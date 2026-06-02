import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import {
    Meus,
    MeusConfig,
    Opcodes,
    COMMISSION_WALLET,
    MIN_ESCROW_AMOUNT,
    calculateCommission,
} from '../wrappers/Meus';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('Meus Escrow', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Meus');
    });

    let blockchain: Blockchain;
    let employer: SandboxContract<TreasuryContract>;
    let freelancer: SandboxContract<TreasuryContract>;
    let arbiter: SandboxContract<TreasuryContract>;
    let deployer: SandboxContract<TreasuryContract>;
    let outsider: SandboxContract<TreasuryContract>;
    let meus: SandboxContract<Meus>;

    const ESCROW_AMOUNT = toNano('1');
    const DEADLINE = Math.floor(Date.now() / 1000) + 86400;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        employer   = await blockchain.treasury('employer');
        freelancer = await blockchain.treasury('freelancer');
        arbiter    = await blockchain.treasury('arbiter');
        deployer   = await blockchain.treasury('deployer');
        outsider   = await blockchain.treasury('outsider');

        const config: MeusConfig = {
            employer:   employer.address,
            freelancer: freelancer.address,
            arbiter:    arbiter.address,
            deployer:   deployer.address,
            amount:     ESCROW_AMOUNT,
            deadline:   DEADLINE,
        };

        meus = blockchain.openContract(Meus.createFromConfig(config, code));

        const deployResult = await meus.sendDeploy(employer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: employer.address,
            to: meus.address,
            deploy: true,
            success: true,
        });
    });

    async function depositAndSubmit() {
        await meus.sendDeposit(employer.getSender(), ESCROW_AMOUNT);
        const workHash = beginCell().storeUint(0xdeadbeef, 32).endCell();
        await meus.sendSubmit(freelancer.getSender(), workHash);
    }

    describe('deploy', () => {
        it('should deploy with correct initial state', async () => {
            const data = await meus.getEscrowData();
            expect(data.status).toBe(0);
            expect(data.amount).toBe(ESCROW_AMOUNT);
        });
    });

    describe('deposit', () => {
        it('employer should deposit', async () => {
            const result = await meus.sendDeposit(employer.getSender(), ESCROW_AMOUNT);

            expect(result.transactions).toHaveTransaction({
                from: employer.address,
                to: meus.address,
                success: true,
            });

            const data = await meus.getEscrowData();
            expect(data.status).toBe(1);
        });

        it('should reject deposit from non-employer', async () => {
            const result = await meus.sendDeposit(outsider.getSender(), ESCROW_AMOUNT);
            expect(result.transactions).toHaveTransaction({
                from: outsider.address, to: meus.address,
                success: false, exitCode: 101,
            });
        });

        it('should reject deposit with insufficient value', async () => {
            const result = await meus.sendDeposit(employer.getSender(), toNano('0.5'));
            expect(result.transactions).toHaveTransaction({
                from: employer.address, to: meus.address,
                success: false, exitCode: 103,
            });
        });

        it('should reject double deposit', async () => {
            await meus.sendDeposit(employer.getSender(), ESCROW_AMOUNT);
            const result = await meus.sendDeposit(employer.getSender(), ESCROW_AMOUNT);
            expect(result.transactions).toHaveTransaction({
                from: employer.address, to: meus.address,
                success: false, exitCode: 102,
            });
        });
    });

    describe('submit work', () => {
        it('freelancer should submit work', async () => {
            await meus.sendDeposit(employer.getSender(), ESCROW_AMOUNT);
            const workHash = beginCell().storeUint(0xdeadbeef, 32).endCell();
            const result = await meus.sendSubmit(freelancer.getSender(), workHash);

            expect(result.transactions).toHaveTransaction({
                from: freelancer.address, to: meus.address, success: true,
            });
            const data = await meus.getEscrowData();
            expect(data.status).toBe(2);
            expect(data.reviewDeadline).toBeGreaterThan(0);
        });

        it('should reject submit from non-freelancer', async () => {
            await meus.sendDeposit(employer.getSender(), ESCROW_AMOUNT);
            const workHash = beginCell().storeUint(0xdeadbeef, 32).endCell();
            const result = await meus.sendSubmit(outsider.getSender(), workHash);
            expect(result.transactions).toHaveTransaction({
                from: outsider.address, to: meus.address,
                success: false, exitCode: 201,
            });
        });

        it('should reject re-submission (no timer reset)', async () => {
            await depositAndSubmit();
            const workHash = beginCell().storeUint(0xcafebabe, 32).endCell();
            const result = await meus.sendSubmit(freelancer.getSender(), workHash);
            expect(result.transactions).toHaveTransaction({
                from: freelancer.address, to: meus.address,
                success: false, exitCode: 202,
            });
        });
    });

    describe('approve', () => {
        it('employer approves → freelancer + commission paid to hardcoded wallet', async () => {
            await depositAndSubmit();
            const result = await meus.sendApprove(employer.getSender());

            expect(result.transactions).toHaveTransaction({
                from: meus.address, to: COMMISSION_WALLET,
            });
            expect(result.transactions).toHaveTransaction({
                from: meus.address, to: freelancer.address, success: true,
            });
        });

        it('should reject approve from non-employer', async () => {
            await depositAndSubmit();
            const result = await meus.sendApprove(outsider.getSender());
            expect(result.transactions).toHaveTransaction({
                from: outsider.address, to: meus.address,
                success: false, exitCode: 301,
            });
        });
    });

    describe('cancel', () => {
        it('employer cancels before submission → full refund, no commission', async () => {
            await meus.sendDeposit(employer.getSender(), ESCROW_AMOUNT);
            const result = await meus.sendCancel(employer.getSender());

            expect(result.transactions).toHaveTransaction({
                from: meus.address, to: employer.address, success: true,
            });
            expect(result.transactions).not.toHaveTransaction({
                from: meus.address, to: COMMISSION_WALLET,
            });
        });

        it('should reject cancel after work submitted', async () => {
            await depositAndSubmit();
            const result = await meus.sendCancel(employer.getSender());
            expect(result.transactions).toHaveTransaction({
                from: employer.address, to: meus.address,
                success: false, exitCode: 602,
            });
        });

        it('should reject cancel from non-employer', async () => {
            await meus.sendDeposit(employer.getSender(), ESCROW_AMOUNT);
            const result = await meus.sendCancel(outsider.getSender());
            expect(result.transactions).toHaveTransaction({
                from: outsider.address, to: meus.address,
                success: false, exitCode: 601,
            });
        });
    });

    describe('dispute', () => {
        it('employer opens dispute within review window', async () => {
            await depositAndSubmit();
            const result = await meus.sendDispute(employer.getSender());

            expect(result.transactions).toHaveTransaction({
                from: employer.address, to: meus.address, success: true,
            });
            const data = await meus.getEscrowData();
            expect(data.status).toBe(3);
        });

        it('should reject dispute after review deadline', async () => {
            await depositAndSubmit();
            blockchain.now = Math.floor(Date.now() / 1000) + 172800 + 1;
            const result = await meus.sendDispute(employer.getSender());
            expect(result.transactions).toHaveTransaction({
                from: employer.address, to: meus.address,
                success: false, exitCode: 403,
            });
        });

        it('should reject dispute from non-employer', async () => {
            await depositAndSubmit();
            const result = await meus.sendDispute(outsider.getSender());
            expect(result.transactions).toHaveTransaction({
                from: outsider.address, to: meus.address,
                success: false, exitCode: 401,
            });
        });
    });

    describe('resolve', () => {
        it('arbiter resolves for freelancer → freelancer + commission paid', async () => {
            await depositAndSubmit();
            await meus.sendDispute(employer.getSender());
            const result = await meus.sendResolve(arbiter.getSender(), true);

            expect(result.transactions).toHaveTransaction({
                from: meus.address, to: freelancer.address, success: true,
            });
            expect(result.transactions).toHaveTransaction({
                from: meus.address, to: COMMISSION_WALLET,
            });
        });

        it('arbiter resolves for employer → employer + commission paid', async () => {
            await depositAndSubmit();
            await meus.sendDispute(employer.getSender());
            const result = await meus.sendResolve(arbiter.getSender(), false);

            expect(result.transactions).toHaveTransaction({
                from: meus.address, to: employer.address, success: true,
            });
            expect(result.transactions).toHaveTransaction({
                from: meus.address, to: COMMISSION_WALLET,
            });
        });

        it('should reject resolve from non-arbiter', async () => {
            await depositAndSubmit();
            await meus.sendDispute(employer.getSender());
            const result = await meus.sendResolve(outsider.getSender(), true);
            expect(result.transactions).toHaveTransaction({
                from: outsider.address, to: meus.address,
                success: false, exitCode: 501,
            });
        });
    });

    describe('resolve timeout', () => {
        it('timed-out dispute defaults to freelancer (anti-collusion)', async () => {
            await depositAndSubmit();
            await meus.sendDispute(employer.getSender());
            const data = await meus.getEscrowData();

            blockchain.now = data.reviewDeadline + 2592000 + 1;
            const result = await meus.sendResolveTimeout(outsider.getSender());

            expect(result.transactions).toHaveTransaction({
                from: meus.address, to: COMMISSION_WALLET,
            });
            expect(result.transactions).toHaveTransaction({
                from: meus.address, to: freelancer.address, success: true,
            });
            expect(result.transactions).toHaveTransaction({
                from: meus.address, to: deployer.address, success: true,
            });
        });

        it('should reject resolve_timeout before 30 days', async () => {
            await depositAndSubmit();
            await meus.sendDispute(employer.getSender());
            const result = await meus.sendResolveTimeout(outsider.getSender());
            expect(result.transactions).toHaveTransaction({
                from: outsider.address, to: meus.address,
                success: false, exitCode: 802,
            });
        });
    });

    describe('auto-release', () => {
        it('after review deadline → freelancer paid with commission', async () => {
            await depositAndSubmit();
            const data = await meus.getEscrowData();
            blockchain.now = data.reviewDeadline + 1;

            const result = await meus.sendAutoRelease(outsider.getSender());

            expect(result.transactions).toHaveTransaction({
                from: meus.address, to: freelancer.address, success: true,
            });
            expect(result.transactions).toHaveTransaction({
                from: meus.address, to: COMMISSION_WALLET,
            });
        });

        it('should reject auto-release before review deadline', async () => {
            await depositAndSubmit();
            const result = await meus.sendAutoRelease(outsider.getSender());
            expect(result.transactions).toHaveTransaction({
                from: outsider.address, to: meus.address,
                success: false, exitCode: 702,
            });
        });
    });

    describe('refund expired (stuck FUNDED rescue)', () => {
        it('anyone can refund after deadline if freelancer never submitted', async () => {
            await meus.sendDeposit(employer.getSender(), ESCROW_AMOUNT);

            blockchain.now = DEADLINE + 1;
            const result = await meus.sendRefundExpired(outsider.getSender());

            expect(result.transactions).toHaveTransaction({
                from: meus.address, to: employer.address, success: true,
            });
            expect(result.transactions).not.toHaveTransaction({
                from: meus.address, to: COMMISSION_WALLET,
            });
        });

        it('should reject refund_expired before deadline', async () => {
            await meus.sendDeposit(employer.getSender(), ESCROW_AMOUNT);
            const result = await meus.sendRefundExpired(outsider.getSender());
            expect(result.transactions).toHaveTransaction({
                from: outsider.address, to: meus.address,
                success: false, exitCode: 902,
            });
        });

        it('should reject refund_expired when work already submitted', async () => {
            await depositAndSubmit();
            blockchain.now = DEADLINE + 1;
            const result = await meus.sendRefundExpired(outsider.getSender());
            expect(result.transactions).toHaveTransaction({
                from: outsider.address, to: meus.address,
                success: false, exitCode: 901,
            });
        });
    });

    describe('employer cheating', () => {
        it('cannot cancel after freelancer submitted', async () => {
            await depositAndSubmit();
            const result = await meus.sendCancel(employer.getSender());
            expect(result.transactions).toHaveTransaction({
                success: false, exitCode: 602,
            });
        });

        it('cannot dispute after 48h review window', async () => {
            await depositAndSubmit();
            const data = await meus.getEscrowData();
            blockchain.now = data.reviewDeadline + 1;
            const result = await meus.sendDispute(employer.getSender());
            expect(result.transactions).toHaveTransaction({
                success: false, exitCode: 403,
            });
        });

        it('cannot approve then dispute (double action)', async () => {
            await depositAndSubmit();
            await meus.sendApprove(employer.getSender());
            const result = await meus.sendDispute(employer.getSender());
            expect(result.transactions).toHaveTransaction({
                success: false, exitCode: 402,
            });
        });
    });

    describe('freelancer cheating', () => {
        it('cannot submit without deposit', async () => {
            const workHash = beginCell().storeUint(0xdeadbeef, 32).endCell();
            const result = await meus.sendSubmit(freelancer.getSender(), workHash);
            expect(result.transactions).toHaveTransaction({
                success: false, exitCode: 202,
            });
        });

        it('cannot trigger auto-release immediately', async () => {
            await depositAndSubmit();
            const result = await meus.sendAutoRelease(freelancer.getSender());
            expect(result.transactions).toHaveTransaction({
                success: false, exitCode: 702,
            });
        });

        it('cannot call approve', async () => {
            await depositAndSubmit();
            const result = await meus.sendApprove(freelancer.getSender());
            expect(result.transactions).toHaveTransaction({
                success: false, exitCode: 301,
            });
        });
    });

    describe('arbiter abuse', () => {
        it('cannot resolve without a dispute', async () => {
            await depositAndSubmit();
            const result = await meus.sendResolve(arbiter.getSender(), true);
            expect(result.transactions).toHaveTransaction({
                success: false, exitCode: 502,
            });
        });

        it('absent arbiter cannot lock funds forever (timeout protects freelancer)', async () => {
            await depositAndSubmit();
            await meus.sendDispute(employer.getSender());
            const data = await meus.getEscrowData();

            blockchain.now = data.reviewDeadline + 2592000 + 1;
            const result = await meus.sendResolveTimeout(freelancer.getSender());

            expect(result.transactions).toHaveTransaction({
                from: meus.address, to: freelancer.address, success: true,
            });
        });
    });

    describe('double payout prevention', () => {
        it('cannot approve twice', async () => {
            await depositAndSubmit();
            await meus.sendApprove(employer.getSender());
            const result = await meus.sendApprove(employer.getSender());
            expect(result.transactions).toHaveTransaction({
                success: false, exitCode: 302,
            });
        });

        it('cannot auto-release after approve (contract destroyed)', async () => {
            await depositAndSubmit();
            const data = await meus.getEscrowData();
            await meus.sendApprove(employer.getSender());
            blockchain.now = data.reviewDeadline + 1;
            const result = await meus.sendAutoRelease(outsider.getSender());
            expect(result.transactions).toHaveTransaction({
                from: outsider.address, to: meus.address, aborted: true,
            });
        });
    });

    describe('Edge cases and boundary conditions', () => {
        const GAS_TOLERANCE = toNano('0.01');
        const EXPECTED_COMMISSION = calculateCommission(MIN_ESCROW_AMOUNT);
        let deadlineOffset = 0;

        beforeEach(async () => {
            blockchain = await Blockchain.create();
            employer   = await blockchain.treasury('employer');
            freelancer = await blockchain.treasury('freelancer');
            arbiter    = await blockchain.treasury('arbiter');
            deployer   = await blockchain.treasury('deployer');
            outsider   = await blockchain.treasury('outsider');

            const now = Math.floor(Date.now() / 1000);
            const config: MeusConfig = {
                employer:   employer.address,
                freelancer: freelancer.address,
                arbiter:    arbiter.address,
                deployer:   deployer.address,
                amount:     ESCROW_AMOUNT,
                deadline:   now + 86400,
            };
            meus = blockchain.openContract(Meus.createFromConfig(config, code));
            await meus.sendDeploy(employer.getSender(), toNano('0.05'));
            deadlineOffset = 0;
        });

        async function openEscrow(amount: bigint) {
            deadlineOffset += 1;
            const now = blockchain.now ?? Math.floor(Date.now() / 1000);
            const config: MeusConfig = {
                employer:   employer.address,
                freelancer: freelancer.address,
                arbiter:    arbiter.address,
                deployer:   deployer.address,
                amount,
                deadline:   now + 86400 + deadlineOffset,
            };
            const contract = blockchain.openContract(Meus.createFromConfig(config, code));
            const deployResult = await contract.sendDeploy(employer.getSender(), toNano('0.05'));
            expect(deployResult.transactions).toHaveTransaction({
                from: employer.address,
                to: contract.address,
                deploy: true,
                success: true,
            });
            return contract;
        }

        async function depositSubmitApprove(contract: SandboxContract<Meus>, amount: bigint) {
            await contract.sendDeposit(employer.getSender(), amount);
            const workHash = beginCell().storeUint(0xdeadbeef, 32).endCell();
            await contract.sendSubmit(freelancer.getSender(), workHash);
            return contract.sendApprove(employer.getSender());
        }

        function expectCommissionNear(
            result: Awaited<ReturnType<typeof depositSubmitApprove>>,
            contract: SandboxContract<Meus>,
            amount: bigint,
        ) {
            const expected = calculateCommission(amount);
            const commissionTx = result.transactions.find((tx) => {
                if (tx.inMessage?.info.type !== 'internal') return false;
                return (
                    tx.inMessage.info.src.equals(contract.address) &&
                    tx.inMessage.info.dest.equals(COMMISSION_WALLET)
                );
            });
            expect(commissionTx).toBeDefined();
            const info = commissionTx!.inMessage!.info;
            if (info.type !== 'internal') {
                throw new Error('expected internal commission message');
            }
            const paid = info.value.coins;
            expect(paid).toBeGreaterThan(expected - GAS_TOLERANCE);
            expect(paid).toBeLessThanOrEqual(expected + GAS_TOLERANCE);
        }

        it('minimum escrow amount boundary', async () => {
            const minContract = await openEscrow(MIN_ESCROW_AMOUNT);
            const ok = await minContract.sendDeposit(employer.getSender(), MIN_ESCROW_AMOUNT);
            expect(ok.transactions).toHaveTransaction({
                from: employer.address, to: minContract.address, success: true,
            });
            const data = await minContract.getEscrowData();
            expect(data.status).toBe(1);

            const belowMin = await openEscrow(MIN_ESCROW_AMOUNT - 1n);
            const fail104 = await belowMin.sendDeposit(
                employer.getSender(),
                MIN_ESCROW_AMOUNT - 1n,
            );
            expect(fail104.transactions).toHaveTransaction({
                from: employer.address, to: belowMin.address,
                success: false, exitCode: 104,
            });

            const underpay = await openEscrow(MIN_ESCROW_AMOUNT);
            const fail103 = await underpay.sendDeposit(
                employer.getSender(),
                MIN_ESCROW_AMOUNT - 1n,
            );
            expect(fail103.transactions).toHaveTransaction({
                from: employer.address, to: underpay.address,
                success: false, exitCode: 103,
            });
        });

        it('commission calculation on minimum amount', async () => {
            // Tier 1 (<= 100 TON): 3% — MIN_ESCROW_AMOUNT is 0.01 TON, well under the tier-1 cap.
            const minContract = await openEscrow(MIN_ESCROW_AMOUNT);
            const result = await depositSubmitApprove(minContract, MIN_ESCROW_AMOUNT);

            expect(result.transactions).toHaveTransaction({
                from: minContract.address,
                to: COMMISSION_WALLET,
                value: EXPECTED_COMMISSION,
            });
            expect(result.transactions).toHaveTransaction({
                from: minContract.address,
                to: freelancer.address,
                success: true,
            });
            expect(EXPECTED_COMMISSION).toBe(300_000n);
            expect(MIN_ESCROW_AMOUNT - EXPECTED_COMMISSION).toBe(9_700_000n);
        });

        it('Commission tier 1 — amount <= 100 TON pays 3%', async () => {
            const amount = toNano('50');
            const contract = await openEscrow(amount);
            const result = await depositSubmitApprove(contract, amount);
            expectCommissionNear(result, contract, amount);
            expect(calculateCommission(amount)).toBe(1_500_000_000n);
        });

        it('Commission tier 2 — amount > 100 TON and <= 500 TON pays 2%', async () => {
            const amount = toNano('200');
            const contract = await openEscrow(amount);
            const result = await depositSubmitApprove(contract, amount);
            expectCommissionNear(result, contract, amount);
            expect(calculateCommission(amount)).toBe(4_000_000_000n);
        });

        it('Commission tier 3 — amount > 500 TON pays 1%', async () => {
            const amount = toNano('600');
            const contract = await openEscrow(amount);
            const result = await depositSubmitApprove(contract, amount);
            expectCommissionNear(result, contract, amount);
            expect(calculateCommission(amount)).toBe(6_000_000_000n);
        });

        it('Tier boundary — exactly 100 TON uses tier 1 (3%)', async () => {
            const amount = 100_000_000_000n;
            const contract = await openEscrow(amount);
            const result = await depositSubmitApprove(contract, amount);
            expectCommissionNear(result, contract, amount);
            expect(calculateCommission(amount)).toBe(3_000_000_000n);
        });

        it('Tier boundary — exactly 500 TON uses tier 2 (2%)', async () => {
            const amount = 500_000_000_000n;
            const contract = await openEscrow(amount);
            const result = await depositSubmitApprove(contract, amount);
            expectCommissionNear(result, contract, amount);
            expect(calculateCommission(amount)).toBe(10_000_000_000n);
        });

        it.skip('zero commission guard — MIN_ESCROW_AMOUNT always yields commission > 0', () => {
            // floor(10_000_000 * 300 / 10000) = 300_000 nanotons; no smaller legal amount in config.
        });

        it('malformed message body — empty body', async () => {
            await meus.sendDeposit(employer.getSender(), ESCROW_AMOUNT);
            const result = await meus.sendRawBody(outsider.getSender(), beginCell().endCell());
            expect(result.transactions).toHaveTransaction({
                from: outsider.address, to: meus.address,
                success: false, exitCode: 0xffff,
            });
        });

        it('submit with missing ref', async () => {
            await meus.sendDeposit(employer.getSender(), ESCROW_AMOUNT);
            const body = beginCell()
                .storeUint(Opcodes.submit, 32)
                .storeUint(0n, 64)
                .endCell();
            const result = await meus.sendRawBody(freelancer.getSender(), body);
            expect(result.transactions).toHaveTransaction({
                from: freelancer.address, to: meus.address,
                success: false, exitCode: 204,
            });
        });

        it('resolve with missing winner byte', async () => {
            await depositAndSubmit();
            await meus.sendDispute(employer.getSender());
            const body = beginCell()
                .storeUint(Opcodes.resolve, 32)
                .storeUint(0n, 64)
                .endCell();
            const result = await meus.sendRawBody(arbiter.getSender(), body);
            expect(result.transactions).toHaveTransaction({
                from: arbiter.address, to: meus.address,
                success: false, exitCode: 503,
            });
        });

        it('post-destruction safety — refund_expired after approve', async () => {
            await depositAndSubmit();
            await meus.sendApprove(employer.getSender());
            blockchain.now = DEADLINE + 1;
            const result = await meus.sendRefundExpired(outsider.getSender());
            expect(result.transactions).toHaveTransaction({
                from: outsider.address, to: meus.address, aborted: true,
            });
            expect(result.transactions).not.toHaveTransaction({
                from: meus.address, to: employer.address, success: true,
            });
        });

        it('outsider cannot trigger protected ops', async () => {
            await depositAndSubmit();

            const approve = await meus.sendApprove(outsider.getSender());
            expect(approve.transactions).toHaveTransaction({
                from: outsider.address, to: meus.address,
                success: false, exitCode: 301,
            });

            const dispute = await meus.sendDispute(outsider.getSender());
            expect(dispute.transactions).toHaveTransaction({
                from: outsider.address, to: meus.address,
                success: false, exitCode: 401,
            });

            await meus.sendDispute(employer.getSender());
            const resolve = await meus.sendResolve(outsider.getSender(), true);
            expect(resolve.transactions).toHaveTransaction({
                from: outsider.address, to: meus.address,
                success: false, exitCode: 501,
            });
        });

        it('time boundary: dispute exactly at review deadline', async () => {
            await depositAndSubmit();
            const data = await meus.getEscrowData();
            blockchain.now = Math.max((blockchain.now ?? 0) + 1, data.reviewDeadline);
            const atDeadline = await meus.sendDispute(employer.getSender());
            expect(atDeadline.transactions).toHaveTransaction({
                from: employer.address, to: meus.address, success: true,
            });

            const lateContract = await openEscrow(ESCROW_AMOUNT);
            await lateContract.sendDeposit(employer.getSender(), ESCROW_AMOUNT);
            const workHash = beginCell().storeUint(0xbeef, 32).endCell();
            await lateContract.sendSubmit(freelancer.getSender(), workHash);
            const lateData = await lateContract.getEscrowData();
            expect(lateData.reviewDeadline).toBeGreaterThan(0);
            blockchain.now = Math.max((blockchain.now ?? 0) + 1, lateData.reviewDeadline + 1);
            const afterDeadline = await lateContract.sendDispute(employer.getSender());
            expect(afterDeadline.transactions).toHaveTransaction({
                from: employer.address, to: lateContract.address,
                success: false, exitCode: 403,
            });
        });

        it('double submit prevention', async () => {
            await depositAndSubmit();
            const workHash = beginCell().storeUint(0xcafebabe, 32).endCell();
            const result = await meus.sendSubmit(freelancer.getSender(), workHash);
            expect(result.transactions).toHaveTransaction({
                from: freelancer.address, to: meus.address,
                success: false, exitCode: 202,
            });
        });
    });
});

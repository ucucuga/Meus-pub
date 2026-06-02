import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    toNano,
} from '@ton/core';

export type MeusConfig = {
    employer: Address;
    freelancer: Address;
    arbiter: Address;
    deployer: Address;
    amount: bigint;
    deadline: number;
};

export const COMMISSION_WALLET = Address.parse(
    'UQAKFKgE5rjD6c7RfX9hIIpJljj2h5oMwkKgfOrAB_zJiucg',
);

export function meusConfigToCell(config: MeusConfig): Cell {
    return beginCell()
        .storeAddress(config.employer)
        .storeAddress(config.freelancer)
        .storeAddress(config.arbiter)
        .storeRef(
            beginCell()
                .storeAddress(config.deployer)
                .storeCoins(config.amount)
                .storeUint(config.deadline, 32)
                .storeUint(0, 32)
                .storeUint(0, 8)
                .storeRef(beginCell().endCell())
            .endCell()
        )
    .endCell();
}

export const MIN_ESCROW_AMOUNT = 10_000_000n;

export function getCommissionRate(amountNano: bigint): number {
    const TIER_1_MAX = 100_000_000_000n; // 100 TON
    const TIER_2_MAX = 500_000_000_000n; // 500 TON
    if (amountNano <= TIER_1_MAX) return 300; // 3%
    if (amountNano <= TIER_2_MAX) return 200; // 2%
    return 100; // 1%
}

export function calculateCommission(amountNano: bigint): bigint {
    const rate = BigInt(getCommissionRate(amountNano));
    return (amountNano * rate) / 10000n;
}

export const Opcodes = {
    deposit:        0x1,
    submit:         0x2,
    approve:        0x3,
    dispute:        0x4,
    resolve:        0x5,
    cancel:         0x6,
    autoRelease:    0x7,
    resolveTimeout: 0x8,
    refundExpired:  0x9,
} as const;

export class Meus implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new Meus(address);
    }

    static createFromConfig(config: MeusConfig, code: Cell, workchain = 0) {
        const data = meusConfigToCell(config);
        const init = { code, data };
        return new Meus(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendDeposit(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        queryId: bigint = 0n,
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.deposit, 32)
                .storeUint(queryId, 64)
            .endCell(),
        });
    }

    async sendSubmit(
        provider: ContractProvider,
        via: Sender,
        workHash: Cell,
        queryId: bigint = 0n,
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.submit, 32)
                .storeUint(queryId, 64)
                .storeRef(workHash)
            .endCell(),
        });
    }

    async sendApprove(
        provider: ContractProvider,
        via: Sender,
        queryId: bigint = 0n,
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.approve, 32)
                .storeUint(queryId, 64)
            .endCell(),
        });
    }

    async sendDispute(
        provider: ContractProvider,
        via: Sender,
        queryId: bigint = 0n,
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.dispute, 32)
                .storeUint(queryId, 64)
            .endCell(),
        });
    }

    async sendResolve(
        provider: ContractProvider,
        via: Sender,
        freelancerWins: boolean,
        queryId: bigint = 0n,
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.resolve, 32)
                .storeUint(queryId, 64)
                .storeUint(freelancerWins ? 1 : 0, 8)
            .endCell(),
        });
    }

    async sendCancel(
        provider: ContractProvider,
        via: Sender,
        queryId: bigint = 0n,
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.cancel, 32)
                .storeUint(queryId, 64)
            .endCell(),
        });
    }

    async sendAutoRelease(
        provider: ContractProvider,
        via: Sender,
        queryId: bigint = 0n,
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.autoRelease, 32)
                .storeUint(queryId, 64)
            .endCell(),
        });
    }

    async sendResolveTimeout(
        provider: ContractProvider,
        via: Sender,
        queryId: bigint = 0n,
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.resolveTimeout, 32)
                .storeUint(queryId, 64)
            .endCell(),
        });
    }

    async sendRefundExpired(
        provider: ContractProvider,
        via: Sender,
        queryId: bigint = 0n,
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.refundExpired, 32)
                .storeUint(queryId, 64)
            .endCell(),
        });
    }

    /** Internal message with a caller-supplied body (for malformed-input tests). */
    async sendRawBody(
        provider: ContractProvider,
        via: Sender,
        body: Cell,
        value: bigint = toNano('0.05'),
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    async getEscrowData(provider: ContractProvider) {
        const result = await provider.get('get_escrow_data', []);
        return {
            status:         result.stack.readNumber(),
            amount:         result.stack.readBigNumber(),
            deadline:       result.stack.readNumber(),
            reviewDeadline: result.stack.readNumber(),
        };
    }
}

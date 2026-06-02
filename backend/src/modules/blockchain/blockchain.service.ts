import { readFileSync } from 'node:fs';
import { Address, Cell, contractAddress, beginCell, toNano, internal } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, WalletContractV5R1, SendMode } from '@ton/ton';
import { type FastifyInstance } from 'fastify';
import { config } from '../../config/index.js';
import { getTonClient } from './ton.client.js';
import { MeusContract, meusConfigToCell, Opcodes, type MeusConfig } from './contract.wrapper.js';

/** On-chain escrow status codes (matches meus.fc). */
export const OnChainStatus = {
  INIT: 0,
  FUNDED: 1,
  SUBMITTED: 2,
  DISPUTE: 3,
  COMPLETED: 4,
  CANCELLED: 5,
} as const;

const DISPUTE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;

export function buildOpcodeBody(opcode: number, queryId = 0n): Cell {
  return beginCell().storeUint(opcode, 32).storeUint(queryId, 64).endCell();
}

async function openDeployerWallet(client: TonClient) {
  const mnemonic = config.DEPLOYER_MNEMONIC.split(' ');
  const keyPair = await mnemonicToPrivateKey(mnemonic);
  const isTestnet = config.TON_NETWORK === 'testnet';
  const wallet = WalletContractV5R1.create({
    publicKey: keyPair.publicKey,
    workchain: 0,
    walletId: { networkGlobalId: isTestnet ? -3 : -239 },
  });
  return { walletContract: client.open(wallet), keyPair, walletAddress: wallet.address.toString() };
}

/**
 * Send an internal message to an escrow contract from the platform deployer wallet.
 * Used for permissionless ops: auto_release (0x7), resolve_timeout (0x8), refund_expired (0x9).
 */
export async function sendDeployerContractOp(
  contractAddress: string,
  body: Cell,
  log?: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void },
): Promise<{ seqno: number; deployerAddress: string }> {
  const client = getTonClient();
  const { walletContract, keyPair, walletAddress } = await openDeployerWallet(client);
  const seqno = await walletContract.getSeqno();

  await walletContract.sendTransfer({
    secretKey: keyPair.secretKey,
    seqno,
    sendMode: SendMode.PAY_GAS_SEPARATELY,
    messages: [
      internal({
        to: Address.parse(contractAddress),
        value: toNano('0.05'),
        body,
      }),
    ],
  });

  log?.info({ contractAddress, seqno, deployerAddress: walletAddress }, 'Deployer contract op sent');

  return { seqno, deployerAddress: walletAddress };
}

export async function sendAutoRelease(
  contractAddress: string,
  log?: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void },
) {
  return sendDeployerContractOp(contractAddress, buildOpcodeBody(Opcodes.autoRelease), log);
}

export async function sendResolveTimeout(
  contractAddress: string,
  log?: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void },
) {
  return sendDeployerContractOp(contractAddress, buildOpcodeBody(Opcodes.resolveTimeout), log);
}

/** @param winner 1 = freelancer wins, 0 = employer wins */
export async function sendDeployerResolveOp(
  contractAddress: string,
  winner: number,
  log?: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void },
) {
  const body = beginCell()
    .storeUint(Opcodes.resolve, 32)
    .storeUint(0, 64)
    .storeUint(winner, 8)
    .endCell();
  return sendDeployerContractOp(contractAddress, body, log);
}

export async function sendRefundExpired(
  contractAddress: string,
  log?: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void },
) {
  return sendDeployerContractOp(contractAddress, buildOpcodeBody(Opcodes.refundExpired), log);
}

export { DISPUTE_TIMEOUT_MS };

const STATUS_MAP: Record<number, string> = {
  0: 'INIT',
  1: 'FUNDED',
  2: 'SUBMITTED',
  3: 'DISPUTE',
  4: 'COMPLETED',
  5: 'CANCELLED',
};

let contractCodeCell: Cell | null = null;

function loadContractCode(): Cell {
  if (!contractCodeCell) {
    const raw = readFileSync(config.CONTRACT_CODE_PATH);
    contractCodeCell = Cell.fromBoc(raw)[0];
  }
  return contractCodeCell;
}

export interface DeployResult {
  contractAddress: string;
  deployerAddress: string;
  seqno: number;
}

export class BlockchainService {
  constructor(private readonly app: FastifyInstance) {}

  /**
   * Deploy a new Meus escrow contract on-chain.
   *
   * The platform's deployer wallet sends the StateInit message and pays gas.
   * The contract starts in STATUS_INIT; the employer must send a separate
   * deposit transaction from their own wallet to fund it.
   */
  async deployEscrowContract(params: {
    employer: string;
    freelancer: string;
    arbiter: string;
    amount: bigint;
    deadline: number;
    deployNonce?: number;
  }): Promise<DeployResult> {
    const client = getTonClient();
    const code = loadContractCode();

    const { walletContract, keyPair, walletAddress: deployerAddress } = await openDeployerWallet(client);

    const meusConfig: MeusConfig = {
      employer: Address.parse(params.employer),
      freelancer: Address.parse(params.freelancer),
      arbiter: Address.parse(params.arbiter),
      deployer: Address.parse(deployerAddress),
      amount: params.amount,
      deadline: params.deadline,
      deployNonce: params.deployNonce,
    };

    const data = meusConfigToCell(meusConfig);
    const init = { code, data };
    const addr = contractAddress(0, init);

    console.log('Deploying with endpoint:', config.TON_ENDPOINT);
    console.log('Deployer address:', deployerAddress);
    console.log('Contract address:', addr.toString());

    try {
      const seqno = await walletContract.getSeqno();

      await walletContract.sendTransfer({
        secretKey: keyPair.secretKey,
        seqno,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        messages: [
          internal({
            to: addr,
            value: toNano('0.05'),
            init,
            body: beginCell().endCell(),
          }),
        ],
      });

      this.app.log.info(
        { contractAddress: addr.toString(), seqno },
        'Escrow contract deployment sent',
      );

      return {
        contractAddress: addr.toString(),
        deployerAddress,
        seqno,
      };
    } catch (error: any) {
      console.error('TON deployment error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        config: error.config?.url,
      });
      throw new Error(`Contract deployment failed: ${error.message}`);
    }
  }

  async waitForDeploy(address: string, timeoutMs = 60_000, intervalMs = 3_000): Promise<boolean> {
    const client = getTonClient();
    const addr = Address.parse(address);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const state = await client.getContractState(addr);
        if (state.state === 'active') return true;
      } catch {
        // not yet deployed
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    return false;
  }

  async getContractState(contractAddress: string) {
    const client = getTonClient();
    const addr = Address.parse(contractAddress);
    const contract = client.open(MeusContract.createFromAddress(addr));

    try {
      const data = await contract.getEscrowData();
      return {
        status: STATUS_MAP[data.status] ?? 'UNKNOWN',
        statusCode: data.status,
        amount: data.amount.toString(),
        deadline: data.deadline,
        reviewDeadline: data.reviewDeadline,
      };
    } catch (err) {
      this.app.log.warn({ contractAddress, err }, 'Failed to read contract state');
      return null;
    }
  }

  async isContractActive(contractAddress: string): Promise<boolean> {
    const client = getTonClient();
    const addr = Address.parse(contractAddress);
    try {
      const state = await client.getContractState(addr);
      return state.state === 'active';
    } catch {
      return false;
    }
  }

  async syncEscrowState(escrowId: string) {
    const escrow = await this.app.prisma.escrow.findUnique({ where: { id: escrowId } });
    if (!escrow?.contractAddress) return null;

    const onChain = await this.getContractState(escrow.contractAddress);
    if (!onChain) return null;

    const dbStatus = onChain.status as any;

    if (escrow.status !== dbStatus) {
      this.app.log.info(
        { escrowId, from: escrow.status, to: dbStatus },
        'Escrow status changed on-chain',
      );

      await this.app.prisma.escrow.update({
        where: { id: escrowId },
        data: { status: dbStatus },
      });
    }

    return onChain;
  }

  async sendDeployerSubmit(contractAddress: string, workHash: string): Promise<void> {
    const hashCell = beginCell()
      .storeUint(0, 32)
      .storeStringTail(workHash)
      .endCell();
    const body = beginCell()
      .storeUint(Opcodes.submit, 32)
      .storeUint(0, 64)
      .storeRef(hashCell)
      .endCell();
    await sendDeployerContractOp(contractAddress, body, this.app.log);
  }

  async sendDeployerApprove(contractAddress: string): Promise<void> {
    const body = beginCell()
      .storeUint(Opcodes.approve, 32)
      .storeUint(0, 64)
      .endCell();
    await sendDeployerContractOp(contractAddress, body, this.app.log);
  }

  async sendDeployerDispute(contractAddress: string): Promise<void> {
    const body = beginCell()
      .storeUint(Opcodes.dispute, 32)
      .storeUint(0, 64)
      .endCell();
    await sendDeployerContractOp(contractAddress, body, this.app.log);
  }

  async sendDeployerResolve(contractAddress: string, winner: number): Promise<void> {
    await sendDeployerResolveOp(contractAddress, winner, this.app.log);
  }

  buildDeployData(params: {
    employer: string;
    freelancer: string;
    arbiter: string;
    deployer: string;
    amount: bigint;
    deadline: number;
  }) {
    const cell = meusConfigToCell({
      employer: Address.parse(params.employer),
      freelancer: Address.parse(params.freelancer),
      arbiter: Address.parse(params.arbiter),
      deployer: Address.parse(params.deployer),
      amount: params.amount,
      deadline: params.deadline,
    });

    return cell.toBoc().toString('base64');
  }
}

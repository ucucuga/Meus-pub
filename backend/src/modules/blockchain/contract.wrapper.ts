import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  type ContractProvider,
  type Sender,
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
  deployNonce?: number;
};

export function meusConfigToCell(cfg: MeusConfig): Cell {
  return beginCell()
    .storeAddress(cfg.employer)
    .storeAddress(cfg.freelancer)
    .storeAddress(cfg.arbiter)
    .storeRef(
      beginCell()
        .storeAddress(cfg.deployer)
        .storeCoins(cfg.amount)
        .storeUint(cfg.deadline, 32)
        .storeUint(cfg.deployNonce ?? 0, 32) // unique per escrow at init; overwritten on submit
        .storeUint(0, 8) // STATUS_INIT
        .storeRef(beginCell().endCell()) // empty work_hash
        .endCell(),
    )
    .endCell();
}

export const Opcodes = {
  deposit: 0x1,
  submit: 0x2,
  approve: 0x3,
  dispute: 0x4,
  resolve: 0x5,
  cancel: 0x6,
  autoRelease: 0x7,
  resolveTimeout: 0x8,
  refundExpired: 0x9,
} as const;

export class MeusContract implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromConfig(cfg: MeusConfig, code: Cell, workchain = 0) {
    const data = meusConfigToCell(cfg);
    const init = { code, data };
    return new MeusContract(contractAddress(workchain, init), init);
  }

  static createFromAddress(addr: Address) {
    return new MeusContract(addr);
  }

  async getEscrowData(provider: ContractProvider) {
    const result = await provider.get('get_escrow_data', []);
    return {
      status: result.stack.readNumber(),
      amount: result.stack.readBigNumber(),
      deadline: result.stack.readNumber(),
      reviewDeadline: result.stack.readNumber(),
    };
  }

  async sendDeposit(provider: ContractProvider, via: Sender, value: bigint, queryId = 0n) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Opcodes.deposit, 32).storeUint(queryId, 64).endCell(),
    });
  }

  async sendSubmit(provider: ContractProvider, via: Sender, workHash: Cell, queryId = 0n) {
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

  async sendApprove(provider: ContractProvider, via: Sender, queryId = 0n) {
    await provider.internal(via, {
      value: toNano('0.05'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Opcodes.approve, 32).storeUint(queryId, 64).endCell(),
    });
  }

  async sendDispute(provider: ContractProvider, via: Sender, queryId = 0n) {
    await provider.internal(via, {
      value: toNano('0.05'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Opcodes.dispute, 32).storeUint(queryId, 64).endCell(),
    });
  }

  async sendResolve(
    provider: ContractProvider,
    via: Sender,
    freelancerWins: boolean,
    queryId = 0n,
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

  async sendCancel(provider: ContractProvider, via: Sender, queryId = 0n) {
    await provider.internal(via, {
      value: toNano('0.05'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Opcodes.cancel, 32).storeUint(queryId, 64).endCell(),
    });
  }

  async sendAutoRelease(provider: ContractProvider, via: Sender, queryId = 0n) {
    await provider.internal(via, {
      value: toNano('0.05'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Opcodes.autoRelease, 32).storeUint(queryId, 64).endCell(),
    });
  }

  async sendResolveTimeout(provider: ContractProvider, via: Sender, queryId = 0n) {
    await provider.internal(via, {
      value: toNano('0.05'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Opcodes.resolveTimeout, 32).storeUint(queryId, 64).endCell(),
    });
  }

  async sendRefundExpired(provider: ContractProvider, via: Sender, queryId = 0n) {
    await provider.internal(via, {
      value: toNano('0.05'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Opcodes.refundExpired, 32).storeUint(queryId, 64).endCell(),
    });
  }
}

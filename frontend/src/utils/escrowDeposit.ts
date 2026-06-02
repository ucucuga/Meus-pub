import { beginCell } from '@ton/core';

export function buildDepositPayload(): string {
  const cell = beginCell().storeUint(0x1, 32).storeUint(0, 64).endCell();
  return cell.toBoc().toString('base64');
}

export function depositValidUntil(): number {
  return Math.floor(Date.now() / 1000) + 600;
}

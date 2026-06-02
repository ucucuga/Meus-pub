import { calculateCommission } from './commission.js';

const NANOTONS_PER_TON = 1_000_000_000n;

export function formatNanotonsAsTon(amountNano: bigint): string {
  const whole = amountNano / NANOTONS_PER_TON;
  const frac = amountNano % NANOTONS_PER_TON;
  if (frac === 0n) {
    return whole.toString();
  }
  const asNumber = Number(amountNano) / Number(NANOTONS_PER_TON);
  return asNumber.toFixed(4).replace(/\.?0+$/, '');
}

export function formatCommissionTon(amountNano: bigint): string {
  return formatNanotonsAsTon(calculateCommission(amountNano));
}

export function hoursUntil(date: Date, from = new Date()): number {
  const ms = date.getTime() - from.getTime();
  return Math.max(1, Math.ceil(ms / (60 * 60 * 1000)));
}

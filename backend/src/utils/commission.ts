export function getCommissionRate(amountNano: bigint): number {
  const TIER_1_MAX = 100_000_000_000n;
  const TIER_2_MAX = 500_000_000_000n;
  if (amountNano <= TIER_1_MAX) return 300;
  if (amountNano <= TIER_2_MAX) return 200;
  return 100;
}

export function calculateCommission(amountNano: bigint): bigint {
  const rate = BigInt(getCommissionRate(amountNano));
  return (amountNano * rate) / 10000n;
}

export function getCommissionRatePercent(amountTon: number): number {
  if (amountTon <= 0) return 0;
  if (amountTon <= 100) return 3;
  if (amountTon <= 500) return 2;
  return 1;
}

export function calculateCommissionTon(amountTon: number): number {
  if (amountTon <= 0) return 0;
  const rate = getCommissionRatePercent(amountTon);
  return (amountTon * rate) / 100;
}

export function formatCommission(amountTon: number): string {
  const commission = calculateCommissionTon(amountTon);
  if (commission === 0) return '0';
  if (commission < 0.01) return '< 0.01';
  return commission.toFixed(4).replace(/\.?0+$/, '');
}

export function commissionLabel(amountTon: number): string {
  const rate = getCommissionRatePercent(amountTon);
  return `${rate}% commission`;
}

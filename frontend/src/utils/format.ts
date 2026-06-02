export function truncateWallet(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatTonFromNanotons(amount: string): string {
  const ton = Number(amount) / 1e9;
  return `${ton.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} TON`;
}

export function formatDeadline(iso: string): string {
  const date = new Date(iso);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

export function formatDeadlineDateTime(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${hours}:${minutes}, ${day}.${month}.${year}`;
}

export function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function formatClientLabel(
  username?: string | null,
  wallet?: string | null,
): string {
  if (username) {
    return username.startsWith('@') ? username : `@${username}`;
  }
  if (wallet) {
    return truncateWallet(wallet);
  }
  return '—';
}

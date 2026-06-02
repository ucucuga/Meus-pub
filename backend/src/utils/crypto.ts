import { createHmac } from 'node:crypto';
import { config } from '../config/index.js';

export function validateTelegramInitData(initData: string): Record<string, string> | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  params.delete('hash');
  const entries = Array.from(params.entries());
  entries.sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = createHmac('sha256', 'WebAppData')
    .update(config.TELEGRAM_BOT_TOKEN)
    .digest();

  const computed = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (computed !== hash) return null;

  return Object.fromEntries(params.entries());
}

export function parseTelegramUser(params: Record<string, string>) {
  const raw = params['user'];
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
      language_code?: string;
    };
  } catch {
    return null;
  }
}

import { TonClient } from '@ton/ton';
import { config } from '../../config/index.js';

let client: TonClient | null = null;

export function getTonClient(): TonClient {
  if (!client) {
    client = new TonClient({
      endpoint: config.TON_ENDPOINT,
      apiKey: config.TON_API_KEY || undefined,
    });
  }
  return client;
}

import { config } from '../config/index.js';

const BASE_URL = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`;

export async function setupBotCommands(): Promise<void> {
  const res = await fetch(`${BASE_URL}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commands: [
        { command: 'start', description: 'Open Meus escrow platform' },
        { command: 'escrows', description: 'View my active escrows' },
        { command: 'help', description: 'How to use Meus' },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`setMyCommands failed ${res.status}: ${body}`);
  }
}

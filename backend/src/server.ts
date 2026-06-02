import { config } from './config/index.js';
import { buildApp } from './app.js';
import { startJobSystem } from './modules/jobs/index.js';
import { setupBotCommands } from './utils/setup-bot-commands.js';
import { startTelegramArbiterCallbacks } from './utils/telegram-arbiter-callbacks.js';

async function main() {
  const app = await buildApp();

  let stopTelegramCallbacks: (() => void) | undefined;

  app.addHook('onClose', async () => {
    stopTelegramCallbacks?.();
  });

  await startJobSystem(app);

  await app.listen({ port: config.PORT, host: config.HOST });

  try {
    await setupBotCommands();
    app.log.info('Telegram bot commands registered');
  } catch (err) {
    app.log.warn({ err }, 'Failed to register Telegram bot commands');
  }

  stopTelegramCallbacks = startTelegramArbiterCallbacks();
  app.log.info('Telegram arbiter callback polling started');

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

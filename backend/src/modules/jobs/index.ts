import { type FastifyInstance } from 'fastify';
import { escrowQueue } from './queue.js';
import { startEscrowWorker } from './workers/escrow.worker.js';
import { startNotificationWorker } from './workers/notification.worker.js';

export async function startJobSystem(app: FastifyInstance) {
  const escrowWorker = startEscrowWorker();
  const notificationWorker = startNotificationWorker();

  app.log.info('Job workers started');

  // Repeating jobs: sync on-chain state every 60s, check deadlines every 5min
  await escrowQueue.upsertJobScheduler('sync-all-scheduler', {
    every: 20_000,
  }, {
    name: 'sync-all',
    data: { type: 'sync-all' },
  });

  await escrowQueue.upsertJobScheduler('check-deadlines-scheduler', {
    every: 300_000,
  }, {
    name: 'check-deadlines',
    data: { type: 'check-deadlines' },
  });

  await escrowQueue.upsertJobScheduler(
    'check-stale-escrows-scheduler',
    { every: 30 * 60 * 1000 },
    {
      name: 'check-stale-escrows',
      data: { type: 'check-stale-escrows' },
    },
  );

  app.log.info('Scheduled jobs registered');

  app.addHook('onClose', async () => {
    await escrowWorker.close();
    await notificationWorker.close();
    await escrowQueue.close();
    app.log.info('Job workers stopped');
  });
}

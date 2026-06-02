import { Queue } from 'bullmq';
import { config } from '../../config/index.js';

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: Number(parsed.port) || 6379,
    password: parsed.password || undefined,
    db: parsed.pathname ? Number(parsed.pathname.slice(1)) || 0 : 0,
    maxRetriesPerRequest: null as null,
  };
}

const connection = parseRedisUrl(config.REDIS_URL);

export const escrowQueue = new Queue('escrow', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export const notificationQueue = new Queue('notification', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 2000 },
  },
});

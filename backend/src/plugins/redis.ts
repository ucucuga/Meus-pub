import fp from 'fastify-plugin';
import Redis from 'ioredis';
import { type FastifyInstance } from 'fastify';
import { config } from '../config/index.js';

export default fp(
  async (app: FastifyInstance) => {
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
    lazyConnect: true,
  });

  await redis.connect();
  app.log.info('Redis connected');

  app.decorate('redis', redis);

  app.addHook('onClose', async () => {
    await redis.quit();
    app.log.info('Redis disconnected');
  });
  },
  { name: 'redis-plugin' },
);

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { type FastifyInstance } from 'fastify';

export default fp(
  async (app: FastifyInstance) => {
    await app.register(rateLimit, {
      global: false,
      redis: app.redis,
      errorResponseBuilder: () => ({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Too many requests, please try again later',
      }),
    });
  },
  { dependencies: ['redis-plugin'] },
);

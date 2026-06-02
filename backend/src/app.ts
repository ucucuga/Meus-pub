import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loggerConfig } from './config/logger.js';
import { errorHandler } from './middleware/error-handler.js';

import prismaPlugin from './plugins/prisma.js';
import redisPlugin from './plugins/redis.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import authPlugin from './plugins/auth.js';

import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import escrowRoutes from './modules/escrow/escrow.routes.js';
import disputesRoutes from './modules/disputes/disputes.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';

export async function buildApp() {
  const app = Fastify({
    logger: loggerConfig,
    bodyLimit: 100 * 1024 * 1024, // 100MB — dispute evidence with base64 attachments (up to 10×10MB)
  });

  app.setErrorHandler(errorHandler);

  await app.register(cors, {
    origin: [
      'https://hilarious-blini-f529d3.netlify.app',
      'https://web.telegram.org',
      'null',
      /\.telegram\.org$/,
      /localhost/,
      /127\.0\.0\.1/,
    ],
    credentials: true,
  });

  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(rateLimitPlugin);
  await app.register(authPlugin);

  app.get('/health', async (request, reply) => {
    const checks: Record<string, string> = {};

    try {
      await app.prisma.$queryRaw`SELECT 1`;
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'error';
    }

    try {
      const pong = await app.redis.ping();
      checks.redis = pong === 'PONG' ? 'ok' : 'error';
    } catch {
      checks.redis = 'error';
    }

    const healthy = Object.values(checks).every((v) => v === 'ok');
    const status = healthy ? 200 : 503;

    return reply.code(status).send({
      status: healthy ? 'healthy' : 'degraded',
      uptime: process.uptime(),
      checks,
    });
  });

  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(usersRoutes);
      await api.register(escrowRoutes);
      await api.register(disputesRoutes);
      await api.register(notificationsRoutes);
    },
    { prefix: '/api/v1' },
  );

  return app;
}

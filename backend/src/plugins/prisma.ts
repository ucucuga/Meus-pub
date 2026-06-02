import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import { type FastifyInstance } from 'fastify';

const prisma = new PrismaClient();

export default fp(async (app: FastifyInstance) => {
  await prisma.$connect();
  app.log.info('PostgreSQL connected');

  app.decorate('prisma', prisma);

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
    app.log.info('PostgreSQL disconnected');
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

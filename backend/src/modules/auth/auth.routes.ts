import { type FastifyInstance } from 'fastify';
import { AuthService } from './auth.service.js';
import { telegramAuthSchema, connectWalletSchema, tonProofCheckSchema } from './auth.schema.js';

export default async function authRoutes(app: FastifyInstance) {
  const service = new AuthService(app);

  app.post('/auth/telegram', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
      },
    },
    handler: async (request, reply) => {
      const body = telegramAuthSchema.parse(request.body);
      const result = await service.authenticateWithTelegram(body);
      return reply.code(200).send(result);
    },
  });

  app.post('/auth/connect-wallet', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const body = connectWalletSchema.parse(request.body);
      const user = await service.connectWallet(request.user.sub, body);
      return reply.code(200).send(user);
    },
  });

  app.post('/auth/ton-proof/generate-payload', async (_request, reply) => {
    const result = await service.generateTonProofPayload();
    return reply.code(200).send(result);
  });

  app.post('/auth/ton-proof/check-proof', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const body = tonProofCheckSchema.parse(request.body);
      const result = await service.checkTonProof(request.user.sub, body);
      return reply.code(200).send(result);
    },
  });
}

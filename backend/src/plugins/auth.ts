import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { config } from '../config/index.js';

export default fp(async (app: FastifyInstance) => {
  app.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRES_IN },
  });

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });
});

export interface JwtPayload {
  sub: string; // user id
  telegramId: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

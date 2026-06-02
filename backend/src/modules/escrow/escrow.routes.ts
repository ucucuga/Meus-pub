import { type FastifyInstance } from 'fastify';
import { EscrowService } from './escrow.service.js';
import { createEscrowHandler } from './escrow.handler.js';
import {
  createEscrowSchema,
  createEscrowBodySchema,
  escrowIdParams,
  listEscrowsQuery,
  submitWorkSchema,
  recordDeploySchema,
} from './escrow.schema.js';

export default async function escrowRoutes(app: FastifyInstance) {
  const service = new EscrowService(app);
  const escrowHandler = createEscrowHandler(app);

  app.addHook('preHandler', app.authenticate);

  app.post('/escrows', async (request, reply) => {
    const body = createEscrowSchema.parse(request.body);
    const escrow = await service.create(request.user.sub, body);
    return reply.code(201).send(escrow);
  });

  app.post('/escrow', async (request, reply) => {
    const body = createEscrowBodySchema.parse(request.body);
    const escrow = await service.create(request.user.sub, body);
    return reply.code(201).send(escrow);
  });

  app.get('/escrows', async (request) => {
    const query = listEscrowsQuery.parse(request.query);
    return service.list(request.user.sub, query);
  });

  app.get('/escrows/:id', async (request) => {
    const { id } = escrowIdParams.parse(request.params);
    return service.getById(id, request.user.sub);
  });

  app.post('/escrows/:id/accept', { onRequest: [app.authenticate] }, escrowHandler.acceptInvitation);

  app.post('/escrows/:id/deploy', async (request, reply) => {
    const { id } = escrowIdParams.parse(request.params);
    const body = recordDeploySchema.parse(request.body);
    const escrow = await service.recordDeploy(id, request.user.sub, body);
    return reply.code(200).send(escrow);
  });

  app.post('/escrows/:id/submit', async (request, reply) => {
    const { id } = escrowIdParams.parse(request.params);
    const body = submitWorkSchema.parse(request.body);
    const escrow = await service.submitWork(id, request.user.sub, body);
    return reply.code(200).send(escrow);
  });

  app.post('/escrows/:id/approve', async (request, reply) => {
    const { id } = escrowIdParams.parse(request.params);
    const escrow = await service.approve(id, request.user.sub);
    return reply.code(200).send(escrow);
  });

  app.post('/escrows/:id/dispute', async (request, reply) => {
    const { id } = escrowIdParams.parse(request.params);
    const escrow = await service.openDispute(id, request.user.sub);
    return reply.code(200).send(escrow);
  });

  app.post('/escrows/:id/cancel', async (request, reply) => {
    const { id } = escrowIdParams.parse(request.params);
    const escrow = await service.cancel(id, request.user.sub);
    return reply.code(200).send(escrow);
  });
}

import { type FastifyInstance } from 'fastify';
import { DisputesService } from './disputes.service.js';
import {
  openDisputeSchema,
  submitEvidenceSchema,
  resolveDisputeSchema,
  disputeIdParams,
  listDisputesQuery,
} from './disputes.schema.js';

export default async function disputesRoutes(app: FastifyInstance) {
  const service = new DisputesService(app);

  app.addHook('preHandler', app.authenticate);

  app.post('/disputes', async (request, reply) => {
    const body = openDisputeSchema.parse(request.body);
    const dispute = await service.open(request.user.sub, body);
    return reply.code(201).send(dispute);
  });

  app.post('/disputes/evidence', async (request, reply) => {
    const body = submitEvidenceSchema.parse(request.body);
    const dispute = await service.submitEvidence(request.user.sub, body);
    return reply.code(200).send(dispute);
  });

  app.get('/disputes', async (request) => {
    const query = listDisputesQuery.parse(request.query);
    return service.list(request.user.sub, query);
  });

  app.get('/disputes/:id', async (request) => {
    const { id } = disputeIdParams.parse(request.params);
    return service.getById(id, request.user.sub);
  });

  app.post('/disputes/:id/resolve', async (request, reply) => {
    const { id } = disputeIdParams.parse(request.params);
    const body = resolveDisputeSchema.parse(request.body);
    const dispute = await service.resolve(id, request.user.sub, body);
    return reply.code(200).send(dispute);
  });
}

import { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { EscrowService } from './escrow.service.js';
import { escrowIdParams } from './escrow.schema.js';

export function createEscrowHandler(app: FastifyInstance) {
  const escrowService = new EscrowService(app);

  return {
    acceptInvitation: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = escrowIdParams.parse(request.params);
      const result = await escrowService.acceptInvitation(id, request.user.sub);
      reply.send(result);
    },
  };
}

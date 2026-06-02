import { type FastifyInstance } from 'fastify';
import { NotificationsService } from './notifications.service.js';
import { z } from 'zod';

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const idParams = z.object({ id: z.string().uuid() });

export default async function notificationsRoutes(app: FastifyInstance) {
  const service = new NotificationsService(app);

  app.addHook('preHandler', app.authenticate);

  app.get('/notifications', async (request) => {
    const query = listQuery.parse(request.query);
    return service.listForUser(request.user.sub, query.limit, query.offset);
  });

  app.post('/notifications/:id/read', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const notification = await service.markRead(id, request.user.sub);
    return reply.code(200).send(notification);
  });

  app.post('/notifications/read-all', async (request, reply) => {
    await service.markAllRead(request.user.sub);
    return reply.code(204).send();
  });
}

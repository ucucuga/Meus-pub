import { type FastifyInstance } from 'fastify';
import { UsersService } from './users.service.js';
import { getUserParams, searchUsersQuery } from './users.schema.js';

export default async function usersRoutes(app: FastifyInstance) {
  const service = new UsersService(app);

  app.addHook('preHandler', app.authenticate);

  app.get('/users/me', async (request) => {
    return service.getMe(request.user.sub);
  });

  app.get('/users/search', async (request) => {
    const query = searchUsersQuery.parse(request.query);
    return service.search(query);
  });

  app.get('/users/:id', async (request) => {
    const { id } = getUserParams.parse(request.params);
    return service.getById(id);
  });
}

import { type PrismaClient } from '@prisma/client';
import { type FastifyInstance } from 'fastify';
import { prismaCall } from '../../utils/prisma.js';
import { type SearchUsersQuery } from './users.schema.js';

function serializeUser(user: {
  id: string;
  telegramId: bigint;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  walletAddress: string | null;
  photoUrl: string | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    telegramId: Number(user.telegramId),
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    walletAddress: user.walletAddress,
    photoUrl: user.photoUrl,
    createdAt: user.createdAt.toISOString(),
  };
}

export class UsersService {
  constructor(private readonly app: FastifyInstance) {}

  private get prisma(): PrismaClient {
    return this.app.prisma;
  }

  async getMe(userId: string) {
    return prismaCall(this.app.log, { method: 'getMe', userId }, async () => {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      return serializeUser(user);
    });
  }

  async getById(id: string) {
    return prismaCall(this.app.log, { method: 'getById', id }, async () => {
      const user = await this.prisma.user.findUnique({ where: { id } });
      if (!user) {
        throw Object.assign(new Error('User not found'), { statusCode: 404, error: 'Not Found' });
      }
      return serializeUser(user);
    });
  }

  async search(query: SearchUsersQuery) {
    return prismaCall(this.app.log, { method: 'search' }, async () => {
      const where: Record<string, unknown> = {};
      if (query.username) where.username = { contains: query.username, mode: 'insensitive' };
      if (query.telegramId) where.telegramId = BigInt(query.telegramId);

      const [users, total] = await Promise.all([
        this.prisma.user.findMany({
          where,
          take: query.limit,
          skip: query.offset,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.user.count({ where }),
      ]);

      return { users: users.map(serializeUser), total };
    });
  }
}

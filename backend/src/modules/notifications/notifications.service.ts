import { type PrismaClient, Prisma, type NotificationType } from '@prisma/client';
import { type FastifyInstance } from 'fastify';
import { prismaCall } from '../../utils/prisma.js';
import { sendTelegramMessage } from '../../utils/telegram-bot.js';
import { deliverByType, loadEscrow } from './notification-delivery.js';

export class NotificationsService {
  constructor(private readonly app: FastifyInstance) {}

  private get prisma(): PrismaClient {
    return this.app.prisma;
  }

  async create(params: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
    escrowId?: string;
  }) {
    return prismaCall(this.app.log, { method: 'create', userId: params.userId }, async () => {
      const notification = await this.prisma.notification.create({
        data: {
          userId: params.userId,
          type: params.type,
          title: params.title,
          body: params.body,
          metadata: (params.metadata as Prisma.InputJsonValue) ?? undefined,
        },
      });

      if (params.escrowId) {
        const escrow = await loadEscrow(this.prisma, params.escrowId);
        if (escrow) {
          this.sendTelegramForType(escrow, params.type, params.userId).catch((err) => {
            this.app.log.warn({ err, userId: params.userId }, 'Failed to send Telegram notification');
          });
          return notification;
        }
      }

      const user = await this.prisma.user.findUnique({ where: { id: params.userId } });
      if (user) {
        const text = `<b>${params.title}</b>\n${params.body}`;
        sendTelegramMessage(user.telegramId, text).catch((err) => {
          this.app.log.warn({ err, userId: params.userId }, 'Failed to send Telegram notification');
        });
      }

      return notification;
    });
  }

  private async sendTelegramForType(
    escrow: NonNullable<Awaited<ReturnType<typeof loadEscrow>>>,
    type: NotificationType,
    targetUserId: string,
  ) {
    if (type === 'ESCROW_CREATED' || type === 'DISPUTE_OPENED' || type === 'AUTO_RELEASED') {
      await deliverByType(this.prisma, type, escrow);
      return;
    }

    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) return;

    await deliverByType(this.prisma, type, escrow);
  }

  async listForUser(userId: string, limit = 20, offset = 0) {
    return prismaCall(this.app.log, { method: 'listForUser', userId }, async () => {
      const [notifications, total, unreadCount] = await Promise.all([
        this.prisma.notification.findMany({
          where: { userId },
          take: limit,
          skip: offset,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.notification.count({ where: { userId } }),
        this.prisma.notification.count({ where: { userId, read: false } }),
      ]);

      return { notifications, total, unreadCount };
    });
  }

  async markRead(notificationId: string, userId: string) {
    return prismaCall(this.app.log, { method: 'markRead', notificationId, userId }, async () => {
      const notification = await this.prisma.notification.findUnique({
        where: { id: notificationId },
      });
      if (!notification || notification.userId !== userId) {
        throw Object.assign(new Error('Notification not found'), {
          statusCode: 404,
          error: 'Not Found',
        });
      }

      return this.prisma.notification.update({
        where: { id: notificationId },
        data: { read: true },
      });
    });
  }

  async markAllRead(userId: string) {
    return prismaCall(this.app.log, { method: 'markAllRead', userId }, async () => {
      await this.prisma.notification.updateMany({
        where: { userId, read: false },
        data: { read: true },
      });
    });
  }
}

import { type PrismaClient, Prisma, EscrowStatus, DisputeStatus } from '@prisma/client';
import { type FastifyInstance } from 'fastify';
import { type OpenDisputeInput, type ResolveDisputeInput, type SubmitEvidenceInput } from './disputes.schema.js';
import { type z } from 'zod';
import { type listDisputesQuery } from './disputes.schema.js';
import { notificationQueue } from '../jobs/queue.js';
import { prismaCall } from '../../utils/prisma.js';
import { sendArbiterDisputeDetails } from '../notifications/notification-delivery.js';
import { resolveDisputeAsArbiter } from './arbiter-resolve.js';

export class DisputesService {
  constructor(private readonly app: FastifyInstance) {}

  private get prisma(): PrismaClient {
    return this.app.prisma;
  }

  async open(userId: string, input: OpenDisputeInput) {
    return prismaCall(this.app.log, { method: 'open', userId, escrowId: input.escrowId }, async () => {
      const escrow = await this.prisma.escrow.findUnique({ where: { id: input.escrowId } });
      if (!escrow) {
        throw Object.assign(new Error('Escrow not found'), { statusCode: 404, error: 'Not Found' });
      }
      if (escrow.employerId !== userId) {
        throw Object.assign(new Error('Only employer can open dispute'), { statusCode: 403 });
      }
      if (escrow.status !== EscrowStatus.SUBMITTED) {
        throw Object.assign(new Error('Can only dispute submitted work'), { statusCode: 400 });
      }
      if (escrow.reviewDeadline && escrow.reviewDeadline < new Date()) {
        throw Object.assign(new Error('Review deadline passed'), { statusCode: 400 });
      }

      const [dispute] = await this.prisma.$transaction([
        this.prisma.dispute.create({
          data: {
            escrowId: input.escrowId,
            raisedById: userId,
            reason: input.reason,
            evidence: (input.evidence as Prisma.InputJsonValue) ?? undefined,
          },
        }),
        this.prisma.escrow.update({
          where: { id: input.escrowId },
          data: { status: EscrowStatus.DISPUTE },
        }),
      ]);

      await notificationQueue.add('dispute-opened', {
        type: 'notify',
        escrowId: input.escrowId,
        notificationType: 'DISPUTE_OPENED',
      });

      return dispute;
    });
  }

  async submitEvidence(userId: string, input: SubmitEvidenceInput) {
    return prismaCall(
      this.app.log,
      { method: 'submitEvidence', userId, escrowId: input.escrowId },
      async () => {
        const escrow = await this.prisma.escrow.findUnique({ where: { id: input.escrowId } });
        if (!escrow) {
          throw Object.assign(new Error('Escrow not found'), { statusCode: 404, error: 'Not Found' });
        }
        if (escrow.status !== EscrowStatus.DISPUTE) {
          throw Object.assign(new Error('Escrow is not in dispute'), { statusCode: 400 });
        }

        const caller = await this.prisma.user.findUnique({ where: { id: userId } });
        const isEmployer = escrow.employerId === userId;
        const isFreelancer =
          escrow.freelancerId === userId ||
          (caller?.walletAddress !== undefined &&
            caller.walletAddress !== null &&
            caller.walletAddress === escrow.freelancerWallet);
        if (!isEmployer && !isFreelancer) {
          throw Object.assign(new Error('Only contract parties can submit evidence'), {
            statusCode: 403,
          });
        }

        const dispute = await this.prisma.dispute.findFirst({
          where: { escrowId: input.escrowId, status: DisputeStatus.OPEN },
          orderBy: { createdAt: 'desc' },
        });
        if (!dispute) {
          throw Object.assign(new Error('No open dispute found'), { statusCode: 404 });
        }

        const party = isEmployer ? 'employer' : 'freelancer';
        const existing =
          dispute.evidence && typeof dispute.evidence === 'object' && !Array.isArray(dispute.evidence)
            ? (dispute.evidence as Record<string, unknown>)
            : {};
        if (existing[party]) {
          throw Object.assign(new Error('Evidence already submitted'), { statusCode: 400 });
        }

        const files = input.files ?? [];
        const updatedEvidence = {
          ...existing,
          [party]: {
            reason: input.reason,
            fileNames: files.map((f) => f.name),
            files,
            submittedAt: new Date().toISOString(),
          },
        };

        const updated = await this.prisma.dispute.update({
          where: { id: dispute.id },
          data: { evidence: updatedEvidence as Prisma.InputJsonValue },
        });

        if (updatedEvidence.employer && updatedEvidence.freelancer) {
          await sendArbiterDisputeDetails(
            this.prisma,
            input.escrowId,
            dispute.id,
            true,
          );
        }

        return updated;
      },
    );
  }

  async resolve(disputeId: string, userId: string, input: ResolveDisputeInput) {
    return prismaCall(this.app.log, { method: 'resolve', disputeId, userId }, async () => {
      const dispute = await this.prisma.dispute.findUnique({
        where: { id: disputeId },
        include: { escrow: true },
      });
      if (!dispute) {
        throw Object.assign(new Error('Dispute not found'), { statusCode: 404, error: 'Not Found' });
      }

      const caller = await this.prisma.user.findUnique({ where: { id: userId } });
      const isArbiter =
        dispute.escrow.arbiterId === userId ||
        (caller?.walletAddress !== undefined &&
          caller.walletAddress === dispute.escrow.arbiterWallet);
      if (!isArbiter) {
        throw Object.assign(new Error('Only arbiter can resolve'), { statusCode: 403 });
      }
      if (dispute.status !== DisputeStatus.OPEN) {
        throw Object.assign(new Error('Dispute already resolved'), { statusCode: 400 });
      }

      await resolveDisputeAsArbiter(this.prisma, disputeId, input.winner, this.app.log);

      return this.prisma.dispute.findUniqueOrThrow({ where: { id: disputeId } });
    });
  }

  async list(userId: string, query: z.infer<typeof listDisputesQuery>) {
    return prismaCall(this.app.log, { method: 'list', userId }, async () => {
      const where: Record<string, unknown> = {};
      if (query.escrowId) where.escrowId = query.escrowId;
      if (query.status) where.status = query.status;

      where.escrow = {
        OR: [{ employerId: userId }, { freelancerId: userId }, { arbiterId: userId }],
      };

      const [disputes, total] = await Promise.all([
        this.prisma.dispute.findMany({
          where,
          take: query.limit,
          skip: query.offset,
          orderBy: { createdAt: 'desc' },
          include: { escrow: { select: { id: true, title: true, status: true } } },
        }),
        this.prisma.dispute.count({ where }),
      ]);

      return { disputes, total };
    });
  }

  async getById(disputeId: string, userId: string) {
    return prismaCall(this.app.log, { method: 'getById', disputeId, userId }, async () => {
      const dispute = await this.prisma.dispute.findUnique({
        where: { id: disputeId },
        include: {
          escrow: {
            include: {
              employer: { select: { id: true, username: true, firstName: true } },
              freelancer: { select: { id: true, username: true, firstName: true } },
              arbiter: { select: { id: true, username: true, firstName: true } },
            },
          },
          raisedBy: { select: { id: true, username: true, firstName: true } },
        },
      });
      if (!dispute) {
        throw Object.assign(new Error('Dispute not found'), { statusCode: 404, error: 'Not Found' });
      }

      const e = dispute.escrow;
      const isParty = e.employerId === userId || e.freelancerId === userId || e.arbiterId === userId;
      if (!isParty) throw Object.assign(new Error('Forbidden'), { statusCode: 403 });

      return dispute;
    });
  }
}

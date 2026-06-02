import { type PrismaClient, type Escrow, EscrowStatus, DisputeStatus } from '@prisma/client';
import { type FastifyInstance } from 'fastify';
import { config } from '../../config/index.js';
import { BlockchainService } from '../blockchain/blockchain.service.js';
import {
  type CreateEscrowInput,
  type ListEscrowsQuery,
  type submitWorkSchema,
  type recordDeploySchema,
} from './escrow.schema.js';
import { type z } from 'zod';
import { escrowQueue, notificationQueue } from '../jobs/queue.js';
import { prismaCall } from '../../utils/prisma.js';
import { calculateCommission, getCommissionRate } from '../../utils/commission.js';

type EscrowWithPartyNames = Escrow & {
  employer?: { username: string | null; firstName?: string | null } | null;
  freelancer?: { username: string | null; firstName?: string | null } | null;
};

function serializeEscrow(e: EscrowWithPartyNames) {
  const { employer, freelancer, ...rest } = e;
  return {
    ...rest,
    amount: e.amount.toString(),
    deadline: e.deadline.toISOString(),
    reviewDeadline: e.reviewDeadline?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    employerUsername: employer?.username ?? null,
    freelancerUsername: freelancer?.username ?? null,
  };
}

function deployNonceFromEscrowId(id: string): number {
  const nonce = Number.parseInt(id.replace(/-/g, '').slice(0, 8), 16) >>> 0;
  return nonce || 1;
}

export class EscrowService {
  private readonly blockchain: BlockchainService;

  constructor(private readonly app: FastifyInstance) {
    this.blockchain = new BlockchainService(app);
  }

  private get prisma(): PrismaClient {
    return this.app.prisma;
  }

  private async triggerSync(escrowId: string) {
    await escrowQueue.add('sync-state', { type: 'sync-state', escrowId }, { delay: 5000 });
    await escrowQueue.add('sync-state', { type: 'sync-state', escrowId }, { delay: 15000 });
    await escrowQueue.add('sync-state', { type: 'sync-state', escrowId }, { delay: 30000 });
  }

  async create(userId: string, input: CreateEscrowInput) {
    return prismaCall(this.app.log, { method: 'create', userId }, async () => {
      const creator = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      if (!creator.walletAddress) {
        throw Object.assign(
          new Error('Connect your TON wallet before creating an escrow'),
          { statusCode: 400 },
        );
      }

      const role = input.role ?? 'employer';
      let employerId: string;
      let employerWallet: string;
      let freelancerId: string | null;
      let freelancerWallet: string;
      let freelancerAccepted: boolean;

      if (role === 'freelancer') {
        if (!input.employerWallet) {
          throw Object.assign(new Error('employerWallet is required when role is freelancer'), {
            statusCode: 400,
          });
        }
        if (creator.walletAddress === input.employerWallet) {
          throw Object.assign(
            new Error('Cannot create escrow with yourself'),
            { statusCode: 400 },
          );
        }

        const employerUser = await this.prisma.user.findFirst({
          where: { walletAddress: input.employerWallet },
        });
        if (!employerUser) {
          throw Object.assign(
            new Error('Customer must be registered with a connected wallet'),
            { statusCode: 400 },
          );
        }

        employerId = employerUser.id;
        employerWallet = input.employerWallet;
        freelancerId = userId;
        freelancerWallet = creator.walletAddress;
        freelancerAccepted = true;
      } else {
        if (creator.walletAddress === input.freelancerWallet) {
          throw Object.assign(
            new Error('Cannot create escrow with yourself'),
            { statusCode: 400 },
          );
        }

        const freelancerUser = await this.prisma.user.findFirst({
          where: { walletAddress: input.freelancerWallet },
        });

        employerId = userId;
        employerWallet = creator.walletAddress;
        freelancerId = freelancerUser?.id ?? null;
        freelancerWallet = input.freelancerWallet;
        freelancerAccepted = false;
      }

      const amount = BigInt(input.amount);
      if (amount < 10_000_000n) {
        throw Object.assign(
          new Error('Minimum escrow amount is 0.01 TON (10000000 nanotons)'),
          { statusCode: 400 },
        );
      }

      const deadlineUnix =
        input.deadline !== undefined
          ? input.deadline
          : Math.floor(Date.now() / 1000) + (input.deadlineDays ?? 7) * 86_400;
      const deadlineDate = new Date(deadlineUnix * 1000);
      const arbiterWallet = config.ARBITER_ADDRESS;

      const escrow = await this.prisma.escrow.create({
        data: {
          employerId,
          freelancerId,
          employerWallet,
          freelancerWallet,
          arbiterWallet: arbiterWallet,
          title: input.projectName,
          description: input.description ?? null,
          amount,
          deadline: deadlineDate,
          status: EscrowStatus.DEPLOYING,
          freelancerAccepted,
        },
      });

      let deployResult;
      try {
        deployResult = await this.blockchain.deployEscrowContract({
          employer: employerWallet,
          freelancer: freelancerWallet,
          arbiter: arbiterWallet,
          amount,
          deadline: deadlineUnix,
          deployNonce: deployNonceFromEscrowId(escrow.id),
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await this.prisma.escrow.update({
          where: { id: escrow.id },
          data: { status: EscrowStatus.CANCELLED },
        });
        this.app.log.error({ err: message, escrowId: escrow.id }, 'Contract deployment failed');
        throw Object.assign(
          new Error(`Contract deployment failed: ${message}`),
          { statusCode: 502, error: 'Bad Gateway' },
        );
      }

      const updated = await this.prisma.escrow.update({
        where: { id: escrow.id },
        data: {
          contractAddress: deployResult.contractAddress,
          status: EscrowStatus.INIT,
        },
      });

      this.app.log.info(
        {
          escrowId: updated.id,
          contractAddress: deployResult.contractAddress,
          employer: employerWallet,
          freelancer: freelancerWallet,
        },
        'Escrow contract deployed',
      );

      await notificationQueue.add('escrow-created', {
        type: 'escrow-created',
        escrowId: updated.id,
      });

      await notificationQueue.add('invitation-received', {
        type: 'notify',
        escrowId: updated.id,
        notificationType: 'INVITATION_RECEIVED',
      });

      return {
        ...serializeEscrow(updated),
        deployerAddress: deployResult.deployerAddress,
      };
    });
  }

  async list(userId: string, query: ListEscrowsQuery) {
    return prismaCall(this.app.log, { method: 'list', userId }, async () => {
      const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
      const where: Record<string, unknown> = {};

      if (query.role === 'employer') where.employerId = userId;
      else if (query.role === 'freelancer') where.freelancerId = userId;
      else if (query.role === 'arbiter') where.arbiterId = userId;
      else {
        const orConditions: Record<string, unknown>[] = [
          { employerId: userId },
          { freelancerId: userId },
          { arbiterId: userId },
        ];
        if (currentUser?.walletAddress) {
          orConditions.push({ freelancerWallet: currentUser.walletAddress });
          orConditions.push({ employerWallet: currentUser.walletAddress });
        }
        where.OR = orConditions;
      }

      if (query.status) where.status = query.status;

      const [escrows, total] = await Promise.all([
        this.prisma.escrow.findMany({
          where,
          take: query.limit,
          skip: query.offset,
          orderBy: { createdAt: 'desc' },
          include: {
            employer: { select: { username: true, firstName: true } },
            freelancer: { select: { username: true, firstName: true } },
          },
        }),
        this.prisma.escrow.count({ where }),
      ]);

      return { escrows: escrows.map(serializeEscrow), total };
    });
  }

  async getById(id: string, userId: string) {
    return prismaCall(this.app.log, { method: 'getById', id, userId }, async () => {
      const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
      const escrow = await this.prisma.escrow.findUnique({
        where: { id },
        include: {
          employer: { select: { id: true, username: true, firstName: true, walletAddress: true } },
          freelancer: { select: { id: true, username: true, firstName: true, walletAddress: true } },
          arbiter: { select: { id: true, username: true, firstName: true, walletAddress: true } },
          disputes: true,
        },
      });
      if (!escrow) {
        throw Object.assign(new Error('Escrow not found'), { statusCode: 404, error: 'Not Found' });
      }

      const isParty =
        escrow.employerId === userId ||
        escrow.freelancerId === userId ||
        escrow.arbiterId === userId ||
        (currentUser?.walletAddress !== undefined &&
          currentUser?.walletAddress !== null &&
          escrow.freelancerWallet === currentUser.walletAddress) ||
        (currentUser?.walletAddress !== undefined &&
          currentUser?.walletAddress !== null &&
          escrow.employerWallet === currentUser.walletAddress);
      if (!isParty) throw Object.assign(new Error('Forbidden'), { statusCode: 403 });

      const amountNano = BigInt(escrow.amount);
      return {
        ...serializeEscrow(escrow),
        commissionRate: getCommissionRate(amountNano),
        commissionAmount: calculateCommission(amountNano).toString(),
        employer: escrow.employer,
        freelancer: escrow.freelancer,
        arbiter: escrow.arbiter,
        disputes: escrow.disputes,
      };
    });
  }

  async recordDeploy(id: string, userId: string, input: z.infer<typeof recordDeploySchema>) {
    return prismaCall(this.app.log, { method: 'recordDeploy', id, userId }, async () => {
      const escrow = await this.prisma.escrow.findUnique({ where: { id } });
      if (!escrow) {
        throw Object.assign(new Error('Escrow not found'), { statusCode: 404, error: 'Not Found' });
      }
      if (escrow.employerId !== userId) {
        throw Object.assign(new Error('Only employer can deploy'), { statusCode: 403 });
      }
      if (escrow.status !== EscrowStatus.DRAFT) {
        throw Object.assign(new Error('Escrow already deployed'), { statusCode: 400 });
      }

      const updated = await this.prisma.escrow.update({
        where: { id },
        data: {
          contractAddress: input.contractAddress,
          deployTxHash: input.deployTxHash,
          status: EscrowStatus.INIT,
        },
      });

      return serializeEscrow(updated);
    });
  }

  async acceptInvitation(id: string, userId: string) {
    return prismaCall(this.app.log, { method: 'acceptInvitation', id, userId }, async () => {
      const escrow = await this.prisma.escrow.findUnique({ where: { id } });
      if (!escrow) {
        throw Object.assign(new Error('Escrow not found'), { statusCode: 404, error: 'Not Found' });
      }
      if (escrow.status !== EscrowStatus.INIT) {
        throw Object.assign(new Error('Cannot accept in current state'), { statusCode: 400 });
      }

      if (escrow.employerId === userId) {
        throw Object.assign(
          new Error('Employer cannot accept their own contract'),
          { statusCode: 403 },
        );
      }

      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user?.walletAddress || user.walletAddress !== escrow.freelancerWallet) {
        throw Object.assign(new Error('Only invited freelancer can accept'), { statusCode: 403 });
      }

      const updated = await this.prisma.escrow.update({
        where: { id },
        data: {
          freelancerId: escrow.freelancerId ?? userId,
          freelancerAccepted: true,
        },
      });

      await notificationQueue.add('freelancer-accepted', {
        type: 'notify',
        escrowId: id,
        notificationType: 'FREELANCER_ACCEPTED',
      });

      void this.triggerSync(id);

      return serializeEscrow(updated);
    });
  }

  async updateStatus(id: string, status: EscrowStatus, extra?: Record<string, unknown>) {
    return prismaCall(this.app.log, { method: 'updateStatus', id }, async () => {
      const updated = await this.prisma.escrow.update({
        where: { id },
        data: { status, ...extra },
      });
      return serializeEscrow(updated);
    });
  }

  async submitWork(id: string, userId: string, input: z.infer<typeof submitWorkSchema>) {
    return prismaCall(this.app.log, { method: 'submitWork', id, userId }, async () => {
      const escrow = await this.prisma.escrow.findUnique({ where: { id } });
      if (!escrow) {
        throw Object.assign(new Error('Escrow not found'), { statusCode: 404, error: 'Not Found' });
      }
      if (escrow.freelancerId !== userId) {
        throw Object.assign(new Error('Only freelancer can submit work'), { statusCode: 403 });
      }
      if (escrow.status !== EscrowStatus.FUNDED) {
        throw Object.assign(new Error('Escrow not in FUNDED state'), { statusCode: 400 });
      }

      const reviewDeadline = new Date(Date.now() + 48 * 3600_000);
      const updated = await this.prisma.escrow.update({
        where: { id },
        data: {
          workHash: input.workHash,
          reviewDeadline,
          status: EscrowStatus.SUBMITTED,
        },
      });

      if (escrow.contractAddress) {
        try {
          await this.blockchain.sendDeployerSubmit(escrow.contractAddress, input.workHash);
        } catch (err) {
          this.app.log.error({ err }, 'Deployer submit tx failed');
        }
      }

      await notificationQueue.add('work-submitted', {
        type: 'notify',
        escrowId: id,
        notificationType: 'WORK_SUBMITTED',
      });

      void this.triggerSync(id);

      return serializeEscrow(updated);
    });
  }

  async approve(id: string, userId: string) {
    return prismaCall(this.app.log, { method: 'approve', id, userId }, async () => {
      const escrow = await this.prisma.escrow.findUnique({ where: { id } });
      if (!escrow) {
        throw Object.assign(new Error('Escrow not found'), { statusCode: 404, error: 'Not Found' });
      }
      if (escrow.employerId !== userId) {
        throw Object.assign(new Error('Only employer can approve'), { statusCode: 403 });
      }
      if (escrow.status !== EscrowStatus.SUBMITTED) {
        throw Object.assign(new Error('Escrow not in SUBMITTED state'), { statusCode: 400 });
      }

      if (escrow.freelancerId) {
        await notificationQueue.add('work-approved', {
          type: 'notify',
          escrowId: id,
          notificationType: 'WORK_APPROVED',
        });
      }

      await notificationQueue.add('work-approved-employer', {
        type: 'notify',
        escrowId: id,
        notificationType: 'WORK_APPROVED_EMPLOYER',
      });

      if (escrow.contractAddress) {
        try {
          await this.blockchain.sendDeployerApprove(escrow.contractAddress);
        } catch (err) {
          this.app.log.error({ err }, 'Deployer approve tx failed');
        }
      }

      void this.triggerSync(id);

      return serializeEscrow(escrow);
    });
  }

  async openDispute(id: string, userId: string) {
    return prismaCall(this.app.log, { method: 'openDispute', id, userId }, async () => {
      const escrow = await this.prisma.escrow.findUnique({ where: { id } });
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

      const existingDispute = await this.prisma.dispute.findFirst({
        where: { escrowId: id, status: DisputeStatus.OPEN },
      });
      if (existingDispute) {
        return serializeEscrow(escrow);
      }

      await this.prisma.$transaction([
        this.prisma.dispute.create({
          data: {
            escrowId: id,
            raisedById: userId,
            reason: 'Dispute opened',
            evidence: {},
          },
        }),
        this.prisma.escrow.update({
          where: { id },
          data: { status: EscrowStatus.DISPUTE },
        }),
      ]);

      if (escrow.contractAddress) {
        try {
          await this.blockchain.sendDeployerDispute(escrow.contractAddress);
        } catch (err) {
          this.app.log.error({ err }, 'Deployer dispute tx failed');
        }
      }

      await notificationQueue.add('dispute-opened-arbiter', {
        type: 'notify',
        escrowId: id,
        notificationType: 'DISPUTE_OPENED',
      });

      void this.triggerSync(id);

      const updated = await this.prisma.escrow.findUniqueOrThrow({ where: { id } });
      return serializeEscrow(updated);
    });
  }

  async cancel(id: string, userId: string) {
    return prismaCall(this.app.log, { method: 'cancel', id, userId }, async () => {
      const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
      const escrow = await this.prisma.escrow.findUnique({ where: { id } });
      if (!escrow) {
        throw Object.assign(new Error('Escrow not found'), { statusCode: 404, error: 'Not Found' });
      }

      const isFreelancer =
        escrow.freelancerId === userId ||
        (currentUser?.walletAddress !== undefined &&
          currentUser?.walletAddress !== null &&
          escrow.freelancerWallet === currentUser.walletAddress);

      if (isFreelancer && escrow.status === EscrowStatus.INIT) {
        const updated = await this.prisma.escrow.update({
          where: { id },
          data: { status: EscrowStatus.CANCELLED },
        });
        return serializeEscrow(updated);
      }

      if (escrow.employerId !== userId) {
        throw Object.assign(new Error('Only employer can cancel'), { statusCode: 403 });
      }
      if (escrow.status !== EscrowStatus.FUNDED) {
        throw Object.assign(new Error('Cannot cancel in current state'), { statusCode: 400 });
      }

      const updated = await this.prisma.escrow.update({
        where: { id },
        data: { status: EscrowStatus.CANCELLED },
      });

    if (escrow.freelancerId) {
      await notificationQueue.add('escrow-cancelled', {
        type: 'notify',
        escrowId: id,
        notificationType: 'ESCROW_CANCELLED',
      });
    }

      return serializeEscrow(updated);
    });
  }
}

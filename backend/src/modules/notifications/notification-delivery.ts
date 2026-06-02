import { Prisma, type PrismaClient, type NotificationType } from '@prisma/client';
import { config } from '../../config/index.js';
import { calculateCommission } from '../../utils/commission.js';
import {
  sendArbiterEvidenceFiles,
  sendTelegramMessage,
} from '../../utils/telegram-bot.js';
import * as messages from '../../utils/notification-messages.js';
import {
  formatCommissionTon,
  formatNanotonsAsTon,
  hoursUntil,
} from '../../utils/ton-format.js';
import { parseDisputeEvidence } from '../../utils/dispute-evidence.js';

type EscrowWithParties = {
  id: string;
  title: string;
  amount: bigint;
  arbiterWallet: string;
  employerId: string;
  employerWallet: string;
  freelancerId: string | null;
  freelancerWallet: string;
  freelancerAccepted: boolean;
  employer: { id: string; telegramId: bigint; username: string | null };
  freelancer: { id: string; telegramId: bigint; username: string | null } | null;
  arbiter: { id: string; telegramId: bigint } | null;
};

const ESCROW_INCLUDE = {
  employer: { select: { id: true, telegramId: true, username: true } },
  freelancer: { select: { id: true, telegramId: true, username: true } },
  arbiter: { select: { id: true, telegramId: true } },
} as const;

function truncateWallet(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function employerDisplayName(escrow: EscrowWithParties): string {
  if (escrow.employer.username) {
    return escrow.employer.username.startsWith('@')
      ? escrow.employer.username
      : `@${escrow.employer.username}`;
  }
  return truncateWallet(escrow.employerWallet);
}

export async function loadEscrow(prisma: PrismaClient, escrowId: string) {
  return prisma.escrow.findUnique({
    where: { id: escrowId },
    include: ESCROW_INCLUDE,
  });
}

async function findFreelancerUser(prisma: PrismaClient, escrow: EscrowWithParties) {
  if (escrow.freelancer) return escrow.freelancer;
  return prisma.user.findFirst({
    where: { walletAddress: escrow.freelancerWallet },
    select: { id: true, telegramId: true, username: true },
  });
}

export async function sendArbiterDisputeDetails(
  prisma: PrismaClient,
  escrowId: string,
  disputeId: string,
  includeResolveButtons: boolean,
): Promise<void> {
  const escrow = await loadEscrow(prisma, escrowId);
  if (!escrow) return;

  const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } });
  if (!dispute) return;

  const evidence = parseDisputeEvidence(dispute.evidence);
  const freelancerUser = await findFreelancerUser(prisma, escrow);
  const freelancerUsername =
    freelancerUser?.username ?? truncateWallet(escrow.freelancerWallet);
  const employerUsername = escrow.employer.username ?? truncateWallet(escrow.employerWallet);

  const message = messages.disputeOpenedArbiter(
    escrow.id,
    dispute.id,
    escrow.title,
    formatNanotonsAsTon(escrow.amount),
    employerUsername,
    freelancerUsername,
    dispute.reason,
    evidence.employer?.reason ?? null,
    evidence.freelancer?.reason ?? null,
    evidence.employer?.fileNames ?? [],
    evidence.freelancer?.fileNames ?? [],
    includeResolveButtons,
  );

  const arbiterUser =
    escrow.arbiter ??
    (await prisma.user.findFirst({
      where: { walletAddress: escrow.arbiterWallet },
      select: { id: true, telegramId: true },
    }));

  let arbiterChatId: bigint | string | null = null;
  if (arbiterUser) {
    await sendToUser(prisma, arbiterUser.id, arbiterUser.telegramId, 'DISPUTE_OPENED', message);
    arbiterChatId = arbiterUser.telegramId;
  } else if (config.ARBITER_TELEGRAM_ID) {
    await sendTelegramMessage(config.ARBITER_TELEGRAM_ID, message.text, message.replyMarkup);
    arbiterChatId = config.ARBITER_TELEGRAM_ID;
  } else {
    console.warn(
      { escrowId: escrow.id, arbiterWallet: escrow.arbiterWallet },
      'Arbiter not reachable via Telegram',
    );
    return;
  }

  if (evidence.employer?.files?.length) {
    await sendArbiterEvidenceFiles(arbiterChatId, 'Customer', evidence.employer.files);
  }
  if (evidence.freelancer?.files?.length) {
    await sendArbiterEvidenceFiles(arbiterChatId, 'Performer', evidence.freelancer.files);
  }
}

export async function persistNotification(
  prisma: PrismaClient,
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      metadata: (metadata as Prisma.InputJsonValue) ?? undefined,
    },
  });
}

export async function sendToUser(
  prisma: PrismaClient,
  userId: string,
  telegramId: bigint,
  type: NotificationType,
  message: messages.NotificationMessage,
  metadata?: Record<string, unknown>,
) {
  const plainTitle = message.text.split('\n')[0]?.replace(/<[^>]+>/g, '') ?? type;
  await persistNotification(prisma, userId, type, plainTitle, message.text, metadata);
  await sendTelegramMessage(telegramId, message.text, message.replyMarkup);
}

export async function sendToArbiter(
  prisma: PrismaClient,
  escrow: EscrowWithParties,
  type: NotificationType,
  message: messages.NotificationMessage,
) {
  const arbiterUser =
    escrow.arbiter ??
    (await prisma.user.findFirst({
      where: { walletAddress: escrow.arbiterWallet },
      select: { id: true, telegramId: true },
    }));

  if (arbiterUser) {
    await sendToUser(prisma, arbiterUser.id, arbiterUser.telegramId, type, message);
    return;
  }

  if (config.ARBITER_TELEGRAM_ID) {
    await sendTelegramMessage(config.ARBITER_TELEGRAM_ID, message.text, message.replyMarkup);
    return;
  }

  console.warn(
    { escrowId: escrow.id, arbiterWallet: escrow.arbiterWallet },
    'Arbiter not reachable via Telegram',
  );
}

export async function deliverByType(
  prisma: PrismaClient,
  type: NotificationType,
  escrow: EscrowWithParties,
  options?: {
    disputeWinner?: 'freelancer' | 'employer';
    hoursLeft?: number;
    staleCancel?: boolean;
    recipient?: 'employer' | 'freelancer';
  },
) {
  const amountTon = formatNanotonsAsTon(escrow.amount);
  const commissionTon = formatCommissionTon(escrow.amount);
  const netPayoutTon = formatNanotonsAsTon(escrow.amount - calculateCommission(escrow.amount));

  switch (type) {
    case 'ESCROW_CREATED': {
      await sendToUser(
        prisma,
        escrow.employerId,
        escrow.employer.telegramId,
        type,
        messages.escrowCreated(escrow.id, escrow.title, 'employer'),
      );
      const freelancer = await findFreelancerUser(prisma, escrow);
      if (freelancer) {
        await sendToUser(
          prisma,
          freelancer.id,
          freelancer.telegramId,
          type,
          messages.escrowCreated(escrow.id, escrow.title, 'freelancer'),
        );
      }
      break;
    }
    case 'FREELANCER_ACCEPTED':
      await sendToUser(
        prisma,
        escrow.employerId,
        escrow.employer.telegramId,
        type,
        messages.freelancerAccepted(escrow.id, escrow.title),
      );
      break;
    case 'INVITATION_RECEIVED': {
      if (escrow.freelancerAccepted) break;
      const freelancer = await findFreelancerUser(prisma, escrow);
      if (!freelancer) break;
      await sendToUser(
        prisma,
        freelancer.id,
        freelancer.telegramId,
        type,
        messages.invitationReceived(
          escrow.id,
          escrow.title,
          employerDisplayName(escrow),
        ),
      );
      break;
    }
    case 'ESCROW_FUNDED': {
      await sendToUser(
        prisma,
        escrow.employerId,
        escrow.employer.telegramId,
        type,
        messages.escrowFunded(escrow.id, escrow.title),
      );
      const freelancer = await findFreelancerUser(prisma, escrow);
      if (freelancer) {
        await sendToUser(
          prisma,
          freelancer.id,
          freelancer.telegramId,
          'FREELANCER_WORK_STARTED',
          messages.freelancerWorkStarted(escrow.id, escrow.title),
        );
      }
      break;
    }
    case 'FREELANCER_WORK_STARTED': {
      const freelancer = await findFreelancerUser(prisma, escrow);
      if (freelancer) {
        await sendToUser(
          prisma,
          freelancer.id,
          freelancer.telegramId,
          type,
          messages.freelancerWorkStarted(escrow.id, escrow.title),
        );
      }
      break;
    }
    case 'WORK_SUBMITTED':
      await sendToUser(
        prisma,
        escrow.employerId,
        escrow.employer.telegramId,
        type,
        messages.workSubmitted(escrow.id, escrow.title),
      );
      break;
    case 'WORK_APPROVED': {
      const freelancer = await findFreelancerUser(prisma, escrow);
      if (freelancer) {
        await sendToUser(
          prisma,
          freelancer.id,
          freelancer.telegramId,
          type,
          messages.workApproved(escrow.id, escrow.title, netPayoutTon, commissionTon),
        );
      }
      break;
    }
    case 'WORK_APPROVED_EMPLOYER':
      await sendToUser(
        prisma,
        escrow.employerId,
        escrow.employer.telegramId,
        type,
        messages.workApprovedEmployer(escrow.id, escrow.title),
      );
      break;
    case 'DISPUTE_OPENED': {
      const freelancer = await findFreelancerUser(prisma, escrow);
      if (freelancer) {
        await sendToUser(
          prisma,
          freelancer.id,
          freelancer.telegramId,
          type,
          messages.disputeOpenedFreelancer(escrow.id, escrow.title),
        );
      }
      const openDispute = await prisma.dispute.findFirst({
        where: { escrowId: escrow.id, status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
      });
      if (openDispute) {
        await sendArbiterDisputeDetails(prisma, escrow.id, openDispute.id, false);
      }
      break;
    }
    case 'DISPUTE_RESOLVED': {
      const winner = options?.disputeWinner ?? 'freelancer';
      const employerWon = winner === 'employer';
      await sendToUser(
        prisma,
        escrow.employerId,
        escrow.employer.telegramId,
        type,
        messages.disputeResolved(escrow.id, escrow.title, employerWon),
      );
      const freelancer = await findFreelancerUser(prisma, escrow);
      if (freelancer) {
        await sendToUser(
          prisma,
          freelancer.id,
          freelancer.telegramId,
          type,
          messages.disputeResolved(escrow.id, escrow.title, !employerWon),
        );
      }
      break;
    }
    case 'ESCROW_CANCELLED': {
      const msg = options?.staleCancel
        ? messages.escrowCancelledStale(escrow.id, escrow.title)
        : messages.escrowCancelled(escrow.id, escrow.title);
      const notifyEmployer = !options?.recipient || options.recipient === 'employer';
      const notifyFreelancer = !options?.recipient || options.recipient === 'freelancer';

      if (notifyEmployer) {
        await sendToUser(
          prisma,
          escrow.employerId,
          escrow.employer.telegramId,
          type,
          msg,
        );
      }

      if (notifyFreelancer) {
        const freelancer = await findFreelancerUser(prisma, escrow);
        if (freelancer) {
          await sendToUser(
            prisma,
            freelancer.id,
            freelancer.telegramId,
            type,
            msg,
          );
        }
      }
      break;
    }
    case 'AUTO_RELEASED': {
      const msg = messages.autoReleased(escrow.id, escrow.title, amountTon);
      await sendToUser(prisma, escrow.employerId, escrow.employer.telegramId, type, msg);
      const freelancer = await findFreelancerUser(prisma, escrow);
      if (freelancer) {
        await sendToUser(prisma, freelancer.id, freelancer.telegramId, type, msg);
      }
      break;
    }
    case 'ESCROW_EXPIRED':
      await sendToUser(
        prisma,
        escrow.employerId,
        escrow.employer.telegramId,
        type,
        messages.refundExpired(escrow.id, escrow.title, amountTon),
      );
      break;
    case 'DEADLINE_APPROACHING': {
      const freelancer = await findFreelancerUser(prisma, escrow);
      const hours = options?.hoursLeft ?? 24;
      if (freelancer) {
        await sendToUser(
          prisma,
          freelancer.id,
          freelancer.telegramId,
          type,
          messages.deadlineApproaching(escrow.id, escrow.title, hours),
        );
      }
      break;
    }
    case 'REVIEW_DEADLINE_APPROACHING':
      await sendToUser(
        prisma,
        escrow.employerId,
        escrow.employer.telegramId,
        type,
        messages.reviewDeadlineApproaching(
          escrow.id,
          escrow.title,
          options?.hoursLeft ?? 24,
        ),
      );
      break;
    default:
      break;
  }
}

export async function deliverResolveTimeout(
  prisma: PrismaClient,
  escrow: EscrowWithParties,
) {
  const msg = messages.resolveTimeout(escrow.id, escrow.title);
  const type: NotificationType = 'DISPUTE_RESOLVED';
  await sendToUser(prisma, escrow.employerId, escrow.employer.telegramId, type, msg);
  const freelancer = await findFreelancerUser(prisma, escrow);
  if (freelancer) {
    await sendToUser(prisma, freelancer.id, freelancer.telegramId, type, msg);
  }
}

export { hoursUntil };

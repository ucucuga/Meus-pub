import { Worker, type Job } from 'bullmq';
import { PrismaClient, EscrowStatus } from '@prisma/client';
import { Address } from '@ton/core';
import { TonClient } from '@ton/ton';
import { config } from '../../../config/index.js';
import { MeusContract } from '../../blockchain/contract.wrapper.js';
import {
  OnChainStatus,
  sendAutoRelease,
  sendRefundExpired,
  sendResolveTimeout,
  DISPUTE_TIMEOUT_MS,
} from '../../blockchain/blockchain.service.js';
import { notificationQueue } from '../queue.js';
import { hoursUntil } from '../../../utils/ton-format.js';

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: Number(parsed.port) || 6379,
    password: parsed.password || undefined,
    db: parsed.pathname ? Number(parsed.pathname.slice(1)) || 0 : 0,
    maxRetriesPerRequest: null as null,
  };
}

const connection = parseRedisUrl(config.REDIS_URL);
const prisma = new PrismaClient();

const tonClient = new TonClient({
  endpoint: config.TON_ENDPOINT,
  apiKey: config.TON_API_KEY || undefined,
});

const STATUS_MAP: Record<number, EscrowStatus> = {
  0: EscrowStatus.INIT,
  1: EscrowStatus.FUNDED,
  2: EscrowStatus.SUBMITTED,
  3: EscrowStatus.DISPUTE,
  4: EscrowStatus.COMPLETED,
  5: EscrowStatus.CANCELLED,
};

type EscrowJobData =
  | { type: 'sync-state'; escrowId: string }
  | { type: 'sync-all' }
  | { type: 'check-deadlines' }
  | { type: 'check-stale-escrows' };

async function processJob(job: Job<EscrowJobData>) {
  const data = job.data;

  if (data.type === 'sync-state') {
    await syncSingleEscrow(data.escrowId);
  } else if (data.type === 'sync-all') {
    await syncAllActive();
  } else if (data.type === 'check-deadlines') {
    await checkDeadlines();
  } else if (data.type === 'check-stale-escrows') {
    await checkStaleEscrows();
  }
}

async function checkStaleEscrows() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const staleEscrows = await prisma.escrow.findMany({
    where: {
      status: EscrowStatus.INIT,
      createdAt: { lt: cutoff },
    },
  });

  for (const escrow of staleEscrows) {
    await prisma.escrow.update({
      where: { id: escrow.id },
      data: { status: EscrowStatus.CANCELLED },
    });

    await notificationQueue.add(`stale-cancel-employer-${escrow.id}`, {
      type: 'notify',
      escrowId: escrow.id,
      notificationType: 'ESCROW_CANCELLED',
      staleCancel: true,
      recipient: 'employer',
    });

    if (escrow.freelancerId) {
      await notificationQueue.add(`stale-cancel-freelancer-${escrow.id}`, {
        type: 'notify',
        escrowId: escrow.id,
        notificationType: 'ESCROW_CANCELLED',
        staleCancel: true,
        recipient: 'freelancer',
      });
    }
  }
}

async function syncSingleEscrow(escrowId: string) {
  const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } });
  if (!escrow?.contractAddress) return;

  const addr = Address.parse(escrow.contractAddress);
  const contract = tonClient.open(MeusContract.createFromAddress(addr));

  try {
    const onChain = await contract.getEscrowData();
    const newStatus = STATUS_MAP[onChain.status];

    if (newStatus && escrow.status !== newStatus) {
      await prisma.escrow.update({
        where: { id: escrowId },
        data: { status: newStatus },
      });

      await notificationQueue.add('status-change', {
        type: 'escrow-status-change' as const,
        escrowId,
        oldStatus: escrow.status,
        newStatus,
      });
    }
  } catch {
    const contractState = await tonClient.getContractState(addr);
    if (contractState.state !== 'active') {
      if (escrow.status !== EscrowStatus.COMPLETED && escrow.status !== EscrowStatus.CANCELLED) {
        await prisma.escrow.update({
          where: { id: escrowId },
          data: { status: EscrowStatus.COMPLETED },
        });
      }
    }
  }
}

async function syncAllActive() {
  const activeEscrows = await prisma.escrow.findMany({
    where: {
      contractAddress: { not: null },
      status: {
        in: [EscrowStatus.INIT, EscrowStatus.FUNDED, EscrowStatus.SUBMITTED, EscrowStatus.DISPUTE],
      },
    },
    select: { id: true },
  });

  for (const escrow of activeEscrows) {
    await syncSingleEscrow(escrow.id);
  }
}

const workerLog = {
  info: (obj: object, msg: string) => console.log(msg, obj),
  error: (obj: object, msg: string) => console.error(msg, obj),
};

async function verifyOnChainStatus(
  contractAddress: string,
  expectedStatus: number,
): Promise<boolean> {
  try {
    const addr = Address.parse(contractAddress);
    const contract = tonClient.open(MeusContract.createFromAddress(addr));
    const onChain = await contract.getEscrowData();
    return onChain.status === expectedStatus;
  } catch {
    return false;
  }
}

async function checkDeadlines() {
  const now = new Date();
  const approachingWindowMs = 24 * 60 * 60 * 1000;
  const approachingEnd = new Date(now.getTime() + approachingWindowMs);

  const workDeadlineApproaching = await prisma.escrow.findMany({
    where: {
      status: EscrowStatus.FUNDED,
      deadline: { gt: now, lte: approachingEnd },
    },
    select: { id: true, employerId: true, title: true, deadline: true },
  });

  for (const escrow of workDeadlineApproaching) {
    await notificationQueue.add('deadline-approaching', {
      type: 'deadline-approaching' as const,
      escrowId: escrow.id,
      userId: escrow.employerId,
      title: escrow.title,
      hoursLeft: hoursUntil(escrow.deadline, now),
    });
  }

  const reviewDeadlineApproaching = await prisma.escrow.findMany({
    where: {
      status: EscrowStatus.SUBMITTED,
      reviewDeadline: { gt: now, lte: approachingEnd },
    },
    select: { id: true, employerId: true, title: true, reviewDeadline: true },
  });

  for (const escrow of reviewDeadlineApproaching) {
    if (!escrow.reviewDeadline) continue;
    await notificationQueue.add('review-deadline-approaching', {
      type: 'review-deadline-approaching' as const,
      escrowId: escrow.id,
      userId: escrow.employerId,
      title: escrow.title,
      hoursLeft: hoursUntil(escrow.reviewDeadline, now),
    });
  }

  const expiredFunded = await prisma.escrow.findMany({
    where: {
      status: EscrowStatus.FUNDED,
      deadline: { lt: now },
      contractAddress: { not: null },
    },
    select: { id: true, employerId: true, title: true, contractAddress: true },
  });

  for (const escrow of expiredFunded) {
    if (escrow.contractAddress) {
      try {
        const stillFunded = await verifyOnChainStatus(
          escrow.contractAddress,
          OnChainStatus.FUNDED,
        );
        if (stillFunded) {
          const { seqno } = await sendRefundExpired(escrow.contractAddress, workerLog);
          workerLog.info(
            { escrowId: escrow.id, op: 'refund_expired', seqno, contractAddress: escrow.contractAddress },
            'refund_expired tx sent',
          );
        }
      } catch (err) {
        workerLog.error(
          { escrowId: escrow.id, op: 'refund_expired', err },
          'refund_expired tx failed',
        );
      }
    }

    await notificationQueue.add('deadline-expired', {
      type: 'deadline-expired' as const,
      escrowId: escrow.id,
      userId: escrow.employerId,
      title: escrow.title,
    });
  }

  const expiredReview = await prisma.escrow.findMany({
    where: {
      status: EscrowStatus.SUBMITTED,
      reviewDeadline: { lt: now },
      contractAddress: { not: null },
    },
    select: { id: true, freelancerId: true, title: true, contractAddress: true },
  });

  for (const escrow of expiredReview) {
    if (escrow.contractAddress) {
      try {
        const stillSubmitted = await verifyOnChainStatus(
          escrow.contractAddress,
          OnChainStatus.SUBMITTED,
        );
        if (stillSubmitted) {
          const { seqno } = await sendAutoRelease(escrow.contractAddress, workerLog);
          workerLog.info(
            { escrowId: escrow.id, op: 'auto_release', seqno, contractAddress: escrow.contractAddress },
            'auto_release tx sent',
          );
        }
      } catch (err) {
        workerLog.error(
          { escrowId: escrow.id, op: 'auto_release', err },
          'auto_release tx failed',
        );
      }
    }

    if (escrow.freelancerId) {
      await notificationQueue.add('auto-release-ready', {
        type: 'auto-release-ready' as const,
        escrowId: escrow.id,
        userId: escrow.freelancerId,
        title: escrow.title,
      });
    }
  }

  const disputeEscrows = await prisma.escrow.findMany({
    where: {
      status: EscrowStatus.DISPUTE,
      reviewDeadline: { not: null },
      contractAddress: { not: null },
    },
    select: {
      id: true,
      employerId: true,
      freelancerId: true,
      title: true,
      contractAddress: true,
      reviewDeadline: true,
    },
  });

  for (const escrow of disputeEscrows) {
    if (!escrow.reviewDeadline || !escrow.contractAddress) continue;

    const timeoutAt = escrow.reviewDeadline.getTime() + DISPUTE_TIMEOUT_MS;
    if (now.getTime() <= timeoutAt) continue;

    try {
      const stillDispute = await verifyOnChainStatus(
        escrow.contractAddress,
        OnChainStatus.DISPUTE,
      );
      if (stillDispute) {
        const { seqno } = await sendResolveTimeout(escrow.contractAddress, workerLog);
        workerLog.info(
          { escrowId: escrow.id, op: 'resolve_timeout', seqno, contractAddress: escrow.contractAddress },
          'resolve_timeout tx sent',
        );
      }
    } catch (err) {
      workerLog.error(
        { escrowId: escrow.id, op: 'resolve_timeout', err },
        'resolve_timeout tx failed',
      );
    }

    await notificationQueue.add('dispute-timeout-ready', {
      type: 'dispute-timeout-ready' as const,
      escrowId: escrow.id,
      employerId: escrow.employerId,
      freelancerId: escrow.freelancerId,
      title: escrow.title,
    });
  }
}

export function startEscrowWorker() {
  const worker = new Worker('escrow', processJob, {
    connection,
    concurrency: 5,
  });

  worker.on('failed', (job, err) => {
    console.error(`Escrow job ${job?.id} failed:`, err.message);
  });

  return worker;
}

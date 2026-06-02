import { Worker, type Job } from 'bullmq';
import { PrismaClient, type NotificationType } from '@prisma/client';
import { config } from '../../../config/index.js';
import {
  deliverByType,
  deliverResolveTimeout,
  hoursUntil,
  loadEscrow,
} from '../../notifications/notification-delivery.js';

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

type NotificationJobData =
  | {
      type: 'escrow-status-change';
      escrowId: string;
      oldStatus: string;
      newStatus: string;
    }
  | {
      type: 'escrow-created';
      escrowId: string;
    }
  | {
      type: 'deadline-expired';
      escrowId: string;
      userId: string;
      title: string;
    }
  | {
      type: 'deadline-approaching';
      escrowId: string;
      userId: string;
      title: string;
      hoursLeft: number;
    }
  | {
      type: 'auto-release-ready';
      escrowId: string;
      userId: string;
      title: string;
    }
  | {
      type: 'review-deadline-approaching';
      escrowId: string;
      userId: string;
      title: string;
      hoursLeft: number;
    }
  | {
      type: 'dispute-timeout-ready';
      escrowId: string;
      employerId: string;
      freelancerId: string | null;
      title: string;
    }
  | {
      type: 'dispute-resolved';
      escrowId: string;
      winner: 'freelancer' | 'employer';
    }
  | {
      type: 'notify';
      escrowId: string;
      notificationType: NotificationType;
      staleCancel?: boolean;
      recipient?: 'employer' | 'freelancer';
    };

const HANDLED_NOTIFICATION_TYPES: NotificationType[] = [
  'ESCROW_CREATED',
  'ESCROW_FUNDED',
  'FREELANCER_ACCEPTED',
  'INVITATION_RECEIVED',
  'FREELANCER_WORK_STARTED',
  'WORK_SUBMITTED',
  'WORK_APPROVED',
  'WORK_APPROVED_EMPLOYER',
  'DISPUTE_OPENED',
  'DISPUTE_RESOLVED',
  'ESCROW_CANCELLED',
  'ESCROW_EXPIRED',
  'AUTO_RELEASED',
  'DEADLINE_APPROACHING',
  'REVIEW_DEADLINE_APPROACHING',
];

const STATUS_TO_NOTIFICATION: Partial<Record<string, NotificationType>> = {
  FUNDED: 'ESCROW_FUNDED',
  SUBMITTED: 'WORK_SUBMITTED',
  COMPLETED: 'WORK_APPROVED',
  CANCELLED: 'ESCROW_CANCELLED',
  DISPUTE: 'DISPUTE_OPENED',
  INIT: 'ESCROW_CREATED',
};

async function processJob(job: Job<NotificationJobData>) {
  const data = job.data;

  if (data.type === 'escrow-status-change') {
    await handleStatusChange(data);
  } else if (data.type === 'escrow-created') {
    await handleEscrowCreated(data.escrowId);
  } else if (data.type === 'deadline-expired') {
    await handleTypedNotification(data.escrowId, 'ESCROW_EXPIRED');
  } else if (data.type === 'deadline-approaching') {
    const escrow = await loadEscrow(prisma, data.escrowId);
    if (!escrow) return;
    await deliverByType(prisma, 'DEADLINE_APPROACHING', escrow, {
      hoursLeft: data.hoursLeft,
    });
  } else if (data.type === 'auto-release-ready') {
    await handleTypedNotification(data.escrowId, 'AUTO_RELEASED');
  } else if (data.type === 'review-deadline-approaching') {
    const escrow = await loadEscrow(prisma, data.escrowId);
    if (!escrow) return;
    await deliverByType(prisma, 'REVIEW_DEADLINE_APPROACHING', escrow, {
      hoursLeft: data.hoursLeft,
    });
  } else if (data.type === 'dispute-timeout-ready') {
    const escrow = await loadEscrow(prisma, data.escrowId);
    if (!escrow) return;
    await deliverResolveTimeout(prisma, escrow);
  } else if (data.type === 'dispute-resolved') {
    const escrow = await loadEscrow(prisma, data.escrowId);
    if (!escrow) return;
    await deliverByType(prisma, 'DISPUTE_RESOLVED', escrow, {
      disputeWinner: data.winner,
    });
  } else if (data.type === 'notify') {
    await handleTypedNotification(data.escrowId, data.notificationType, {
      staleCancel: data.staleCancel,
      recipient: data.recipient,
    });
  }
}

async function handleEscrowCreated(escrowId: string) {
  const escrow = await loadEscrow(prisma, escrowId);
  if (!escrow) return;
  await deliverByType(prisma, 'ESCROW_CREATED', escrow);
}

async function handleStatusChange(data: {
  escrowId: string;
  oldStatus: string;
  newStatus: string;
}) {
  if (data.newStatus === 'FUNDED') {
    await handleTypedNotification(data.escrowId, 'ESCROW_FUNDED');
    await handleTypedNotification(data.escrowId, 'FREELANCER_WORK_STARTED');
    return;
  }

  const nType = STATUS_TO_NOTIFICATION[data.newStatus];
  if (!nType || nType === 'ESCROW_CREATED') return;
  await handleTypedNotification(data.escrowId, nType);
}

async function handleTypedNotification(
  escrowId: string,
  type: NotificationType,
  options?: {
    staleCancel?: boolean;
    recipient?: 'employer' | 'freelancer';
  },
) {
  if (!HANDLED_NOTIFICATION_TYPES.includes(type)) return;
  const escrow = await loadEscrow(prisma, escrowId);
  if (!escrow) return;
  await deliverByType(prisma, type, escrow, options);
}

export function startNotificationWorker() {
  const worker = new Worker('notification', processJob, {
    connection,
    concurrency: 10,
  });

  worker.on('failed', (job, err) => {
    console.error(`Notification job ${job?.id} failed:`, err.message);
  });

  return worker;
}

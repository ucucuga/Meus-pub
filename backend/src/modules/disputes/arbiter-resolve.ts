import {
  type PrismaClient,
  DisputeStatus,
  EscrowStatus,
} from '@prisma/client';
import { type FastifyInstance } from 'fastify';
import { notificationQueue } from '../jobs/queue.js';
import { sendDeployerResolveOp } from '../blockchain/blockchain.service.js';

export async function resolveDisputeAsArbiter(
  prisma: PrismaClient,
  disputeId: string,
  winner: 'freelancer' | 'employer',
  log?: FastifyInstance['log'],
): Promise<void> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { escrow: true },
  });
  if (!dispute) {
    throw Object.assign(new Error('Dispute not found'), { statusCode: 404 });
  }
  if (dispute.status !== DisputeStatus.OPEN) {
    throw Object.assign(new Error('Dispute already resolved'), { statusCode: 400 });
  }

  if (dispute.escrow.contractAddress) {
    const winnerByte = winner === 'freelancer' ? 1 : 0;
    await sendDeployerResolveOp(dispute.escrow.contractAddress, winnerByte, log);
  }

  const status =
    winner === 'freelancer'
      ? DisputeStatus.RESOLVED_FREELANCER
      : DisputeStatus.RESOLVED_EMPLOYER;

  await prisma.$transaction([
    prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status,
        resolution: `Resolved via arbiter: ${winner} wins`,
        resolvedAt: new Date(),
      },
    }),
    prisma.escrow.update({
      where: { id: dispute.escrowId },
      data: { status: EscrowStatus.COMPLETED },
    }),
  ]);

  await notificationQueue.add('dispute-resolved', {
    type: 'dispute-resolved',
    escrowId: dispute.escrowId,
    winner,
  });
}

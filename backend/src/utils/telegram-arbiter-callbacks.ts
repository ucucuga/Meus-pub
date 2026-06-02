import { PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';
import { resolveDisputeAsArbiter } from '../modules/disputes/arbiter-resolve.js';
import {
  answerCallbackQuery,
  editTelegramMessage,
  startTelegramCallbackPolling,
} from './telegram-bot.js';

const prisma = new PrismaClient();

function isAuthorizedArbiter(telegramUserId: number): boolean {
  if (config.ARBITER_TELEGRAM_ID && String(telegramUserId) === config.ARBITER_TELEGRAM_ID) {
    return true;
  }
  return false;
}

async function handleArbiterResolve(
  disputeId: string,
  winner: 'freelancer' | 'employer',
  callbackQueryId: string,
  chatId: number,
  messageId: number,
): Promise<void> {
  try {
    await resolveDisputeAsArbiter(prisma, disputeId, winner);

    const label = winner === 'freelancer' ? 'Performer' : 'Customer';
    await editTelegramMessage(
      chatId,
      messageId,
      `✅ <b>Resolved:</b> ${label} wins.\nFunds released.`,
    );
    await answerCallbackQuery(callbackQueryId, 'Dispute resolved');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Resolution failed';
    await answerCallbackQuery(callbackQueryId, message);
  }
}

export function startTelegramArbiterCallbacks(): () => void {
  return startTelegramCallbackPolling(async (query) => {
    const data = query.data;
    const fromId = query.from.id;

    if (!data?.startsWith('resolve_freelancer_') && !data?.startsWith('resolve_employer_')) {
      await answerCallbackQuery(query.id);
      return;
    }

    if (!isAuthorizedArbiter(fromId)) {
      await answerCallbackQuery(query.id, 'Not authorized');
      return;
    }

    const messageId = query.message?.message_id;
    const chatId = query.message?.chat.id;
    if (messageId === undefined || chatId === undefined) {
      await answerCallbackQuery(query.id, 'Message not found');
      return;
    }

    if (data.startsWith('resolve_freelancer_')) {
      const disputeId = data.replace('resolve_freelancer_', '');
      await handleArbiterResolve(disputeId, 'freelancer', query.id, chatId, messageId);
    } else {
      const disputeId = data.replace('resolve_employer_', '');
      await handleArbiterResolve(disputeId, 'employer', query.id, chatId, messageId);
    }
  });
}

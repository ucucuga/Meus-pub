import type { TelegramInlineKeyboard } from './telegram-bot.js';

const MINI_APP_BASE = 'https://t.me/meus_escrow_bot/app';

export type NotificationMessage = {
  text: string;
  replyMarkup?: TelegramInlineKeyboard;
};

function escrowDeepLink(escrowId: string): string {
  return `${MINI_APP_BASE}?startapp=escrow_${escrowId}`;
}

function button(escrowId: string, label: string): TelegramInlineKeyboard {
  return {
    inline_keyboard: [[{ text: label, url: escrowDeepLink(escrowId) }]],
  };
}

export function escrowCreated(
  escrowId: string,
  title: string,
  role: 'employer' | 'freelancer',
): NotificationMessage {
  if (role === 'employer') {
    return {
      text:
        `<b>✅ Escrow created</b>\n\n` +
        `<b>${escapeHtml(title)}</b> has been deployed on TON.\n` +
        `Share the link with your freelancer and deposit funds to activate it.`,
      replyMarkup: button(escrowId, 'Open escrow'),
    };
  }
  return {
    text:
      `<b>📋 New escrow for you</b>\n\n` +
      `You have been added as freelancer on <b>${escapeHtml(title)}</b>.\n` +
      `Connect your wallet to confirm participation.`,
    replyMarkup: button(escrowId, 'Open escrow'),
  };
}

export function invitationReceived(
  escrowId: string,
  title: string,
  employerUsername: string,
): NotificationMessage {
  const name = employerUsername.startsWith('@') ? employerUsername : `@${employerUsername}`;
  return {
    text:
      `<b>📨 New contract invitation</b>\n\n` +
      `<b>${escapeHtml(name)}</b> invited you to work on ` +
      `<b>${escapeHtml(title)}</b>.\n` +
      `Open the app to accept or decline.`,
    replyMarkup: button(escrowId, 'View Invitation'),
  };
}

export function escrowFunded(escrowId: string, title: string): NotificationMessage {
  return {
    text:
      `<b>✅ Contract funded</b>\n\n` +
      `<b>${escapeHtml(title)}</b> has been funded and work has started.\n` +
      `You will be notified when the performer submits work.`,
    replyMarkup: button(escrowId, 'View Contract'),
  };
}

export function freelancerWorkStarted(escrowId: string, title: string): NotificationMessage {
  return {
    text:
      `<b>🚀 Work started</b>\n\n` +
      `<b>${escapeHtml(title)}</b> has been funded by the customer.\n` +
      `Submit your work before the deadline.`,
    replyMarkup: button(escrowId, 'View Contract'),
  };
}

export function freelancerAccepted(escrowId: string, title: string): NotificationMessage {
  return {
    text:
      `<b>🤝 Performer accepted</b>\n\n` +
      `The performer has accepted <b>${escapeHtml(title)}</b>.\n` +
      `Deposit funds to start the work.`,
    replyMarkup: button(escrowId, 'Fund Contract'),
  };
}

export function workSubmitted(escrowId: string, title: string): NotificationMessage {
  return {
    text:
      `<b>📤 Work submitted</b>\n\n` +
      `The freelancer has submitted work on <b>${escapeHtml(title)}</b>.\n` +
      `You have <b>48 hours</b> to review and approve or open a dispute.`,
    replyMarkup: button(escrowId, 'Review work'),
  };
}

export function workApprovedEmployer(escrowId: string, title: string): NotificationMessage {
  return {
    text:
      `<b>✅ Order completed</b>\n\n` +
      `<b>${escapeHtml(title)}</b> has been completed.\n` +
      `Funds have been released to the performer.`,
    replyMarkup: button(escrowId, 'View Contract'),
  };
}

export function workApproved(
  escrowId: string,
  title: string,
  amountTon: string,
  commissionTon: string,
): NotificationMessage {
  return {
    text:
      `<b>🎉 Payment released</b>\n\n` +
      `Work on <b>${escapeHtml(title)}</b> has been approved.\n` +
      `<b>${escapeHtml(amountTon)} TON</b> sent to your wallet (commission: ${escapeHtml(commissionTon)} TON).`,
    replyMarkup: button(escrowId, 'View details'),
  };
}

function formatUsername(username: string): string {
  const trimmed = username.replace(/^@/, '');
  return `@${escapeHtml(trimmed)}`;
}

function arbiterResolveKeyboard(
  escrowId: string,
  disputeId: string,
): TelegramInlineKeyboard {
  return {
    inline_keyboard: [
      [
        {
          text: '✅ Performer wins',
          callback_data: `resolve_freelancer_${disputeId}`,
        },
        {
          text: '❌ Customer wins',
          callback_data: `resolve_employer_${disputeId}`,
        },
      ],
      [{ text: 'View in App', url: escrowDeepLink(escrowId) }],
    ],
  };
}

export function disputeOpenedArbiter(
  escrowId: string,
  disputeId: string,
  title: string,
  amountTon: string,
  employerUsername: string,
  freelancerUsername: string,
  disputeReason: string,
  employerEvidence: string | null,
  freelancerEvidence: string | null,
  employerFileNames: string[],
  freelancerFileNames: string[],
  includeResolveButtons: boolean,
): NotificationMessage {
  const empFiles =
    employerFileNames.length > 0 ? `\nFiles: ${employerFileNames.map(escapeHtml).join(', ')}` : '';
  const freFiles =
    freelancerFileNames.length > 0
      ? `\nFiles: ${freelancerFileNames.map(escapeHtml).join(', ')}`
      : '';

  return {
    text:
      `<b>⚖️ Dispute requires resolution</b>\n\n` +
      `<b>Contract:</b> ${escapeHtml(title)}\n` +
      `<b>Amount:</b> ${escapeHtml(amountTon)} TON\n` +
      `<b>Customer:</b> ${formatUsername(employerUsername)}\n` +
      `<b>Performer:</b> ${formatUsername(freelancerUsername)}\n\n` +
      `<b>Dispute reason:</b> ${escapeHtml(disputeReason)}\n\n` +
      `<b>Customer evidence:</b>\n` +
      `${employerEvidence ? escapeHtml(employerEvidence) : 'Not submitted yet'}${empFiles}\n\n` +
      `<b>Performer evidence:</b>\n` +
      `${freelancerEvidence ? escapeHtml(freelancerEvidence) : 'Not submitted yet'}${freFiles}`,
    replyMarkup: includeResolveButtons
      ? arbiterResolveKeyboard(escrowId, disputeId)
      : button(escrowId, 'View in App'),
  };
}

export function disputeOpenedFreelancer(escrowId: string, title: string): NotificationMessage {
  return {
    text:
      `<b>⚖️ Dispute opened</b>\n\n` +
      `A dispute was opened on your work for <b>${escapeHtml(title)}</b>.\n` +
      `Submit your evidence before the arbiter decides.`,
    replyMarkup: button(escrowId, 'Submit evidence'),
  };
}

export function disputeOpened(
  escrowId: string,
  title: string,
  role: 'employer' | 'freelancer' | 'arbiter',
): NotificationMessage {
  if (role === 'arbiter') {
    return {
      text:
        `<b>⚖️ Dispute requires your attention</b>\n\n` +
        `A dispute has been opened on <b>${escapeHtml(title)}</b>.\n` +
        `Review the evidence and resolve the dispute within 30 days.`,
      replyMarkup: button(escrowId, 'Resolve dispute'),
    };
  }
  return {
    text:
      `<b>⚖️ Dispute opened</b>\n\n` +
      `A dispute has been opened on <b>${escapeHtml(title)}</b>.\n` +
      `Submit your evidence. The arbiter will review and decide.`,
    replyMarkup: button(escrowId, 'Submit evidence'),
  };
}

export function disputeResolved(
  escrowId: string,
  title: string,
  won: boolean,
): NotificationMessage {
  if (won) {
    return {
      text:
        `<b>✅ Dispute resolved — you won</b>\n\n` +
        `The arbiter has resolved the dispute on <b>${escapeHtml(title)}</b> in your favour.\n` +
        `Funds have been released to you.`,
      replyMarkup: button(escrowId, 'View details'),
    };
  }
  return {
    text:
      `<b>❌ Dispute resolved — you lost</b>\n\n` +
      `The arbiter has resolved the dispute on <b>${escapeHtml(title)}</b>.\n` +
      `Funds have been returned to the other party.`,
    replyMarkup: button(escrowId, 'View details'),
  };
}

export function escrowCancelled(escrowId: string, title: string): NotificationMessage {
  return {
    text:
      `<b>🚫 Escrow cancelled</b>\n\n` +
      `<b>${escapeHtml(title)}</b> has been cancelled.\n` +
      `Funds have been returned to the employer.`,
    replyMarkup: button(escrowId, 'View details'),
  };
}

export function escrowCancelledStale(escrowId: string, title: string): NotificationMessage {
  return {
    text:
      `<b>❌ Contract cancelled</b>\n\n` +
      `<b>${escapeHtml(title)}</b> was automatically cancelled ` +
      `after 24 hours of inactivity.`,
    replyMarkup: button(escrowId, 'View'),
  };
}

export function deadlineApproaching(
  escrowId: string,
  title: string,
  hoursLeft: number,
): NotificationMessage {
  return {
    text:
      `<b>⏰ Deadline approaching</b>\n\n` +
      `<b>${escapeHtml(title)}</b> deadline is in <b>${hoursLeft} hours</b>.\n` +
      `Submit your work before time runs out.`,
    replyMarkup: button(escrowId, 'Open escrow'),
  };
}

export function autoReleased(
  escrowId: string,
  title: string,
  amountTon: string,
): NotificationMessage {
  return {
    text:
      `<b>⏱ Payment auto-released</b>\n\n` +
      `Review period expired on <b>${escapeHtml(title)}</b>.\n` +
      `<b>${escapeHtml(amountTon)} TON</b> has been automatically sent to the freelancer.`,
    replyMarkup: button(escrowId, 'View details'),
  };
}

export function refundExpired(
  escrowId: string,
  title: string,
  amountTon: string,
): NotificationMessage {
  return {
    text:
      `<b>↩️ Escrow refunded</b>\n\n` +
      `The freelancer did not submit work on <b>${escapeHtml(title)}</b> by the deadline.\n` +
      `<b>${escapeHtml(amountTon)} TON</b> has been returned to you.`,
    replyMarkup: button(escrowId, 'View details'),
  };
}

export function resolveTimeout(escrowId: string, title: string): NotificationMessage {
  return {
    text:
      `<b>⏱ Dispute timeout — freelancer paid</b>\n\n` +
      `The arbiter did not resolve the dispute on <b>${escapeHtml(title)}</b> within 30 days.\n` +
      `Funds have been automatically sent to the freelancer.`,
    replyMarkup: button(escrowId, 'View details'),
  };
}

export function reviewDeadlineApproaching(
  escrowId: string,
  title: string,
  hoursLeft: number,
): NotificationMessage {
  return {
    text:
      `<b>⏰ Review deadline approaching</b>\n\n` +
      `You have <b>${hoursLeft} hours</b> left to review work on <b>${escapeHtml(title)}</b>.\n` +
      `Approve or open a dispute before time runs out — otherwise funds ` +
      `will be automatically released to the freelancer.`,
    replyMarkup: button(escrowId, 'Review now'),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

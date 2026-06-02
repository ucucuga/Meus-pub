import { config } from '../config/index.js';

const BASE_URL = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`;

export type TelegramInlineKeyboard = {
  inline_keyboard: Array<
    Array<{
      text: string;
      url?: string;
      callback_data?: string;
    }>
  >;
};

function chatIdString(telegramId: bigint | number | string): string {
  return typeof telegramId === 'bigint' ? telegramId.toString() : String(telegramId);
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl;
  return Buffer.from(base64, 'base64');
}

export async function sendTelegramPhoto(
  telegramId: bigint | number | string,
  imageBuffer: Buffer,
  caption?: string,
): Promise<void> {
  const chatId = chatIdString(telegramId);
  const form = new FormData();
  form.append('chat_id', chatId);
  if (caption) form.append('caption', caption);
  form.append('photo', new Blob([imageBuffer]), 'evidence.jpg');

  try {
    const res = await fetch(`${BASE_URL}/sendPhoto`, { method: 'POST', body: form });
    if (!res.ok) {
      const body = await res.text();
      console.error({ chatId, status: res.status, body }, 'sendPhoto failed');
    }
  } catch (err) {
    console.error({ err, chatId }, 'sendTelegramPhoto failed');
  }
}

export async function sendTelegramDocument(
  telegramId: bigint | number | string,
  fileBuffer: Buffer,
  filename: string,
  caption?: string,
): Promise<void> {
  const chatId = chatIdString(telegramId);
  const form = new FormData();
  form.append('chat_id', chatId);
  if (caption) form.append('caption', caption);
  form.append('document', new Blob([fileBuffer]), filename);

  try {
    const res = await fetch(`${BASE_URL}/sendDocument`, { method: 'POST', body: form });
    if (!res.ok) {
      const body = await res.text();
      console.error({ chatId, status: res.status, body }, 'sendDocument failed');
    }
  } catch (err) {
    console.error({ err, chatId }, 'sendTelegramDocument failed');
  }
}

export async function sendArbiterEvidenceFiles(
  telegramId: bigint | number | string,
  roleLabel: string,
  files: Array<{ name: string; type: string; data: string }>,
): Promise<void> {
  for (const file of files) {
    const buffer = dataUrlToBuffer(file.data);
    const caption = `${roleLabel} evidence: ${file.name}`;
    if (file.type.startsWith('image/')) {
      await sendTelegramPhoto(telegramId, buffer, caption);
    } else {
      await sendTelegramDocument(telegramId, buffer, file.name, caption);
    }
  }
}

export async function sendTelegramMessage(
  telegramId: bigint | number | string,
  text: string,
  replyMarkup?: TelegramInlineKeyboard,
): Promise<void> {
  const chatId = chatIdString(telegramId);

  try {
    const res = await fetch(`${BASE_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 403) {
        console.warn(
          { chatId, status: res.status, body },
          'Telegram send blocked — user may have blocked the bot',
        );
        return;
      }
      console.error({ chatId, status: res.status, body }, 'Telegram API error');
      return;
    }
  } catch (err) {
    console.error({ err, chatId }, 'Telegram send failed');
  }
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  try {
    await fetch(`${BASE_URL}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        ...(text ? { text } : {}),
      }),
    });
  } catch (err) {
    console.error({ err, callbackQueryId }, 'answerCallbackQuery failed');
  }
}

export async function editTelegramMessage(
  chatId: bigint | number | string,
  messageId: number,
  text: string,
  replyMarkup?: TelegramInlineKeyboard,
): Promise<void> {
  const id = typeof chatId === 'bigint' ? chatId.toString() : String(chatId);
  try {
    const res = await fetch(`${BASE_URL}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: id,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error({ chatId: id, messageId, status: res.status, body }, 'editMessageText failed');
    }
  } catch (err) {
    console.error({ err, chatId: id, messageId }, 'editTelegramMessage failed');
  }
}

type TelegramUpdate = {
  update_id: number;
  callback_query?: {
    id: string;
    from: { id: number };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
};

export function startTelegramCallbackPolling(
  onCallback: (query: NonNullable<TelegramUpdate['callback_query']>) => Promise<void>,
): () => void {
  let offset = 0;
  let stopped = false;

  const poll = async () => {
    if (stopped) return;
    try {
      const res = await fetch(
        `${BASE_URL}/getUpdates?offset=${offset}&timeout=25&allowed_updates=${encodeURIComponent(JSON.stringify(['callback_query']))}`,
      );
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 3000));
        if (!stopped) void poll();
        return;
      }
      const payload = (await res.json()) as { ok: boolean; result?: TelegramUpdate[] };
      for (const update of payload.result ?? []) {
        offset = update.update_id + 1;
        if (update.callback_query) {
          await onCallback(update.callback_query);
        }
      }
    } catch (err) {
      console.error({ err }, 'Telegram getUpdates failed');
    }
    if (!stopped) void poll();
  };

  void poll();

  return () => {
    stopped = true;
  };
}

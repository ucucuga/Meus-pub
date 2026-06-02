import { z } from 'zod';

export const telegramAuthSchema = z.object({
  initData: z.string().min(1),
});

export type TelegramAuthInput = z.infer<typeof telegramAuthSchema>;

export const connectWalletSchema = z.object({
  walletAddress: z.string().min(48).max(67),
});

export type ConnectWalletInput = z.infer<typeof connectWalletSchema>;

export const tonProofCheckSchema = z.object({
  address: z.string().min(48),
  network: z.string(),
  proof: z.object({
    timestamp: z.number().int(),
    domain: z.object({
      lengthBytes: z.number().int(),
      value: z.string().min(1),
    }),
    payload: z.string().min(1),
    signature: z.string().min(1),
    state_init: z.string().optional(),
  }),
});

export type TonProofCheckInput = z.infer<typeof tonProofCheckSchema>;

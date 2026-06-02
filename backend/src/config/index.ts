import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),

  TELEGRAM_BOT_TOKEN: z.string(),

  /** Optional Telegram user ID for arbiter alerts when arbiter has no linked User row */
  ARBITER_TELEGRAM_ID: z.string().optional().default(''),

  TON_NETWORK: z.enum(['mainnet', 'testnet']).default('testnet'),
  TON_API_KEY: z.string().default(''),
  TON_ENDPOINT: z.string().default('https://testnet.toncenter.com/api/v2/jsonRPC'),

  DEPLOYER_MNEMONIC: z.string().min(1), // 24-word mnemonic for the platform deployer wallet
  ARBITER_ADDRESS: z.string().min(48),   // default arbiter TON address
  CONTRACT_CODE_PATH: z
    .string()
    .min(1)
    .default('./contract/meus.code.boc'), // relative to backend/ when started via cd backend

  LOG_LEVEL: z.string().default('info'),
});

export type Env = z.infer<typeof envSchema>;

export const config = envSchema.parse(process.env);

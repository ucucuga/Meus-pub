import { randomBytes } from 'node:crypto';
import { type PrismaClient } from '@prisma/client';
import { type FastifyInstance } from 'fastify';
import { validateTelegramInitData, parseTelegramUser } from '../../utils/crypto.js';
import { verifyTonProof, PAYLOAD_TTL_SEC, type TonConnectProof } from '../../utils/ton-proof.js';
import { prismaCall } from '../../utils/prisma.js';
import {
  type TelegramAuthInput,
  type ConnectWalletInput,
  type TonProofCheckInput,
} from './auth.schema.js';

const NONCE_PREFIX = 'tonproof:nonce:';

export class AuthService {
  constructor(private readonly app: FastifyInstance) {}

  private get prisma(): PrismaClient {
    return this.app.prisma;
  }

  async authenticateWithTelegram(input: TelegramAuthInput) {
    const params = validateTelegramInitData(input.initData);
    if (!params) {
      throw Object.assign(new Error('Invalid Telegram initData'), { statusCode: 401 });
    }

    const tgUser = parseTelegramUser(params);
    if (!tgUser) {
      throw Object.assign(new Error('Missing user in initData'), { statusCode: 401 });
    }

    return prismaCall(this.app.log, { method: 'authenticateWithTelegram' }, async () => {
      const user = await this.prisma.user.upsert({
        where: { telegramId: BigInt(tgUser.id) },
        update: {
          username: tgUser.username ?? null,
          firstName: tgUser.first_name,
          lastName: tgUser.last_name ?? null,
          photoUrl: tgUser.photo_url ?? null,
        },
        create: {
          telegramId: BigInt(tgUser.id),
          username: tgUser.username ?? null,
          firstName: tgUser.first_name,
          lastName: tgUser.last_name ?? null,
          photoUrl: tgUser.photo_url ?? null,
        },
      });

      const token = this.app.jwt.sign({
        sub: user.id,
        telegramId: tgUser.id,
      });

      return {
        token,
        user: {
          id: user.id,
          telegramId: Number(user.telegramId),
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          photoUrl: user.photoUrl,
          walletAddress: user.walletAddress,
        },
      };
    });
  }

  async connectWallet(userId: string, input: ConnectWalletInput) {
    return prismaCall(this.app.log, { method: 'connectWallet', userId }, async () => {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: { walletAddress: input.walletAddress },
      });

      return {
        id: user.id,
        telegramId: Number(user.telegramId),
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl: user.photoUrl,
        walletAddress: user.walletAddress,
      };
    });
  }

  async generateTonProofPayload(): Promise<{ payload: string }> {
    const nonce = randomBytes(32).toString('hex');
    const key = NONCE_PREFIX + nonce;

    await this.app.redis.set(key, '1', 'EX', PAYLOAD_TTL_SEC);

    return { payload: nonce };
  }

  async checkTonProof(userId: string, input: TonProofCheckInput) {
    const nonceKey = NONCE_PREFIX + input.proof.payload;
    const exists = await this.app.redis.get(nonceKey);
    if (!exists) {
      throw Object.assign(
        new Error('Invalid or expired proof payload — nonce not found'),
        { statusCode: 401 },
      );
    }

    await this.app.redis.del(nonceKey);

    const proof: TonConnectProof = {
      address: input.address,
      network: input.network,
      proof: {
        timestamp: input.proof.timestamp,
        domain: input.proof.domain,
        payload: input.proof.payload,
        signature: input.proof.signature,
        state_init: input.proof.state_init,
      },
    };

    let result;
    try {
      result = await verifyTonProof(proof);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.app.log.warn({ err: message, address: input.address }, 'TON proof verification failed');
      throw Object.assign(new Error(`Proof verification failed: ${message}`), {
        statusCode: 401,
      });
    }

    return prismaCall(this.app.log, { method: 'checkTonProof', userId }, async () => {
      const walletAddr = result.address.toString();
      const existing = await this.prisma.user.findFirst({
        where: { walletAddress: walletAddr, NOT: { id: userId } },
      });
      if (existing) {
        throw Object.assign(
          new Error('This wallet is already linked to another account'),
          { statusCode: 409, error: 'Conflict' },
        );
      }

      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          walletAddress: walletAddr,
          walletPublicKey: result.publicKey.toString('hex'),
        },
      });

      const token = this.app.jwt.sign({
        sub: user.id,
        telegramId: Number(user.telegramId),
      });

      return {
        token,
        user: {
          id: user.id,
          telegramId: Number(user.telegramId),
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          photoUrl: user.photoUrl,
          walletAddress: user.walletAddress,
        },
      };
    });
  }
}

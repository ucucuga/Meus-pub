import { Prisma } from '@prisma/client';
import { type FastifyBaseLogger } from 'fastify';

export type AppError = Error & {
  statusCode?: number;
  error?: string;
};

export function mapPrismaError(err: unknown): AppError {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      return Object.assign(new Error('Resource not found'), {
        statusCode: 404,
        error: 'Not Found',
      });
    }
    if (err.code === 'P2002') {
      return Object.assign(new Error('Resource already exists'), {
        statusCode: 409,
        error: 'Conflict',
      });
    }
  }
  return err instanceof Error ? err : new Error(String(err));
}

export async function prismaCall<T>(
  log: FastifyBaseLogger,
  context: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const mapped = mapPrismaError(err);
    if (mapped.statusCode) {
      log.warn({
        ...context,
        statusCode: mapped.statusCode,
        prismaCode: err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined,
      }, mapped.message);
    } else {
      log.error({ ...context, err }, 'Unexpected database error');
    }
    throw mapped;
  }
}

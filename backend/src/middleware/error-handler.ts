import { type FastifyError, type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { type AppError } from '../utils/prisma.js';

function statusLabel(code: number): string {
  const labels: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
  };
  return labels[code] ?? 'Error';
}

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if ((error as AppError).statusCode && (error as AppError).statusCode! < 500) {
    request.log.warn({ err: error, url: request.url }, error.message);
  } else {
    request.log.error({ err: error, url: request.url }, error.message);
  }

  if (error instanceof ZodError) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Validation Error',
      message: 'Request validation failed',
      details: error.flatten().fieldErrors,
    });
  }

  const appError = error as AppError;
  if (appError.statusCode) {
    return reply.code(appError.statusCode).send({
      statusCode: appError.statusCode,
      error: appError.error ?? statusLabel(appError.statusCode),
      message: appError.message,
    });
  }

  return reply.code(500).send({
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  });
}

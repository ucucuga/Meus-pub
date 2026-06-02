import { type FastifyBaseLogger } from 'fastify';
import { config } from './index.js';

export const loggerConfig = {
  level: config.LOG_LEVEL,
  ...(config.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
        },
      }
    : {}),
};

export type Logger = FastifyBaseLogger;

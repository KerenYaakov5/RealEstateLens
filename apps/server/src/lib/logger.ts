import { pino } from 'pino';
import { env } from '../config/env.js';

const usePrettyOutput = env.NODE_ENV === 'development';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.passwordHash'],
  ...(usePrettyOutput ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
});

export type Logger = typeof logger;

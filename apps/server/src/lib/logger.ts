import { pino } from 'pino';
import { env } from '../config/env.js';
import { logSink } from './logSink.js';

const level = env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL;

// Readable output while developing; JSON lines everywhere else (Render's log dashboard).
const console: pino.DestinationStream =
  env.NODE_ENV === 'development'
    ? pino.transport({ target: 'pino-pretty', options: { colorize: true } })
    : pino.destination(1);

/**
 * Every log line goes to the console and – from `info` up – to the app_logs table (through
 * logSink, attached to the database at startup) for the administrator's log screen.
 */
export const logger = pino(
  {
    level,
    // Secrets never reach a log: session cookies (both directions), credentials, passwords.
    redact: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
    ],
  },
  pino.multistream([
    { stream: console, level: 'trace' },
    { stream: logSink, level: 'info' },
  ]),
);

export type Logger = typeof logger;

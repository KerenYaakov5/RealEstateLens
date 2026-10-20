import type { LogCategory } from '@rel/shared';

/** One row of app_logs, built from a pino log line. */
export interface LogRow {
  createdAt: Date;
  level: string;
  category: LogCategory;
  message: string;
  requestId: string | null;
  userId: number | null;
  method: string | null;
  path: string | null;
  status: number | null;
  durationMs: number | null;
  details: Record<string, unknown> | null;
}

export interface LogWriter {
  insert(rows: LogRow[]): Promise<void>;
}

const LEVELS: Readonly<Record<number, string>> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

/** Requests not worth keeping: platform health checks and the static web client's files. */
const UNLOGGED_PATHS = /^\/(api\/v1\/health|assets\/|favicon)/;

const FLUSH_EVERY_MS = 2_000;
const MAX_BATCH = 500;
/** Lines kept while the database is not attached yet (startup) or not reachable. */
const MAX_BUFFER = 5_000;

const AUTH_MESSAGES = /logged in|logged out|registered|login|session/i;
const ADMIN_MESSAGES = /registration code|registration closed|access changed/i;
const AI_MESSAGES = /llm|recommendation|ai_|model/i;

/** Where a line logged during a request belongs, by the endpoint it came from. */
function categoryOfPath(method: string | null, path: string | null): LogCategory | null {
  if (path === null) {
    return null;
  }
  if (path.startsWith('/api/v1/sessions') || (method === 'POST' && path === '/api/v1/users')) {
    return 'auth';
  }
  if (/^\/api\/v1\/(registration-code|logs)|^\/api\/v1\/users\/\d/.test(path)) {
    return 'admin';
  }
  return path.startsWith('/api/v1/compromise-recommendations') ? 'ai' : null;
}

function categoryOf(
  message: string,
  isRequest: boolean,
  method: string | null,
  path: string | null,
): LogCategory {
  if (isRequest) {
    return 'request';
  }
  if (ADMIN_MESSAGES.test(message)) {
    return 'admin';
  }
  if (AUTH_MESSAGES.test(message)) {
    return 'auth';
  }
  if (AI_MESSAGES.test(message)) {
    return 'ai';
  }
  return categoryOfPath(method, path) ?? 'system';
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

interface PinoLine {
  level?: number;
  time?: number;
  msg?: string;
  req?: {
    id?: string;
    method?: string;
    url?: string;
    remoteAddress?: string;
    headers?: Record<string, unknown>;
  };
  res?: { statusCode?: number };
  responseTime?: number;
  userId?: number;
  [key: string]: unknown;
}

/** A pino log line → a table row. Bulky or duplicated fields stay out of `details`. */
export function toLogRow(line: PinoLine): LogRow | null {
  const message = line.msg ?? '';
  const path = line.req?.url ?? null;
  if (path !== null && UNLOGGED_PATHS.test(path)) {
    return null;
  }
  const isRequest = message === 'request completed' || message === 'request errored';
  const {
    level,
    time,
    msg: _msg,
    pid: _pid,
    hostname: _host,
    req,
    res: _res,
    responseTime: _rt,
    userId,
    ...rest
  } = line;
  const details: Record<string, unknown> = { ...rest };
  if (req?.remoteAddress !== undefined) {
    details.ip = req.remoteAddress;
  }
  const userAgent = req?.headers?.['user-agent'];
  if (isRequest && typeof userAgent === 'string') {
    details.userAgent = userAgent;
  }
  return {
    createdAt: new Date(time ?? Date.now()),
    level: LEVELS[level ?? 30] ?? 'info',
    category: categoryOf(message, isRequest, req?.method ?? null, path),
    message,
    requestId: req?.id ?? null,
    userId: numberOrNull(userId),
    method: req?.method ?? null,
    path,
    status: numberOrNull(line.res?.statusCode),
    durationMs: numberOrNull(line.responseTime),
    details: Object.keys(details).length === 0 ? null : details,
  };
}

/**
 * A pino destination that also keeps log lines in the database. Lines are batched (every few
 * seconds, or at MAX_BATCH) so requests never wait for it, and a database failure never
 * breaks a request – the lines stay in the buffer and the failure goes to stdout only.
 */
export class LogSink {
  private buffer: LogRow[] = [];
  private writer: LogWriter | null = null;
  private timer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> | null = null;

  /** pino calls this with each serialized line. */
  write(chunk: string): void {
    let row: LogRow | null;
    try {
      row = toLogRow(JSON.parse(chunk) as PinoLine);
    } catch {
      return;
    }
    if (row === null) {
      return;
    }
    this.buffer.push(row);
    if (this.buffer.length > MAX_BUFFER) {
      this.buffer.splice(0, this.buffer.length - MAX_BUFFER);
    }
    if (this.writer !== null && this.buffer.length >= MAX_BATCH) {
      void this.flush();
    }
  }

  /** Starts writing to the database (lines logged before this are kept and written too). */
  attach(writer: LogWriter): void {
    this.writer = writer;
    this.timer = setInterval(() => {
      void this.flush();
    }, FLUSH_EVERY_MS);
    this.timer.unref();
  }

  async flush(): Promise<void> {
    if (this.writer === null || this.buffer.length === 0) {
      return;
    }
    if (this.flushing !== null) {
      return this.flushing;
    }
    const batch = this.buffer.splice(0, MAX_BATCH);
    const writer = this.writer;
    this.flushing = writer
      .insert(batch)
      .catch((err: unknown) => {
        // Put them back for the next try; report on stdout (not through the logger – no loop).
        this.buffer.unshift(...batch);
        if (this.buffer.length > MAX_BUFFER) {
          this.buffer.splice(MAX_BUFFER);
        }
        process.stderr.write(`app_logs write failed: ${(err as Error).message}\n`);
      })
      .finally(() => {
        this.flushing = null;
      });
    return this.flushing;
  }

  /** On shutdown: stop the timer and write what is left. */
  async close(): Promise<void> {
    if (this.timer !== null) {
      clearInterval(this.timer);
    }
    await this.flush();
  }
}

export const logSink = new LogSink();

import type { z } from 'zod';
import type { Logger } from '../lib/logger.js';

export class HttpError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status: number | null,
    readonly retryable: boolean,
    /** Wait requested by the server (Retry-After), in milliseconds. */
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface GetJsonOptions<T extends z.ZodType> {
  /** Validates (and types) the response body; a mismatch is a non-retryable error. */
  schema: T;
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export type FetchFn = typeof fetch;

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const BASE_BACKOFF_MS = 300;
/** Never wait longer than this for one retry, whatever the server asks (keeps startup bounded). */
const MAX_RETRY_WAIT_MS = 30_000;

/**
 * Reads a Retry-After header: either seconds ("120") or an HTTP date. Returns milliseconds,
 * or null when the header is missing or unreadable.
 */
export function parseRetryAfter(header: string | null, now: number = Date.now()): number | null {
  if (header === null || header.trim() === '') {
    return null;
  }
  const value = header.trim();
  if (/^\d+$/.test(value)) {
    return Number(value) * 1000;
  }
  const date = Date.parse(value);
  if (Number.isNaN(date)) {
    return null;
  }
  return Math.max(0, date - now);
}

/**
 * Generic client for third-party JSON APIs: per-request timeout, retries on network errors /
 * 429 / 5xx, response validation, and logging. Between retries it waits as long as the server
 * asks (Retry-After, capped) or, without such a header, an exponential default backoff.
 */
export class HttpClient {
  constructor(
    private readonly logger: Logger,
    private readonly fetchFn: FetchFn = fetch,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {}

  async getJson<T extends z.ZodType>(url: string, options: GetJsonOptions<T>): Promise<z.infer<T>> {
    const retries = options.retries ?? DEFAULT_RETRIES;
    let lastError: HttpError | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        await this.sleep(retryWait(attempt, lastError));
      }
      const startedAt = Date.now();
      try {
        const body = await this.fetchOnce(url, options);
        const parsed = options.schema.safeParse(body);
        if (!parsed.success) {
          throw new HttpError(`Unexpected response shape from ${url}`, url, 200, false);
        }
        this.logger.debug({ url, attempt, ms: Date.now() - startedAt }, 'HTTP GET ok');
        return parsed.data;
      } catch (err) {
        lastError = toHttpError(err, url);
        this.logger.warn(
          {
            url,
            attempt,
            ms: Date.now() - startedAt,
            status: lastError.status,
            retryAfterMs: lastError.retryAfterMs,
            err: lastError.message,
          },
          'HTTP GET failed',
        );
        if (!lastError.retryable) {
          break;
        }
      }
    }
    throw lastError ?? new HttpError(`Request to ${url} failed`, url, null, false);
  }

  private async fetchOnce(url: string, options: GetJsonOptions<z.ZodType>): Promise<unknown> {
    const response = await this.fetchFn(url, {
      headers: { accept: 'application/json', ...options.headers },
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new HttpError(
        `HTTP ${response.status} from ${url}`,
        url,
        response.status,
        retryable,
        parseRetryAfter(response.headers.get('retry-after')),
      );
    }
    return (await response.json()) as unknown;
  }
}

/** The server's requested wait when it gave one (capped), otherwise exponential backoff. */
function retryWait(attempt: number, lastError: HttpError | undefined): number {
  const requested = lastError?.retryAfterMs ?? null;
  if (requested !== null) {
    return Math.min(requested, MAX_RETRY_WAIT_MS);
  }
  return BASE_BACKOFF_MS * 2 ** (attempt - 1);
}

function toHttpError(err: unknown, url: string): HttpError {
  if (err instanceof HttpError) {
    return err;
  }
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return new HttpError(`Timeout calling ${url}`, url, null, true);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new HttpError(`Network error calling ${url}: ${message}`, url, null, true);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

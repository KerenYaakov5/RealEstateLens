import type { FetchFn } from '../httpClient.js';
import { LlmUnavailableError } from './types.js';

/**
 * One POST to a model API, no retries: the user is waiting, so a slow or failing provider is
 * skipped for the next one instead of being retried. The API key goes in a header, never in the
 * URL (URLs end up in logs).
 */
export async function postLlmJson(
  fetchFn: FetchFn,
  provider: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new LlmUnavailableError(
      timedOut ? `timeout after ${timeoutMs}ms` : `network error: ${(err as Error).message}`,
      provider,
    );
  }
  if (!response.ok) {
    // The body may echo the request; keep only the status in the error.
    throw new LlmUnavailableError(`HTTP ${response.status}`, provider, response.status);
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new LlmUnavailableError('response is not JSON', provider, response.status);
  }
}

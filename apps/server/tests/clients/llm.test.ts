import { describe, expect, it, vi } from 'vitest';
import type { FetchFn } from '../../src/clients/httpClient.js';
import { CircuitBreaker } from '../../src/clients/llm/circuitBreaker.js';
import { GeminiProvider } from '../../src/clients/llm/gemini.js';
import { OpenAiProvider } from '../../src/clients/llm/openai.js';
import { LlmUnavailableError, type LlmRequest } from '../../src/clients/llm/types.js';

const REQUEST: LlmRequest = {
  system: 'sys',
  messages: [{ role: 'user', text: '{"p":{}}' }],
  responseSchema: { type: 'object' },
  maxOutputTokens: 300,
  timeoutMs: 1000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('GeminiProvider', () => {
  it('sends the key in a header with a JSON-schema answer, and reads text and tokens', async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: '{"picks":' }, { text: '[]}' }] } }],
        usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30 },
      }),
    );
    const provider = new GeminiProvider('secret-key', 'gemini-test', fetchFn);

    await expect(provider.complete(REQUEST)).resolves.toEqual({
      text: '{"picks":[]}',
      inputTokens: 120,
      outputTokens: 30,
    });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(String(url)).toContain('/models/gemini-test:generateContent');
    expect(String(url)).not.toContain('secret-key');
    expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
    const body = JSON.parse(String(init?.body)) as {
      generationConfig: { responseMimeType: string; maxOutputTokens: number };
    };
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.maxOutputTokens).toBe(300);
  });

  it('maps HTTP errors and empty answers to "unavailable"', async () => {
    const failing = new GeminiProvider(
      'k',
      'm',
      vi.fn<FetchFn>().mockResolvedValue(jsonResponse({}, 503)),
    );
    await expect(failing.complete(REQUEST)).rejects.toBeInstanceOf(LlmUnavailableError);

    const empty = new GeminiProvider(
      'k',
      'm',
      vi.fn<FetchFn>().mockResolvedValue(jsonResponse({ candidates: [] })),
    );
    await expect(empty.complete(REQUEST)).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  it('maps a timeout to "unavailable"', async () => {
    const fetchFn = vi.fn<FetchFn>().mockRejectedValue(new DOMException('slow', 'TimeoutError'));
    const provider = new GeminiProvider('k', 'm', fetchFn);

    await expect(provider.complete(REQUEST)).rejects.toThrow(/timeout/);
  });
});

describe('OpenAiProvider', () => {
  it('uses a strict JSON schema and reads the output text', async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(
      jsonResponse({
        output: [
          { type: 'reasoning' },
          { type: 'message', content: [{ type: 'output_text', text: '{"picks":[]}' }] },
        ],
        usage: { input_tokens: 90, output_tokens: 20 },
      }),
    );
    const provider = new OpenAiProvider('sk-test', 'nano-test', fetchFn);

    await expect(provider.complete(REQUEST)).resolves.toEqual({
      text: '{"picks":[]}',
      inputTokens: 90,
      outputTokens: 20,
    });
    const init = fetchFn.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    const body = JSON.parse(String(init?.body)) as {
      text: { format: { type: string; strict: boolean } };
      store: boolean;
    };
    expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true });
    expect(body.store).toBe(false);
  });

  it('maps a network error to "unavailable"', async () => {
    const provider = new OpenAiProvider(
      'k',
      'm',
      vi.fn<FetchFn>().mockRejectedValue(new Error('ECONNRESET')),
    );

    await expect(provider.complete(REQUEST)).rejects.toBeInstanceOf(LlmUnavailableError);
  });
});

describe('CircuitBreaker', () => {
  const options = { failureThreshold: 3, windowMs: 60_000, openMs: 60_000 };

  it('opens after 3 failures within the window and lets one trial through later', () => {
    let now = 0;
    const breaker = new CircuitBreaker(options, () => now);
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.tryAcquire()).toBe(true);
    breaker.recordFailure();

    expect(breaker.state).toBe('open');
    expect(breaker.tryAcquire()).toBe(false);

    now = 60_000;
    expect(breaker.state).toBe('half-open');
    expect(breaker.tryAcquire()).toBe(true);
    expect(breaker.tryAcquire()).toBe(false);
    breaker.recordSuccess();
    expect(breaker.state).toBe('closed');
  });

  it('forgets failures older than the window', () => {
    let now = 0;
    const breaker = new CircuitBreaker(options, () => now);
    breaker.recordFailure();
    breaker.recordFailure();
    now = 61_000;
    breaker.recordFailure();

    expect(breaker.state).toBe('closed');
  });

  it('re-opens when the half-open trial fails', () => {
    let now = 0;
    const breaker = new CircuitBreaker(options, () => now);
    for (let i = 0; i < 3; i++) {
      breaker.recordFailure();
    }
    now = 60_000;
    breaker.tryAcquire();
    breaker.recordFailure();

    expect(breaker.state).toBe('open');
  });
});

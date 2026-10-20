import { z } from 'zod';
import type { FetchFn } from '../httpClient.js';
import { postLlmJson } from './postJson.js';
import {
  LlmUnavailableError,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
} from './types.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const responseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({ parts: z.array(z.object({ text: z.string().optional() })).optional() })
          .optional(),
      }),
    )
    .optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().optional(),
      candidatesTokenCount: z.number().optional(),
      thoughtsTokenCount: z.number().optional(),
    })
    .optional(),
});

/** Google Gemini (generateContent REST API) with a JSON-schema constrained answer. */
export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const body = await postLlmJson(
      this.fetchFn,
      this.name,
      `${BASE_URL}/${encodeURIComponent(this.model)}:generateContent`,
      { 'x-goog-api-key': this.apiKey },
      {
        systemInstruction: { parts: [{ text: request.system }] },
        contents: request.messages.map((message) => {
          return {
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.text }],
          };
        }),
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: request.responseSchema,
          maxOutputTokens: request.maxOutputTokens,
          temperature: 0.2,
          // Picking from a short list needs no reasoning tokens – they would only add cost.
          thinkingConfig: { thinkingLevel: 'minimal' },
        },
      },
      request.timeoutMs,
    );
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) {
      throw new LlmUnavailableError('unexpected response shape', this.name);
    }
    const text = (parsed.data.candidates?.[0]?.content?.parts ?? [])
      .map((part) => {
        return part.text ?? '';
      })
      .join('');
    if (text.trim() === '') {
      throw new LlmUnavailableError('empty answer', this.name);
    }
    const usage = parsed.data.usageMetadata;
    return {
      text,
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
    };
  }
}

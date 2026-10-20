import { z } from 'zod';
import type { FetchFn } from '../httpClient.js';
import { postLlmJson } from './postJson.js';
import {
  LlmUnavailableError,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
} from './types.js';

const URL = 'https://api.openai.com/v1/responses';

const responseSchema = z.object({
  output: z
    .array(
      z.object({
        type: z.string(),
        content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
      }),
    )
    .optional(),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).optional(),
});

/** OpenAI (Responses REST API) with a strict JSON-schema answer. */
export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai';

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const body = await postLlmJson(
      this.fetchFn,
      this.name,
      URL,
      { authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        instructions: request.system,
        input: request.messages.map((message) => {
          return { role: message.role, content: message.text };
        }),
        max_output_tokens: request.maxOutputTokens,
        // Reasoning tokens count against max_output_tokens and cost money; none are needed here.
        reasoning: { effort: 'none' },
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: 'recommendation',
            strict: true,
            schema: request.responseSchema,
          },
        },
      },
      request.timeoutMs,
    );
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) {
      throw new LlmUnavailableError('unexpected response shape', this.name);
    }
    const text = (parsed.data.output ?? [])
      .filter((item) => {
        return item.type === 'message';
      })
      .flatMap((item) => {
        return item.content ?? [];
      })
      .filter((part) => {
        return part.type === 'output_text';
      })
      .map((part) => {
        return part.text ?? '';
      })
      .join('');
    if (text.trim() === '') {
      throw new LlmUnavailableError('empty answer', this.name);
    }
    return {
      text,
      inputTokens: parsed.data.usage?.input_tokens ?? 0,
      outputTokens: parsed.data.usage?.output_tokens ?? 0,
    };
  }
}

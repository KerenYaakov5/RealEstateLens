export interface LlmMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  /** JSON Schema the answer must follow (both providers enforce it server-side). */
  responseSchema: Record<string, unknown>;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface LlmResponse {
  /** Raw answer text – still unvalidated. */
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmProvider {
  /** "gemini" / "openai" – used in logs and the circuit breaker. */
  readonly name: string;
  readonly model: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

/**
 * The provider could not give an answer at all (timeout, network, HTTP error, empty reply).
 * The next provider is tried. A wrong answer is not this error – it goes to the validator.
 */
export class LlmUnavailableError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}

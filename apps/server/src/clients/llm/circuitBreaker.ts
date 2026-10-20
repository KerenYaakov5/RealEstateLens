export interface CircuitBreakerOptions {
  /** Failures within `windowMs` that open the circuit. */
  failureThreshold: number;
  windowMs: number;
  /** How long an open circuit skips the provider before letting one trial request through. */
  openMs: number;
}

export const DEFAULT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 3,
  windowMs: 60_000,
  openMs: 60_000,
};

/**
 * Stops calling a provider that keeps failing, so users don't each wait for its timeout.
 * closed → (N failures in the window) → open → (after openMs) half-open: one trial request;
 * success closes the circuit, failure opens it again.
 */
export class CircuitBreaker {
  private failures: number[] = [];
  private openedAt: number | null = null;
  private trialInFlight = false;

  constructor(
    private readonly options: CircuitBreakerOptions = DEFAULT_BREAKER_OPTIONS,
    private readonly now: () => number = Date.now,
  ) {}

  get state(): 'closed' | 'open' | 'half-open' {
    if (this.openedAt === null) {
      return 'closed';
    }
    return this.now() - this.openedAt >= this.options.openMs ? 'half-open' : 'open';
  }

  /** Whether a request may go to the provider now. Call exactly once per request. */
  tryAcquire(): boolean {
    const state = this.state;
    if (state === 'closed') {
      return true;
    }
    if (state === 'half-open' && !this.trialInFlight) {
      this.trialInFlight = true;
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = [];
    this.openedAt = null;
    this.trialInFlight = false;
  }

  recordFailure(): void {
    const now = this.now();
    if (this.trialInFlight) {
      this.trialInFlight = false;
      this.openedAt = now;
      return;
    }
    this.failures = this.failures.filter((at) => {
      return now - at < this.options.windowMs;
    });
    this.failures.push(now);
    if (this.failures.length >= this.options.failureThreshold) {
      this.openedAt = now;
      this.failures = [];
    }
  }
}

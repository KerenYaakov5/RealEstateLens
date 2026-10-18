/**
 * Holds one value in memory for `ttlMs`, loading it on first use. Concurrent callers share a
 * single in-flight load, and a failed load is not cached. If a refresh fails while an older
 * value exists, the older value keeps being served (stale-if-error).
 */
export class MemoryCache<T> {
  private value: { data: T; loadedAt: number } | undefined;
  private inFlight: Promise<T> | undefined;

  constructor(
    private readonly loader: () => Promise<T>,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
    private readonly onRefreshError: (err: unknown) => void = () => {
      return undefined;
    },
  ) {}

  async get(): Promise<T> {
    if (this.value !== undefined && this.now() - this.value.loadedAt < this.ttlMs) {
      return this.value.data;
    }
    if (this.inFlight !== undefined) {
      return this.inFlight;
    }
    this.inFlight = this.load();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = undefined;
    }
  }

  /** Forces the next `get` to reload (e.g. after a re-seed). */
  invalidate(): void {
    this.value = undefined;
  }

  private async load(): Promise<T> {
    try {
      const data = await this.loader();
      this.value = { data, loadedAt: this.now() };
      return data;
    } catch (err) {
      if (this.value !== undefined) {
        this.onRefreshError(err);
        return this.value.data;
      }
      throw err;
    }
  }
}

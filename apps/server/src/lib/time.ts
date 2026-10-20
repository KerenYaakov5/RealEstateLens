/** "YYYY-MM-DD" in Israel – daily limits (AI quota, call ceiling) reset at local midnight. */
export function israelDay(epochMs: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(epochMs);
}

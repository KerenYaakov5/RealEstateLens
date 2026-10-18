/** Outcome of normalizing a single raw cell. `null` values are valid ("unknown"). */
export type FieldResult<T> =
  { ok: true; value: T; warning?: string } | { ok: false; reason: string };

export function ok<T>(value: T, warning?: string): FieldResult<T> {
  if (warning === undefined) {
    return { ok: true, value };
  }
  return { ok: true, value, warning };
}

export function fail<T>(reason: string): FieldResult<T> {
  return { ok: false, reason };
}

/** A raw cell as produced by the spreadsheet reader. */
export type RawCell = string | number | boolean | Date | null | undefined;

export function isBlank(raw: RawCell): boolean {
  if (raw === null || raw === undefined) {
    return true;
  }
  return typeof raw === 'string' && raw.trim() === '';
}

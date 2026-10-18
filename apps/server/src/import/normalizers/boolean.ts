import { cleanText } from './text.js';
import { fail, isBlank, ok, type FieldResult, type RawCell } from './result.js';

const TRUE_VALUES = new Set(['כן', 'yes', 'y', 'true', '1', 'יש', 'v']);
const FALSE_VALUES = new Set(['לא', 'no', 'n', 'false', '0', 'אין', 'x']);

/** Parses yes/no style values. Empty → null ("unknown"); unrecognized text → failure. */
export function normalizeBoolean(raw: RawCell): FieldResult<boolean | null> {
  if (isBlank(raw)) {
    return ok(null);
  }
  if (typeof raw === 'boolean') {
    return ok(raw);
  }
  if (typeof raw === 'number') {
    if (raw === 1) {
      return ok(true);
    }
    if (raw === 0) {
      return ok(false);
    }
    return fail(`ערך בוליאני לא מוכר: ${raw}`);
  }
  const text = cleanText(raw instanceof Date ? raw.toISOString() : raw)?.toLowerCase() ?? '';
  if (TRUE_VALUES.has(text)) {
    return ok(true);
  }
  if (FALSE_VALUES.has(text)) {
    return ok(false);
  }
  return fail(`ערך בוליאני לא מוכר: "${text}"`);
}

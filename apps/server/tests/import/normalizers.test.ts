import { describe, expect, it } from 'vitest';
import { PROPERTY_CONDITIONS, PROPERTY_TYPES } from '@rel/shared';
import { normalizeBoolean } from '../../src/import/normalizers/boolean.js';
import { normalizeDealDate } from '../../src/import/normalizers/date.js';
import { normalizeEnum } from '../../src/import/normalizers/enum.js';
import {
  normalizeOptionalInt,
  normalizePrice,
  parseLooseNumber,
} from '../../src/import/normalizers/number.js';
import { normalizeRooms } from '../../src/import/normalizers/rooms.js';
import { cleanText, toMatchKey } from '../../src/import/normalizers/text.js';
import type { FieldResult } from '../../src/import/normalizers/result.js';

function valueOf<T>(result: FieldResult<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got failure: ${result.reason}`);
  }
  return result.value;
}

describe('cleanText', () => {
  it('trims and collapses whitespace (values seen in the data)', () => {
    expect(cleanText('  מבצע קדש ')).toBe('מבצע קדש');
    expect(cleanText('דירה  ')).toBe('דירה');
    expect(cleanText('רובע ט"ו ')).toBe('רובע ט"ו');
  });

  it('unifies Hebrew gershayim/geresh and typographic quotes', () => {
    expect(cleanText('ב״ש')).toBe('ב"ש');
    expect(cleanText('רמב״ש ג׳')).toBe('רמב"ש ג\'');
    expect(cleanText('ז’בוטינסקי')).toBe("ז'בוטינסקי");
  });

  it('removes niqqud and invisible direction marks', () => {
    expect(cleanText('חֵיפָה')).toBe('חיפה');
    expect(cleanText('\u200Fחולון\u200E')).toBe('חולון');
  });

  it('unifies dash variants', () => {
    expect(cleanText('באר–שבע')).toBe('באר-שבע');
  });

  it('returns null for empty input', () => {
    expect(cleanText('   ')).toBeNull();
    expect(cleanText(null)).toBeNull();
  });
});

describe('toMatchKey', () => {
  it('gives different spellings of the same name one key', () => {
    expect(toMatchKey('מודיעין-מכבים-רעות')).toBe(toMatchKey('מודיעין מכבים רעות'));
    expect(toMatchKey('Tel Aviv-Yafo')).toBe('tel aviv yafo');
    expect(toMatchKey('ב"ש')).toBe('בש');
  });
});

describe('normalizeBoolean', () => {
  it.each([
    ['כן', true],
    ['yes', true],
    ['YES', true],
    ['true', true],
    ['1', true],
    [1, true],
    [true, true],
    ['לא', false],
    ['no', false],
    ['0', false],
    [0, false],
    [false, false],
  ] as const)('%s → %s', (raw, expected) => {
    expect(valueOf(normalizeBoolean(raw))).toBe(expected);
  });

  it('treats empty as unknown (has_parking has 20 empty cells)', () => {
    expect(valueOf(normalizeBoolean(''))).toBeNull();
    expect(valueOf(normalizeBoolean(undefined))).toBeNull();
  });

  it('fails on unrecognized text', () => {
    expect(normalizeBoolean('אולי').ok).toBe(false);
    expect(normalizeBoolean(2).ok).toBe(false);
  });
});

describe('parseLooseNumber / normalizePrice', () => {
  it.each([
    [3054000, 3054000],
    ['3054000', 3054000],
    ['1,850,000', 1850000],
    ['1,850,000 ₪', 1850000],
    ['₪1,850,000', 1850000],
    ['1850000 ש"ח', 1850000],
    ['ש״ח 950,000', 950000],
  ] as const)('%s → %s', (raw, expected) => {
    expect(valueOf(normalizePrice(raw))).toBe(expected);
  });

  it('rejects missing, non-numeric and absurd prices', () => {
    expect(normalizePrice('').ok).toBe(false);
    expect(normalizePrice('כמיליון').ok).toBe(false);
    expect(normalizePrice(500).ok).toBe(false);
  });

  it('does not merge two numbers into one', () => {
    expect(parseLooseNumber('1,850,000 - 1,900,000')).toBeUndefined();
  });
});

describe('normalizeRooms', () => {
  it.each([
    [3, 3],
    ['3.5', 3.5],
    ['4 חדרים', 4],
    ['3.5 חדרים', 3.5],
    ['חדרים 4', 4],
    ['3,5', 3.5],
    ['2.5 rooms', 2.5],
  ] as const)('%s → %s', (raw, expected) => {
    expect(valueOf(normalizeRooms(raw))).toBe(expected);
  });

  it('rejects missing, out-of-range and non half-room values', () => {
    expect(normalizeRooms('').ok).toBe(false);
    expect(normalizeRooms(0).ok).toBe(false);
    expect(normalizeRooms(15).ok).toBe(false);
    expect(normalizeRooms(3.3).ok).toBe(false);
  });
});

describe('normalizeOptionalInt', () => {
  const sizeRange = { min: 10, max: 1000, label: 'גודל' };

  it('keeps valid values and treats empty as unknown', () => {
    expect(valueOf(normalizeOptionalInt(110, sizeRange))).toBe(110);
    expect(valueOf(normalizeOptionalInt('', sizeRange))).toBeNull();
  });

  it('turns out-of-range values into unknown with a warning', () => {
    const result = normalizeOptionalInt(5000, sizeRange);

    expect(result.ok && result.value).toBeNull();
    expect(result.ok && result.warning).toMatch(/מחוץ לטווח/);
  });
});

describe('normalizeDealDate', () => {
  const today = new Date('2026-10-18T00:00:00Z');

  it('reads Excel serial numbers', () => {
    expect(valueOf(normalizeDealDate(45907, today))).toBe('2025-09-07');
  });

  it('reads Date objects produced by the spreadsheet reader', () => {
    expect(valueOf(normalizeDealDate(new Date('2025-09-07T00:00:00Z'), today))).toBe('2025-09-07');
  });

  it.each([
    ['17.07.2026', '2026-07-17'],
    ['23/07/2021', '2021-07-23'],
    ['4-12-2021', '2021-12-04'],
    ['2024-02-26', '2024-02-26'],
  ] as const)('reads text date %s', (raw, expected) => {
    expect(valueOf(normalizeDealDate(raw, today))).toBe(expected);
  });

  it('treats a date without a year as missing', () => {
    const result = normalizeDealDate('17.07', today);

    expect(result.ok && result.value).toBeNull();
    expect(result.ok && result.warning).toMatch(/ללא שנה/);
  });

  it('treats impossible and future dates as missing', () => {
    expect(valueOf(normalizeDealDate('31.02.2024', today))).toBeNull();
    expect(valueOf(normalizeDealDate('01.01.2027', today))).toBeNull();
  });
});

describe('normalizeEnum', () => {
  it('maps padded Hebrew labels (values seen in the data)', () => {
    const options = { required: true };

    expect(valueOf(normalizeEnum(PROPERTY_TYPES, '  דירת גן ', 'סוג נכס', options))).toBe(
      'gardenApartment',
    );
    expect(valueOf(normalizeEnum(PROPERTY_TYPES, 'פנטהאוז  ', 'סוג נכס', options))).toBe(
      'penthouse',
    );
  });

  it('accepts the English key', () => {
    expect(valueOf(normalizeEnum(PROPERTY_TYPES, 'Penthouse', 'סוג נכס', { required: true }))).toBe(
      'penthouse',
    );
  });

  it('fails a required enum on unknown value, but only warns for an optional one', () => {
    expect(normalizeEnum(PROPERTY_TYPES, 'טירה', 'סוג נכס', { required: true }).ok).toBe(false);

    const optional = normalizeEnum(PROPERTY_CONDITIONS, 'מצוין', 'מצב', { required: false });

    expect(optional.ok && optional.value).toBeNull();
    expect(optional.ok && optional.warning).toBeDefined();
  });

  it('treats an empty optional enum as unknown (condition has 16 empty cells)', () => {
    expect(valueOf(normalizeEnum(PROPERTY_CONDITIONS, '', 'מצב', { required: false }))).toBeNull();
  });
});

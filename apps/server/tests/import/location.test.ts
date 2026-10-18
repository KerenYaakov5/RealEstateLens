import { describe, expect, it } from 'vitest';
import { CITY_REFERENCES } from '../../src/data/cities.js';
import { similarity } from '../../src/import/normalizers/levenshtein.js';
import {
  CityMatcher,
  normalizeNeighborhood,
  normalizeStreet,
} from '../../src/import/normalizers/location.js';

const matcher = new CityMatcher(CITY_REFERENCES);

function cityKeyOf(raw: string): string | undefined {
  const result = matcher.match(raw);
  return result.ok ? result.value.cityKey : undefined;
}

describe('CityMatcher – every spelling found in the seed data', () => {
  it.each([
    ['חולון', 'holon'],
    ['ירושלים ', 'jerusalem'],
    ['Jerusalem', 'jerusalem'],
    ['תל אביב', 'tel-aviv-yafo'],
    ['תל אביב-יפו', 'tel-aviv-yafo'],
    ['תל אביב יפו', 'tel-aviv-yafo'],
    ['Tel Aviv-Yafo', 'tel-aviv-yafo'],
    ['ת"א', 'tel-aviv-yafo'],
    ['באר שבע', 'beer-sheva'],
    ['באר-שבע', 'beer-sheva'],
    ['ב"ש', 'beer-sheva'],
    ['בית-שמש', 'beit-shemesh'],
    ['מודיעין', 'modiin'],
    ['מודיעין מכבים רעות', 'modiin'],
    ['מודיעין-מכבים-רעות', 'modiin'],
  ])('%s → %s', (raw, expected) => {
    expect(cityKeyOf(raw)).toBe(expected);
  });

  it('matches all 29 raw spellings to 18 cities without failures', () => {
    const rawSpellings = [
      'חולון',
      'נתניה',
      'ראשון לציון',
      'פתח תקווה',
      'כפר סבא',
      'רעננה',
      'רמת גן',
      'רחובות',
      'הרצליה',
      'גבעתיים',
      'בת ים',
      'אשדוד',
      'חיפה',
      'בית שמש',
      'באר שבע',
      'מודיעין',
      'מודיעין מכבים רעות',
      'מודיעין-מכבים-רעות',
      'ירושלים',
      'ירושלים ',
      'בית-שמש',
      'תל אביב',
      'באר-שבע',
      'תל אביב-יפו',
      'ב"ש',
      'Tel Aviv-Yafo',
      'תל אביב יפו',
      'Jerusalem',
      'ת"א',
    ];

    const keys = rawSpellings.map(cityKeyOf);

    expect(keys).not.toContain(undefined);
    expect(new Set(keys).size).toBe(18);
  });
});

describe('CityMatcher – future spellings', () => {
  it('translates mixed Hebrew/English names', () => {
    const result = matcher.match('Tel אביב');

    expect(result.ok && result.value).toEqual({ cityKey: 'tel-aviv-yafo', method: 'translated' });
  });

  it('handles Hebrew typos with a fuzzy match and flags them', () => {
    const result = matcher.match('פתח תקוואה');

    expect(result.ok && result.value.method).toBe('fuzzy');
    expect(result.ok && result.value.cityKey).toBe('petah-tikva');
    expect(result.ok && result.warning).toBeDefined();
  });

  it('accepts curly gershayim and niqqud', () => {
    expect(cityKeyOf('ב״ש')).toBe('beer-sheva');
    expect(cityKeyOf('חֵיפָה')).toBe('haifa');
  });

  it('does not fuzzy-match a different real city', () => {
    expect(matcher.match('רמת השרון').ok).toBe(false);
    expect(matcher.match('ראש העין').ok).toBe(false);
    expect(matcher.match('גבעת שמואל').ok).toBe(false);
  });

  it('fails on empty input', () => {
    expect(matcher.match('').ok).toBe(false);
  });
});

describe('normalizeNeighborhood', () => {
  it.each([
    ['מרכז ', 'מרכז'],
    ['Florentin', 'פלורנטין'],
    ['רמב"ש ג\'', "רמת בית שמש ג'"],
    ['רמת בית שמש ג', "רמת בית שמש ג'"],
    ['רמת בית שמש א', "רמת בית שמש א'"],
    ["שכונה ו'", "שכונה ו'"],
    ['רובע ט"ו ', 'רובע ט"ו'],
  ])('%s → %s', (raw, expected) => {
    const result = normalizeNeighborhood(raw);

    expect(result.ok && result.value).toBe(expected);
  });

  it('treats empty as unknown', () => {
    const result = normalizeNeighborhood('');

    expect(result.ok && result.value).toBeNull();
  });
});

describe('normalizeStreet', () => {
  it('cleans padded names and keeps quotes', () => {
    const result = normalizeStreet('  הפלמ"ח ');

    expect(result.ok && result.value).toBe('הפלמ"ח');
  });

  it('fails when missing', () => {
    expect(normalizeStreet('  ').ok).toBe(false);
  });
});

describe('similarity', () => {
  it('scores identical strings as 1 and unrelated ones low', () => {
    expect(similarity('חולון', 'חולון')).toBe(1);
    expect(similarity('חולון', 'נתניה')).toBeLessThan(0.5);
  });
});

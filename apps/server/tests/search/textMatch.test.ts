import { describe, expect, it } from 'vitest';
import { bestMatch, matchText, searchKey } from '../../src/services/search/textMatch.js';

function kindOf(query: string, candidate: string) {
  return matchText(searchKey(query), searchKey(candidate))?.kind ?? null;
}

describe('searchKey', () => {
  it('unifies final letters, quotes, dashes and case', () => {
    expect(searchKey('רמת גנ')).toBe(searchKey('רמת גן'));
    expect(searchKey('ב״ש')).toBe(searchKey('ב"ש'));
    expect(searchKey('Tel-Aviv')).toBe(searchKey('tel aviv'));
  });

  it('translates Latin words of mixed spellings to Hebrew', () => {
    expect(searchKey('Tel אביב')).toBe(searchKey('תל אביב'));
  });
});

describe('matchText', () => {
  it.each([
    ['חולון', 'חולון', 'exact'],
    ['הרצ', 'הרצליה', 'prefix'],
    ['גן', 'רמת גן', 'word'],
    ['שבע', 'באר שבע', 'word'],
    ['herz', 'Herzliyya', 'prefix'],
    ['Herzlia', 'Herzliyya', 'fuzzy'],
    ['פתח תקוה', 'פתח תקווה', 'fuzzy'],
    ['רמת גנ', 'רמת גן', 'exact'],
  ] as const)('"%s" vs "%s" → %s', (query, candidate, expected) => {
    expect(kindOf(query, candidate)).toBe(expected);
  });

  it('does not match unrelated names', () => {
    expect(kindOf('חיפה', 'נתניה')).toBeNull();
    expect(kindOf('רמת השרון', 'רמת גן')).toBeNull();
  });

  it('ranks exact over prefix over word over fuzzy', () => {
    const score = (q: string, c: string) => matchText(searchKey(q), searchKey(c))?.score ?? 0;

    expect(score('חולון', 'חולון')).toBeGreaterThan(score('חול', 'חולון'));
    expect(score('חול', 'חולון')).toBeGreaterThan(score('גן', 'רמת גן'));
    expect(score('גן', 'רמת גן')).toBeGreaterThan(score('Herzlia', 'Herzliyya'));
  });
});

describe('bestMatch', () => {
  it('takes the best of several names of the same place', () => {
    const names = ['הרצלייה', 'herzliyya'].map(searchKey);

    expect(bestMatch(searchKey('Herzliyya'), names)?.kind).toBe('exact');
  });
});

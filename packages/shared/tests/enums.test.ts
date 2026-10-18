import { describe, expect, it } from 'vitest';
import {
  DEAL_SOURCES,
  PROPERTY_CONDITIONS,
  PROPERTY_TYPES,
  keyByLabel,
  propertyTypeSchema,
} from '../src/enums.js';

describe('keyByLabel', () => {
  it('maps every Hebrew label back to its key', () => {
    expect(keyByLabel(PROPERTY_TYPES, 'דירת גן')).toBe('gardenApartment');
    expect(keyByLabel(PROPERTY_CONDITIONS, 'חדש מקבלן')).toBe('newFromContractor');
    expect(keyByLabel(DEAL_SOURCES, 'רשות המסים')).toBe('taxAuthority');
  });

  it('returns undefined for an unknown label', () => {
    expect(keyByLabel(PROPERTY_TYPES, 'טירה')).toBeUndefined();
  });
});

describe('propertyTypeSchema', () => {
  it('accepts keys and rejects Hebrew labels', () => {
    expect(propertyTypeSchema.safeParse('penthouse').success).toBe(true);
    expect(propertyTypeSchema.safeParse('פנטהאוז').success).toBe(false);
  });
});

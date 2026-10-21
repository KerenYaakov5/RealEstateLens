import { describe, expect, it } from 'vitest';
import { propertyTypeSchema } from '../src/enums.js';

describe('propertyTypeSchema', () => {
  it('accepts keys and rejects Hebrew labels', () => {
    expect(propertyTypeSchema.safeParse('penthouse').success).toBe(true);
    expect(propertyTypeSchema.safeParse('פנטהאוז').success).toBe(false);
    expect(propertyTypeSchema.safeParse('triplex3').success).toBe(false);
  });
});

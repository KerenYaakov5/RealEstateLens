import { z } from 'zod';

// Canonical values are the Hebrew labels as they appear in the source data (after trimming).
// Keys are stable English identifiers used in code and in the API.

export const PROPERTY_TYPES = {
  apartment: 'דירה',
  duplex: 'דופלקס',
  penthouse: 'פנטהאוז',
  gardenApartment: 'דירת גן',
  rooftopApartment: 'דירת גג',
  privateHouse: 'בית פרטי',
} as const;

export const PROPERTY_CONDITIONS = {
  newFromContractor: 'חדש מקבלן',
  renovated: 'משופץ',
  good: 'במצב טוב',
  maintained: 'שמור',
  needsRenovation: 'דורש שיפוץ',
} as const;

export const DEAL_SOURCES = {
  taxAuthority: 'רשות המסים',
  broker: 'מתווך',
  owner: 'בעל נכס',
} as const;

export type PropertyType = keyof typeof PROPERTY_TYPES;
export type PropertyCondition = keyof typeof PROPERTY_CONDITIONS;
export type DealSource = keyof typeof DEAL_SOURCES;

function keysOf<T extends Record<string, string>>(
  record: T,
): [keyof T & string, ...(keyof T & string)[]] {
  return Object.keys(record) as [keyof T & string, ...(keyof T & string)[]];
}

export const propertyTypeSchema = z.enum(keysOf(PROPERTY_TYPES));
export const propertyConditionSchema = z.enum(keysOf(PROPERTY_CONDITIONS));
export const dealSourceSchema = z.enum(keysOf(DEAL_SOURCES));

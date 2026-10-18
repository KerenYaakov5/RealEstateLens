import { DEAL_SOURCES, PROPERTY_CONDITIONS, PROPERTY_TYPES } from '@rel/shared';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

function enumValues<T extends Record<string, string>>(record: T): [string, ...string[]] {
  return Object.keys(record) as [string, ...string[]];
}

export const propertyTypeEnum = pgEnum('property_type', enumValues(PROPERTY_TYPES));
export const propertyConditionEnum = pgEnum('property_condition', enumValues(PROPERTY_CONDITIONS));
export const dealSourceEnum = pgEnum('deal_source', enumValues(DEAL_SOURCES));
export const importIssueSeverityEnum = pgEnum('import_issue_severity', [
  'error',
  'warning',
  'duplicate',
]);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const cities = pgTable('cities', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  nameHe: text('name_he').notNull(),
  nameEn: text('name_en').notNull(),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  ...timestamps,
});

export const cityAliases = pgTable('city_aliases', {
  id: serial('id').primaryKey(),
  cityId: integer('city_id')
    .notNull()
    .references(() => cities.id, { onDelete: 'cascade' }),
  alias: text('alias').notNull(),
  matchKey: text('match_key').notNull().unique(),
});

export const neighborhoods = pgTable(
  'neighborhoods',
  {
    id: serial('id').primaryKey(),
    cityId: integer('city_id')
      .notNull()
      .references(() => cities.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  (table) => [uniqueIndex('neighborhoods_city_name_idx').on(table.cityId, table.name)],
);

export const deals = pgTable(
  'deals',
  {
    id: serial('id').primaryKey(),
    dealId: text('deal_id').notNull().unique(),
    cityId: integer('city_id')
      .notNull()
      .references(() => cities.id),
    neighborhoodId: integer('neighborhood_id').references(() => neighborhoods.id),
    street: text('street').notNull(),
    propertyType: propertyTypeEnum('property_type').notNull(),
    rooms: doublePrecision('rooms').notNull(),
    sizeSqm: integer('size_sqm'),
    floor: integer('floor'),
    totalFloors: integer('total_floors').notNull(),
    yearBuilt: integer('year_built'),
    condition: propertyConditionEnum('condition'),
    hasElevator: boolean('has_elevator'),
    hasParking: boolean('has_parking'),
    hasBalcony: boolean('has_balcony'),
    hasSafeRoom: boolean('has_safe_room'),
    dealDate: date('deal_date', { mode: 'string' }),
    priceNis: integer('price_nis').notNull(),
    pricePerSqm: integer('price_per_sqm'),
    sourcePricePerSqm: integer('source_price_per_sqm'),
    source: dealSourceEnum('source').notNull(),
    sourceRow: integer('source_row').notNull(),
    ...timestamps,
  },
  (table) => [
    index('deals_city_idx').on(table.cityId),
    index('deals_city_rooms_idx').on(table.cityId, table.rooms),
    index('deals_price_idx').on(table.priceNis),
  ],
);

export const importRuns = pgTable('import_runs', {
  id: serial('id').primaryKey(),
  sourceFile: text('source_file').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  rowsRead: integer('rows_read').notNull().default(0),
  dealsUpserted: integer('deals_upserted').notNull().default(0),
  rowsRejected: integer('rows_rejected').notNull().default(0),
  duplicatesRemoved: integer('duplicates_removed').notNull().default(0),
  warnings: integer('warnings').notNull().default(0),
});

/** Monthly values of CBS price index series (e.g. 40010 – Prices of Dwellings). */
export const priceIndex = pgTable(
  'price_index',
  {
    seriesCode: integer('series_code').notNull(),
    /** First day of the month, YYYY-MM-01. */
    period: date('period', { mode: 'string' }).notNull(),
    value: doublePrecision('value').notNull(),
    baseDesc: text('base_desc').notNull(),
    /** CBS revises the latest published months; those are refreshed periodically. */
    isProvisional: boolean('is_provisional').notNull().default(false),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.seriesCode, table.period] })],
);

/** Rejected rows, warnings and removed duplicates of each import run. */
export const importIssues = pgTable(
  'import_issues',
  {
    id: serial('id').primaryKey(),
    runId: integer('run_id')
      .notNull()
      .references(() => importRuns.id, { onDelete: 'cascade' }),
    severity: importIssueSeverityEnum('severity').notNull(),
    rowNumber: integer('row_number').notNull(),
    dealId: text('deal_id'),
    message: text('message').notNull(),
  },
  (table) => [index('import_issues_run_idx').on(table.runId)],
);

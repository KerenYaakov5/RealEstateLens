import { DEAL_SOURCES, PROPERTY_CONDITIONS, PROPERTY_TYPES } from '@rel/shared';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

function enumValues<T extends Record<string, string>>(
  record: T,
): [keyof T & string, ...(keyof T & string)[]] {
  return Object.keys(record) as [keyof T & string, ...(keyof T & string)[]];
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

/**
 * Users register with the registration code (or are added by the administrator). Passwords are
 * stored only as an Argon2 hash.
 */
export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  /** Stored lower-cased and trimmed. */
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  /** The registration code used to register; null for users added by the administrator. */
  registrationCodeId: integer('registration_code_id'),
  ...timestamps,
});

/**
 * The registration code: one permanent code the administrator shares, replaced when abused.
 * Only one row is active (disabled_at null); replaced codes stay for the record. The code is
 * kept encrypted, so the administrator can see it again, and as a SHA-256 hash for lookup.
 */
export const registrationCodes = pgTable('registration_codes', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  codeHash: text('code_hash').notNull().unique(),
  codeEncrypted: text('code_encrypted').notNull(),
  /** The last characters, to tell codes apart in the user list. */
  hint: text('hint').notNull(),
  usedCount: integer('used_count').notNull().default(0),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  createdByUserId: integer('created_by_user_id'),
  ...timestamps,
});

/**
 * Every locality in Israel (CBS localities file), not only cities with deals. The 18 reference
 * cities keep their hand-checked names and keys; all others use the official names and the key
 * `cbs-<code>`.
 */
export const cities = pgTable('cities', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  key: text('key').notNull().unique(),
  nameHe: text('name_he').notNull(),
  /** Official English name; missing for some localities in the source. */
  nameEn: text('name_en'),
  /** Official CBS locality code (סמל יישוב). */
  cbsCode: integer('cbs_code').unique(),
  /** CBS municipal status code: 0 = city, 99 = local council, others = regional council / none. */
  municipalStatus: integer('municipal_status'),
  /** CBS population estimate (latest file); used only to rank search suggestions. */
  population: integer('population'),
  /** ITM coordinates in meters, only from an official source (see coordinatesSource). */
  itmX: integer('itm_x'),
  itmY: integer('itm_y'),
  /**
   * The official file this locality was last loaded from – set even when that file has no
   * coordinates for it, so "never loaded" (null) is distinguishable from "officially unknown".
   */
  coordinatesSource: text('coordinates_source'),
  coordinatesUpdatedAt: timestamp('coordinates_updated_at', { withTimezone: true }),
  ...timestamps,
});

export const cityAliases = pgTable('city_aliases', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  cityId: integer('city_id')
    .notNull()
    .references(() => cities.id, { onDelete: 'cascade' }),
  alias: text('alias').notNull(),
  matchKey: text('match_key').notNull().unique(),
});

export const neighborhoods = pgTable(
  'neighborhoods',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
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
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
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
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
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

/**
 * State of each static reference source (e.g. the CBS localities file): which published file
 * was loaded, its modification date, and when we last checked for a newer one.
 */
export const referenceSources = pgTable('reference_sources', {
  key: text('key').primaryKey(),
  resourceId: text('resource_id').notNull(),
  /** Modification date as published by the source (kept verbatim for comparison). */
  sourceModifiedAt: text('source_modified_at'),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull(),
  loadedAt: timestamp('loaded_at', { withTimezone: true }).notNull(),
});

/** Rejected rows, warnings and removed duplicates of each import run. */
export const importIssues = pgTable(
  'import_issues',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
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

/**
 * Validated model answers (second cache layer, after memory). The key is a hash of exactly what
 * the model saw plus the prompt version; automatic (fallback) answers are never stored.
 */
export const aiCache = pgTable('ai_cache', {
  key: text('key').primaryKey(),
  promptVersion: integer('prompt_version').notNull(),
  picks: jsonb('picks').$type<{ compromiseId: string; reason: string }[]>().notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Per user and day (Israel time): personal recommendations (the quota) and model token use. */
export const aiUsage = pgTable(
  'ai_usage',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    recommendations: integer('recommendations').notNull().default(0),
    llmCalls: integer('llm_calls').notNull().default(0),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] })],
);

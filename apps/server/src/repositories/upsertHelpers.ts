import { getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * Builds an `ON CONFLICT DO UPDATE SET col = excluded.col` map for the given columns,
 * so bulk upserts overwrite every listed field with the incoming row.
 */
export function excludedSet<T extends PgTable>(
  table: T,
  columnKeys: readonly (keyof T['_']['columns'] & string)[],
): Record<string, SQL> {
  const columns = getTableColumns(table);
  const set: Record<string, SQL> = {};
  for (const key of columnKeys) {
    const column = columns[key];
    if (column !== undefined) {
      set[key] = sql.raw(`excluded."${column.name}"`);
    }
  }
  return set;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

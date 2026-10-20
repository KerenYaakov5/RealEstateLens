import { and, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { appLogs, users } from '../db/schema.js';
import type { LogRow, LogWriter } from '../lib/logSink.js';

export interface LogQuery {
  levels?: readonly string[];
  category?: string;
  /** Free text: message, path, user email, or anything in the details. */
  text?: string;
  since?: Date;
  /** Paging: rows older than this id (the last id of the previous page). */
  beforeId?: number;
  limit: number;
}

export class AppLogRepository implements LogWriter {
  constructor(private readonly db: Database) {}

  async insert(rows: LogRow[]): Promise<void> {
    if (rows.length > 0) {
      await this.db.insert(appLogs).values(rows);
    }
  }

  /** Retention: removes everything older than `days`. Returns how many rows went. */
  async deleteOlderThan(days: number): Promise<number> {
    const deleted = await this.db
      .delete(appLogs)
      .where(lt(appLogs.createdAt, sql`now() - make_interval(days => ${days})`))
      .returning({ id: appLogs.id });
    return deleted.length;
  }

  /** Newest first, with the user's email. */
  find(query: LogQuery) {
    const conditions: SQL[] = [];
    if (query.levels !== undefined && query.levels.length > 0) {
      conditions.push(inArray(appLogs.level, [...query.levels]));
    }
    if (query.category !== undefined) {
      conditions.push(eq(appLogs.category, query.category));
    }
    if (query.since !== undefined) {
      conditions.push(gte(appLogs.createdAt, query.since));
    }
    if (query.beforeId !== undefined) {
      conditions.push(lt(appLogs.id, query.beforeId));
    }
    if (query.text !== undefined) {
      const pattern = `%${query.text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      const textMatch = or(
        ilike(appLogs.message, pattern),
        ilike(appLogs.path, pattern),
        ilike(users.email, pattern),
        sql`${appLogs.details}::text ilike ${pattern}`,
      );
      if (textMatch !== undefined) {
        conditions.push(textMatch);
      }
    }
    return this.db
      .select({
        id: appLogs.id,
        createdAt: appLogs.createdAt,
        level: appLogs.level,
        category: appLogs.category,
        message: appLogs.message,
        requestId: appLogs.requestId,
        userEmail: users.email,
        method: appLogs.method,
        path: appLogs.path,
        status: appLogs.status,
        durationMs: appLogs.durationMs,
        details: appLogs.details,
      })
      .from(appLogs)
      .leftJoin(users, eq(users.id, appLogs.userId))
      .where(conditions.length === 0 ? undefined : and(...conditions))
      .orderBy(desc(appLogs.id))
      .limit(query.limit);
  }
}

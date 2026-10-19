import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from '../../src/db/client.js';
import { logger } from '../../src/lib/logger.js';

let handle: DatabaseHandle;

beforeAll(async () => {
  handle = createDatabase({ pgliteDataDir: 'memory://', logger });
  await handle.migrate();
}, 60_000);

afterAll(async () => {
  await handle.close();
});

describe('identity primary keys', () => {
  it('lets only the database assign ids', async () => {
    const first = await handle.db.execute(
      sql`INSERT INTO cities (key, name_he, name_en) VALUES ('a', 'א', 'A') RETURNING id`,
    );
    const second = await handle.db.execute(
      sql`INSERT INTO cities (key, name_he, name_en) VALUES ('b', 'ב', 'B') RETURNING id`,
    );
    const ids = [first, second].map((result) => {
      return (result as unknown as { rows: { id: number }[] }).rows[0]?.id;
    });

    expect(ids).toEqual([1, 2]);
  });

  it('rejects an insert that tries to choose its own id', async () => {
    await expect(
      handle.db.execute(
        sql`INSERT INTO cities (id, key, name_he, name_en) VALUES (99, 'c', 'ג', 'C')`,
      ),
    ).rejects.toThrow();
  });
});

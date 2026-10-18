import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.js';

describe('parseEnv', () => {
  it('applies defaults when nothing is set', () => {
    const env = parseEnv({});

    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.SEED_FILE_PATH).toMatch(/madlan-sample\.xlsx$/);
  });

  it('treats an empty DATABASE_URL as not set', () => {
    expect(parseEnv({ DATABASE_URL: '' }).DATABASE_URL).toBeUndefined();
  });

  it('accepts a postgres connection string', () => {
    const url = 'postgresql://user:pw@db.example.com:5432/postgres';

    expect(parseEnv({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });

  it('rejects an invalid port with a readable message', () => {
    expect(() => {
      return parseEnv({ PORT: 'abc' });
    }).toThrow(/PORT/);
  });
});

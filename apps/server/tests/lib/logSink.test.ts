import { describe, expect, it, vi } from 'vitest';
import { LogSink, toLogRow, type LogRow } from '../../src/lib/logSink.js';

const REQUEST_LINE = {
  level: 30,
  time: 1_792_520_000_000,
  pid: 1,
  hostname: 'h',
  req: {
    id: 'req-1',
    method: 'GET',
    url: '/api/v1/market-assessments?cityId=9&maxPrice=2500000',
    remoteAddress: '10.0.0.1',
    headers: { 'user-agent': 'Edge', cookie: '[Redacted]' },
  },
  res: { statusCode: 200, headers: { etag: 'x' } },
  responseTime: 12.6,
  userId: 7,
  msg: 'request completed',
};

describe('toLogRow', () => {
  it('turns a request line into columns, without headers or bulk', () => {
    expect(toLogRow(REQUEST_LINE)).toEqual({
      createdAt: new Date(1_792_520_000_000),
      level: 'info',
      category: 'request',
      message: 'request completed',
      requestId: 'req-1',
      userId: 7,
      method: 'GET',
      path: '/api/v1/market-assessments?cityId=9&maxPrice=2500000',
      status: 200,
      durationMs: 13,
      details: { ip: '10.0.0.1', userAgent: 'Edge' },
    });
  });

  it.each([
    ['LLM call', 'ai'],
    ['Recommendation from cache', 'ai'],
    ['Automatic recommendation', 'ai'],
    ['User logged in', 'auth'],
    ['User registered', 'auth'],
    ['Registration code replaced', 'admin'],
    ['User access changed', 'admin'],
    ['Market snapshot loaded into memory', 'system'],
  ])('"%s" is %s', (msg, category) => {
    expect(toLogRow({ level: 30, msg })?.category).toBe(category);
  });

  it('places Hebrew error lines by their endpoint', () => {
    const failedLogin = {
      level: 40,
      msg: 'אימייל או סיסמה שגויים',
      req: { method: 'POST', url: '/api/v1/sessions' },
    };
    expect(toLogRow(failedLogin)?.category).toBe('auth');
    expect(
      toLogRow({ ...failedLogin, req: { method: 'DELETE', url: '/api/v1/registration-code' } })
        ?.category,
    ).toBe('admin');
    expect(
      toLogRow({ ...failedLogin, req: { method: 'GET', url: '/api/v1/cities' } })?.category,
    ).toBe('system');
  });

  it('keeps the event fields as details and maps levels', () => {
    const row = toLogRow({ level: 40, msg: 'LLM call failed', provider: 'gemini', ms: 8000 });
    expect(row).toMatchObject({ level: 'warn', details: { provider: 'gemini', ms: 8000 } });
  });

  it('skips health checks and static files', () => {
    expect(toLogRow({ ...REQUEST_LINE, req: { url: '/api/v1/health' } })).toBeNull();
    expect(toLogRow({ ...REQUEST_LINE, req: { url: '/assets/index-abc.js' } })).toBeNull();
  });
});

function writer() {
  const rows: LogRow[] = [];
  return {
    rows,
    insert: vi.fn((batch: LogRow[]) => {
      rows.push(...batch);
      return Promise.resolve();
    }),
  };
}

describe('LogSink', () => {
  it('keeps lines logged before the database is attached, then writes them', async () => {
    const sink = new LogSink();
    sink.write(JSON.stringify({ level: 30, msg: 'Applying database migrations' }));
    const target = writer();

    sink.attach(target);
    await sink.close();

    expect(target.rows.map((row) => row.message)).toEqual(['Applying database migrations']);
  });

  it('ignores lines that are not JSON', async () => {
    const sink = new LogSink();
    const target = writer();
    sink.attach(target);
    sink.write('not json');
    await sink.close();

    expect(target.insert).not.toHaveBeenCalled();
  });

  it('keeps the lines for the next try when the database write fails', async () => {
    const sink = new LogSink();
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const failing = { insert: vi.fn(() => Promise.reject(new Error('db down'))) };
    sink.attach(failing);
    sink.write(JSON.stringify({ level: 50, msg: 'Unhandled error' }));
    await sink.flush();

    const target = writer();
    sink.attach(target);
    await sink.close();
    stderr.mockRestore();

    expect(target.rows.map((row) => row.message)).toEqual(['Unhandled error']);
  });
});

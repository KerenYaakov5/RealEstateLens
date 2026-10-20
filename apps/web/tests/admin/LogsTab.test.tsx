import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogsTab } from '../../src/features/admin/LogsTab';

const ENTRY = {
  id: 10,
  time: '2026-10-20T10:00:00.000Z',
  level: 'warn',
  category: 'ai',
  message: 'LLM call failed',
  requestId: 'req-1',
  userEmail: 'dana@example.com',
  method: 'POST',
  path: '/api/v1/compromise-recommendations',
  status: 200,
  durationMs: 8012,
  details: { provider: 'gemini', err: 'timeout after 8000ms' },
};

const urls: string[] = [];

beforeEach(() => {
  urls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      const older = url.includes('before=10');
      const body = older
        ? { data: [{ ...ENTRY, id: 9, level: 'info', message: 'LLM call' }], nextBefore: null }
        : { data: [ENTRY], nextBefore: 10 };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LogsTab />
    </QueryClientProvider>,
  );
}

describe('LogsTab', () => {
  it('shows entries in Hebrew with their request, user and details', async () => {
    renderTab();

    const row = await screen.findByRole('button', { name: /קריאה למודל AI נכשלה/ });
    expect(row).toHaveTextContent('אזהרה');
    expect(row).toHaveTextContent('dana@example.com');
    expect(row).toHaveTextContent('8012ms');
    await userEvent.click(row);
    expect(screen.getByText(/timeout after 8000ms/)).toBeInTheDocument();
  });

  it('sends the filters and pages to older entries', async () => {
    renderTab();
    await screen.findByText('קריאה למודל AI נכשלה');

    await userEvent.selectOptions(screen.getByLabelText('רמה'), 'error');
    await userEvent.selectOptions(screen.getByLabelText('סוג'), 'ai');
    await userEvent.type(screen.getByLabelText('חיפוש'), 'gemini');
    await vi.waitFor(() => {
      expect(urls.at(-1)).toContain('level=error');
    });
    expect(urls.at(-1)).toContain('category=ai');
    expect(urls.at(-1)).toContain('q=gemini');

    await userEvent.click(await screen.findByRole('button', { name: 'עוד רשומות ישנות יותר' }));
    const list = screen.getByRole('list', { name: 'רשומות' });
    expect(await within(list).findByText('קריאה למודל AI')).toBeInTheDocument();
    expect(urls.at(-1)).toContain('before=10');
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminPage } from '../../src/features/admin/AdminPage';

const CODE = {
  id: 1,
  label: 'דנה',
  hint: 'HJK9',
  maxUses: 1,
  usedCount: 0,
  expiresAt: null,
  createdAt: '2026-10-20T10:00:00.000Z',
  status: 'active',
};
const USER = {
  id: 5,
  email: 'dana@example.com',
  isActive: true,
  isAdmin: false,
  createdAt: '2026-10-20T10:00:00.000Z',
  lastLoginAt: null,
  invitedWith: 'דנה',
  aiRecommendationsToday: 2,
};

const calls: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, ...(init === undefined ? {} : { init }) });
      const json = (body: unknown, status = 200) => {
        return Promise.resolve(new Response(JSON.stringify(body), { status }));
      };
      if (url.endsWith('/invite-codes') && init?.method === 'POST') {
        return json({ ...CODE, id: 2, label: 'יוסי', code: 'ABCDE-FGHJK' }, 201);
      }
      if (url.endsWith('/invite-codes')) {
        return json({ data: [CODE] });
      }
      if (url.endsWith('/users') && init?.method === undefined) {
        return json({ data: [USER] });
      }
      return json({ ok: true });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AdminPage />
    </QueryClientProvider>,
  );
}

describe('AdminPage', () => {
  it('lists codes and users', async () => {
    renderPage();

    const codes = screen.getByRole('region', { name: 'קודי הזמנה' });
    expect(await within(codes).findByText('HJK9')).toBeInTheDocument();
    expect(within(codes).getByText('פעיל')).toBeInTheDocument();
    const users = screen.getByRole('region', { name: 'משתמשים' });
    expect(await within(users).findByText('dana@example.com')).toBeInTheDocument();
    expect(within(users).getByText(/קוד: דנה/)).toBeInTheDocument();
  });

  it('creates a code and shows it once', async () => {
    renderPage();

    await userEvent.type(screen.getByLabelText('למי הקוד'), 'יוסי');
    await userEvent.click(screen.getByRole('button', { name: 'יצירת קוד' }));

    expect(await screen.findByText('ABCDE-FGHJK')).toBeInTheDocument();
    const post = calls.find((call) => call.init?.method === 'POST');
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      label: 'יוסי',
      maxUses: 1,
      expiresInDays: 30,
    });
  });

  it('blocks a user', async () => {
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'חסימה' }));

    const patch = calls.find((call) => call.init?.method === 'PATCH');
    expect(patch?.url).toBe('/api/v1/users/5');
    expect(JSON.parse(String(patch?.init?.body))).toEqual({ isActive: false });
  });
});

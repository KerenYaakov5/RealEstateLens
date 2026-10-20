import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminPage } from '../../src/features/admin/AdminPage';

const CODE = { code: 'ABCD-EFGH-JKMN', createdAt: '2026-10-20T10:00:00.000Z', usedCount: 3 };
const USER = {
  id: 5,
  email: 'dana@example.com',
  isActive: true,
  isAdmin: false,
  createdAt: '2026-10-20T10:00:00.000Z',
  lastLoginAt: null,
  registeredWithCode: 'JKMN',
  aiRecommendationsToday: 2,
};

const calls: { url: string; method: string; body?: string }[] = [];
let registrationOpen = true;

beforeEach(() => {
  calls.length = 0;
  registrationOpen = true;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, ...(typeof init?.body === 'string' ? { body: init.body } : {}) });
      const json = (body: unknown, status = 200) => {
        return Promise.resolve(new Response(JSON.stringify(body), { status }));
      };
      if (url.endsWith('/registration-code')) {
        if (method === 'POST') {
          registrationOpen = true;
          return json({ ...CODE, code: 'NEWC-ODEN-EWCD', usedCount: 0 }, 201);
        }
        if (method === 'DELETE') {
          registrationOpen = false;
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return registrationOpen ? json(CODE) : Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url.endsWith('/users') && method === 'GET') {
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

async function confirmIn(dialogName: string, action: string) {
  const dialog = screen.getByRole('dialog', { name: dialogName, hidden: true });
  await userEvent.click(within(dialog).getByRole('button', { name: action, hidden: true }));
}

describe('AdminPage', () => {
  it('shows the current code with its use count, and the users', async () => {
    renderPage();

    const section = screen.getByRole('region', { name: 'קוד הרשמה' });
    expect(await within(section).findByText('ABCD-EFGH-JKMN')).toBeInTheDocument();
    expect(section).toHaveTextContent('נרשמו איתו 3');
    const users = screen.getByRole('region', { name: 'משתמשים' });
    expect(await within(users).findByText('dana@example.com')).toBeInTheDocument();
    expect(users).toHaveTextContent('נרשם/ה בקוד שמסתיים ב-JKMN');
  });

  it('replaces the code only after confirmation', async () => {
    renderPage();
    await screen.findByText('ABCD-EFGH-JKMN');

    await userEvent.click(screen.getByRole('button', { name: 'החלפת קוד' }));
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    await confirmIn('להחליף את קוד ההרשמה?', 'החלפה');

    expect(calls.some((call) => call.method === 'POST')).toBe(true);
  });

  it('closes registration and offers to create a new code', async () => {
    renderPage();
    await screen.findByText('ABCD-EFGH-JKMN');

    await userEvent.click(screen.getByRole('button', { name: 'סגירת ההרשמה' }));
    await confirmIn('לסגור את ההרשמה?', 'סגירה');

    expect(await screen.findByText(/ההרשמה סגורה כרגע/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'יצירת קוד' })).toBeInTheDocument();
  });

  it('blocks a user', async () => {
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'חסימה' }));

    const patch = calls.find((call) => call.method === 'PATCH');
    expect(patch?.url).toBe('/api/v1/users/5');
    expect(JSON.parse(patch?.body ?? '{}')).toEqual({ isActive: false });
  });
});

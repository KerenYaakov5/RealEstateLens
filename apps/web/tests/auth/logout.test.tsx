import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';

const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.endsWith('/users/me')) {
    return Promise.resolve(
      new Response(JSON.stringify({ email: 'keren@example.com', aiQuotaLeft: 20 }), {
        status: 200,
      }),
    );
  }
  if (url.endsWith('/sessions/current') && init?.method === 'DELETE') {
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  return Promise.resolve(new Response('{}', { status: 404 }));
});

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  fetchMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

function deleteCalls() {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');
}

describe('logout', () => {
  it('asks for confirmation; cancel keeps the user logged in', async () => {
    renderApp();
    await userEvent.click(
      (await screen.findAllByRole('button', { name: 'יציאה' }))[0] as HTMLElement,
    );

    expect(screen.getByRole('dialog', { name: 'לצאת מהמערכת?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'ביטול' }));

    expect(deleteCalls()).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: 'כניסה' })).toBeNull();
  });

  it('after confirming, ends the session and returns to the login screen', async () => {
    renderApp();
    await userEvent.click(
      (await screen.findAllByRole('button', { name: 'יציאה' }))[0] as HTMLElement,
    );
    const dialog = screen.getByRole('dialog', { name: 'לצאת מהמערכת?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'יציאה' }));

    expect(await screen.findByRole('heading', { name: 'כניסה' })).toBeInTheDocument();
    expect(deleteCalls()).toHaveLength(1);
  });
});

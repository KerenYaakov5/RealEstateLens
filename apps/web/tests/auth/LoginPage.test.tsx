import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../../src/auth/LoginPage';

function renderLogin() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LoginPage />
    </QueryClientProvider>,
  );
  return client;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LoginPage', () => {
  it('keeps the button disabled until both fields are filled', async () => {
    renderLogin();
    const button = screen.getByRole('button', { name: 'כניסה' });

    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText('אימייל'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('סיסמה'), 'secret-123');
    expect(button).toBeEnabled();
  });

  it('shows the Hebrew message the server returns', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'אימייל או סיסמה שגויים' } }),
            { status: 401 },
          ),
        ),
      ),
    );
    renderLogin();

    await userEvent.type(screen.getByLabelText('אימייל'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('סיסמה'), 'wrong-pass');
    await userEvent.click(screen.getByRole('button', { name: 'כניסה' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('אימייל או סיסמה שגויים');
  });

  it('stores the user in the session after a successful login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ user: { email: 'a@b.co' } }), { status: 201 }),
        ),
      ),
    );
    const client = renderLogin();

    await userEvent.type(screen.getByLabelText('אימייל'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('סיסמה'), 'right-pass');
    await userEvent.click(screen.getByRole('button', { name: 'כניסה' }));

    await vi.waitFor(() => {
      expect(client.getQueryData(['session'])).toEqual({ email: 'a@b.co' });
    });
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegisterPage } from '../../src/auth/RegisterPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RegisterPage onLogin={() => undefined} />
    </QueryClientProvider>,
  );
}

async function fill(code: string, email: string, password: string, confirm: string) {
  await userEvent.type(screen.getByLabelText('קוד הרשמה'), code);
  await userEvent.type(screen.getByLabelText('אימייל'), email);
  await userEvent.type(screen.getByLabelText(/^סיסמה/), password);
  await userEvent.type(screen.getByLabelText('אימות סיסמה'), confirm);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RegisterPage', () => {
  it('waits for a long enough, matching password', async () => {
    renderPage();
    const button = screen.getByRole('button', { name: 'הרשמה' });

    await fill('ABCD-EFGH-JKMN', 'a@b.co', 'short', 'short');
    expect(button).toBeDisabled();
    expect(screen.getByText('הסיסמה צריכה לכלול לפחות 10 תווים')).toBeInTheDocument();
  });

  it('sends the code with the credentials and shows the server message', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: { code: 'INVALID_REGISTRATION_CODE', message: 'קוד ההרשמה שגוי' },
          }),
          { status: 400 },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    await fill('ABCD-EFGH-JKMN', 'a@b.co', 'a-good-password', 'a-good-password');
    await userEvent.click(screen.getByRole('button', { name: 'הרשמה' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('קוד ההרשמה שגוי');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/users');
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'a@b.co',
      password: 'a-good-password',
      registrationCode: 'ABCD-EFGH-JKMN',
    });
  });
});

import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { useLogin } from './session';

const FALLBACK_ERROR = 'ההתחברות נכשלה. נסו שוב.';

function messageOf(error: unknown): string | null {
  if (error === null || error === undefined) {
    return null;
  }
  return error instanceof ApiError ? error.message : FALLBACK_ERROR;
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const errorMessage = messageOf(login.error);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold text-brand">RealEstateLens</h1>
          <p className="mt-2 text-ink-soft">כמה באמת שווה התקציב שלך – על סמך עסקאות אמת</p>
        </header>

        <form
          onSubmit={onSubmit}
          className="rounded-(--radius-card) bg-surface p-6 shadow-(--shadow-card)"
          noValidate
        >
          <h2 className="mb-5 text-xl font-bold">כניסה</h2>

          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">אימייל</span>
            <input
              type="email"
              autoComplete="username"
              dir="ltr"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
              className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-start"
            />
          </label>

          <label className="mb-5 block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">סיסמה</span>
            <input
              type="password"
              autoComplete="current-password"
              dir="ltr"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-start"
            />
          </label>

          {errorMessage !== null && (
            <p role="alert" className="mb-4 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={login.isPending || email === '' || password === ''}
            className="w-full rounded-xl bg-brand px-4 py-3 font-bold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {login.isPending ? 'מתחברים…' : 'כניסה'}
          </button>

          <p className="mt-4 text-center text-xs text-muted">
            הגישה למשתמשים מורשים בלבד. אין הרשמה עצמית.
          </p>
        </form>
      </div>
    </main>
  );
}

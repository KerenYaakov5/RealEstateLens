import { useState, type FormEvent } from 'react';
import { AuthLayout, authErrorMessage, INPUT_CLASS } from './AuthLayout';
import { useLogin } from './session';

const FALLBACK_ERROR = 'ההתחברות נכשלה. נסו שוב.';

export function LoginPage({ onRegister }: { onRegister: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const errorMessage = authErrorMessage(login.error, FALLBACK_ERROR);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <AuthLayout>
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
            className={INPUT_CLASS}
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
            className={INPUT_CLASS}
          />
        </label>

        {errorMessage !== null && (
          <p
            role="alert"
            className="mb-4 rounded-xl bg-bad-soft px-3 py-2 text-sm font-medium text-bad-ink"
          >
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

        <p className="mt-4 text-center text-sm text-ink-soft">
          יש לך קוד הזמנה?{' '}
          <button
            type="button"
            onClick={onRegister}
            className="font-bold text-brand underline-offset-2 hover:underline"
          >
            להרשמה
          </button>
        </p>
      </form>
    </AuthLayout>
  );
}

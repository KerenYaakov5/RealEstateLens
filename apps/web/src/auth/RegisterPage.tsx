import { MIN_PASSWORD_LENGTH } from '@rel/shared';
import { useState, type FormEvent } from 'react';
import { AuthLayout, authErrorMessage, INPUT_CLASS } from './AuthLayout';
import { useRegister } from './session';

const FALLBACK_ERROR = 'ההרשמה נכשלה. נסו שוב.';

/** Registration with the code the administrator shares. */
export function RegisterPage({ onLogin }: { onLogin: () => void }) {
  const [registrationCode, setRegistrationCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const register = useRegister();

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const hint = tooShort
    ? `הסיסמה צריכה לכלול לפחות ${MIN_PASSWORD_LENGTH} תווים`
    : mismatch
      ? 'הסיסמאות לא זהות'
      : null;
  const errorMessage = authErrorMessage(register.error, FALLBACK_ERROR);
  const ready =
    registrationCode.trim() !== '' &&
    email.trim() !== '' &&
    password.length >= MIN_PASSWORD_LENGTH &&
    confirm === password;

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (ready) {
      register.mutate({ email, password, registrationCode });
    }
  };

  return (
    <AuthLayout>
      <form
        onSubmit={onSubmit}
        className="rounded-(--radius-card) bg-surface p-6 shadow-(--shadow-card)"
        noValidate
      >
        <h2 className="mb-1 text-xl font-bold">הרשמה</h2>
        <p className="mb-5 text-sm text-ink-soft">ההרשמה עם קוד ההרשמה שקיבלת ממנהל המערכת.</p>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-ink-soft">קוד הרשמה</span>
          <input
            autoComplete="off"
            dir="ltr"
            required
            placeholder="XXXX-XXXX-XXXX"
            value={registrationCode}
            onChange={(event) => {
              setRegistrationCode(event.target.value);
            }}
            className={`${INPUT_CLASS} font-mono tracking-wider uppercase`}
          />
        </label>

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

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-ink-soft">
            סיסמה (לפחות {MIN_PASSWORD_LENGTH} תווים)
          </span>
          <input
            type="password"
            autoComplete="new-password"
            dir="ltr"
            required
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
            className={INPUT_CLASS}
          />
        </label>

        <label className="mb-2 block">
          <span className="mb-1 block text-sm font-medium text-ink-soft">אימות סיסמה</span>
          <input
            type="password"
            autoComplete="new-password"
            dir="ltr"
            required
            value={confirm}
            onChange={(event) => {
              setConfirm(event.target.value);
            }}
            className={INPUT_CLASS}
          />
        </label>
        <p className="mb-4 min-h-5 text-xs text-warn-ink" aria-live="polite">
          {hint}
        </p>

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
          disabled={register.isPending || !ready}
          className="w-full rounded-xl bg-brand px-4 py-3 font-bold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {register.isPending ? 'נרשמים…' : 'הרשמה'}
        </button>

        <p className="mt-4 text-center text-sm text-ink-soft">
          כבר רשומים?{' '}
          <button
            type="button"
            onClick={onLogin}
            className="font-bold text-brand underline-offset-2 hover:underline"
          >
            לכניסה
          </button>
        </p>
      </form>
    </AuthLayout>
  );
}

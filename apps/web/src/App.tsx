import { useRef, useState } from 'react';
import { LoginPage } from './auth/LoginPage';
import { RegisterPage } from './auth/RegisterPage';
import { useLogout, useSession, type SessionUser } from './auth/session';
import { AdminPage } from './features/admin/AdminPage';
import { MainScreen } from './features/MainScreen';
import { useHash } from './lib/useHash';

const ADMIN_HASH = '#/admin';

function AppHeader({ user, onAdmin }: { user: SessionUser; onAdmin: boolean }) {
  const logout = useLogout();
  const confirmDialog = useRef<HTMLDialogElement>(null);
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <span className="text-xl font-extrabold text-brand">RealEstateLens</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-muted sm:inline" dir="ltr">
            {user.email}
          </span>
          {user.isAdmin === true && (
            <a
              href={onAdmin ? '#' : ADMIN_HASH}
              className="rounded-lg px-3 py-1.5 font-medium text-brand hover:bg-brand-soft"
            >
              {onAdmin ? 'חזרה לחיפוש' : 'ניהול'}
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              confirmDialog.current?.showModal();
            }}
            className="rounded-lg px-3 py-1.5 font-medium text-ink-soft hover:bg-sand"
          >
            יציאה
          </button>
        </div>
      </div>

      <dialog
        ref={confirmDialog}
        aria-labelledby="logout-title"
        className="m-auto max-w-xs rounded-(--radius-card) p-5 shadow-(--shadow-card) backdrop:bg-ink/40"
      >
        <h3 id="logout-title" className="font-bold">
          לצאת מהמערכת?
        </h3>
        <p className="mt-1 text-sm text-ink-soft">
          הבחירות נשמרות בדפדפן הזה, כך שבכניסה הבאה אפשר להמשיך מאותה נקודה.
        </p>
        <form method="dialog" className="mt-4 flex justify-end gap-2">
          <button type="submit" className="rounded-lg px-3 py-1.5 text-sm hover:bg-sand">
            ביטול
          </button>
          <button
            type="submit"
            onClick={() => {
              logout.mutate();
            }}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white"
          >
            יציאה
          </button>
        </form>
      </dialog>
    </header>
  );
}

export function App() {
  const session = useSession();
  const hash = useHash();
  const [registering, setRegistering] = useState(false);

  if (session.isPending) {
    return (
      <p className="py-24 text-center text-muted" aria-live="polite">
        טוען…
      </p>
    );
  }
  if (session.isError) {
    return (
      <p role="alert" className="py-24 text-center font-medium text-bad-ink">
        {session.error.message}
      </p>
    );
  }
  if (session.data === null) {
    return registering ? (
      <RegisterPage
        onLogin={() => {
          setRegistering(false);
        }}
      />
    ) : (
      <LoginPage
        onRegister={() => {
          setRegistering(true);
        }}
      />
    );
  }
  const onAdmin = hash === ADMIN_HASH && session.data.isAdmin === true;
  return (
    <>
      <AppHeader user={session.data} onAdmin={onAdmin} />
      {onAdmin ? <AdminPage /> : <MainScreen />}
    </>
  );
}

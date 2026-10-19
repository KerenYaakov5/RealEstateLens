import { LoginPage } from './auth/LoginPage';
import { useLogout, useSession } from './auth/session';

function AppHeader({ email }: { email: string }) {
  const logout = useLogout();
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <span className="text-xl font-extrabold text-brand">RealEstateLens</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-muted sm:inline" dir="ltr">
            {email}
          </span>
          <button
            type="button"
            onClick={() => {
              logout.mutate();
            }}
            className="rounded-lg px-3 py-1.5 font-medium text-ink-soft hover:bg-sand"
          >
            יציאה
          </button>
        </div>
      </div>
    </header>
  );
}

export function App() {
  const session = useSession();

  if (session.isPending) {
    return (
      <p className="py-24 text-center text-muted" aria-live="polite">
        טוען…
      </p>
    );
  }
  if (session.isError) {
    return (
      <p role="alert" className="py-24 text-center text-bad">
        {session.error.message}
      </p>
    );
  }
  if (session.data === null) {
    return <LoginPage />;
  }
  return (
    <>
      <AppHeader email={session.data.email} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-ink-soft">כאן יופיע המסך הראשי.</p>
      </main>
    </>
  );
}

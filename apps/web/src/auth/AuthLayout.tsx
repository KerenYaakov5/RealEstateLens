import type { ReactNode } from 'react';
import { ApiError } from '../api/client';

/** The frame shared by the login and registration screens. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold text-brand">RealEstateLens</h1>
          <p className="mt-2 text-ink-soft">כמה באמת שווה התקציב שלך – על סמך עסקאות אמת</p>
        </header>
        {children}
      </div>
    </main>
  );
}

/** The server's Hebrew message, or a fallback for anything unexpected. */
export function authErrorMessage(error: unknown, fallback: string): string | null {
  if (error === null || error === undefined) {
    return null;
  }
  return error instanceof ApiError ? error.message : fallback;
}

export const INPUT_CLASS = 'w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-start';

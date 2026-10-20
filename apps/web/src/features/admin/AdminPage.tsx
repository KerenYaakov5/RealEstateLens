import type { AdminUserDto, RegistrationCodeDto } from '@rel/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { deleteResource, getJson, patchJson, postJson } from '../../api/client';

const CODE_KEY = ['admin', 'registrationCode'] as const;
const USERS_KEY = ['admin', 'users'] as const;

/** A timestamp's date in Israel: "20.10.2026". */
function day(iso: string | null): string {
  return iso === null
    ? '—'
    : new Date(iso).toLocaleDateString('he-IL', {
        timeZone: 'Asia/Jerusalem',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
}

interface ConfirmProps {
  title: string;
  text: string;
  action: string;
  onConfirm: () => void;
}

/** A button that asks first – for actions that lock people out. */
function ConfirmButton({
  label,
  tone,
  confirm,
}: {
  label: string;
  tone: string;
  confirm: ConfirmProps;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          dialog.current?.showModal();
        }}
        className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${tone}`}
      >
        {label}
      </button>
      <dialog
        ref={dialog}
        aria-label={confirm.title}
        className="m-auto max-w-xs rounded-(--radius-card) p-5 shadow-(--shadow-card) backdrop:bg-ink/40"
      >
        <h3 className="font-bold">{confirm.title}</h3>
        <p className="mt-1 text-sm text-ink-soft">{confirm.text}</p>
        <form method="dialog" className="mt-4 flex justify-end gap-2">
          <button type="submit" className="rounded-lg px-3 py-1.5 text-sm hover:bg-sand">
            ביטול
          </button>
          <button
            type="submit"
            onClick={confirm.onConfirm}
            className="rounded-lg bg-bad px-3 py-1.5 text-sm font-bold text-white"
          >
            {confirm.action}
          </button>
        </form>
      </dialog>
    </>
  );
}

/** The one code people register with: always visible here, replaced when it leaks. */
function RegistrationCode() {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const code = useQuery({
    queryKey: CODE_KEY,
    queryFn: ({ signal }) => {
      // null = registration closed (204)
      return getJson<RegistrationCodeDto>('/registration-code', signal);
    },
  });
  const refresh = (): void => {
    setCopied(false);
    void queryClient.invalidateQueries({ queryKey: CODE_KEY });
  };
  const replace = useMutation({
    mutationFn: () => {
      return postJson<RegistrationCodeDto>('/registration-code', {});
    },
    onSuccess: refresh,
  });
  const close = useMutation({
    mutationFn: () => {
      return deleteResource('/registration-code');
    },
    onSuccess: refresh,
  });
  const error = replace.error ?? close.error;
  const current = code.data;

  return (
    <section
      aria-label="קוד הרשמה"
      className="space-y-4 rounded-(--radius-card) bg-surface p-5 shadow-(--shadow-card)"
    >
      <div>
        <h2 className="text-lg font-bold">קוד הרשמה</h2>
        <p className="text-sm text-ink-soft">
          קוד אחד קבוע לכל מי שתרצו להזמין. אם הוא דלף – החליפו אותו, והקוד הקודם יפסיק לעבוד מיד.
          מי שכבר נרשם לא מושפע.
        </p>
      </div>

      {current === undefined ? null : current === null ? (
        <p
          role="status"
          className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm font-medium text-warn-ink"
        >
          ההרשמה סגורה כרגע – אין קוד פעיל. צרו קוד כדי לאפשר הרשמה.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-brand-soft/50 px-4 py-3">
          <code
            dir="ltr"
            className="rounded-lg bg-surface px-3 py-1.5 font-mono text-lg font-bold tracking-wider"
          >
            {current.code}
          </code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(current.code).then(() => {
                setCopied(true);
              });
            }}
            className="rounded-lg bg-surface px-3 py-1.5 text-sm font-medium hover:bg-sand"
          >
            {copied ? 'הועתק ✓' : 'העתקה'}
          </button>
          <span className="text-xs text-muted">
            נוצר {day(current.createdAt)} · נרשמו איתו{' '}
            <span className="num">{current.usedCount}</span>
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {current === null ? (
          <button
            type="button"
            disabled={replace.isPending}
            onClick={() => {
              replace.mutate();
            }}
            className="rounded-xl bg-brand px-4 py-2 font-bold text-white transition hover:bg-brand-strong disabled:opacity-50"
          >
            יצירת קוד
          </button>
        ) : (
          <>
            <ConfirmButton
              label="החלפת קוד"
              tone="border border-line hover:bg-sand"
              confirm={{
                title: 'להחליף את קוד ההרשמה?',
                text: 'הקוד הנוכחי יפסיק לעבוד מיד. תצטרכו לשלוח את הקוד החדש למי שעוד לא נרשם.',
                action: 'החלפה',
                onConfirm: () => {
                  replace.mutate();
                },
              }}
            />
            <ConfirmButton
              label="סגירת ההרשמה"
              tone="border border-bad/40 bg-bad-soft/60 text-bad-ink hover:bg-bad-soft"
              confirm={{
                title: 'לסגור את ההרשמה?',
                text: 'אף אחד לא יוכל להירשם עד שתיצרו קוד חדש. מי שכבר רשום ממשיך כרגיל.',
                action: 'סגירה',
                onConfirm: () => {
                  close.mutate();
                },
              }}
            />
          </>
        )}
      </div>

      {error !== null && (
        <p
          role="alert"
          className="rounded-xl bg-bad-soft px-3 py-2 text-sm font-medium text-bad-ink"
        >
          {error.message}
        </p>
      )}
    </section>
  );
}

function Users() {
  const queryClient = useQueryClient();
  const users = useQuery({
    queryKey: USERS_KEY,
    queryFn: async ({ signal }) => {
      return (await getJson<{ data: AdminUserDto[] }>('/users', signal))?.data ?? [];
    },
  });
  const setActive = useMutation({
    mutationFn: (user: AdminUserDto) => {
      return patchJson(`/users/${user.id}`, { isActive: !user.isActive });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_KEY });
    },
  });

  return (
    <section
      aria-label="משתמשים"
      className="space-y-3 rounded-(--radius-card) bg-surface p-5 shadow-(--shadow-card)"
    >
      <h2 className="text-lg font-bold">
        משתמשים{' '}
        {users.data !== undefined && (
          <span className="num text-base font-normal text-muted">({users.data.length})</span>
        )}
      </h2>
      {setActive.error !== null && (
        <p
          role="alert"
          className="rounded-xl bg-bad-soft px-3 py-2 text-sm font-medium text-bad-ink"
        >
          {setActive.error.message}
        </p>
      )}
      <ul className="divide-y divide-line">
        {(users.data ?? []).map((user) => (
          <li key={user.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <p dir="ltr" className="text-end font-medium">
                {user.email}
              </p>
              <p className="text-xs text-muted">
                {user.isAdmin ? 'מנהל/ת · ' : ''}
                {user.registeredWithCode === null
                  ? 'נוסף/ה ידנית'
                  : `נרשם/ה בקוד שמסתיים ב-${user.registeredWithCode}`}{' '}
                · נרשם/ה {day(user.createdAt)} · כניסה אחרונה {day(user.lastLoginAt)} · המלצות AI
                היום: <span className="num">{user.aiRecommendationsToday}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  user.isActive ? 'bg-good-soft text-good-ink' : 'bg-bad-soft text-bad-ink'
                }`}
              >
                {user.isActive ? 'פעיל' : 'חסום'}
              </span>
              {!user.isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setActive.mutate(user);
                  }}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                    user.isActive ? 'text-bad-ink hover:bg-bad-soft' : 'text-ink-soft hover:bg-sand'
                  }`}
                >
                  {user.isActive ? 'חסימה' : 'ביטול חסימה'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** For administrators: the registration code and who can use the system. */
export function AdminPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-extrabold">ניהול</h1>
      <RegistrationCode />
      <Users />
    </main>
  );
}

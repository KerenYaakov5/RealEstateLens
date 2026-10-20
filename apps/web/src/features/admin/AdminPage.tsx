import type {
  AdminUserDto,
  CreatedInviteCodeDto,
  CreateInviteCodeRequest,
  InviteCodeDto,
  InviteCodeStatus,
} from '@rel/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { getJson, patchJson, postJson } from '../../api/client';
import { formatDate } from '../../lib/format';

const CODES_KEY = ['admin', 'inviteCodes'] as const;
const USERS_KEY = ['admin', 'users'] as const;

const STATUS: Readonly<Record<InviteCodeStatus, { text: string; tone: string }>> = {
  active: { text: 'פעיל', tone: 'bg-good-soft text-good-ink' },
  'used-up': { text: 'נוצל', tone: 'bg-sand text-ink-soft' },
  expired: { text: 'פג תוקף', tone: 'bg-warn-soft text-warn-ink' },
  disabled: { text: 'מושבת', tone: 'bg-bad-soft text-bad-ink' },
};

const EXPIRY_CHOICES = [
  { days: undefined, label: 'ללא תפוגה' },
  { days: 7, label: 'שבוע' },
  { days: 30, label: 'חודש' },
  { days: 90, label: '3 חודשים' },
] as const;

function day(iso: string | null): string {
  return iso === null ? '—' : formatDate(iso.slice(0, 10));
}

function NewCodeForm() {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [maxUses, setMaxUses] = useState(1);
  const [expiry, setExpiry] = useState<number | undefined>(30);
  const [created, setCreated] = useState<CreatedInviteCodeDto | null>(null);
  const [copied, setCopied] = useState(false);
  const create = useMutation({
    mutationFn: (body: CreateInviteCodeRequest) => {
      return postJson<CreatedInviteCodeDto>('/invite-codes', body);
    },
    onSuccess: (code) => {
      setCreated(code);
      setCopied(false);
      setLabel('');
      void queryClient.invalidateQueries({ queryKey: CODES_KEY });
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    create.mutate({
      label: label.trim(),
      maxUses,
      ...(expiry === undefined ? {} : { expiresInDays: expiry }),
    });
  };

  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1">
          <span className="mb-1 block text-sm font-medium text-ink-soft">למי הקוד</span>
          <input
            value={label}
            maxLength={80}
            placeholder="למשל: דנה – משפחה"
            onChange={(event) => {
              setLabel(event.target.value);
            }}
            className="w-full rounded-xl border border-line bg-canvas px-3 py-2"
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-ink-soft">מספר שימושים</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={maxUses}
            onChange={(event) => {
              const value = event.target.valueAsNumber;
              setMaxUses(Number.isFinite(value) ? Math.min(1000, Math.max(1, value)) : 1);
            }}
            className="num w-24 rounded-xl border border-line bg-canvas px-3 py-2"
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-ink-soft">תוקף</span>
          <select
            value={expiry ?? ''}
            onChange={(event) => {
              setExpiry(event.target.value === '' ? undefined : Number(event.target.value));
            }}
            className="rounded-xl border border-line bg-canvas px-3 py-2"
          >
            {EXPIRY_CHOICES.map((choice) => (
              <option key={choice.label} value={choice.days ?? ''}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={create.isPending || label.trim() === ''}
          className="rounded-xl bg-brand px-4 py-2 font-bold text-white transition hover:bg-brand-strong disabled:opacity-50"
        >
          יצירת קוד
        </button>
      </form>

      {create.error !== null && (
        <p
          role="alert"
          className="rounded-xl bg-bad-soft px-3 py-2 text-sm font-medium text-bad-ink"
        >
          {create.error.message}
        </p>
      )}

      {created !== null && (
        <div role="status" className="rounded-xl border border-good/30 bg-good-soft px-4 py-3">
          <p className="text-sm font-medium text-good-ink">
            הקוד של "{created.label}" נוצר. העתיקו אותו עכשיו – הוא לא יוצג שוב.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <code
              dir="ltr"
              className="rounded-lg bg-surface px-3 py-1.5 font-mono text-lg font-bold tracking-wider"
            >
              {created.code}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(created.code).then(() => {
                  setCopied(true);
                });
              }}
              className="rounded-lg bg-surface px-3 py-1.5 text-sm font-medium hover:bg-sand"
            >
              {copied ? 'הועתק ✓' : 'העתקה'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InviteCodes() {
  const queryClient = useQueryClient();
  const codes = useQuery({
    queryKey: CODES_KEY,
    queryFn: async ({ signal }) => {
      return (await getJson<{ data: InviteCodeDto[] }>('/invite-codes', signal))?.data ?? [];
    },
  });
  const toggle = useMutation({
    mutationFn: (code: InviteCodeDto) => {
      return patchJson<InviteCodeDto>(`/invite-codes/${code.id}`, {
        disabled: code.status !== 'disabled',
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CODES_KEY });
    },
  });

  return (
    <section
      aria-label="קודי הזמנה"
      className="space-y-4 rounded-(--radius-card) bg-surface p-5 shadow-(--shadow-card)"
    >
      <h2 className="text-lg font-bold">קודי הזמנה</h2>
      <NewCodeForm />
      {codes.data !== undefined && codes.data.length === 0 && (
        <p className="text-sm text-muted">עוד לא נוצרו קודים.</p>
      )}
      <ul className="divide-y divide-line">
        {(codes.data ?? []).map((code) => (
          <li key={code.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <p className="font-medium">
                {code.label}{' '}
                <span className="text-xs text-muted">
                  (מסתיים ב-
                  <span dir="ltr" className="font-mono">
                    {code.hint}
                  </span>
                  )
                </span>
              </p>
              <p className="text-xs text-muted">
                נוצל <span className="num">{code.usedCount}</span> מתוך{' '}
                <span className="num">{code.maxUses}</span> · נוצר {day(code.createdAt)}
                {code.expiresAt !== null && <> · בתוקף עד {day(code.expiresAt)}</>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS[code.status].tone}`}
              >
                {STATUS[code.status].text}
              </span>
              {(code.status === 'active' || code.status === 'disabled') && (
                <button
                  type="button"
                  onClick={() => {
                    toggle.mutate(code);
                  }}
                  className="rounded-lg px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-sand"
                >
                  {code.status === 'disabled' ? 'הפעלה מחדש' : 'השבתה'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
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
                {user.invitedWith === null ? 'נוסף/ה ידנית' : `קוד: ${user.invitedWith}`} · נרשם/ה{' '}
                {day(user.createdAt)} · כניסה אחרונה {day(user.lastLoginAt)} · המלצות AI היום:{' '}
                <span className="num">{user.aiRecommendationsToday}</span>
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

/** For administrators: invite codes and who can use the system. */
export function AdminPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-extrabold">ניהול</h1>
      <InviteCodes />
      <Users />
    </main>
  );
}

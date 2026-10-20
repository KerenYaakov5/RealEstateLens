import type { LogCategory, LogEntryDto, LogPageDto } from '@rel/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getJson } from '../../api/client';
import { useDebouncedValue } from '../../lib/useDebouncedValue';

const CATEGORY_LABELS: Readonly<Record<LogCategory, string>> = {
  request: 'בקשה',
  ai: 'AI',
  auth: 'כניסה והרשמה',
  admin: 'ניהול',
  system: 'מערכת',
};

const LEVEL_STYLE: Readonly<Record<string, { text: string; tone: string }>> = {
  debug: { text: 'debug', tone: 'bg-sand text-muted' },
  info: { text: 'מידע', tone: 'bg-sand text-ink-soft' },
  warn: { text: 'אזהרה', tone: 'bg-warn-soft text-warn-ink' },
  error: { text: 'שגיאה', tone: 'bg-bad-soft text-bad-ink' },
  fatal: { text: 'קריטי', tone: 'bg-bad text-white' },
};

/** Hebrew names for the server's log messages; anything else is shown as written. */
const MESSAGE_LABELS: Readonly<Record<string, string>> = {
  'request completed': 'בקשה הושלמה',
  'request errored': 'בקשה נכשלה',
  'LLM call': 'קריאה למודל AI',
  'LLM call failed': 'קריאה למודל AI נכשלה',
  'LLM answer rejected by validator': 'תשובת ה-AI נפסלה בבדיקה',
  'LLM provider skipped (circuit open)': 'ספק AI דולג (תקלות חוזרות)',
  'No LLM provider available – automatic recommendation': 'אין ספק AI זמין – המלצה אוטומטית',
  'Daily LLM call limit reached – automatic recommendation': 'הגעה לתקרת ה-AI היומית',
  'Recommendation from cache': 'המלצה מה-cache',
  'Recommendation from model': 'המלצה מהמודל',
  'Automatic recommendation': 'המלצה אוטומטית',
  'User logged in': 'כניסה',
  'User logged out': 'יציאה',
  'User registered': 'הרשמה',
  'User access changed': 'שינוי הרשאת משתמש',
  'Registration code replaced': 'קוד ההרשמה הוחלף',
  'Registration closed': 'ההרשמה נסגרה',
  'Validation failed': 'נתונים לא תקינים',
  'Unhandled error': 'שגיאה לא צפויה',
  'Application error': 'שגיאת שרת',
  'Client error': 'בקשה לא תקינה',
  'Personal recommendations': 'הגדרת ההמלצות האישיות (בעליית השרת)',
  'RealEstateLens server listening': 'השרת עלה',
  'Shutting down': 'השרת נכבה',
  'Applying database migrations': 'עדכון מבנה מסד הנתונים',
  'Market snapshot loaded into memory': 'נתוני השוק נטענו לזיכרון',
  'Market reload failed – serving the previous snapshot':
    'טעינת נתוני השוק נכשלה – ממשיכים עם הקודמים',
  'Price index fetched from CBS': 'מדד הלמ"ס עודכן',
  'Price index up to date': 'מדד הלמ"ס עדכני',
  'Localities stored': 'קובץ היישובים נטען',
  'Localities file unchanged': 'קובץ היישובים לא השתנה',
  'Deals table already populated – skipping seed': 'העסקאות כבר טעונות',
  'Deals table is empty – running seed': 'טעינת עסקאות ראשונית',
  'Seed finished': 'טעינת העסקאות הסתיימה',
  'Seed failed': 'טעינת העסקאות נכשלה',
  'Old log entries removed': 'רשומות לוג ישנות נמחקו',
  'Log retention cleanup failed': 'מחיקת לוגים ישנים נכשלה',
};

const TIME_RANGES = [
  { hours: 1, label: 'שעה אחרונה' },
  { hours: 24, label: '24 שעות' },
  { hours: 24 * 7, label: '7 ימים' },
  { hours: 24 * 30, label: '30 ימים' },
] as const;

interface Filters {
  level: 'all' | 'warn' | 'error';
  category: LogCategory | '';
  hours: number;
  text: string;
}

function queryString(filters: Filters, before: number | null): string {
  const params = new URLSearchParams({ level: filters.level, hours: String(filters.hours) });
  if (filters.category !== '') {
    params.set('category', filters.category);
  }
  if (filters.text.trim() !== '') {
    params.set('q', filters.text.trim());
  }
  if (before !== null) {
    params.set('before', String(before));
  }
  return params.toString();
}

function time(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function LogRow({ entry }: { entry: LogEntryDto }) {
  const [open, setOpen] = useState(false);
  const level = LEVEL_STYLE[entry.level] ?? { text: entry.level, tone: 'bg-sand text-ink-soft' };
  const label = MESSAGE_LABELS[entry.message];
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
        className="grid w-full grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 px-2 py-2.5 text-start text-sm hover:bg-canvas md:grid-cols-[7.5rem_4.5rem_6.5rem_1fr_12rem]"
      >
        <span className="num text-xs text-muted">{time(entry.time)}</span>
        <span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${level.tone}`}>
            {level.text}
          </span>
        </span>
        <span className="text-xs text-ink-soft">{CATEGORY_LABELS[entry.category]}</span>
        <span className="min-w-0">
          <span className="font-medium">{label ?? entry.message}</span>
          {entry.path !== null && (
            <span dir="ltr" className="block truncate text-xs text-muted">
              {entry.method} {entry.path}
              {entry.status !== null && ` → ${entry.status}`}
              {entry.durationMs !== null && ` · ${entry.durationMs}ms`}
            </span>
          )}
        </span>
        <span dir="ltr" className="truncate text-xs text-ink-soft md:text-end">
          {entry.userEmail ?? ''}
        </span>
      </button>
      {open && (
        <div className="space-y-1 bg-canvas px-3 py-2 text-xs">
          {label !== undefined && <p className="text-muted">{entry.message}</p>}
          {entry.requestId !== null && (
            <p className="text-muted">
              מזהה בקשה: <span dir="ltr">{entry.requestId}</span>
            </p>
          )}
          <pre dir="ltr" className="overflow-x-auto whitespace-pre-wrap break-all text-ink-soft">
            {JSON.stringify(entry.details ?? {}, null, 2)}
          </pre>
        </div>
      )}
    </li>
  );
}

/** Everything the server logged: requests, AI calls, cache hits, logins, admin actions, errors. */
export function LogsTab() {
  const [filters, setFilters] = useState<Filters>({
    level: 'all',
    category: '',
    hours: 24,
    text: '',
  });
  const debounced = useDebouncedValue(filters, 300);
  const logs = useInfiniteQuery({
    queryKey: ['admin', 'logs', debounced],
    queryFn: async ({ pageParam, signal }) => {
      return (
        (await getJson<LogPageDto>(`/logs?${queryString(debounced, pageParam)}`, signal)) ?? {
          data: [],
          nextBefore: null,
        }
      );
    },
    initialPageParam: null as number | null,
    getNextPageParam: (last) => {
      return last.nextBefore;
    },
  });
  const entries = logs.data?.pages.flatMap((page) => page.data) ?? [];
  const set = <K extends keyof Filters>(key: K, value: Filters[K]): void => {
    setFilters((current) => {
      return { ...current, [key]: value };
    });
  };
  const selectClass = 'rounded-xl border border-line bg-canvas px-3 py-2 text-sm';

  return (
    <section
      aria-label="לוגים"
      className="space-y-4 rounded-(--radius-card) bg-surface p-5 shadow-(--shadow-card)"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label>
          <span className="mb-1 block text-sm font-medium text-ink-soft">רמה</span>
          <select
            value={filters.level}
            onChange={(event) => {
              set('level', event.target.value as Filters['level']);
            }}
            className={selectClass}
          >
            <option value="all">הכל</option>
            <option value="warn">אזהרות ושגיאות</option>
            <option value="error">שגיאות בלבד</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-ink-soft">סוג</span>
          <select
            value={filters.category}
            onChange={(event) => {
              set('category', event.target.value as Filters['category']);
            }}
            className={selectClass}
          >
            <option value="">הכל</option>
            {(Object.keys(CATEGORY_LABELS) as LogCategory[]).map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-ink-soft">טווח זמן</span>
          <select
            value={filters.hours}
            onChange={(event) => {
              set('hours', Number(event.target.value));
            }}
            className={selectClass}
          >
            {TIME_RANGES.map((range) => (
              <option key={range.hours} value={range.hours}>
                {range.label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-48 flex-1">
          <span className="mb-1 block text-sm font-medium text-ink-soft">חיפוש</span>
          <input
            type="search"
            value={filters.text}
            placeholder="אימייל, נתיב, ספק AI, מזהה בקשה…"
            onChange={(event) => {
              set('text', event.target.value);
            }}
            className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm"
          />
        </label>
      </div>

      {logs.isError && (
        <p
          role="alert"
          className="rounded-xl bg-bad-soft px-3 py-2 text-sm font-medium text-bad-ink"
        >
          {logs.error.message}
        </p>
      )}
      {logs.isSuccess && entries.length === 0 && (
        <p className="text-sm text-muted">אין רשומות שמתאימות לסינון.</p>
      )}
      <ul aria-label="רשומות" className="divide-line">
        {entries.map((entry) => (
          <LogRow key={entry.id} entry={entry} />
        ))}
      </ul>
      {logs.hasNextPage && (
        <button
          type="button"
          disabled={logs.isFetchingNextPage}
          onClick={() => {
            void logs.fetchNextPage();
          }}
          className="rounded-xl border border-line px-4 py-2 text-sm font-medium hover:bg-sand disabled:opacity-50"
        >
          {logs.isFetchingNextPage ? 'טוען…' : 'עוד רשומות ישנות יותר'}
        </button>
      )}
    </section>
  );
}

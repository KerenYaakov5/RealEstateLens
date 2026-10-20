import {
  MAX_PRIORITY,
  MIN_PRIORITY,
  PRIORITY_LABELS,
  priorityKeyOf,
  type CompromiseDto,
  type Priorities,
  type PriorityKey,
} from '@rel/shared';
import { useId, useState } from 'react';

const DEFAULT_RATING = 3;
const RATINGS = Array.from({ length: MAX_PRIORITY - MIN_PRIORITY + 1 }, (_, index) => {
  return MIN_PRIORITY + index;
});

/** "החניה" → "חניה": labels carry the article for sentences, not for a list. */
function rowLabel(key: PriorityKey): string {
  const label = PRIORITY_LABELS[key];
  return label.startsWith('ה') ? label.slice(1) : label;
}

interface PersonalizePanelProps {
  compromises: CompromiseDto[];
  priorities: Priorities;
  onChange: (priorities: Priorities) => void;
  onAsk: (priorities: Priorities) => void;
  isAsking: boolean;
  error: string | null;
  quotaLeft: number | undefined;
}

/**
 * "התאם לי אישית": the user rates how important each requirement that a compromise would give
 * up is, then asks for a personal recommendation. Only those requirements are listed – rating
 * anything else could not change the answer.
 */
export function PersonalizePanel({
  compromises,
  priorities,
  onChange,
  onAsk,
  isAsking,
  error,
  quotaLeft,
}: PersonalizePanelProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const keys = [...new Set(compromises.map(priorityKeyOf))];
  if (keys.length < 2) {
    return null;
  }
  const ratingOf = (key: PriorityKey): number => {
    return priorities[key] ?? DEFAULT_RATING;
  };

  return (
    <div className="rounded-(--radius-card) border border-brand/20 bg-brand-soft/60 p-4 shadow-(--shadow-card)">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen(!open);
        }}
        className="flex w-full items-center justify-between gap-2 text-start font-bold text-brand"
      >
        <span>
          <span className="block">✨ התאם לי אישית</span>
          <span className="block text-sm font-normal text-ink-soft">
            דרגו מה חשוב לכם, ונבחר את הפשרות שמתאימות לכם
          </span>
        </span>
        <span aria-hidden="true" className={`transition ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {open && (
        <div id={panelId} className="mt-3 space-y-3">
          <p className="text-sm text-ink-soft">
            כמה חשוב לך כל אחד מאלה? (1 = פחות חשוב, 5 = חשוב מאוד). נבחר את הפשרות שמתאימות לך, רק
            על סמך העסקאות שלנו.
          </p>
          <ul className="space-y-2">
            {keys.map((key) => (
              <li key={key} className="flex flex-wrap items-center justify-between gap-2">
                <span id={`${panelId}-${key}`} className="text-sm font-medium">
                  {rowLabel(key)}
                </span>
                <span
                  role="radiogroup"
                  aria-labelledby={`${panelId}-${key}`}
                  className="inline-flex gap-1"
                >
                  {RATINGS.map((rating) => {
                    const selected = ratingOf(key) === rating;
                    return (
                      <button
                        key={rating}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={`${rating} מתוך ${MAX_PRIORITY}`}
                        onClick={() => {
                          onChange({ ...priorities, [key]: rating });
                        }}
                        className={`num h-8 w-8 rounded-lg text-sm font-bold transition ${
                          selected ? 'bg-brand text-white' : 'bg-sand text-ink-soft hover:bg-line'
                        }`}
                      >
                        {rating}
                      </button>
                    );
                  })}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={isAsking}
              onClick={() => {
                // Send every listed requirement, including untouched defaults.
                const full: Priorities = {};
                for (const key of keys) {
                  full[key] = ratingOf(key);
                }
                onAsk(full);
              }}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-strong disabled:opacity-60"
            >
              {isAsking ? 'בוחר…' : 'בחרו לי פשרות'}
            </button>
            {quotaLeft !== undefined && (
              <span className="text-xs text-muted">
                נותרו היום <span className="num">{quotaLeft}</span> המלצות אישיות
              </span>
            )}
          </div>
          {error !== null && (
            <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-ink">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

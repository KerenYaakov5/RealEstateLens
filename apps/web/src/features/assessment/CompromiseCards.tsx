import type { CompromiseDto } from '@rel/shared';
import { formatPercent, formatPoints } from '../../lib/format';
import { compromiseTitle } from './labels';

/** How many compromises are shown at once – the API returns all of them, best first. */
const SHOWN = 4;

interface CompromiseCardsProps {
  compromises: CompromiseDto[];
  onApply: (compromise: CompromiseDto) => void;
}

export function CompromiseCards({ compromises, onApply }: CompromiseCardsProps) {
  if (compromises.length === 0) {
    return null;
  }
  return (
    <section aria-label="על מה אפשר להתפשר">
      <h2 className="mb-3 text-lg font-bold">על מה אפשר להתפשר?</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {compromises.slice(0, SHOWN).map((compromise) => (
          <li key={compromise.id}>
            <button
              type="button"
              onClick={() => {
                onApply(compromise);
              }}
              className="group h-full w-full rounded-(--radius-card) border-2 border-transparent bg-surface p-4 text-start shadow-(--shadow-card) transition hover:border-compromise"
            >
              <span className="block font-bold">{compromiseTitle(compromise)}</span>
              {compromise.feasibility.matchRate !== null && (
                <span className="mt-2 flex items-baseline gap-2">
                  <span className="num text-2xl font-extrabold text-compromise">
                    {formatPercent(compromise.feasibility.matchRate)}
                  </span>
                  <span className="num rounded-full bg-compromise-soft px-2 py-0.5 text-xs font-bold text-compromise">
                    {formatPoints(compromise.delta)}
                  </span>
                </span>
              )}
              <span className="mt-1 block text-xs text-muted">
                על סמך <span className="num">{compromise.feasibility.poolSize}</span> עסקאות
              </span>
              <span className="mt-3 block text-sm font-medium text-brand opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                להחיל את השינוי ←
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

import {
  FEATURE_LABELS,
  type CompromiseDto,
  type HousePartDto,
  type HousePartName,
  type HousePartStatus,
} from '@rel/shared';
import { MotionConfig } from 'motion/react';
import { useState } from 'react';
import { formatPercent } from '../../lib/format';
import { IsoHouse } from './IsoHouse';

const PART_LABELS: Readonly<Record<HousePartName, string>> = {
  structure: 'הדירה עצמה',
  ...FEATURE_LABELS,
};

const STATUS_TEXT: Readonly<Record<HousePartStatus, string>> = {
  full: 'ברוב הדירות בתקציב',
  partial: 'רק בחלק מהדירות בתקציב',
  missing: 'כמעט אין בתקציב – כאן צריך להתפשר',
  unknown: 'אין מספיק נתונים כדי לדעת',
};

const STATUS_TONE: Readonly<Record<HousePartStatus, string>> = {
  full: 'bg-good-soft text-good-ink',
  partial: 'bg-warn-soft text-warn-ink',
  missing: 'bg-compromise-soft text-compromise',
  unknown: 'bg-sand text-muted',
};

const PREFERENCE_TEXT = { required: 'חובה', preferred: 'רצוי', any: null } as const;

interface HouseCardProps {
  parts: HousePartDto[];
  compromises: CompromiseDto[];
  onApplyCompromise: (compromise: CompromiseDto) => void;
}

function shareSentence(part: HousePartDto): string {
  if (part.share === null) {
    return `נמצאו רק ${part.knownCount} עסקאות עם המידע הזה.`;
  }
  if (part.part === 'structure') {
    return `${formatPercent(part.share)} מהדירות שעונות על הדרישות נמכרו בתקציב.`;
  }
  return `${formatPercent(part.share)} מהדירות שנמכרו בתקציב כוללות ${PART_LABELS[part.part]}.`;
}

/** The isometric house, a readable list of the same information, and the selected part's details. */
export function HouseCard({ parts, compromises, onApplyCompromise }: HouseCardProps) {
  const [selected, setSelected] = useState<HousePartName | null>(null);
  const selectedPart = parts.find((part) => part.part === selected) ?? null;
  const dropCompromise =
    selectedPart === null || selectedPart.part === 'structure'
      ? undefined
      : compromises.find(
          (compromise) =>
            compromise.type === 'dropFeature' && compromise.params.feature === selectedPart.part,
        );

  return (
    <section
      aria-label="הבית שהתקציב קונה"
      className="rounded-(--radius-card) bg-surface p-5 shadow-(--shadow-card)"
    >
      <h2 className="text-lg font-bold">הבית שהתקציב שלך קונה</h2>
      <p className="mt-1 text-sm text-ink-soft">לחצו על חלק בבית כדי לראות את הפרטים.</p>

      <div className="mt-2 flex justify-center">
        <MotionConfig reducedMotion="user">
          <IsoHouse parts={parts} labels={PART_LABELS} selected={selected} onSelect={setSelected} />
        </MotionConfig>
      </div>

      {selectedPart !== null && (
        <div role="status" className="mt-2 rounded-xl bg-canvas p-4">
          <p className="font-bold">
            {PART_LABELS[selectedPart.part]} – {STATUS_TEXT[selectedPart.status]}
          </p>
          <p className="mt-1 text-sm text-ink-soft">{shareSentence(selectedPart)}</p>
          {dropCompromise !== undefined && dropCompromise.feasibility.matchRate !== null && (
            <button
              type="button"
              onClick={() => {
                onApplyCompromise(dropCompromise);
              }}
              className="mt-3 rounded-xl bg-compromise px-4 py-2 text-sm font-bold text-white"
            >
              לוותר על {PART_LABELS[selectedPart.part]} ←{' '}
              <span className="num">{formatPercent(dropCompromise.feasibility.matchRate)}</span>
            </button>
          )}
        </div>
      )}

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {parts.map((part) => {
          const preference = part.preference === null ? null : PREFERENCE_TEXT[part.preference];
          return (
            <li key={part.part}>
              <button
                type="button"
                aria-pressed={selected === part.part}
                onClick={() => {
                  setSelected(part.part);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-start text-sm hover:bg-canvas"
              >
                <span>
                  {PART_LABELS[part.part]}
                  {preference !== null && (
                    <span className="ms-1 text-xs text-muted">({preference})</span>
                  )}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_TONE[part.status]}`}
                >
                  {part.share === null ? '?' : formatPercent(part.share)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

import type { ReactNode } from 'react';
import { SlidingHighlight } from './SlidingHighlight';

interface ChoiceChipProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  /**
   * For a single-choice row (rooms): the group's id, so the selection slides between chips.
   * Without it (multi-choice, e.g. property types) each chip just fades between states.
   */
  slideGroup?: string;
}

/** A toggle button in a row of choices (rooms, property types). */
export function ChoiceChip({ selected, onClick, children, slideGroup }: ChoiceChipProps) {
  const sliding = slideGroup !== undefined;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`relative rounded-xl px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
        selected
          ? `text-white ${sliding ? 'bg-sand' : 'bg-brand'}`
          : 'bg-sand text-ink-soft hover:bg-line hover:text-ink'
      }`}
    >
      {selected && sliding && (
        <SlidingHighlight layoutId={`${slideGroup}-selection`} className="rounded-xl bg-brand" />
      )}
      <span className="relative">{children}</span>
    </button>
  );
}

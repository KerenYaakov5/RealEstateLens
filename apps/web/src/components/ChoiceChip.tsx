import type { ReactNode } from 'react';

interface ChoiceChipProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}

/** A toggle button in a row of choices (rooms, property types). */
export function ChoiceChip({ selected, onClick, children }: ChoiceChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
        selected ? 'bg-brand text-white' : 'bg-sand text-ink-soft hover:bg-line hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

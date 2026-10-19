import type { FeaturePreference } from '@rel/shared';

const OPTIONS: { value: FeaturePreference; label: string }[] = [
  { value: 'any', label: 'לא משנה' },
  { value: 'preferred', label: 'רצוי' },
  { value: 'required', label: 'חובה' },
];

interface FeatureToggleProps {
  label: string;
  value: FeaturePreference;
  onChange: (value: FeaturePreference) => void;
}

/**
 * Three-way choice for a yes/no feature, as an accessible radio group. The three options have
 * equal widths and the same inset, whichever one is selected.
 */
export function FeatureToggle({ label, value, onChange }: FeatureToggleProps) {
  return (
    <fieldset className="flex items-center justify-between gap-3">
      <legend className="sr-only">{label}</legend>
      <span aria-hidden="true" className="text-sm font-medium">
        {label}
      </span>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-sand p-1">
        {OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={`rounded-lg px-2.5 py-1 text-center text-xs font-medium transition ${
                selected
                  ? option.value === 'required'
                    ? 'bg-brand text-white shadow-sm'
                    : 'bg-surface text-ink shadow-sm'
                  : 'text-ink-soft hover:bg-surface/60 hover:text-ink'
              }`}
            >
              <input
                type="radio"
                name={label}
                value={option.value}
                checked={selected}
                onChange={() => {
                  onChange(option.value);
                }}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

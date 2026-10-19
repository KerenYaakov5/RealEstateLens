import { MIN_SEARCH_LENGTH } from '@rel/shared';
import { useQuery } from '@tanstack/react-query';
import { useId, useState, type KeyboardEvent } from 'react';
import { useDebouncedValue } from '../lib/useDebouncedValue';

export interface AutocompleteOption {
  id: number;
  label: string;
  /** Short note under the label, e.g. "אין לנו עסקאות ביישוב הזה". */
  hint?: string;
}

interface AutocompleteProps {
  label: string;
  placeholder: string;
  /** Distinguishes cached searches of different lists (cities vs a city's neighborhoods). */
  queryKey: readonly unknown[];
  search: (term: string, signal: AbortSignal) => Promise<AutocompleteOption[]>;
  /** Text shown when an option is chosen (or the free text that was committed). */
  selectedText: string;
  onSelect: (option: AutocompleteOption) => void;
  onClear: () => void;
  /** When set, text that matches no option is still accepted (e.g. a neighborhood name). */
  onFreeText?: (text: string) => void;
  disabled?: boolean;
}

const SEARCH_DELAY_MS = 300;

/**
 * Accessible combobox (WAI-ARIA pattern). Searches the server only from 3 characters and only
 * after a short pause in typing – never on every keystroke.
 */
export function Autocomplete(props: AutocompleteProps) {
  const { label, placeholder, queryKey, search, selectedText, onSelect, onClear, onFreeText } =
    props;
  const listId = useId();
  const [text, setText] = useState(selectedText);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  // Reflect an outside change (a compromise picked another city, a reset) in the input.
  // Adjusting state during render is React's recommended way to follow a prop.
  const [shownSelection, setShownSelection] = useState(selectedText);
  if (selectedText !== shownSelection) {
    setShownSelection(selectedText);
    setText(selectedText);
  }

  const term = useDebouncedValue(text.trim(), SEARCH_DELAY_MS);
  const searching = term.length >= MIN_SEARCH_LENGTH && term !== selectedText;
  const results = useQuery({
    queryKey: [...queryKey, term],
    queryFn: ({ signal }) => {
      return search(term, signal);
    },
    enabled: searching && props.disabled !== true,
  });
  const options = searching ? (results.data ?? []) : [];

  const choose = (option: AutocompleteOption): void => {
    onSelect(option);
    setText(option.label);
    setOpen(false);
    setActive(-1);
  };

  const commitText = (): void => {
    const value = text.trim();
    if (value === selectedText) {
      return;
    }
    if (value === '') {
      onClear();
    } else if (onFreeText !== undefined) {
      onFreeText(value);
    } else {
      // Without free text, unfinished typing falls back to the last real choice.
      setText(selectedText);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((current) => Math.min(current + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[active];
      if (open && option !== undefined) {
        choose(option);
      } else {
        commitText();
        setOpen(false);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  let status: string | null = null;
  const typed = text.trim();
  if (open && typed !== selectedText) {
    if (typed.length > 0 && typed.length < MIN_SEARCH_LENGTH) {
      status = `הקלידו לפחות ${MIN_SEARCH_LENGTH} תווים`;
    } else if (searching && results.isFetching && options.length === 0) {
      status = 'מחפש…';
    } else if (searching && results.isSuccess && options.length === 0) {
      status =
        onFreeText === undefined ? 'לא נמצאו תוצאות' : 'לא נמצא ברשימה – אפשר להמשיך עם הטקסט';
    } else if (results.isError) {
      status = results.error.message;
    }
  }
  const showList = open && options.length > 0;

  return (
    <div className="relative">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink-soft">{label}</span>
        <input
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder={placeholder}
          disabled={props.disabled}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => {
            setOpen(true);
          }}
          onBlur={() => {
            commitText();
            setOpen(false);
          }}
          onKeyDown={onKeyDown}
          className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 disabled:opacity-50"
        />
      </label>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-line bg-surface py-1 shadow-(--shadow-card)"
        >
          {options.map((option, index) => (
            <li
              key={option.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // mousedown (not click) so the choice happens before the input's blur.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(option);
              }}
              className={`cursor-pointer px-3 py-2 ${index === active ? 'bg-brand-soft' : 'hover:bg-sand'}`}
            >
              <span className="block">{option.label}</span>
              {option.hint !== undefined && (
                <span className="block text-xs text-muted">{option.hint}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {status !== null && (
        <p className="mt-1 text-xs text-muted" aria-live="polite">
          {status}
        </p>
      )}
    </div>
  );
}

import { FEATURE_LABELS, FEATURES, PROPERTY_TYPES, type PropertyType } from '@rel/shared';
import { useRef, type Dispatch } from 'react';
import { searchCities, searchNeighborhoods } from '../../api/places';
import { Autocomplete } from '../../components/Autocomplete';
import { formatPriceShort } from '../../lib/format';
import { BUDGET, type CriteriaAction, type CriteriaState } from './criteria';
import { FeatureToggle } from './FeatureToggle';

const ROOM_CHOICES = [2, 3, 4, 5, 6] as const;

interface CriteriaPanelProps {
  state: CriteriaState;
  dispatch: Dispatch<CriteriaAction>;
  onReset: () => void;
}

function neighborhoodText(state: CriteriaState): string {
  if (state.neighborhood === null) {
    return '';
  }
  return state.neighborhood.kind === 'list' ? state.neighborhood.name : state.neighborhood.text;
}

export function CriteriaPanel({ state, dispatch, onReset }: CriteriaPanelProps) {
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const city = state.city;

  return (
    <section
      aria-label="הדרישות שלי"
      className="space-y-5 rounded-(--radius-card) bg-surface p-5 shadow-(--shadow-card)"
    >
      <h2 className="text-lg font-bold">מה אני מחפש/ת</h2>

      <Autocomplete
        label="עיר או יישוב"
        placeholder="למשל: רמת גן, Herzliya…"
        queryKey={['citySearch']}
        search={searchCities}
        selectedText={city?.name ?? ''}
        onSelect={(option) => {
          dispatch({ type: 'setCity', city: { id: option.id, name: option.label } });
        }}
        onClear={() => {
          dispatch({ type: 'setCity', city: null });
        }}
      />

      <Autocomplete
        label="שכונה (לא חובה)"
        placeholder={city === null ? 'קודם בוחרים עיר' : 'כל העיר'}
        queryKey={['neighborhoodSearch', city?.id]}
        search={(term, signal) => {
          return city === null ? Promise.resolve([]) : searchNeighborhoods(city.id, term, signal);
        }}
        selectedText={neighborhoodText(state)}
        disabled={city === null}
        onSelect={(option) => {
          dispatch({
            type: 'setNeighborhood',
            neighborhood: { kind: 'list', id: option.id, name: option.label },
          });
        }}
        onFreeText={(text) => {
          dispatch({ type: 'setNeighborhood', neighborhood: { kind: 'text', text } });
        }}
        onClear={() => {
          dispatch({ type: 'setNeighborhood', neighborhood: null });
        }}
      />

      <div>
        <label htmlFor="budget" className="mb-1 flex items-baseline justify-between">
          <span className="text-sm font-medium text-ink-soft">תקציב מקסימלי</span>
          <span className="num text-lg font-bold text-brand">
            {formatPriceShort(state.maxPrice)}
          </span>
        </label>
        <input
          id="budget"
          type="range"
          min={BUDGET.min}
          max={BUDGET.max}
          step={BUDGET.step}
          value={state.maxPrice}
          aria-valuetext={formatPriceShort(state.maxPrice)}
          onChange={(event) => {
            dispatch({ type: 'setMaxPrice', maxPrice: Number(event.target.value) });
          }}
          className="w-full accent-brand"
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-soft">מספר חדרים</legend>
        <div className="flex flex-wrap gap-1.5">
          {[null, ...ROOM_CHOICES].map((rooms) => {
            const selected = state.rooms === rooms;
            return (
              <button
                key={rooms ?? 'any'}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  dispatch({ type: 'setRooms', rooms });
                }}
                className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                  selected ? 'bg-brand text-white' : 'bg-sand text-ink-soft hover:text-ink'
                }`}
              >
                {rooms === null ? 'לא משנה' : rooms}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-muted">כולל חצי חדר לכל כיוון (למשל 4 = 3.5 עד 4.5)</p>
      </fieldset>

      <div className="space-y-2.5">
        {FEATURES.map((feature) => (
          <FeatureToggle
            key={feature}
            label={FEATURE_LABELS[feature]}
            value={state.features[feature]}
            onChange={(preference) => {
              dispatch({ type: 'setFeature', feature, preference });
            }}
          />
        ))}
      </div>

      <details className="group rounded-xl border border-line px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-ink-soft">
          דרישות נוספות
        </summary>
        <div className="mt-3 space-y-4">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink-soft">סוג נכס</legend>
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(PROPERTY_TYPES) as [PropertyType, string][]).map(([key, label]) => {
                const selected = state.propertyTypes.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      dispatch({ type: 'togglePropertyType', propertyType: key });
                    }}
                    className={`rounded-xl px-3 py-1.5 text-sm transition ${
                      selected ? 'bg-brand text-white' : 'bg-sand text-ink-soft hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-muted">בלי בחירה = כל הסוגים</p>
          </fieldset>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">גודל מינימלי (מ"ר)</span>
            <input
              type="number"
              inputMode="numeric"
              min={10}
              max={1000}
              value={state.minSize ?? ''}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                dispatch({
                  type: 'setMinSize',
                  minSize: Number.isFinite(value) && value > 0 ? Math.round(value) : null,
                });
              }}
              className="num w-32 rounded-xl border border-line bg-canvas px-3 py-2"
            />
          </label>
        </div>
      </details>

      <div className="border-t border-line pt-4 text-center">
        <button
          type="button"
          onClick={() => {
            confirmDialog.current?.showModal();
          }}
          className="text-xs text-muted underline-offset-2 hover:text-bad hover:underline"
        >
          איפוס כל הבחירות
        </button>
      </div>

      <dialog
        ref={confirmDialog}
        aria-labelledby="reset-title"
        className="m-auto max-w-xs rounded-(--radius-card) p-5 shadow-(--shadow-card) backdrop:bg-ink/40"
      >
        <h3 id="reset-title" className="font-bold">
          לאפס את כל הבחירות?
        </h3>
        <p className="mt-1 text-sm text-ink-soft">העיר, התקציב וכל הדרישות יחזרו לברירת המחדל.</p>
        <form method="dialog" className="mt-4 flex justify-end gap-2">
          <button type="submit" className="rounded-lg px-3 py-1.5 text-sm hover:bg-sand">
            ביטול
          </button>
          <button
            type="submit"
            onClick={onReset}
            className="rounded-lg bg-bad px-3 py-1.5 text-sm font-bold text-white"
          >
            איפוס
          </button>
        </form>
      </dialog>
    </section>
  );
}

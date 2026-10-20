import {
  budgetScale,
  FEATURE_LABELS,
  FEATURES,
  PROPERTY_TYPES,
  type PropertyType,
} from '@rel/shared';
import { useId, useRef, type Dispatch } from 'react';
import { searchCities, searchNeighborhoods, useCityList } from '../../api/places';
import { Autocomplete } from '../../components/Autocomplete';
import { ChoiceChip } from '../../components/ChoiceChip';
import { MobileCollapsible } from '../../components/MobileCollapsible';
import { formatPriceShort } from '../../lib/format';
import { BUDGET, roomsChoiceLabel, type CriteriaAction, type CriteriaState } from './criteria';
import { FeatureToggle } from './FeatureToggle';

const ROOM_CHOICES = [2, 3, 4, 5, 6] as const;

interface CriteriaPanelProps {
  state: CriteriaState;
  dispatch: Dispatch<CriteriaAction>;
  onReset: () => void;
}

/** "4 חדרים · ממ"ד – חובה · דירה · מ-90 מ"ר", shown on a collapsed panel. */
function choicesSummary(state: CriteriaState): string {
  const parts: string[] = [];
  if (state.rooms !== null) {
    parts.push(`${roomsChoiceLabel(state.rooms)} חדרים`);
  }
  for (const feature of FEATURES) {
    const preference = state.features[feature];
    if (preference !== 'any') {
      parts.push(`${FEATURE_LABELS[feature]} – ${preference === 'required' ? 'חובה' : 'רצוי'}`);
    }
  }
  if (state.propertyTypes.length > 0) {
    parts.push(state.propertyTypes.map((type) => PROPERTY_TYPES[type]).join(', '));
  }
  if (state.minSize !== null) {
    parts.push(`מ-${state.minSize} מ"ר`);
  }
  return parts.length === 0 ? 'לא נבחרו דרישות' : parts.join(' · ');
}

function neighborhoodText(state: CriteriaState): string {
  if (state.neighborhood === null) {
    return '';
  }
  return state.neighborhood.kind === 'list' ? state.neighborhood.name : state.neighborhood.text;
}

export function CriteriaPanel({ state, dispatch, onReset }: CriteriaPanelProps) {
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const roomsGroup = useId();
  const city = state.city;
  const cityList = useCityList();
  // The slider moves over the points of the tiered scale, not over shekels.
  const budgets = budgetScale(
    Math.max(cityList.data?.budgetMax ?? BUDGET.fallbackMax, state.maxPrice),
  );
  const budgetIndex = Math.max(
    0,
    budgets.findIndex((value) => {
      return value >= state.maxPrice;
    }),
  );

  return (
    <section
      aria-label="הדרישות שלי"
      className="space-y-5 rounded-(--radius-card) bg-surface p-5 shadow-(--shadow-card)"
    >
      <h2 className="text-lg font-bold">מה אני מחפש/ת</h2>

      <Autocomplete
        label="עיר או יישוב"
        placeholder="למשל: רמת גן, הרצליה…"
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
          <span className="text-lg font-bold text-brand">{formatPriceShort(state.maxPrice)}</span>
        </label>
        <input
          id="budget"
          type="range"
          min={0}
          max={budgets.length - 1}
          step={1}
          value={budgetIndex}
          aria-valuetext={formatPriceShort(state.maxPrice)}
          onChange={(event) => {
            const value = budgets[Number(event.target.value)];
            if (value !== undefined) {
              dispatch({ type: 'setMaxPrice', maxPrice: value });
            }
          }}
          className="w-full accent-brand"
        />
      </div>

      <MobileCollapsible title="חדרים ודרישות" summary={choicesSummary(state)}>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-soft">מספר חדרים</legend>
          <div className="flex flex-wrap gap-1.5">
            {[null, ...ROOM_CHOICES].map((rooms) => {
              const selected = state.rooms === rooms;
              return (
                <ChoiceChip
                  key={rooms ?? 'any'}
                  selected={selected}
                  slideGroup={roomsGroup}
                  onClick={() => {
                    dispatch({ type: 'setRooms', rooms });
                  }}
                >
                  {rooms === null ? 'לא משנה' : roomsChoiceLabel(rooms)}
                </ChoiceChip>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-muted">כולל חצי חדר לכל כיוון</p>
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

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-soft">סוג נכס</legend>
          <div className="flex flex-wrap gap-1.5">
            <ChoiceChip
              selected={state.propertyTypes.length === 0}
              onClick={() => {
                dispatch({ type: 'clearPropertyTypes' });
              }}
            >
              הכל
            </ChoiceChip>
            {(Object.entries(PROPERTY_TYPES) as [PropertyType, string][]).map(([key, label]) => (
              <ChoiceChip
                key={key}
                selected={state.propertyTypes.includes(key)}
                onClick={() => {
                  dispatch({ type: 'togglePropertyType', propertyType: key });
                }}
              >
                {label}
              </ChoiceChip>
            ))}
          </div>
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
      </MobileCollapsible>

      <div className="border-t border-line pt-4 text-center">
        <button
          type="button"
          onClick={() => {
            confirmDialog.current?.showModal();
          }}
          className="rounded-xl border border-bad/40 bg-bad-soft/60 px-4 py-2 text-sm font-medium text-bad-ink transition-colors duration-200 hover:border-bad hover:bg-bad-soft"
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

import type { CompromiseDto, MarketAssessmentDto, Priorities } from '@rel/shared';
import { useQuery } from '@tanstack/react-query';
import { cityDealCounts } from '../../api/places';
import { useSession } from '../../auth/session';
import type { Place } from '../criteria/criteria';
import { HouseCard } from '../house/HouseCard';
import { PersonalizePanel } from '../recommendation/PersonalizePanel';
import { usePersonalRecommendation } from '../recommendation/usePersonalRecommendation';
import { CompromiseCards } from './CompromiseCards';
import { FeasibilityCard } from './FeasibilityCard';
import { ReferenceDeals } from './ReferenceDeals';
import { useAssessment } from './useAssessment';
import type { CriteriaState } from '../criteria/criteria';

interface ResultsProps {
  state: CriteriaState;
  priorities: Priorities;
  onChangePriorities: (priorities: Priorities) => void;
  onApplyCompromise: (compromise: CompromiseDto) => void;
  onChooseCity: (city: Place) => void;
}

function Notices({ assessment }: { assessment: MarketAssessmentDto }) {
  if (assessment.notices.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-2">
      {assessment.notices.map((notice) => (
        <li
          key={notice.code}
          role="status"
          className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm font-medium text-warn-ink"
        >
          {notice.message}
        </li>
      ))}
    </ul>
  );
}

/** How many deals we have in the city – shown in the feasibility card once results are in. */
function useCityDealCount(cityId: number | undefined): number | undefined {
  const counts = useQuery({
    queryKey: ['cityDealCounts'],
    queryFn: ({ signal }) => {
      return cityDealCounts(signal);
    },
    staleTime: 10 * 60_000,
    enabled: cityId !== undefined,
  });
  return cityId === undefined ? undefined : counts.data?.get(cityId);
}

function NearbyCities({
  assessment,
  onChooseCity,
}: {
  assessment: MarketAssessmentDto;
  onChooseCity: (city: Place) => void;
}) {
  if (assessment.nearbyCitiesWithData.length === 0) {
    return null;
  }
  return (
    <section aria-label="ערים קרובות עם נתונים" className="flex flex-wrap gap-2">
      {assessment.nearbyCitiesWithData.map((city) => (
        <button
          key={city.id}
          type="button"
          onClick={() => {
            onChooseCity({ id: city.id, name: city.name });
          }}
          className="rounded-xl bg-surface px-4 py-2 text-sm shadow-(--shadow-card) hover:bg-brand-soft"
        >
          <span className="font-bold">{city.name}</span>{' '}
          <span className="num text-muted">({city.distanceKm} ק"מ)</span>
        </button>
      ))}
    </section>
  );
}

function TypicalForBudget({ assessment }: { assessment: MarketAssessmentDto }) {
  const typical = assessment.typicalForBudget;
  if (typical === null) {
    return null;
  }
  const rooms =
    typical.rooms.low === typical.rooms.high
      ? `${typical.rooms.low}`
      : `${typical.rooms.low}–${typical.rooms.high}`;
  const size = typical.sizeSqm === null ? null : `${typical.sizeSqm.low}–${typical.sizeSqm.high}`;
  return (
    <section aria-label="מה אפשר לקבל בתקציב" className="rounded-(--radius-card) bg-brand-soft p-5">
      <h2 className="font-bold text-brand-strong">
        מה כן אפשר לקבל בתקציב הזה ב{assessment.city.name}?
      </h2>
      <p className="mt-1 text-ink-soft">
        רוב הדירות שנמכרו בתקציב הזה היו <span className="num font-bold text-ink">{rooms}</span>{' '}
        חדרים
        {size !== null && (
          <>
            , בגודל <span className="num font-bold text-ink">{size}</span> מ"ר
          </>
        )}{' '}
        (מתוך <span className="num">{typical.dealCount}</span> עסקאות).
      </p>
    </section>
  );
}

export function Results({
  state,
  priorities,
  onChangePriorities,
  onApplyCompromise,
  onChooseCity,
}: ResultsProps) {
  const assessment = useAssessment(state);
  const personal = usePersonalRecommendation(state);
  const session = useSession();
  const cityDealCount = useCityDealCount(assessment.data?.city.id);

  if (state.city === null) {
    return (
      <div className="rounded-(--radius-card) border-2 border-dashed border-line p-10 text-center text-ink-soft">
        <p className="text-lg font-bold text-ink">בחרו עיר כדי להתחיל</p>
        <p className="mt-1">
          נראה לכם כמה מהדירות שאתם מחפשים נמכרו בתקציב שלכם, ועל מה אפשר להתפשר.
        </p>
      </div>
    );
  }
  if (assessment.isPending) {
    return (
      <p className="py-16 text-center text-muted" aria-live="polite">
        מחשב…
      </p>
    );
  }
  if (assessment.isError) {
    return (
      <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 font-medium text-bad-ink">
        {assessment.error.message}
      </p>
    );
  }
  if (assessment.data === null) {
    return (
      <div
        role="status"
        className="rounded-(--radius-card) border border-warn/30 bg-warn-soft p-8 text-center text-warn-ink"
      >
        <p className="text-lg font-bold">אין לנו נתונים על {state.city.name}</p>
        <p className="mt-1">וגם לא על יישובים קרובים אליו. נסו עיר אחרת.</p>
      </div>
    );
  }

  const data = assessment.data;
  return (
    <div
      className={`space-y-5 transition-opacity ${assessment.isPlaceholderData ? 'opacity-60' : ''}`}
      aria-busy={assessment.isFetching}
    >
      <Notices assessment={data} />
      <NearbyCities assessment={data} onChooseCity={onChooseCity} />
      {data.nearbyCitiesWithData.length === 0 && (
        <>
          <FeasibilityCard assessment={data} cityDealCount={cityDealCount} />
          <TypicalForBudget assessment={data} />
          <HouseCard
            parts={data.houseParts}
            compromises={data.compromises}
            onApplyCompromise={onApplyCompromise}
          />
          <CompromiseCards
            compromises={data.compromises}
            baselineRate={data.feasibility.matchRate}
            recommendation={personal.recommendation}
            personalize={
              <PersonalizePanel
                compromises={data.compromises}
                priorities={priorities}
                onChange={onChangePriorities}
                onAsk={personal.ask}
                isAsking={personal.isAsking}
                error={personal.error?.message ?? null}
                quotaLeft={session.data?.aiQuotaLeft}
              />
            }
            onApply={onApplyCompromise}
          />
          <ReferenceDeals deals={data.referenceDeals} />
        </>
      )}
    </div>
  );
}

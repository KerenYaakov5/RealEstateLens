import { Results } from './assessment/Results';
import { CriteriaPanel } from './criteria/CriteriaPanel';
import { useCriteria } from './criteria/useCriteria';
import { usePriorities } from './recommendation/usePersonalRecommendation';

/**
 * The one live screen: requirements on one side, results updating as they change. On a phone the
 * panel comes first, then the results.
 */
export function MainScreen() {
  const { state, dispatch, reset } = useCriteria();
  const { priorities, setPriorities, reset: resetPriorities } = usePriorities();

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[22rem_1fr] lg:items-start">
      <div className="lg:sticky lg:top-6">
        <CriteriaPanel
          state={state}
          dispatch={dispatch}
          onReset={() => {
            reset();
            resetPriorities();
          }}
        />
      </div>
      <Results
        state={state}
        priorities={priorities}
        onChangePriorities={setPriorities}
        onApplyCompromise={(compromise) => {
          dispatch({ type: 'applyCompromise', compromise });
        }}
        onChooseCity={(city) => {
          dispatch({ type: 'setCity', city });
        }}
      />
    </main>
  );
}

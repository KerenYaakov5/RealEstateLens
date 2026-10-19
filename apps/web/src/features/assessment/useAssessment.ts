import { toAssessmentQueryString, type MarketAssessmentDto } from '@rel/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getJson } from '../../api/client';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { toRequest, type CriteriaState } from '../criteria/criteria';

const UPDATE_DELAY_MS = 300;

/**
 * The live assessment for the current requirements. Updates after a short pause (dragging the
 * budget slider does not send a request per step) and keeps the previous result on screen while
 * the next one loads. `data` is null when the server has nothing at all to show (204).
 */
export function useAssessment(state: CriteriaState) {
  const request = toRequest(state);
  const query = useDebouncedValue(
    request === null ? null : toAssessmentQueryString(request),
    UPDATE_DELAY_MS,
  );
  return useQuery({
    queryKey: ['assessment', query],
    queryFn: ({ signal }) => {
      return getJson<MarketAssessmentDto>(`/market-assessments?${query ?? ''}`, signal);
    },
    enabled: query !== null,
    placeholderData: keepPreviousData,
  });
}

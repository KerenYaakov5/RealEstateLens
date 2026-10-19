import { useEffect, useReducer } from 'react';
import { readStored, removeStored, writeStored } from '../../lib/storage';
import { criteriaReducer, parseStoredCriteria, type CriteriaState } from './criteria';

const STORAGE_KEY = 'rel.criteria.v1';

/** The user's requirements, remembered in this browser so they are not re-entered every visit. */
export function useCriteria() {
  const [state, dispatch] = useReducer(criteriaReducer, undefined, (): CriteriaState => {
    return parseStoredCriteria(readStored(STORAGE_KEY));
  });

  useEffect(() => {
    writeStored(STORAGE_KEY, state);
  }, [state]);

  const reset = (): void => {
    removeStored(STORAGE_KEY);
    dispatch({ type: 'reset' });
  };

  return { state, dispatch, reset };
}

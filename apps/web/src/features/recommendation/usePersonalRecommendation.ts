import {
  prioritiesSchema,
  toAssessmentQueryString,
  type Priorities,
  type RecommendationDto,
} from '@rel/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError, postJson } from '../../api/client';
import { SESSION_KEY, type SessionUser } from '../../auth/session';
import { readStored, removeStored, writeStored } from '../../lib/storage';
import { toRequest, type CriteriaState } from '../criteria/criteria';

const STORAGE_KEY = 'rel.priorities.v1';

/** The user's importance ratings (1–5), remembered in this browser. */
export function usePriorities() {
  const [priorities, setPriorities] = useState<Priorities>(() => {
    const parsed = prioritiesSchema.safeParse(readStored(STORAGE_KEY));
    return parsed.success ? parsed.data : {};
  });

  useEffect(() => {
    writeStored(STORAGE_KEY, priorities);
  }, [priorities]);

  const reset = (): void => {
    removeStored(STORAGE_KEY);
    setPriorities({});
  };

  return { priorities, setPriorities, reset };
}

interface Answer {
  /** The requirements the answer was given for – it is shown only while they are unchanged. */
  forQuery: string;
  result: RecommendationDto;
}

/**
 * Asks the server for personal picks (only when the user asks – each one may use quota). The
 * answer belongs to the requirements it was asked for; once they change, the cards go back to
 * the default ranking until the user asks again.
 */
export function usePersonalRecommendation(state: CriteriaState) {
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [askedFor, setAskedFor] = useState<string | null>(null);
  const request = toRequest(state);
  const setQuotaLeft = (aiQuotaLeft: number): void => {
    queryClient.setQueryData<SessionUser | null>(SESSION_KEY, (user) => {
      return user === null || user === undefined ? user : { ...user, aiQuotaLeft };
    });
  };
  const currentQuery = request === null ? null : toAssessmentQueryString(request);

  const mutation = useMutation({
    mutationFn: async (priorities: Priorities) => {
      if (request === null || currentQuery === null) {
        throw new Error('no city chosen');
      }
      const result = await postJson<RecommendationDto>('/compromise-recommendations', {
        criteria: request,
        priorities,
      });
      return { forQuery: currentQuery, result };
    },
    onSuccess: (next) => {
      setAnswer(next);
      setQuotaLeft(next.result.aiQuotaLeft);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'AI_QUOTA_EXCEEDED') {
        setQuotaLeft(0);
      }
    },
  });

  const current = answer !== null && answer.forQuery === currentQuery ? answer.result : null;
  return {
    recommendation: current,
    ask: (priorities: Priorities): void => {
      setAskedFor(currentQuery);
      mutation.mutate(priorities);
    },
    isAsking: mutation.isPending,
    /** The error of the last request, only while the requirements are the ones it was for. */
    error: mutation.isError && askedFor === currentQuery ? mutation.error : null,
  };
}

import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { SESSION_KEY } from '../auth/session';
import { ApiError } from './client';

/** The app's query client: shared retry rules and the "session expired" handling. */
export function createQueryClient(): QueryClient {
  // A 401 from any request – a query or a mutation (e.g. asking for a recommendation) – means
  // the session expired: go back to the login screen. A failed login is also a 401, but there
  // the session is already null.
  const onError = (error: unknown): void => {
    if (error instanceof ApiError && error.status === 401) {
      queryClient.setQueryData(SESSION_KEY, null);
    }
  };
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        // Market data changes only when the server re-seeds; no need to refetch on every focus.
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Client errors (bad input, not logged in, not found) will not fix themselves.
          if (error instanceof ApiError && error.status < 500) {
            return false;
          }
          return failureCount < 2;
        },
      },
    },
  });
  return queryClient;
}

import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ApiError } from './api/client';
import { SESSION_KEY } from './auth/session';
import './index.css';

const queryClient: QueryClient = new QueryClient({
  // A 401 from any request means the session expired: go back to the login screen.
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        queryClient.setQueryData(SESSION_KEY, null);
      }
    },
  }),
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

const root = document.getElementById('root');
if (root === null) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Every animation honours the system's "reduce motion" setting. */}
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ApiError } from './api/client';
import './index.css';

const queryClient = new QueryClient({
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
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

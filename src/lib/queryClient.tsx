'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiResponseError } from '@/lib/fetchError';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Expensive account aggregations already have upstream fallbacks.
            // One retry covers transient network failures without multiplying
            // Vercel/third-party usage threefold during an outage.
            retry: (failureCount, error) =>
              failureCount < 1 &&
              !(error instanceof ApiResponseError && error.status < 500),
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

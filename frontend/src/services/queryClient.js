// [FN-07.06] Caché compartida de liquidaciones PostgreSQL
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000),
      staleTime: 15000
    }
  }
});


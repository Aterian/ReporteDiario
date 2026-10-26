// [FN-07.06] Caché compartida de liquidaciones PostgreSQL
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 15000 } }
});

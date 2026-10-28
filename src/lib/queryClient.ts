import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { reportError } from "@/lib/errorReporting";

export const queryClient = new QueryClient({
  // Components still handle their own errors; this makes sure every failure is also recorded.
  queryCache: new QueryCache({
    onError: (error, query) => reportError(error, { source: "query", query_key: String(query.queryKey[0] ?? "") }),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => reportError(error, { source: "mutation", mutation_key: String(mutation.options.mutationKey?.[0] ?? "") }),
  }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

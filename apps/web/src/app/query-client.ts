import { ApiError } from '@goodresearch/api-client'
import { MutationCache, QueryClient } from '@tanstack/react-query'

export const queryClient: QueryClient = new QueryClient({
  // Spec 026: a change refused from a page left open: read again, its controls go.
  mutationCache: new MutationCache({
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'READ_ONLY')
        void queryClient.invalidateQueries()
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      // Business errors (404, 409, 401) are not worth retrying.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
})

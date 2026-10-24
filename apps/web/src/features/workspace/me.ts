import { getGetMeQueryKey, getMe } from '@goodresearch/api-client'
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'

/** The signed-in account; loaded by the authenticated layout before any page renders. */
export const meQueryOptions = queryOptions({
  queryKey: getGetMeQueryKey(),
  queryFn: ({ signal }) => getMe({ signal }),
})

export const useMe = () => useSuspenseQuery(meQueryOptions).data

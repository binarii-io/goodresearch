import { getGetMeQueryKey, getMe } from '@goodresearch/api-client'
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'

/** The signed-in account; loaded by the authenticated layout before any page renders. */
export const meQueryOptions = queryOptions({
  queryKey: getGetMeQueryKey(),
  queryFn: ({ signal }) => getMe({ signal }),
})

export const useMe = () => useSuspenseQuery(meQueryOptions).data

/**
 * Spec 038: whether the AI provider serving the person reads videos: Vertex AI, the only provider
 * tested for usability tests (the dev and test fake stands in for it).
 */
export const readsVideo = (me: { aiProvider: { kind: string | null } }): boolean =>
  me.aiProvider.kind === 'vertex' || me.aiProvider.kind === 'fake'

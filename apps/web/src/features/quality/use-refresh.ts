import { getGetQualityOverviewQueryKey } from '@goodresearch/api-client'
import { useQueryClient } from '@tanstack/react-query'

/** After an opinion or a review: the figures, the remarks and the interview open. */
export const useRefreshQuality = (studyId: string) => {
  const queryClient = useQueryClient()
  const base = String(getGetQualityOverviewQueryKey(studyId)[0])
  return () =>
    queryClient.invalidateQueries({
      predicate: (query) => String(query.queryKey[0]).startsWith(base),
    })
}

import type { QualityOverview } from '@goodresearch/api-client'

/** How often the tab looks: closely during a review, now and then at one that may wake up. */
export const followRun = (data: QualityOverview | undefined) =>
  data?.run && !data.run.finished ? 2000 : data?.run?.dormant ? 30_000 : false

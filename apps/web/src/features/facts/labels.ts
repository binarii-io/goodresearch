import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'

/** Spec 039: one status vocabulary for every fact, whatever its study type. */
export type CommonStatus = 'to-decide' | 'accepted' | 'edited' | 'rejected'

export const COMMON_STATUSES: Record<CommonStatus, MessageDescriptor> = {
  'to-decide': msg`To decide`,
  accepted: msg`Accepted`,
  edited: msg`Edited`,
  rejected: msg`Rejected`,
}

/** The stored status of a fact as people read it (`proposed` is "to decide"). */
export const commonStatusOf = (status: string): CommonStatus =>
  status === 'proposed' || status === 'to-decide'
    ? 'to-decide'
    : status === 'edited'
      ? 'edited'
      : status === 'rejected'
        ? 'rejected'
        : 'accepted'

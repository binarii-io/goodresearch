import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'

export type ResponseStateKey =
  | 'counted'
  | 'out-of-target'
  | 'profile-not-answered'
  | 'refused-consent'

export const RESPONSE_STATES: Record<ResponseStateKey, MessageDescriptor> = {
  counted: msg`Counted`,
  'out-of-target': msg`Out of target`,
  'profile-not-answered': msg`Profile not answered`,
  'refused-consent': msg`Refused consent`,
}

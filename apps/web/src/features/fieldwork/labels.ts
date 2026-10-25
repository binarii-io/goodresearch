import type { Session } from '@goodresearch/api-client'
import type { I18n, MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'

export const SESSION_STATES: Record<Session['state'], MessageDescriptor> = {
  proposed: msg`Proposed`,
  validated: msg`Validated`,
  excluded: msg`Excluded`,
}

const CONFIDENCES: Record<'high' | 'medium' | 'low', MessageDescriptor> = {
  high: msg`high confidence`,
  medium: msg`medium confidence`,
  low: msg`low confidence`,
}

export const SUGGESTION_RULES: Record<'name' | 'date', MessageDescriptor> = {
  name: msg`name in the file name`,
  date: msg`same date`,
}

/** Why a recording goes with a transcript, as people read it (research R3). */
export const matchReason = (
  i18n: I18n,
  m: { confidence: 'high' | 'medium' | 'low' | null; reason: string },
): string => {
  if (m.reason === 'alone') return i18n._(msg`no transcript found for it`)
  if (m.confidence === null) return i18n._(msg`added by hand`)
  const word = m.reason.startsWith('shared-word:') ? m.reason.slice('shared-word:'.length) : null
  const why =
    m.reason === 'same-time'
      ? i18n._(msg`same time`)
      : m.reason === 'same-meeting'
        ? i18n._(msg`same meeting in their names`)
        : m.reason === 'close-time'
          ? i18n._(msg`within 15 minutes`)
          : i18n._(msg`shared word “${word ?? ''}”`)
  return `${i18n._(CONFIDENCES[m.confidence])}, ${why}`
}

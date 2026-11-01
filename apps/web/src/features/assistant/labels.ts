import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'

/** The five points of a project framing (spec 018). */
export const FRAMING_POINTS: Record<string, MessageDescriptor> = {
  question: msg`Research question`,
  audience: msg`Audience`,
  decision: msg`Decision to support`,
  hypotheses: msg`Hypotheses`,
  team: msg`Team`,
}

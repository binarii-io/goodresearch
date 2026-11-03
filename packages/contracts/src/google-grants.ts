import { z } from 'zod'

/** Why a stored Google grant can no longer be used (spec 030). */
export const GrantProblem = z
  .enum(['refused', 'reauth-required', 'unreadable'])
  .meta({ id: 'GrantProblem' })
export type GrantProblem = z.infer<typeof GrantProblem>

/** One click "Reconnect Google": `popup` when the app opened a window for Google. */
export const ReconnectStart = z
  .object({ returnTo: z.string().max(2000), popup: z.boolean() })
  .meta({ id: 'ReconnectStart' })

export const ReconnectResult = z
  .enum(['reconnected', 'checks-failed', 'other-account', 'missing-right', 'cancelled', 'error'])
  .meta({ id: 'ReconnectResult' })
export type ReconnectResult = z.infer<typeof ReconnectResult>

/** What the pop-up landing page tells the app (`/google/done`). */
export const GoogleConnection = z.enum(['vertex', 'drive']).meta({ id: 'GoogleConnection' })
export type GoogleConnection = z.infer<typeof GoogleConnection>

/** Result of the once-per-session grant check: no AI call, no cost. */
export const GrantCheck = z
  .discriminatedUnion('state', [
    z.object({ state: z.enum(['none', 'ok', 'unreachable']) }),
    z.object({ state: z.literal('problem'), grantProblem: GrantProblem }),
  ])
  .meta({ id: 'GrantCheck' })
export type GrantCheck = z.infer<typeof GrantCheck>

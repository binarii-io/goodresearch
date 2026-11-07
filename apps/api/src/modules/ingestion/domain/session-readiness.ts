import type { SessionState } from './session.ts'

/** Spec 037 FR-012: ready for the video analysis, or the first condition missing (in this order). */
export type SessionReadiness =
  | 'ready'
  | 'not-validated'
  | 'video-missing'
  | 'duration-unknown'
  | 'participant-to-confirm'
  | 'no-protocol'

export const readinessOf = (s: {
  readonly state: SessionState
  /** The main video is in the folder's last inventory. */
  readonly videoInFolder: boolean
  readonly durationMs: number | null
  /** An accepted participant (an anonymised study shows their pseudonym). */
  readonly participants: number
  readonly protocolVersion: number | null
}): SessionReadiness => {
  if (s.state !== 'validated') return 'not-validated'
  if (!s.videoInFolder) return 'video-missing'
  if (s.durationMs === null) return 'duration-unknown'
  if (s.participants === 0) return 'participant-to-confirm'
  if (s.protocolVersion === null) return 'no-protocol'
  return 'ready'
}

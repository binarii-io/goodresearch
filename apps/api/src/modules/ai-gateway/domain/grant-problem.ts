/**
 * Why a stored Google grant can no longer be used (spec 030): withdrawn or expired (`refused`),
 * a new sign-in required by the person's organisation (`reauth-required`), or a stored grant the
 * app cannot decrypt any more (`unreadable`). Only the person can fix it, by reconnecting.
 */
export type GrantProblem = 'refused' | 'reauth-required' | 'unreadable'

/** Outcome of an operation that can fail for an expected (business) reason. */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E; readonly detail?: Readonly<Record<string, unknown>> }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })

/** `detail` carries data the caller needs to explain the error (e.g. a count). */
export const err = <E>(error: E, detail?: Readonly<Record<string, unknown>>): Result<never, E> =>
  detail ? { ok: false, error, detail } : { ok: false, error }

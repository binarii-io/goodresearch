/** A save based on an outdated version of an aggregate (optimistic locking); mapped to VERSION_CONFLICT. */
export class ConcurrencyError extends Error {
  override name = 'ConcurrencyError'
}

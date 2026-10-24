export type AccessEventType =
  | 'account_created'
  | 'role_changed'
  | 'membership_granted'
  | 'membership_removed'
  | 'deactivated'
  | 'reactivated'
  | 'deleted'

/** Immutable record of an access change (FR-014a). Team names are copied so history stays readable. */
export type AccessEvent = {
  readonly type: AccessEventType
  readonly actorId: string | null
  readonly subjectId: string
  readonly occurredAt: Date
  readonly details: Readonly<Record<string, unknown>>
}

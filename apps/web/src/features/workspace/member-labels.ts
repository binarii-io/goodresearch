import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'

export const ROLE_LABELS: Record<'admin' | 'member', MessageDescriptor> = {
  admin: msg`Admin`,
  member: msg`Member`,
}

export const STATUS_LABELS: Record<'active' | 'deactivated' | 'deleted', MessageDescriptor> = {
  active: msg`Active`,
  deactivated: msg`Deactivated`,
  deleted: msg`Deleted`,
}

export const DELETED_ACCOUNT = msg`Deleted account`

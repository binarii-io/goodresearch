import { z } from 'zod'
import { Id, Language } from './common.ts'

export const Role = z.enum(['admin', 'member'])

export const TeamRef = z.object({ id: Id, name: z.string() }).meta({ id: 'TeamRef' })

export const Me = z
  .object({
    id: Id,
    name: z.string(),
    email: z.string(),
    /** Profile photo from the identity provider (https only), or null. */
    picture: z.url({ protocol: /^https$/ }).nullable(),
    role: Role,
    language: Language,
    teams: z.array(TeamRef),
  })
  .meta({ id: 'Me' })
export type Me = z.infer<typeof Me>

export const UpdateLanguage = z.object({ language: Language }).meta({ id: 'UpdateLanguage' })

export const TeamName = z.string().trim().min(1).max(80)
export const CreateTeam = z.object({ name: TeamName }).meta({ id: 'CreateTeam' })

export const AccountStatus = z.enum(['active', 'deactivated', 'deleted'])

/** A person on the members screen; `name` and `email` are null once the account is deleted. */
export const Member = z
  .object({
    id: Id,
    name: z.string().nullable(),
    email: z.string().nullable(),
    role: Role,
    status: AccountStatus,
    teams: z.array(TeamRef),
    provider: z.string().nullable(),
    lastSignInAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .meta({ id: 'Member' })
export type Member = z.infer<typeof Member>

export const AccessEventType = z.enum([
  'account_created',
  'role_changed',
  'membership_granted',
  'membership_removed',
  'deactivated',
  'reactivated',
  'deleted',
])

export const AccessHistoryEntry = z
  .object({
    occurredAt: z.iso.datetime({ offset: true }),
    actor: z.object({ id: Id, name: z.string().nullable() }).nullable(),
    type: AccessEventType,
    details: z.record(z.string(), z.unknown()),
  })
  .meta({ id: 'AccessHistoryEntry' })
export type AccessHistoryEntry = z.infer<typeof AccessHistoryEntry>

export const TeamDetail = z
  .object({
    id: Id,
    name: z.string(),
    version: z.number().int(),
    members: z.array(z.object({ id: Id, name: z.string() })),
    projectCount: z.number().int(),
  })
  .meta({ id: 'TeamDetail' })
export type TeamDetail = z.infer<typeof TeamDetail>

export const RenameTeam = z
  .object({ name: TeamName, version: z.number().int() })
  .meta({ id: 'RenameTeam' })
export const ChangeRole = z.object({ role: Role }).meta({ id: 'ChangeRole' })
export const DeleteAccount = z.object({ confirmation: z.string() }).meta({ id: 'DeleteAccount' })
export const TeamParams = z.object({ teamId: Id })
export const MemberParams = z.object({ memberId: Id })
export const MemberTeamParams = z.object({ memberId: Id, teamId: Id })

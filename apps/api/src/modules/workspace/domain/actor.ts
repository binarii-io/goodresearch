import type { Brand } from '@goodresearch/shared'

export type AccountId = Brand<string, 'AccountId'>
export type TeamId = Brand<string, 'TeamId'>
export type Role = 'admin' | 'member'

/** The signed-in account performing a command or query. */
export type Actor = { readonly id: string; readonly role: Role }

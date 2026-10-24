import { z } from 'zod'

export const Id = z.uuid()
export const Timestamp = z.iso.datetime({ offset: true })
export const Version = z.number().int().nonnegative()

export const VersionAck = z.object({ version: Version }).meta({ id: 'VersionAck' })
export const Created = z.object({ id: Id }).meta({ id: 'Created' })

export const Language = z.enum(['en', 'fr'])
export type Language = z.infer<typeof Language>

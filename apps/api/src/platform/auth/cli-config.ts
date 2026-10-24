// Used only by `pnpm auth:schema` to generate the auth tables; never imported by the app.
import type { Db } from '../db.ts'
import { createAuth } from './auth.ts'

export const auth = createAuth({
  config: {
    appUrl: new URL('http://localhost:3000'),
    authSecret: 'x'.repeat(32),
    signInRateLimit: 20,
    providers: [
      {
        key: 'cli',
        displayName: 'CLI',
        issuer: 'http://localhost',
        clientId: 'cli',
        clientSecret: 'cli',
        trusted: false,
      },
    ],
  },
  db: {} as Db,
  gate: {
    authorize: async () => false,
    roleForNewAccount: () => 'member',
    onAccountCreated: async () => {},
    isActive: async () => false,
    onSignedIn: async () => {},
  },
})

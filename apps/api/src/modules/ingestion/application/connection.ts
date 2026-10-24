import type { IngestionDeps, SourceConnection } from './ports.ts'

/**
 * The person's own refresh token, or null when there is none or it cannot be read (other key after
 * an AUTH_SECRET change, tampering): the connection is then marked lost and the person reconnects.
 */
export const readRefreshToken = async (
  deps: IngestionDeps,
  connection: SourceConnection | null,
): Promise<string | null> => {
  if (connection?.status !== 'connected') return null
  try {
    return deps.cipher.decrypt(connection.encryptedRefreshToken, connection.accountId)
  } catch {
    deps.log.warn(
      { accountId: connection.accountId },
      'stored Drive permission unreadable; marked lost',
    )
    await deps.store.markConnectionLost(connection.accountId)
    return null
  }
}

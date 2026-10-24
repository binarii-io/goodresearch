import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

export type TokenCipher = {
  /** `owner` (the account id) is authenticated with the token: it cannot be moved to another account. */
  encrypt(clear: string, owner: string): string
  decrypt(stored: string, owner: string): string
}

const INFO = 'goodresearch/source-connections/v2'
const TAG_BYTES = 16

/**
 * Encrypts source tokens at rest (FR-010): AES-256-GCM, key derived from AUTH_SECRET, the account id
 * as additional authenticated data, full 16-byte tags only. Format `v2:<iv>:<tag>:<ciphertext>`.
 * Anything else (older format, other key, other account) fails: the connection is treated as lost.
 */
export const createTokenCipher = (secret: string): TokenCipher => {
  const key = Buffer.from(hkdfSync('sha256', secret, 'goodresearch', INFO, 32))
  return {
    encrypt: (clear, owner) => {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES })
      cipher.setAAD(Buffer.from(owner, 'utf8'))
      const data = Buffer.concat([cipher.update(clear, 'utf8'), cipher.final()])
      return [
        'v2',
        iv.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        data.toString('base64url'),
      ].join(':')
    },
    decrypt: (stored, owner) => {
      const [version, iv, tag, data] = stored.split(':')
      if (version !== 'v2' || !iv || !tag || !data) throw new Error('unsupported token format')
      const tagBytes = Buffer.from(tag, 'base64url')
      if (tagBytes.length !== TAG_BYTES) throw new Error('invalid token tag')
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'), {
        authTagLength: TAG_BYTES,
      })
      decipher.setAAD(Buffer.from(owner, 'utf8'))
      decipher.setAuthTag(tagBytes)
      return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64url')),
        decipher.final(),
      ]).toString('utf8')
    },
  }
}

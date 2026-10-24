import { describe, expect, it } from 'vitest'
import { CIPHER_PURPOSES, createTokenCipher } from './token-cipher.ts'

const cipher = createTokenCipher(
  'a-secret-of-at-least-32-characters-long',
  CIPHER_PURPOSES.sourceConnections,
)

describe('token cipher', () => {
  it('round-trips a token in a versioned format, different each time', () => {
    const a = cipher.encrypt('1//refresh-token', 'alice')
    const b = cipher.encrypt('1//refresh-token', 'alice')
    expect(a.startsWith('v2:')).toBe(true)
    expect(a).not.toBe(b)
    expect(cipher.decrypt(a, 'alice')).toBe('1//refresh-token')
  })

  it('rejects tampered values and other keys', () => {
    const value = cipher.encrypt('token', 'alice')
    const tampered = `${value.slice(0, -2)}${value.endsWith('A') ? 'B' : 'A'}A`
    expect(() => cipher.decrypt(tampered, 'alice')).toThrow()
    expect(() =>
      createTokenCipher(
        'another-secret-of-at-least-32-chars!',
        CIPHER_PURPOSES.sourceConnections,
      ).decrypt(value, 'alice'),
    ).toThrow()
  })

  it('never contains the clear token', () => {
    expect(cipher.encrypt('very-secret-token', 'alice')).not.toContain('very-secret-token')
  })

  it('binds a token to its account and refuses truncated tags', () => {
    const value = cipher.encrypt('token', 'alice')
    expect(() => cipher.decrypt(value, 'bob')).toThrow()
    const [version, iv, tag, data] = value.split(':')
    expect(() => cipher.decrypt([version, iv, tag?.slice(0, 8), data].join(':'), 'alice')).toThrow()
  })

  it('cannot decrypt a value encrypted for another purpose', () => {
    const value = cipher.encrypt('token', 'alice')
    expect(() =>
      createTokenCipher(
        'a-secret-of-at-least-32-characters-long',
        CIPHER_PURPOSES.aiProviderCredentials,
      ).decrypt(value, 'alice'),
    ).toThrow()
  })
})

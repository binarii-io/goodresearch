import { describe, expect, it } from 'vitest'
import { credentialHint, isValidProjectId, VERTEX_REGIONS } from '../domain/provider.ts'

describe('provider rules', () => {
  it('shows only the last 4 characters of a key', () => {
    expect(credentialHint('sk-ant-api03-abcdefgh1234')).toBe('1234')
    expect(credentialHint('abc')).toBe('abc')
  })

  it('accepts Google Cloud project IDs only in their documented shape', () => {
    expect(isValidProjectId('my-research-123')).toBe(true)
    expect(isValidProjectId('My-Project')).toBe(false)
    expect(isValidProjectId('abc')).toBe(false)
    expect(isValidProjectId('ends-with-')).toBe(false)
    expect(isValidProjectId('1starts-with-digit')).toBe(false)
  })

  it('offers global first among the regions', () => {
    expect(VERTEX_REGIONS[0]).toBe('global')
    expect(VERTEX_REGIONS).toContain('europe-west1')
  })
})

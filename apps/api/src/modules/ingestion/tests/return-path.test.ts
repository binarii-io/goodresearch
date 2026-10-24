import { describe, expect, it } from 'vitest'
import { safeReturnPath, withQuery } from '../domain/return-path.ts'

describe('safeReturnPath (no open redirect)', () => {
  it.each([
    '/.//evil.com',
    '/a/..//evil.com',
    '//evil.com',
    '///evil.com',
    'https://evil.com/x',
    '/\\evil.com',
    'javascript:alert(1)',
    '',
  ])('refuses %s', (input) => {
    expect(safeReturnPath(input)).toBe('/')
  })

  it('keeps same-origin paths with their query', () => {
    expect(safeReturnPath('/studies/abc')).toBe('/studies/abc')
    expect(safeReturnPath('/projects/1?team=2')).toBe('/projects/1?team=2')
  })
})

describe('withQuery', () => {
  it('adds a parameter and stays on a safe path', () => {
    expect(withQuery('/studies/abc', 'drive', 'connected')).toBe('/studies/abc?drive=connected')
    expect(withQuery('/.//evil.com', 'drive', 'connected')).toBe('/?drive=connected')
  })
})

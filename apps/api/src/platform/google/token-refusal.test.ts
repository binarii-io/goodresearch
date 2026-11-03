import { describe, expect, it } from 'vitest'
import { classifyTokenRefusal } from './token-refusal.ts'

describe('classifyTokenRefusal (spec 030 research R1)', () => {
  it('reads a re-authentication required by the organisation', () => {
    expect(
      classifyTokenRefusal({
        status: 400,
        body: {
          error: 'invalid_grant',
          error_description: 'reauth related error (invalid_rapt)',
          error_subtype: 'invalid_rapt',
        },
      }),
    ).toBe('reauth-required')
    expect(
      classifyTokenRefusal({
        status: 400,
        body: { error: 'invalid_grant', error_description: 'reauth related error (invalid_rapt)' },
      }),
    ).toBe('reauth-required')
  })

  it('reads any other refused grant', () => {
    expect(
      classifyTokenRefusal({
        status: 400,
        body: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' },
      }),
    ).toBe('refused')
    expect(classifyTokenRefusal({ status: 400, body: null })).toBe('refused')
    expect(classifyTokenRefusal({ status: 401, body: {} })).toBe('refused')
  })

  it('never takes a Google outage for a refused grant', () => {
    expect(classifyTokenRefusal({ status: 500, body: { error: 'internal_failure' } })).toBeNull()
    expect(classifyTokenRefusal({ status: 503, body: null })).toBeNull()
    expect(classifyTokenRefusal({ status: 429, body: {} })).toBeNull()
  })

  it('ignores a client misconfiguration that is not about the grant', () => {
    expect(classifyTokenRefusal({ status: 401, body: { error: 'invalid_client' } })).toBeNull()
  })
})

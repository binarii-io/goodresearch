import { describe, expect, it } from 'vitest'
import { classifyFailure, isAuthorisationFailure } from '../domain/failure.ts'

describe('classifyFailure (spec 004 research R4)', () => {
  it('reports timeouts, network errors and provider outages as unreachable', () => {
    expect(classifyFailure({ kind: 'timeout' })).toBe('UNREACHABLE')
    expect(classifyFailure({ kind: 'network' })).toBe('UNREACHABLE')
    expect(classifyFailure({ kind: 'http', status: 503 })).toBe('UNREACHABLE')
    expect(classifyFailure({ kind: 'http', status: 529 })).toBe('UNREACHABLE')
  })

  it('recognises a wrong or revoked credential', () => {
    expect(classifyFailure({ kind: 'http', status: 401 })).toBe('INVALID_CREDENTIAL')
    expect(classifyFailure({ kind: 'revoked-grant' })).toBe('INVALID_CREDENTIAL')
  })

  it('tells missing credit or quota apart from a passing rate limit', () => {
    expect(classifyFailure({ kind: 'http', status: 429, code: 'insufficient_quota' })).toBe(
      'NO_CREDIT_OR_QUOTA',
    )
    expect(
      classifyFailure({
        kind: 'http',
        status: 400,
        message: 'Your credit balance is too low to access the Anthropic API.',
      }),
    ).toBe('NO_CREDIT_OR_QUOTA')
    expect(classifyFailure({ kind: 'http', status: 402 })).toBe('NO_CREDIT_OR_QUOTA')
    expect(classifyFailure({ kind: 'http', status: 429 })).toBe('RATE_LIMITED')
  })

  it('separates a disabled Vertex AI API from a missing permission', () => {
    expect(
      classifyFailure({
        kind: 'http',
        status: 403,
        message: 'Vertex AI API has not been used in project p before or it is disabled.',
      }),
    ).toBe('API_DISABLED')
    expect(classifyFailure({ kind: 'http', status: 403, code: 'SERVICE_DISABLED' })).toBe(
      'API_DISABLED',
    )
    expect(classifyFailure({ kind: 'http', status: 403 })).toBe('PERMISSION_DENIED')
  })

  it('reports an unknown model or one missing in the region', () => {
    expect(classifyFailure({ kind: 'http', status: 404 })).toBe('MODEL_UNAVAILABLE')
  })

  it('keeps anything else as unknown', () => {
    expect(classifyFailure({ kind: 'http', status: 400 })).toBe('UNKNOWN')
    expect(classifyFailure({ kind: 'other' })).toBe('UNKNOWN')
  })

  it('marks only authorisation failures as needing the person', () => {
    expect(isAuthorisationFailure('INVALID_CREDENTIAL')).toBe(true)
    expect(isAuthorisationFailure('PERMISSION_DENIED')).toBe(true)
    expect(isAuthorisationFailure('API_DISABLED')).toBe(true)
    expect(isAuthorisationFailure('RATE_LIMITED')).toBe(false)
    expect(isAuthorisationFailure('UNREACHABLE')).toBe(false)
  })
})

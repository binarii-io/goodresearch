import { describe, expect, it } from 'vitest'
import { ERROR_CODES, HTTP_STATUS } from './errors.ts'

describe('error codes', () => {
  it('map every code to an HTTP status', () => {
    for (const code of ERROR_CODES) expect(HTTP_STATUS[code]).toBeGreaterThanOrEqual(400)
  })
})

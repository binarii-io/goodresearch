import { describe, expect, it } from 'vitest'
import { folderAccessDecision } from '../domain/folder-access.ts'

const now = new Date('2026-10-24T10:00:00Z')
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000)

describe('folderAccessDecision', () => {
  it('reuses a recent check for 5 minutes', () => {
    expect(
      folderAccessDecision({ cached: { result: 'granted', checkedAt: minutesAgo(4) }, now }),
    ).toEqual({ use: 'granted' })
    expect(
      folderAccessDecision({ cached: { result: 'denied', checkedAt: minutesAgo(1) }, now }),
    ).toEqual({ use: 'denied' })
  })

  it('checks again when the last check is older or missing', () => {
    expect(
      folderAccessDecision({ cached: { result: 'granted', checkedAt: minutesAgo(6) }, now }),
    ).toEqual({ use: 'check' })
    expect(folderAccessDecision({ cached: null, now })).toEqual({ use: 'check' })
  })
})

import { describe, expect, it } from 'vitest'
import { makeStudyCostRefs, makeStudyOverview } from '../application/queries/study-overview.ts'
import { InMemoryIngestionStore } from './fakes/in-memory-ingestion.ts'

const session = (id: string, state: string, names: string[]) => ({
  id,
  studyId: 'st',
  state,
  roster: names.map((name, n) => ({ id: `r${n}`, name, role: 'interviewee', memberId: null })),
})

const setup = () => {
  const store = new InMemoryIngestionStore()
  for (const s of [
    session('a', 'validated', ['Élodie Martin']),
    session('b', 'proposed', ['elodie  martin', 'Sam']),
    session('c', 'excluded', ['Alex']),
  ])
    store.sessions.set(s.id, s as never)
  return store
}

describe('a study in the project Overview (spec 017)', () => {
  it('counts interviews per state, and each person kept once whatever the spelling', async () => {
    const overview = await makeStudyOverview({ store: setup() })('st')
    expect(overview).toMatchObject({ validated: 1, proposed: 1, excluded: 1, participants: 2 })
    expect(overview.validatedSessionIds).toEqual(['a'])
  })

  it('does not read the sessions with their stored analysis', async () => {
    const store = setup()
    store.listSessions = async () => {
      throw new Error('whole sessions read')
    }
    await expect(makeStudyOverview({ store })('st')).resolves.toMatchObject({ validated: 1 })
  })

  it('keeps in the costs a session analysed and deleted since', async () => {
    const store = setup()
    store.analysisRuns.set('run', { studyId: 'st', sessionIds: ['a', 'gone'] } as never)
    const { sessionIds, analysisRefs } = await makeStudyCostRefs({ store })('st')
    expect(sessionIds).toEqual(['a', 'b', 'c'])
    expect(analysisRefs).toHaveLength(4)
    expect(analysisRefs.some((r) => r.includes('gone'))).toBe(true)
  })
})

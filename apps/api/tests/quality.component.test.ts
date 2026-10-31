import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { InMemoryDrive } from '../src/modules/ingestion/tests/fakes/in-memory-drive.ts'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }
type Breakdown = { agreed: number; noOpinion: number; disagreed: number }
type Figures = {
  words: { interviewers: number; interviewees: number; unknown: number }
  sentences: number
  questions: number
  simpleReformulations: number
  leading: { questions: Breakdown; reformulations: Breakdown }
}
type Overview = {
  overall: Figures | null
  reviewed: number
  total: number
  people: { key: string; name: string | null; figures: Figures }[]
  interviews: {
    sessionId: string
    title: string
    state: string
    action: string | null
    figures: Figures | null
    cost: number | null
  }[]
  cost: number | null
  run: { finished: boolean } | null
}
type Remark = { id: string; version: number; text: string; origin: string; stance: string | null }

const CONDUCTED = [
  'Alex Martin: How do you find the data of your team?',
  'Sam Example: I export the file every single week, and I hate waiting for it.',
  'Alex Martin: So you export it every week? You find this tool too slow, right?',
  'Sam Example: Yes, somewhat slow, I would say, and that is about all there is to it.',
].join('\n')
// The interviewer's label matches no one on this roster: never a false 0%.
const UNRECOGNISED = [
  'Robin: How do you find the data of your team?',
  'Sam Example: I export the file every single week, and I hate waiting for it.',
].join('\n')

describe('Interview quality on PostgreSQL (spec 016)', () => {
  let world: World
  let drive: InMemoryDrive
  let alex: Who
  let outsider: Who
  let studyId: string
  const ids: Record<string, string> = {}
  const call = (
    who: Who,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    payload?: object,
  ) =>
    world.app.inject({
      method,
      url,
      headers: { cookie: who.cookie },
      ...(payload ? { payload } : {}),
    })
  const overview = async () =>
    (await call(alex, 'GET', `/api/studies/${studyId}/quality`)).json<Overview>()
  const remarks = async () =>
    (await call(alex, 'GET', `/api/studies/${studyId}/quality/remarks`)).json<{
      remarks: Remark[]
    }>().remarks

  beforeAll(async () => {
    drive = new InMemoryDrive()
    world = await startWorld({
      drive,
      config: {
        GOOGLE_DRIVE_CLIENT_ID: 'id',
        GOOGLE_DRIVE_CLIENT_SECRET: 'secret',
        AI_PROVIDERS: '',
        AI_FAKE_PROVIDER: 'true',
        AI_PRICES:
          '[{"model":"fake-model","from":"2026-01-01","inputPerMillion":2,"outputPerMillion":10}]',
      },
    })
    alex = await world.session('alex@example.org', 'Alex Martin')
    outsider = await world.session('zoe@research.example.com', 'Zoe Stone')
    const teamId = await world.team('Research')
    await world.addMember(alex.id, teamId)
    await call(alex, 'PUT', '/api/ai-provider/api-key', { provider: 'fake', apiKey: 'test-ok-k' })
    const projectId = (await call(alex, 'POST', '/api/projects', { name: 'P', teamId })).json<{
      id: string
    }>().id
    drive.nextConsentAccount = 'alex@drive.example'
    const start = await call(
      alex,
      'GET',
      '/api/sources/google-drive/connect?returnTo=/&access=read',
    )
    const state = new URL(String(start.headers.location)).searchParams.get('state')
    await call(alex, 'GET', `/api/sources/google-drive/callback?state=${state}&code=granted`)
    drive.addFolder('folder-quality', 'folder-quality', undefined, 'Alex')
    for (const [id, text] of [
      ['q-conducted', CONDUCTED],
      ['q-second', CONDUCTED],
      ['q-unrecognised', UNRECOGNISED],
    ] as const) {
      drive.addFile(id, `${id}.txt`, 'folder-quality', 'text/plain')
      drive.texts.set(id, text)
    }
    drive.share('folder-quality', 'alex@drive.example')
    studyId = (
      await call(alex, 'POST', `/api/projects/${projectId}/studies`, {
        name: 'Quality',
        type: 'interviews',
      })
    ).json<{ id: string }>().id
    await call(alex, 'PUT', `/api/studies/${studyId}/source`, { link: 'folder-quality' })
    await world.runJobs()
    const sessions = (await call(alex, 'GET', `/api/studies/${studyId}/sessions`)).json<{
      sessions: { id: string; version: number; transcript: { name: string } | null }[]
    }>().sessions
    for (const s of sessions) {
      const name = s.transcript?.name ?? ''
      const unrecognised = name.includes('unrecognised')
      if (name) ids[name.replace('.txt', '')] = s.id
      const edited = await world.app.inject({
        method: 'PATCH',
        url: `/api/sessions/${s.id}`,
        headers: { cookie: alex.cookie },
        payload: {
          version: s.version,
          roster: [
            { name: 'Sam Example', role: 'interviewee' },
            ...(unrecognised ? [] : [{ name: 'Alex Martin', role: 'interviewer' }]),
          ],
        },
      })
      await call(alex, 'POST', `/api/sessions/${s.id}/decision`, {
        decision: 'validate',
        version: edited.json<{ version: number }>().version,
      })
    }
  })

  afterAll(async () => {
    await world?.close()
  })

  it('shows no figure and no cost before a review, and the transcript to read', async () => {
    const before = await overview()
    expect(before.overall).toBeNull()
    expect([before.reviewed, before.total]).toEqual([0, 3])
    expect(before.cost).toBeNull()
    expect(before.interviews.find((i) => i.state === 'not-reviewed')).toMatchObject({
      figures: null,
      cost: null,
      action: 'review',
    })
    const view = await call(
      alex,
      'GET',
      `/api/studies/${studyId}/quality/interviews/${ids['q-conducted']}`,
    )
    expect(view.statusCode).toBe(200)
    expect(view.json<{ turns: unknown[]; figures: unknown }>()).toMatchObject({ figures: null })
    expect(view.json<{ turns: unknown[] }>().turns).toHaveLength(4)
  })

  it('tells speakers not identified from a false 0%', async () => {
    // Opening it brings its transcript, with no AI and no cost.
    await call(alex, 'GET', `/api/studies/${studyId}/quality/interviews/${ids['q-unrecognised']}`)
    const row = (await overview()).interviews.find((i) => i.sessionId === ids['q-unrecognised'])
    expect(row).toMatchObject({ state: 'speakers-not-identified', figures: null, action: null })
  })

  it('reviews one interview alone, with its figures, cost and remarks', async () => {
    const started = await call(alex, 'POST', `/api/studies/${studyId}/quality-runs`, {
      all: false,
      consent: true,
      sessionIds: [ids['q-conducted']],
    })
    expect(started.statusCode).toBe(202)
    await world.runJobs()
    const after = await overview()
    expect([after.reviewed, after.total]).toEqual([1, 3])
    expect(after.overall?.questions).toBe(2)
    expect(after.overall?.simpleReformulations).toBe(1)
    expect(after.overall?.leading.questions.noOpinion).toBe(1)
    expect(after.cost).toBeGreaterThan(0)
    expect(after.people.map((p) => p.name)).toEqual(['Alex Martin'])
    const row = after.interviews.find((i) => i.sessionId === ids['q-conducted'])
    expect(row?.action).toBe('review-again')
    const ledger = await world.db.execute(
      sql`select count(*)::int as n from ai_usage_entries where ref = ${`quality:${(after.run as unknown as { id: string }).id}:${ids['q-conducted']}`}`,
    )
    expect(ledger.rows?.[0] ?? (ledger as unknown as { n: number }[])[0]).toMatchObject({ n: 1 })
  })

  it('stores an opinion that changes the counts only, and detects a stale one', async () => {
    const [remark] = await remarks()
    if (!remark) throw new Error('no remark')
    const url = `/api/studies/${studyId}/quality/remarks/${remark.id}/stance`
    expect(
      (await call(alex, 'PUT', url, { stance: 'disagree', version: remark.version })).statusCode,
    ).toBe(204)
    expect((await overview()).overall?.leading.questions).toEqual({
      agreed: 0,
      noOpinion: 0,
      disagreed: 1,
    })
    const stale = await call(alex, 'PUT', url, { stance: 'agree', version: remark.version })
    expect(stale.statusCode).toBe(409)
  })

  it('requalifies a simple reformulation, and withdraws it', async () => {
    const simple = (
      await call(alex, 'GET', `/api/studies/${studyId}/quality/reformulations`)
    ).json<{ reformulations: { id: string }[] }>().reformulations[0]
    if (!simple) throw new Error('none')
    const done = await call(
      alex,
      'POST',
      `/api/studies/${studyId}/quality/reformulations/${simple.id}/requalify`,
      { reason: 'It adds a cause.' },
    )
    expect(done.statusCode).toBe(201)
    const { remarkId } = done.json<{ remarkId: string }>()
    expect((await overview()).overall?.leading.reformulations.agreed).toBe(1)
    const gone = await call(
      alex,
      'DELETE',
      `/api/studies/${studyId}/quality/remarks/${remarkId}?version=1`,
    )
    expect(gone.statusCode).toBe(204)
    expect((await overview()).overall?.simpleReformulations).toBe(1)
  })

  it('keeps the disagreed remark and flags nothing new on a new review', async () => {
    const before = await remarks()
    await call(alex, 'POST', `/api/studies/${studyId}/quality-runs`, {
      all: false,
      consent: true,
      sessionIds: [ids['q-conducted']],
    })
    await world.runJobs()
    expect((await remarks()).map((r) => r.id)).toEqual(before.map((r) => r.id))
  })

  it('reads a person outside the study nothing', async () => {
    const urls = [
      `/api/studies/${studyId}/quality`,
      `/api/studies/${studyId}/quality/remarks`,
      `/api/studies/${studyId}/quality/reformulations`,
      `/api/studies/${studyId}/quality/interviews/${ids['q-conducted']}`,
    ]
    for (const url of urls) expect((await call(outsider, 'GET', url)).statusCode).toBe(404)
    const [remark] = await remarks()
    expect(
      (
        await call(
          outsider,
          'PUT',
          `/api/studies/${studyId}/quality/remarks/${remark?.id}/stance`,
          {
            stance: 'agree',
            version: remark?.version,
          },
        )
      ).statusCode,
    ).toBe(404)
  })

  it('holds a cleaning while a review runs, and says why', async () => {
    const started = await call(alex, 'POST', `/api/studies/${studyId}/quality-runs`, {
      all: false,
      consent: true,
      sessionIds: [ids['q-second']],
    })
    expect(started.statusCode).toBe(202)
    const cleaning = await call(alex, 'POST', `/api/studies/${studyId}/cleaning-runs`, {
      mode: 'lexicon',
      all: false,
      consent: false,
    })
    expect(cleaning.json<{ code?: string; error?: string }>()).toMatchObject({
      code: 'QUALITY_RUNNING',
    })
    await world.runJobs()
  })

  it('reads a person attribution through Evidence: the speakers are then identified', async () => {
    const id = ids['q-unrecognised']
    const done = await call(alex, 'PUT', `/api/studies/${studyId}/facts-analysis/${id}/speakers`, {
      label: 'Robin',
      participant: 'interviewer',
    })
    expect(done.statusCode).toBeLessThan(300)
    const row = (await overview()).interviews.find((i) => i.sessionId === id)
    expect(row?.state).toBe('not-reviewed')
  })

  it('deletes what a session held with the session', async () => {
    const id = ids['q-conducted']
    const count = async () => {
      const r = await world.db.execute(
        sql`select count(*)::int as n from quality_remarks where session_id = ${id}`,
      )
      return (r.rows?.[0] ?? (r as unknown as { n: number }[])[0]) as { n: number }
    }
    expect((await count()).n).toBeGreaterThan(0)
    await world.db.execute(sql`delete from ingestion_sessions where id = ${id}`)
    expect((await count()).n).toBe(0)
    const evaluations = await world.db.execute(
      sql`select count(*)::int as n from quality_evaluations where session_id = ${id}`,
    )
    expect(evaluations.rows?.[0] ?? (evaluations as unknown as { n: number }[])[0]).toMatchObject({
      n: 0,
    })
  })
})

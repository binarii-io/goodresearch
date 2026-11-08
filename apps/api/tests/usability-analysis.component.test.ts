import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { InMemoryDrive } from '../src/modules/ingestion/tests/fakes/in-memory-drive.ts'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }
const FOLDER = 'folder-usability-analysis'

const protocol = {
  framing: {
    objective: 'See whether people find and share a report',
    hypotheses: [],
    participants: 'Analysts',
    format: 'moderated-remote',
    sessionMinutes: 45,
    language: 'en',
    consent: 'The session is recorded and read by an AI service.',
    interface: { url: 'https://prototype.example.org', kind: 'prototype', description: null },
  },
  script: {
    introduction: 'Thank you.',
    thinkAloud: 'Please think aloud.',
    warmUp: [],
    debrief: ['What was hardest?'],
    closing: 'Thank you.',
  },
  scenario: 'You prepare the weekly review.',
  tasks: [
    {
      instruction: 'Find the report of last week',
      criterion: 'The report is open',
      startUrl: null,
      minutes: null,
    },
    {
      instruction: 'Share it with your manager',
      criterion: 'It is shared',
      startUrl: null,
      minutes: null,
    },
  ],
  questionnaire: 'none',
  easeQuestion: 'seq-v1',
}

describe('Usability test analysis (spec 038)', () => {
  let world: World
  let drive: InMemoryDrive
  let alex: Who
  let robin: Who
  let studyId: string
  let sessionId: string

  const call = (
    who: Who,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) =>
    world.app.inject({
      method,
      url,
      headers: { cookie: who.cookie },
      ...(payload ? { payload } : {}),
    })

  beforeAll(async () => {
    drive = new InMemoryDrive()
    drive.addFolder(FOLDER, 'Study folder', undefined, 'Alex')
    drive.share(FOLDER, 'alex@drive.example')
    drive.addFile('v-one', 'Test one - 2026/11/03 10:00 CET - Recording.mp4', FOLDER, 'video/mp4')
    const item = drive.items.get('v-one')
    if (item)
      drive.items.set('v-one', {
        ...item,
        modifiedTime: '2026-11-03T11:00:00Z',
        durationMs: 60_000,
        size: 4,
      })
    drive.bytes.set('v-one', new Uint8Array([0, 0, 0, 1]))
    world = await startWorld({
      drive,
      config: {
        GOOGLE_DRIVE_CLIENT_ID: 'id',
        GOOGLE_DRIVE_CLIENT_SECRET: 'secret',
        AI_FAKE_PROVIDER: 'true',
        AI_SHARED_PROVIDER: 'fake',
        AI_PRICES:
          '[{"model":"fake-model","from":"2026-01-01","inputPerMillion":2,"outputPerMillion":10},{"model":"fake-strong-model","from":"2026-01-01","inputPerMillion":4,"outputPerMillion":20}]',
      },
    })
    alex = await world.session('alex@example.org')
    robin = await world.session('robin@research.example.com')
    const team = await world.team('Research')
    await world.addMember(alex.id, team)
    const projectId = (
      await call(alex, 'POST', '/api/projects', { name: 'Reports', goal: 'Goal', teamId: team })
    ).json().id
    studyId = (
      await call(alex, 'POST', `/api/projects/${projectId}/studies`, {
        name: 'A test',
        type: 'usability-test',
      })
    ).json().id
    const saved = await call(alex, 'PUT', `/api/studies/${studyId}/protocol`, {
      content: protocol,
      version: null,
    })
    if (saved.statusCode !== 200) throw new Error(`protocol: ${saved.body}`)
    drive.nextConsentAccount = 'alex@drive.example'
    const start = await call(
      alex,
      'GET',
      `/api/sources/google-drive/connect?access=write&returnTo=/studies/${studyId}`,
    )
    const state = new URL(String(start.headers.location)).searchParams.get('state')
    await call(alex, 'GET', `/api/sources/google-drive/callback?state=${state}&code=ok`)
    await call(alex, 'PUT', `/api/studies/${studyId}/source`, {
      link: `https://drive.google.com/drive/folders/${FOLDER}`,
    })
    await world.runJobs()
    const fieldwork = (await call(alex, 'GET', `/api/studies/${studyId}/sessions`)).json()
    const s = fieldwork.sessions[0]
    sessionId = s.id
    const named = (
      await call(alex, 'PATCH', `/api/sessions/${s.id}`, {
        version: s.version,
        roster: [{ name: 'Casey Test', role: 'interviewee' }],
      })
    ).json()
    await call(alex, 'POST', `/api/sessions/${s.id}/decision`, {
      decision: 'validate',
      version: named.version,
    })
  })

  afterAll(async () => {
    await world?.close()
  })

  it('lists the ready session with its estimate, and asks for the consent before starting', async () => {
    const view = (await call(alex, 'GET', `/api/studies/${studyId}/usability/analysis`)).json()
    expect(view.sessions).toMatchObject([{ sessionId, readiness: 'ready', analysis: null }])
    expect(view.estimate.count).toBe(1)
    // One session's own estimate, for its own "Analyse" button: the study's when it is the only one.
    expect(view.sessions[0].estimate).toBeCloseTo(view.estimate.cost, 6)
    expect(view.provider).toEqual({ kind: 'fake', video: true })
    const refused = await call(alex, 'POST', `/api/studies/${studyId}/usability/analysis/runs`, {})
    expect(refused.json().code).toBe('ANALYSIS_CONSENT_REQUIRED')
  })

  it('analyses it in the worker: task results, checked observations, transcript, cost', async () => {
    // The session's own button: only this session.
    const started = await call(alex, 'POST', `/api/studies/${studyId}/usability/analysis/runs`, {
      sessionIds: [sessionId],
      consent: true,
    })
    expect(started.statusCode).toBe(200)
    await world.runJobs()
    const review = (await call(alex, 'GET', `/api/usability/sessions/${sessionId}`)).json()
    expect(review.analysis.state).toBe('done')
    expect(review.tasks.map((t: { result: { outcome: string } }) => t.result.outcome)).toEqual([
      'success',
      'partial',
    ])
    const texts = review.tasks.flatMap((t: { observations: { text: string }[] }) =>
      t.observations.map((o) => o.text),
    )
    // The invented quote never reaches the person (FR-006).
    expect(texts).not.toContain('Praises the product.')
    expect(texts).toContain('Looks for the export in the menu first.')
    const doubted = review.tasks[1].observations[0]
    expect(doubted).toMatchObject({ judge: 'not-confirmed', arbiter: 'kept', screenshot: true })
    expect(review.transcript.segments.length).toBeGreaterThan(3)
    expect(review.cost).toBeGreaterThan(0)
    const shot = await call(alex, 'GET', `/api/usability/observations/${doubted.id}/screenshot`)
    expect(shot.headers['content-type']).toBe('image/jpeg')
  })

  it('gives facts to decide after the analysis, decided with their observation (spec 039)', async () => {
    const review = (await call(alex, 'GET', `/api/usability/sessions/${sessionId}`)).json()
    const o = review.tasks[0].observations[0]
    const factOf = async (observationId: string) =>
      (
        await world.db.execute(
          sql`select f.source, f.status, f.statement_en, s.quote from evidence_facts f join evidence_usability_supports s on s.fact_id = f.id where s.observation_id = ${observationId}`,
        )
      ).rows[0]
    // The analysis made it, to decide.
    expect(await factOf(o.id)).toMatchObject({
      source: 'usability',
      status: 'proposed',
      statement_en: 'Looks for the export in the menu first.',
      quote: "where's the export?",
    })
    const accepted = await call(alex, 'POST', `/api/usability/observations/${o.id}/decision`, {
      action: 'accept',
      version: o.version,
    })
    expect(accepted.json().status).toBe('accepted')
    expect(await factOf(o.id)).toMatchObject({ status: 'accepted' })
    await call(alex, 'POST', `/api/usability/observations/${o.id}/decision`, {
      action: 'reject',
      version: accepted.json().version,
    })
    // Kept, as rejected: insights built on it read "not accepted", not "deleted".
    expect(await factOf(o.id)).toMatchObject({ status: 'rejected' })
  })

  it('lists and decides the facts like any study: board, decision, reopen, accept all (spec 039)', async () => {
    const board = async (status = 'all') =>
      (await call(alex, 'GET', `/api/studies/${studyId}/fact-board?status=${status}`)).json()
    const all = await board()
    expect(all.items.length).toBeGreaterThan(0)
    expect(all.items.every((f: { source: string }) => f.source === 'usability')).toBe(true)
    const toDecide = await board('to-decide')
    expect(toDecide.counts.toDecide).toBe(toDecide.items.length)
    const fact = toDecide.items[0]
    expect(fact).toMatchObject({
      status: 'to-decide',
      canDecide: true,
      evidence: { kind: 'observation' },
    })
    // Deciding the fact decides its observation (FR-007).
    const accepted = await call(alex, 'POST', `/api/facts/${fact.id}/decision`, {
      decision: 'accept',
      version: fact.version,
    })
    expect(accepted.statusCode).toBe(204)
    const review = (await call(alex, 'GET', `/api/usability/sessions/${sessionId}`)).json()
    const observations = [
      ...review.tasks.flatMap((t: { observations: unknown[] }) => t.observations),
      ...review.rejected,
    ] as { id: string; status: string }[]
    expect(observations.find((o) => o.id === fact.evidence.observationId)?.status).toBe('accepted')
    // A stale version is refused; reopen sends it back to decide.
    const now = (await board('accepted')).items.find((f: { id: string }) => f.id === fact.id)
    expect(
      (
        await call(alex, 'POST', `/api/facts/${fact.id}/decision`, {
          decision: 'reject',
          version: fact.version,
        })
      ).statusCode,
    ).toBe(409)
    expect(
      (
        await call(alex, 'POST', `/api/facts/${fact.id}/decision`, {
          decision: 'reopen',
          version: now.version,
        })
      ).statusCode,
    ).toBe(204)
    // Accept all the facts to decide shown, at their versions.
    const shown = (await board('to-decide')).items
    const bulk = await call(alex, 'POST', '/api/facts/accept', {
      facts: shown.map((f: { id: string; version: number }) => ({ id: f.id, version: f.version })),
    })
    expect(bulk.json()).toEqual({ done: shown.length, changed: 0 })
    expect((await board('to-decide')).counts.toDecide).toBe(0)
    // Outside the study's team: no list, no decision.
    expect(
      (await call(robin, 'GET', `/api/studies/${studyId}/fact-board`)).statusCode,
    ).toBeGreaterThanOrEqual(400)
    expect(
      (
        await call(robin, 'POST', `/api/facts/${fact.id}/decision`, {
          decision: 'reject',
          version: 1,
        })
      ).statusCode,
    ).toBe(404)
  })

  it('shows the results of decided items only, by task', async () => {
    const review = (await call(alex, 'GET', `/api/usability/sessions/${sessionId}`)).json()
    const result = review.tasks[0].result
    await call(alex, 'PUT', `/api/usability/task-results/${result.id}`, {
      outcome: 'success',
      version: result.version,
    })
    const results = (await call(alex, 'GET', `/api/studies/${studyId}/usability/results`)).json()
    expect(results.tasks[0]).toMatchObject({
      instruction: 'Find the report of last week',
      outcomes: { success: 1 },
    })
    expect(results.tasks[1].sessions).toBe(0)
    // Spec 039: the task's fact counts the decided outcome, with no session.
    const tasks = (
      await world.db.execute(
        sql`select f.session_id, f.status, f.statement_en, s.task_id, s.sessions from evidence_facts f join evidence_usability_supports s on s.fact_id = f.id where f.study_id = ${studyId} and s.task_id is not null`,
      )
    ).rows
    expect(tasks).toMatchObject([
      {
        session_id: null,
        status: 'proposed',
        sessions: 1,
        statement_en: expect.stringMatching(
          /^Task 1 — Find the report of last week: 1 success out of 1 session\.$/,
        ),
      },
    ])
  })

  it('is reserved to the team', async () => {
    expect(
      (await call(robin, 'GET', `/api/studies/${studyId}/usability/analysis`)).statusCode,
    ).toBeGreaterThanOrEqual(400)
    expect(
      (await call(robin, 'GET', `/api/usability/sessions/${sessionId}`)).statusCode,
    ).toBeGreaterThanOrEqual(400)
  })

  it('deletes the analysis with the study, and the sweep deletes its screenshots', async () => {
    expect(world.storage.objects.size).toBeGreaterThan(0)
    const { version } = (await call(alex, 'GET', `/api/studies/${studyId}`)).json()
    await call(alex, 'DELETE', `/api/studies/${studyId}?version=${version}`)
    const { sweep } = await import('../src/modules/usability/application/commands/analysis-run.ts')
    // Past the grace: the screenshots of a deleted study go.
    await sweep(world.modules.usability.handlers.deps, -60_000)
    expect(world.storage.objects.size).toBe(0)
  })
})

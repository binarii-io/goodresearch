import { beforeEach, describe, expect, it } from 'vitest'
import { session, World } from './fakes/world.ts'

const alice = { id: 'alice', role: 'member' as const }

describe('usability analysis runs (spec 038 US1)', () => {
  let world: World

  const start = (over: Record<string, unknown> = {}) =>
    world.run.start({ actor: alice, studyId: 'study', consent: true, ...over })

  beforeEach(() => {
    world = new World()
  })

  it('estimates before anything starts, and asks for the folder consent', async () => {
    const estimate = await world.run.estimate(alice, 'study')
    expect(estimate).toMatchObject({
      ok: true,
      value: { count: 1, minutes: 2, consentNeeded: true, readsVideo: true },
    })
    expect(world.ai.calls).toEqual([])
    expect(await start({ consent: false })).toEqual({
      ok: false,
      error: 'ANALYSIS_CONSENT_REQUIRED',
    })
  })

  it('refuses a provider that cannot read video, and another type of study', async () => {
    world.ai.provider = 'anthropic'
    expect(await start()).toEqual({ ok: false, error: 'USABILITY_NEEDS_VERTEX' })
    world.ai.provider = 'vertex'
    world.type = 'interviews'
    expect(await start()).toEqual({ ok: false, error: 'NOT_A_USABILITY_TEST_STUDY' })
  })

  it('analyses a ready session through every stage, and removes every copy', async () => {
    expect(await start()).toMatchObject({ ok: true })
    expect(await start()).toEqual({ ok: false, error: 'ANALYSIS_RUNNING' })
    await world.runJobs()
    const stages = world.ai.calls.map((c) => c.stage)
    expect(stages.slice(0, 5)).toEqual(['layout', 'transcript', 'screen-log', 'task-map', 'task'])
    expect(stages).toContain('judge')
    // FR-003: the copies exist only during the analysis.
    expect(world.stagedEver.length).toBeGreaterThan(0)
    expect(world.staged.size).toBe(0)
    expect(world.workdirs.open).toBe(0)
    const view = await world.queries.session(alice, 's1')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.protocolVersion).toBe(1)
    expect(view.value.tasks.map((t) => t.result?.outcome)).toEqual(['success', 'not-attempted'])
    // FR-006: the invented quote never reaches the person.
    const texts = view.value.tasks.flatMap((t) => t.observations.map((o) => o.text))
    expect(texts).toEqual(['Looks for the export in Settings', 'Finds it and says it was easy'])
    expect(view.value.tasks[0]?.observations.every((o) => o.screenshotKey !== null)).toBe(true)
    expect(view.value.transcript?.segments).toHaveLength(3)
    expect(world.ai.calls.every((c) => c.ref === 'usability-analysis:s1')).toBe(true)
  })

  it('stops a run whose worker died, so its sessions can be analysed again', async () => {
    await start()
    // The job started at 8:00, the worker stopped mid-analysis (a redeployment): no heartbeat since 9:00.
    const run = [...world.store.runs.values()][0]
    const analysis = [...world.store.analyses.values()][0]
    if (!run || !analysis) throw new Error('fixture')
    world.store.runs.set(run.id, {
      ...run,
      startedAt: new Date('2026-11-08T08:00:00Z'),
      heartbeatAt: new Date('2026-11-08T09:00:00Z'),
    })
    world.store.analyses.set(analysis.id, { ...analysis, state: 'analysing' })
    const { recoverStaleRuns } = await import('../application/commands/analysis-run.ts')
    await recoverStaleRuns(world.deps)
    const view = await world.queries.study(alice, 'study')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.sessions[0]?.analysis).toMatchObject({ state: 'stopped', failure: 'STOPPED' })
    expect(view.value.run).toBeNull()
    expect(await start()).toMatchObject({ ok: true })
  })

  it('leaves a run still queued to its job, however long it waits', async () => {
    await start()
    // Queued at 9:00 behind another study's long job: no heartbeat since its start, it never ran.
    const run = [...world.store.runs.values()][0]
    if (!run) throw new Error('fixture')
    const queuedAt = new Date('2026-11-08T09:00:00Z')
    world.store.runs.set(run.id, { ...run, startedAt: queuedAt, heartbeatAt: queuedAt })
    const { recoverStaleRuns } = await import('../application/commands/analysis-run.ts')
    await recoverStaleRuns(world.deps)
    expect(world.store.runs.get(run.id)?.state).toBe('running')
    expect([...world.store.analyses.values()][0]?.state).toBe('waiting')
  })

  it('leaves an analysed session as it was when the job cannot be queued', async () => {
    await start()
    await world.runJobs()
    world.queueRefuses = true
    expect(await start({ again: true })).toEqual({ ok: false, error: 'ANALYSIS_RUNNING' })
    const view = await world.queries.study(alice, 'study')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.sessions[0]?.analysis?.state).toBe('done')
    expect(view.value.run).toBeNull()
  })

  it('asks to connect the AI provider again when it refused the access, not a copy failure', async () => {
    const { ProviderAccessLost } = await import('../application/ports.ts')
    world.stagingRefuses = new ProviderAccessLost()
    await start()
    await world.runJobs()
    const view = await world.queries.study(alice, 'study')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.sessions[0]?.analysis).toMatchObject({
      state: 'failed',
      failure: 'AI_RECONNECT_REQUIRED',
    })
  })

  it('says the video is unreadable when Drive stops giving it in the middle of the copy', async () => {
    world.videoBreaks.add('v1')
    await start()
    await world.runJobs()
    const view = await world.queries.study(alice, 'study')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.sessions[0]?.analysis?.failure).toBe('VIDEO_UNREADABLE')
  })

  it('fails only the session whose reading of the session or protocol throws', async () => {
    const one = world.deps.sessions.one
    world.deps.sessions.one = async () => {
      throw new Error('database unavailable')
    }
    await start()
    await world.runJobs()
    world.deps.sessions.one = one
    const view = await world.queries.study(alice, 'study')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.sessions[0]?.analysis?.state).toBe('failed')
    expect(view.value.run).toBeNull()
  })

  it('removes the copies when the analysis fails, and goes on with the other sessions', async () => {
    world.sessions = [
      session(),
      session({
        sessionId: 's2',
        video: { fileId: 'v2', name: 'two.mp4', modifiedAt: null, size: 10, durationMs: 60_000 },
      }),
    ]
    world.missingVideo.add('v1')
    world.ai.failAt = null
    await start()
    await world.runJobs()
    const view = await world.queries.study(alice, 'study')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.sessions.map((s) => s.analysis?.state)).toEqual(['failed', 'done'])
    expect(view.value.sessions[0]?.analysis?.failure).toBe('VIDEO_UNREADABLE')
    world.ai.failAt = 'task'
    await world.run.start({ actor: alice, studyId: 'study', sessionIds: ['s2'], again: true })
    await world.runJobs()
    expect(world.staged.size).toBe(0)
    expect((await world.store.analysisOf('s2'))?.failure).toBe('AI_FAILED')
  })

  it('stops between stages when asked', async () => {
    const started = await start()
    if (!started.ok) throw new Error(started.error)
    await world.store.requestStop(started.value.runId)
    await world.runJobs()
    expect((await world.store.analysisOf('s1'))?.state).toBe('stopped')
    expect((await world.store.getRun(started.value.runId))?.state).toBe('stopped')
  })

  it('sends a doubt to the arbiter, and never rejects without contrary evidence', async () => {
    world.ai.judgeVerdict = 'rejected'
    world.ai.judgeContrary = null
    await start()
    await world.runJobs()
    const obs = [...world.store.observations.values()]
    expect(obs.every((o) => o.judge === 'not-confirmed' && o.arbiter === 'kept')).toBe(true)
    expect(world.ai.calls.filter((c) => c.stage === 'arbiter').length).toBe(obs.length)
  })

  it('freezes the protocol version and marks the analysis out of date when it changes', async () => {
    await start()
    await world.runJobs()
    world.sessions = [session({ protocolVersion: 2 })]
    const view = await world.queries.study(alice, 'study')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.sessions[0]?.analysis?.outOfDate).toBe(true)
  })

  it('keeps decided observations when the session is analysed again', async () => {
    await start()
    await world.runJobs()
    const first = [...world.store.observations.values()][0]
    if (!first) throw new Error('fixture')
    await world.observations.decide({
      actor: alice,
      observationId: first.id,
      decision: { action: 'accept' },
      version: 1,
    })
    await world.run.start({ actor: alice, studyId: 'study', again: true })
    await world.runJobs()
    const obs = [...world.store.observations.values()]
    expect(obs.filter((o) => o.text === first.text)).toHaveLength(1)
    expect(world.store.observations.get(first.id)?.status).toBe('accepted')
  })

  it('proposes the people from its transcript when the session has none (spec 037)', async () => {
    world.sessions = [session({ hasPeople: false, participant: null })]
    await start()
    await world.runJobs()
    expect(world.people[0]?.text).toContain("Participant: Hmm, where's the export?")
  })

  it('refuses another team, without anything started', async () => {
    expect(
      await world.run.start({ actor: { id: 'eve', role: 'member' }, studyId: 'study' }),
    ).toEqual({
      ok: false,
      error: 'STUDY_NOT_FOUND',
    })
  })
})

describe('reviewing observations (spec 038 US2, US3)', () => {
  let world: World

  beforeEach(async () => {
    world = new World()
    await world.run.start({ actor: alice, studyId: 'study', consent: true })
    await world.runJobs()
  })

  const first = () => {
    const o = [...world.store.observations.values()].find((x) => x.kind === 'difficulty')
    if (!o) throw new Error('fixture')
    return o
  }

  it('refuses to accept a statement naming a person, and leaves the observation to decide', async () => {
    const o = first()
    world.knownNames = ['Settings']
    expect(
      await world.observations.decide({
        actor: alice,
        observationId: o.id,
        decision: { action: 'accept' },
        version: 1,
      }),
    ).toEqual({ ok: false, error: 'NAME_IN_STATEMENT' })
    expect(world.store.observations.get(o.id)).toMatchObject({ status: 'proposed', version: 1 })
    // Its fact stays to decide, as the analysis made it (spec 039).
    expect(world.facts.get(o.id)?.status).toBe('proposed')
  })

  it('backfills the facts of sessions analysed before, and running it again changes nothing (spec 039)', async () => {
    const before = [...world.facts.keys()].sort()
    expect(before.length).toBeGreaterThan(0)
    world.facts.clear()
    const { backfillFacts } = await import('../application/commands/analysis-run.ts')
    await backfillFacts(world.deps)
    expect([...world.facts.keys()].sort()).toEqual(before)
    await backfillFacts(world.deps)
    expect([...world.facts.keys()].sort()).toEqual(before)
  })

  it('the analysis gives facts to decide; accepting and rejecting decide them, at the version seen (spec 039)', async () => {
    const o = first()
    expect(world.facts.get(o.id)).toMatchObject({ status: 'proposed', decidedBy: null })
    const accepted = await world.observations.decide({
      actor: alice,
      observationId: o.id,
      decision: { action: 'accept' },
      version: 1,
    })
    expect(accepted).toMatchObject({ ok: true, value: { status: 'accepted', version: 2 } })
    expect(world.facts.get(o.id)).toMatchObject({
      statement: 'Looks for the export in Settings',
      polarity: 'negative',
      theme: { id: 'task-1', title: 'Find the report of last week' },
      quote: "where's the export?",
      participant: 'Casey Test',
      origin: 'ai',
      status: 'accepted',
      decidedBy: 'alice',
    })
    expect(
      await world.observations.decide({
        actor: alice,
        observationId: o.id,
        decision: { action: 'reject' },
        version: 1,
      }),
    ).toEqual({ ok: false, error: 'VERSION_CONFLICT' })
    await world.observations.decide({
      actor: alice,
      observationId: o.id,
      decision: { action: 'reject' },
      version: 2,
    })
    expect(world.facts.get(o.id)?.status).toBe('rejected')
    await world.observations.decide({
      actor: alice,
      observationId: o.id,
      decision: { action: 'reopen' },
      version: 3,
    })
    expect(world.facts.get(o.id)?.status).toBe('proposed')
  })

  it('adds an observation by hand, accepted at once, and corrects a task outcome', async () => {
    const added = await world.observations.add({
      actor: alice,
      sessionId: 's1',
      kind: 'error',
      taskId: 'task-1',
      momentMs: 50_000,
      text: 'Clicks Export twice',
    })
    expect(added).toMatchObject({ ok: true, value: { origin: 'person', status: 'accepted' } })
    if (!added.ok) throw new Error(added.error)
    expect(world.facts.get(added.value.id)).toMatchObject({ status: 'accepted', origin: 'person' })
    expect(world.taskFacts).toEqual([])
    const result = [...world.store.tasks.values()].find((t) => t.taskId === 'task-1')
    if (!result) throw new Error('fixture')
    expect(
      await world.observations.correctTask({
        actor: alice,
        taskResultId: result.id,
        outcome: 'partial',
        version: 1,
      }),
    ).toMatchObject({ ok: true, value: { outcome: 'partial', status: 'edited' } })
    // Spec 039: the task's fact counts the decided outcome.
    expect(world.taskFacts).toMatchObject([
      {
        task: { id: 'task-1', index: 1, instruction: 'Find the report of last week' },
        outcomes: { success: 0, partial: 1, failure: 0, notAttempted: 0 },
      },
    ])
  })

  it('counts only decided items in the study results', async () => {
    let results = await world.queries.results(alice, 'study')
    if (!results.ok) throw new Error(results.error)
    expect(results.value.tasks[0]?.outcomes.success).toBe(0)
    expect(results.value.toReview).toBeGreaterThan(0)
    const r = [...world.store.tasks.values()].find((t) => t.taskId === 'task-1')
    if (!r) throw new Error('fixture')
    await world.observations.correctTask({
      actor: alice,
      taskResultId: r.id,
      outcome: 'success',
      version: 1,
    })
    await world.observations.decide({
      actor: alice,
      observationId: first().id,
      decision: { action: 'accept' },
      version: 1,
    })
    results = await world.queries.results(alice, 'study')
    if (!results.ok) throw new Error(results.error)
    expect(results.value.tasks[0]).toMatchObject({
      instruction: 'Find the report of last week',
      outcomes: { success: 1 },
      difficulties: [{ text: 'Looks for the export in Settings', sessions: 1 }],
    })
  })

  it('deletes the screenshots nothing refers to, once past the grace a running analysis needs', async () => {
    const before = world.stored.size
    expect(before).toBeGreaterThan(0)
    for (const o of [...world.store.observations.values()]) world.store.observations.delete(o.id)
    const { sweep } = await import('../application/commands/analysis-run.ts')
    // Just stored, as by an analysis that has not saved its observations yet: kept.
    expect(await sweep(world.deps)).toBe(0)
    expect(world.stored.size).toBe(before)
    expect(await sweep(world.deps, -1)).toBe(before)
    expect(world.stored.size).toBe(0)
  })
})

describe('what the model finds, kept inside what the app can store (spec 038 FR-006)', () => {
  it('moves a moment before the video to its start and clears SUS values off SUS answers', async () => {
    const { checkFound } = await import('../application/pipeline/run-session.ts')
    const kept = checkFound(
      [
        {
          kind: 'difficulty',
          momentMs: -2000,
          text: 'Hesitates on the first screen.',
          quote: null,
          seen: null,
          susItem: 0,
          susValue: 9,
        },
      ],
      { startMs: 5000, endMs: 60_000 },
      [],
    )
    expect(kept).toMatchObject([{ momentMs: 0, susItem: null, susValue: null }])
  })
})

describe("the gateway's refusals as the analysis names them", () => {
  it('turns a refused access into a reconnection, a missing provider into its own', async () => {
    const { providerError } = await import('../infrastructure/provider-error.ts')
    const { AiProviderRequired, ProviderCallError } = await import('../../ai-gateway/index.ts')
    const { ProviderAccessLost, ProviderMissing } = await import('../application/ports.ts')
    expect(providerError(new ProviderCallError('INVALID_CREDENTIAL'))).toBeInstanceOf(
      ProviderAccessLost,
    )
    expect(providerError(new AiProviderRequired())).toBeInstanceOf(ProviderMissing)
    // A missing role or a disabled API is not fixed by reconnecting.
    const denied = new ProviderCallError('PERMISSION_DENIED')
    expect(providerError(denied)).toBe(denied)
  })

  it('reaches the staging: a refused grant on the bucket token asks to reconnect', async () => {
    const { createGcsStaging } = await import('../infrastructure/staging.gcs.ts')
    const { ProviderCallError } = await import('../../ai-gateway/index.ts')
    const { ProviderAccessLost, ProviderMissing } = await import('../application/ports.ts')
    const refused = createGcsStaging({
      googleAccessFor: async () => {
        throw new ProviderCallError('INVALID_CREDENTIAL', null, 'reauth-required')
      },
      providerOf: async () => 'vertex',
      bucket: null,
    })
    const bytes = async function* () {
      yield new Uint8Array([1])
    }
    await expect(refused.put('ada', 'v.mp4', 'video/mp4', bytes(), 1)).rejects.toBeInstanceOf(
      ProviderAccessLost,
    )
    const none = createGcsStaging({
      googleAccessFor: async () => null,
      providerOf: async () => null,
      bucket: null,
    })
    await expect(none.put('ada', 'v.mp4', 'video/mp4', bytes(), 1)).rejects.toBeInstanceOf(
      ProviderMissing,
    )
  })
})

describe('the staging copy, never whole in memory (ADR-0013 update)', () => {
  it('sends the bytes as they come by parts of a resumable upload, then gives ffmpeg an https source', async () => {
    const { createGcsStaging } = await import('../infrastructure/staging.gcs.ts')
    const calls: { method: string; url: string; range: string | null; size: number }[] = []
    // Google keeps only two bytes of the second part once: the rest is sent again.
    let stored = 0
    let short = true
    const fake = (async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      const size = init?.body instanceof Uint8Array ? init.body.byteLength : 0
      calls.push({ method: init?.method ?? 'GET', url, range: headers.get('content-range'), size })
      if (url.includes('/storage/v1/b/') && (init?.method ?? 'GET') === 'GET')
        return new Response('{}', { status: 200 })
      if (url.includes('uploadType=resumable'))
        return new Response(null, { status: 200, headers: { location: 'https://upload/session' } })
      if (url === 'https://upload/session') {
        const last = !headers.get('content-range')?.endsWith('/*')
        if (last) return new Response(null, { status: 200 })
        stored += short && stored === 4 ? 2 : size
        if (stored === 6) short = false
        return new Response(null, { status: 308, headers: { range: `bytes=0-${stored - 1}` } })
      }
      return new Response(null, { status: 404 })
    }) as typeof fetch
    const staging = createGcsStaging({
      googleAccessFor: async () => ({ project: 'p', region: 'eu', accessToken: 'token' }),
      providerOf: async () => 'vertex',
      bucket: 'bucket',
      fetch: fake,
      partBytes: 4,
    })
    const chunks = async function* () {
      yield new Uint8Array([1, 2, 3])
      yield new Uint8Array([4, 5, 6, 7, 8, 9])
      yield new Uint8Array([10])
    }
    const file = await staging.put('ada', 'a1/video.mp4', 'video/mp4', chunks(), 10)
    expect(file.uri).toBe('gs://bucket/usability/a1/video.mp4')
    const parts = calls.filter((c) => c.url === 'https://upload/session')
    expect(parts.map((p) => [p.range, p.size])).toEqual([
      ['bytes 0-3/*', 4],
      ['bytes 4-7/*', 4],
      ['bytes 6-7/*', 2],
      ['bytes 8-9/10', 2],
    ])
    expect(await staging.source('ada', file)).toEqual({
      input: 'https://storage.googleapis.com/bucket/usability/a1/video.mp4',
      headers: { Authorization: 'Bearer token' },
    })
  })
})

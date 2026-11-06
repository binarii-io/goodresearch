import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ModelRunner } from '../src/modules/ai-gateway/application/ports.ts'
import { createFakeRunner } from '../src/modules/ai-gateway/infrastructure/fake.model-runner.ts'
import { InMemoryDrive } from '../src/modules/ingestion/tests/fakes/in-memory-drive.ts'
import { researchStudies } from '../src/modules/research/infrastructure/schema.ts'
import type { LexiconTerm } from '../src/modules/transcripts/domain/lexicon-term.ts'
import { countOccurrences } from '../src/modules/transcripts/domain/occurrences.ts'
import { createTranscriptsStore } from '../src/modules/transcripts/infrastructure/transcripts.drizzle-store.ts'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }

/** Made-up interviews of a large study: 57 interviews of 251 turns, 438 terms in the lexicon. */
const INTERVIEWS = 57
const TURNS = 251
const TERMS = 438
const SMALL = 6

const random = (seed: number) => {
  let state = seed
  return (max: number) => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return state % max
  }
}
const pick = random(11)
const vocabulary = Array.from({ length: 3000 }, (_, i) => `word${i}`)
// Common English words between the made-up ones, so that the transcripts read as English.
const common = ['the', 'and', 'we', 'it', 'is', 'that', 'with', 'for', 'our', 'you']
const turn = (speaker: string) =>
  `${speaker}: ${Array.from({ length: 40 }, (_, k) => (k % 2 ? common[pick(10)] : vocabulary[pick(3000)])).join(' ')}`
const text = (i: number) =>
  Array.from({ length: TURNS }, (_, j) => turn(j % 2 ? `Person Number${i}` : 'Alex Martin')).join(
    '\n',
  )

/**
 * Counts every query sent to PostgreSQL and adds a round trip to each, as a database reached
 * through a network does (the deployed instance reaches its database through a VPC connector).
 */
const meter = (pool: pg.Pool, roundTripMs: number) => {
  let queries = 0
  const delay = () => new Promise((resolve) => setTimeout(resolve, roundTripMs))
  const wrap = (target: { query: (...args: never[]) => unknown }) => {
    const original = target.query.bind(target) as (...args: unknown[]) => Promise<unknown>
    ;(target as { query: unknown }).query = async (...args: unknown[]) => {
      queries++
      await delay()
      return original(...args)
    }
  }
  // Queries through the pool check out a client: counting on clients counts each query once.
  const meteredClient = (client: pg.PoolClient) => {
    if (!(client as { metered?: boolean }).metered) {
      wrap(client as never)
      ;(client as { metered?: boolean }).metered = true
    }
    return client
  }
  const connect = pool.connect.bind(pool) as (...args: unknown[]) => unknown
  ;(pool as { connect: unknown }).connect = (...args: unknown[]) => {
    const callback = args[0]
    if (typeof callback === 'function')
      return connect((error: unknown, client: pg.PoolClient, done: unknown) =>
        callback(error, client ? meteredClient(client) : client, done),
      )
    return (connect() as Promise<pg.PoolClient>).then(meteredClient)
  }
  return {
    reset: () => {
      queries = 0
    },
    count: () => queries,
  }
}

describe('Study pages of a large study (spec 032)', () => {
  let world: World
  let alex: Who
  let studyId: string
  /** The same study with few interviews: a page must read it as many times as the large one. */
  let smallStudyId: string
  let drive: InMemoryDrive
  let projectId: string
  let metered: ReturnType<typeof meter>
  const fake = createFakeRunner()
  const runner: ModelRunner = {
    generateText: (c, m, r, t) => fake.generateText(c, m, r, t),
    generateObject: (c, m, r, t) => fake.generateObject(c, m, r, t),
    stream: (c, m, r, t) => fake.stream(c, m, r, t),
  }
  const call = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    world.app.inject({
      method,
      url,
      headers: { cookie: alex.cookie },
      ...(payload ? { payload } : {}),
    })

  /** Queries and time of one page, with a 3 ms round trip per query. */
  const measure = async (url: string) => {
    metered.reset()
    const started = performance.now()
    const res = await call('GET', url)
    return {
      status: res.statusCode,
      queries: metered.count(),
      ms: Math.round(performance.now() - started),
      bytes: res.body.length,
    }
  }

  /** A study on its own folder, its interviews validated and read once (transcripts imported). */
  const studyWith = async (folder: string, count: number) => {
    drive.addFolder(folder, folder, undefined, 'Alex')
    for (let i = 0; i < count; i++) {
      drive.addFile(`${folder}-${i}`, `interview-${i}.txt`, folder, 'text/plain')
      drive.texts.set(`${folder}-${i}`, text(i))
    }
    drive.share(folder, 'alex@drive.example')
    const id = (
      await call('POST', `/api/projects/${projectId}/studies`, { name: folder, type: 'interviews' })
    ).json<{ id: string }>().id
    await call('PUT', `/api/studies/${id}/source`, { link: folder })
    await world.runJobs()
    const sessions = (await call('GET', `/api/studies/${id}/sessions`)).json<{
      sessions: { id: string; version: number }[]
    }>().sessions
    for (const x of sessions)
      await call('POST', `/api/sessions/${x.id}/decision`, {
        decision: 'validate',
        version: x.version,
      })
    await call('POST', `/api/studies/${id}/lexicon-runs`, { consent: true })
    await world.runJobs()
    return id
  }

  beforeAll(async () => {
    drive = new InMemoryDrive()
    world = await startWorld({
      drive,
      runner,
      config: {
        GOOGLE_DRIVE_CLIENT_ID: 'id',
        GOOGLE_DRIVE_CLIENT_SECRET: 'secret',
        AI_PROVIDERS: '',
        AI_FAKE_PROVIDER: 'true',
      },
    })
    alex = await world.session('alex@example.org', 'Alex Martin')
    const teamId = await world.team('Research')
    await world.addMember(alex.id, teamId)
    await call('PUT', '/api/ai-provider/api-key', { provider: 'fake', apiKey: 'test-ok-k' })
    projectId = (await call('POST', '/api/projects', { name: 'P', teamId })).json<{
      id: string
    }>().id
    drive.nextConsentAccount = 'alex@drive.example'
    const start = await call('GET', '/api/sources/google-drive/connect?returnTo=/&access=read')
    const state = new URL(String(start.headers.location)).searchParams.get('state')
    await call('GET', `/api/sources/google-drive/callback?state=${state}&code=granted`)

    studyId = await studyWith('folder-large-study', INTERVIEWS)
    smallStudyId = await studyWith('folder-small-study', SMALL)
    const store = createTranscriptsStore(world.db)
    const now = new Date()
    for (let i = 0; i < TERMS; i++) {
      const term: LexiconTerm = {
        id: randomUUID(),
        teamId,
        language: 'en',
        form: `Word${i * 5}`,
        kind: i % 4 ? 'domain' : 'suspect',
        correction: i % 4 ? null : `Fixed${i}`,
        category: 'product',
        definition: null,
        scope: i % 2 ? 'global' : 'case-by-case',
        scopeDecided: true,
        status: i % 3 ? 'accepted' : 'proposed',
        mergedInto: null,
        origin: 'ai',
        quote: null,
        variants: [
          { spelling: `word${i * 5}`, status: 'accepted', origin: 'ai' },
          { spelling: `word${i * 5 + 1} word${i * 5 + 2}`, status: 'proposed', origin: 'ai' },
        ],
        decidedBy: null,
        decidedAt: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      }
      await store.insertTerm(term)
    }
    // The occurrences of every term, counted as a reading does; both studies anonymised.
    for (const id of [studyId, smallStudyId]) {
      await store.replaceOccurrences(
        id,
        countOccurrences(
          (await store.transcriptsOf(id)).map((t) => ({
            sessionId: t.sessionId,
            language: t.language,
            segments: t.segments,
          })),
          await store.teamTerms(teamId),
        ),
      )
      await world.db
        .update(researchStudies)
        .set({ anonymised: true })
        .where(eq(researchStudies.id, id))
    }
    metered = meter((world.db as unknown as { $client: pg.Pool }).$client, 3)
  }, 600_000)

  afterAll(async () => {
    await world?.close()
  })

  const PAGES = ['quality', 'facts-analysis', 'cleaning', 'lexicon?status=to-decide&kind=suspect']

  it('reads a large study as many times as a small one, each page within a bound', async () => {
    for (const page of PAGES) {
      const large = await measure(`/api/studies/${studyId}/${page}`)
      const small = await measure(`/api/studies/${smallStudyId}/${page}`)
      console.log(`${page}: ${JSON.stringify({ large, small })}`)
      expect(large.status).toBe(200)
      // Before spec 032: 1 138 queries for Quality, 1 050 for Analysis, 207 for Cleaning.
      expect(large.queries).toBe(small.queries)
      expect(large.queries).toBeLessThan(100)
    }
    // Before spec 032 the list carried three quotes per interview of every term: 3 MB here; the
    // counts per interview remain (about 0.4 MB for 50 terms in 57 interviews).
    const list = await measure(`/api/studies/${studyId}/lexicon?status=all`)
    expect(list.bytes).toBeLessThan(500_000)
  }, 600_000)

  it('gives the same analysed texts read together as read one by one', async () => {
    const sessions = (await call('GET', `/api/studies/${studyId}/sessions`)).json<{
      sessions: { id: string }[]
    }>().sessions
    const ids = sessions.map((x) => x.id)
    const together = await world.modules.transcripts.analysedTexts(
      alex.id,
      studyId,
      ids,
      'with-corrections',
    )
    for (const id of ids)
      expect(together.get(id)).toEqual(
        await world.modules.transcripts.analysedText(alex.id, studyId, id, 'with-corrections'),
      )
    expect([...together.values()].every((t) => typeof t !== 'string')).toBe(true)
  }, 600_000)
})

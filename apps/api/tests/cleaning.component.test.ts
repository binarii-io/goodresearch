import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ModelRunner } from '../src/modules/ai-gateway/application/ports.ts'
import { createFakeRunner } from '../src/modules/ai-gateway/infrastructure/fake.model-runner.ts'
import { InMemoryDrive } from '../src/modules/ingestion/tests/fakes/in-memory-drive.ts'
import {
  transcriptsCorrections,
  transcriptsVerdicts,
} from '../src/modules/transcripts/infrastructure/schema.ts'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }
type Correction = {
  key: string
  original: string
  replacement: string
  source: string
  status: string
  version: number | null
}
type Review = {
  fingerprint: string
  turns: { id: string; text: string; corrections: Correction[] }[]
  counts: { toDecide: number }
}
type CleaningView = {
  interviews: {
    sessionId: string
    title: string
    state: string
    toDecide: number
    cost: number | null
  }[]
  run: { finished: boolean; leftOut: number } | null
  lastRunCost: number | null
  cost: number | null
  consentNeeded: boolean
}

const TEXTS: Record<string, string> = {
  'c-one': [
    'Alex Martin: Thanks for joining, Sam Example. How do you plan the week?',
    'Sam Example: We use Goodresearch every day, after the eating with the team.',
  ].join('\n'),
  'c-two': [
    'Alex Martin: And then?',
    'Casey Test: My team tried Gooresearch too, and Alex Martin liked it.',
  ].join('\n'),
}

describe('Cleaning the transcripts on PostgreSQL (spec 011)', () => {
  let world: World
  let drive: InMemoryDrive
  let alex: Who
  let zoe: Who
  let studyId: string
  const sent: string[] = []
  const fake = createFakeRunner()
  const runner: ModelRunner = {
    generateText: (c, m, r, t) => fake.generateText(c, m, r, t),
    generateObject: (c, m, r, t) => {
      sent.push(JSON.stringify(r))
      return fake.generateObject(c, m, r, t)
    },
    stream: (c, m, r, t) => fake.stream(c, m, r, t),
  }

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

  const connectDrive = async (who: Who, account: string, access: 'read' | 'write') => {
    drive.nextConsentAccount = account
    const start = await call(
      who,
      'GET',
      `/api/sources/google-drive/connect?returnTo=/&access=${access}`,
    )
    const state = new URL(String(start.headers.location)).searchParams.get('state')
    await call(who, 'GET', `/api/sources/google-drive/callback?state=${state}&code=granted`)
  }

  const view = async () =>
    (await call(alex, 'GET', `/api/studies/${studyId}/cleaning`)).json<CleaningView>()
  const sessionOf = async (title: RegExp) => {
    const found = (await view()).interviews.find((i) => title.test(i.title))
    if (!found) throw new Error(`no interview ${title}`)
    return found.sessionId
  }
  const review = async (sessionId: string) =>
    (
      await call(
        alex,
        'GET',
        `/api/studies/${studyId}/cleaning/${sessionId}?status=all&onlyCorrected=false`,
      )
    ).json<Review>()
  const corrections = async (sessionId: string) =>
    (await review(sessionId)).turns.flatMap((t) => t.corrections)

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
        AI_PRICES:
          '[{"model":"fake-model","from":"2026-01-01","inputPerMillion":2,"outputPerMillion":10}]',
      },
    })
    alex = await world.session('alex@example.org', 'Alex Martin')
    zoe = await world.session('zoe@research.example.com', 'Zoe Stone')
    const teamId = await world.team('Research')
    await world.addMember(alex.id, teamId)
    await world.addMember(zoe.id, teamId)
    for (const who of [alex, zoe])
      await call(who, 'PUT', '/api/ai-provider/api-key', { provider: 'fake', apiKey: 'test-ok-k' })
    const projectId = (await call(alex, 'POST', '/api/projects', { name: 'P', teamId })).json<{
      id: string
    }>().id
    await connectDrive(alex, 'alex@drive.example', 'read')
    await connectDrive(zoe, 'zoe@drive.example', 'read')
    drive.addFolder('folder-cleaning', 'folder-cleaning', undefined, 'Alex')
    for (const [id, text] of Object.entries(TEXTS)) {
      drive.addFile(id, `${id}.txt`, 'folder-cleaning', 'text/plain')
      drive.texts.set(id, text)
    }
    drive.share('folder-cleaning', 'alex@drive.example')
    drive.share('folder-cleaning', 'zoe@drive.example')
    studyId = (
      await call(alex, 'POST', `/api/projects/${projectId}/studies`, {
        name: 'Cleaning',
        type: 'interviews',
      })
    ).json<{ id: string }>().id
    await call(alex, 'PUT', `/api/studies/${studyId}/source`, { link: 'folder-cleaning' })
    await world.runJobs()
    const sessions = (await call(alex, 'GET', `/api/studies/${studyId}/sessions`)).json<{
      sessions: { id: string; version: number }[]
    }>().sessions
    for (const s of sessions)
      await call(alex, 'POST', `/api/sessions/${s.id}/decision`, {
        decision: 'validate',
        version: s.version,
      })
    // The lexicon: "Goodresearch" accepted (everywhere).
    await call(alex, 'POST', `/api/studies/${studyId}/lexicon-runs`, { consent: true })
    await world.runJobs()
    const terms = (await call(alex, 'GET', `/api/studies/${studyId}/lexicon?status=all`)).json<{
      terms: { id: string; version: number; form: string }[]
    }>().terms
    const good = terms.find((t) => t.form === 'Goodresearch')
    if (!good) throw new Error('no term')
    await call(alex, 'PATCH', `/api/studies/${studyId}/lexicon/terms/${good.id}`, {
      version: good.version,
      decision: 'accept',
    })
  })

  afterAll(async () => {
    await world?.close()
  })

  it('cleans with the lexicon only, and runs one Enrichment step at a time (research R6)', async () => {
    const started = await call(alex, 'POST', `/api/studies/${studyId}/cleaning-runs`, {
      mode: 'lexicon',
      all: false,
      consent: false,
    })
    expect(started.statusCode).toBe(202)
    // The cleaning is not run yet: a reading waits.
    expect(
      (
        await call(alex, 'POST', `/api/studies/${studyId}/lexicon-runs`, {
          consent: true,
          all: true,
        })
      ).json<{
        code: string
      }>().code,
    ).toBe('ENRICHMENT_RUNNING')
    await world.runJobs()
    const two = await sessionOf(/c-two/)
    expect(
      (await corrections(two)).map((c) => [c.original, c.replacement, c.source, c.status]),
    ).toEqual([['Gooresearch', 'Goodresearch', 'lexicon', 'accepted']])
    expect((await view()).lastRunCost).toBe(0)
  })

  it('cleans with the AI after its own consent, with no known name sent (SC-002, SC-003)', async () => {
    expect(
      (
        await call(zoe, 'POST', `/api/studies/${studyId}/cleaning-runs`, {
          mode: 'ai',
          all: true,
          consent: false,
        })
      ).json<{ code: string }>().code,
    ).toBe('CLEANING_CONSENT_REQUIRED')
    sent.length = 0
    expect(
      (
        await call(zoe, 'POST', `/api/studies/${studyId}/cleaning-runs`, {
          mode: 'ai',
          all: true,
          consent: true,
        })
      ).statusCode,
    ).toBe(202)
    await world.runJobs()
    const one = await sessionOf(/c-one/)
    const found = await corrections(one)
    expect(found.find((c) => c.original === 'eating')).toMatchObject({
      replacement: 'meeting',
      source: 'ai-other',
      status: 'proposed',
    })
    const requests = sent.filter((r) => r.includes('<turns>'))
    expect(requests).toHaveLength(2)
    expect(requests.join('\n')).not.toMatch(/Alex Martin|Sam Example|Casey Test/)
    expect(requests.join('\n')).toContain('[Person')
    const v = await view()
    expect(v.run).toMatchObject({ finished: true, leftOut: 4 })
    // Zoe ran it; Alex sees its cost: two calls of 6,000 tokens in, 300 out, at $2 and $10.
    expect(v.lastRunCost).toBeCloseTo((2 * (6000 * 2 + 300 * 10)) / 1_000_000, 8)
    expect(v.cost).toBeCloseTo(v.lastRunCost ?? 0, 8)
    // Each interview shows its own part: one call each here.
    for (const i of v.interviews) expect(i.cost).toBeCloseTo((6000 * 2 + 300 * 10) / 1_000_000, 8)
  })

  it('writes the verdict of a lexicon correction (FR-010)', async () => {
    const two = await sessionOf(/c-two/)
    const lex = (await corrections(two)).find((c) => c.source === 'lexicon')
    if (!lex) throw new Error('missing')
    const res = await call(
      alex,
      'PUT',
      `/api/studies/${studyId}/cleaning/${two}/corrections/${encodeURIComponent(lex.key)}`,
      {
        decision: 'reject',
      },
    )
    expect(res.statusCode).toBe(204)
    const rows = await world.db
      .select()
      .from(transcriptsVerdicts)
      .where(eq(transcriptsVerdicts.sessionId, two))
    expect(rows.map((r) => r.verdict)).toEqual(['no'])
    expect((await corrections(two)).find((c) => c.key === lex.key)?.status).toBe('rejected')
  })

  it('validates, then publishes once to a subfolder, never writing the original (SC-008)', async () => {
    const one = await sessionOf(/c-one/)
    const first = await review(one)
    const keys = first.turns
      .flatMap((t) => t.corrections)
      .filter((c) => c.status === 'proposed')
      .map((c) => c.key)
    await call(alex, 'POST', `/api/studies/${studyId}/cleaning/${one}/decisions`, {
      decision: 'accept',
      keys,
    })
    const ready = await review(one)
    expect(ready.counts.toDecide).toBe(0)
    expect(
      (
        await call(alex, 'POST', `/api/studies/${studyId}/cleaning/${one}/versions`, {
          fingerprint: ready.fingerprint,
        })
      ).statusCode,
    ).toBe(201)
    const before = drive.documents.files.size
    expect(
      (
        await call(alex, 'POST', `/api/studies/${studyId}/cleaning/${one}/publish`, {
          overwrite: false,
          language: 'en',
        })
      ).json<{ code: string }>().code,
    ).toBe('DRIVE_WRITE_REQUIRED')
    await connectDrive(alex, 'alex@drive.example', 'write')
    for (let i = 0; i < 2; i++)
      expect(
        (
          await call(alex, 'POST', `/api/studies/${studyId}/cleaning/${one}/publish`, {
            overwrite: false,
            language: 'en',
          })
        ).statusCode,
      ).toBe(200)
    // One folder and one document: published twice, created once.
    expect(drive.documents.files.size).toBe(before + 2)
    const doc = [...drive.documents.files.values()].find((f) => f.doc)
    expect(doc?.name).toMatch(/– clean$/)
    expect(doc?.doc?.blocks.map((b) => b.text).join('\n')).toContain(
      'after the meeting with the team',
    )
    // The original transcript is never written: its revision has not moved.
    const original = drive.documents.files.get('c-one')
    expect(original?.revision ?? 1).toBe(1)
    expect(original?.doc).toBeUndefined()
    expect((await view()).interviews.find((i) => i.sessionId === one)?.state).toBe('published')
  })

  it('goes with the interviews when the folder is detached', async () => {
    expect((await call(alex, 'DELETE', `/api/studies/${studyId}/source`)).statusCode).toBe(204)
    const rows = await world.db.select().from(transcriptsCorrections)
    expect(rows).toEqual([])
  })
})

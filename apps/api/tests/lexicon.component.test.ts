import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ModelRunner } from '../src/modules/ai-gateway/application/ports.ts'
import { createFakeRunner } from '../src/modules/ai-gateway/infrastructure/fake.model-runner.ts'
import { ingestionSessions } from '../src/modules/ingestion/infrastructure/schema.ts'
import { InMemoryDrive } from '../src/modules/ingestion/tests/fakes/in-memory-drive.ts'
import {
  transcriptsOccurrences,
  transcriptsTranscripts,
} from '../src/modules/transcripts/infrastructure/schema.ts'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }
type Term = {
  id: string
  version: number
  form: string
  status: string
  category: string
  variants: { spelling: string; status: string }[]
  occurrences: {
    sessionId: string
    count: number
    yes: number
    no: number
    unsure: number
    quotes: {
      before: string
      match: string
      after: string
      segmentId: string
      offset: number
      verdict: string | null
    }[]
  }[]
  otherStudies: number
}
type EnrichmentView = {
  interviews: { sessionId: string; state: string; toDecide: number }[]
  toValidate: number
  counts: { read: number; toDecide: number; accepted: number }
  run: { phase: string; total: number; done: number } | null
  lastRunCost: number | null
  cost: number | null
  consentNeeded: boolean
}

const TEXTS: Record<string, string> = {
  't-one': [
    'Alex Martin: Thanks for joining, Sam Example. How do you plan the week?',
    'Sam Example: We use Goodresearch every day, and our NPS went up. Mmhmm.',
  ].join('\n'),
  't-two': [
    'Alex Martin: And then?',
    'Casey Test: My team tried Gooresearch too, and Alex Martin liked the NPS. Mmhmm.',
  ].join('\n'),
  't-three': [
    'Alex Martin: Anything else?',
    'Robin Sample: Mmhmm, not really, we do not use it, but the team uses Goodresearch and that is it.',
  ].join('\n'),
}

describe('The team lexicon on PostgreSQL (spec 010)', () => {
  let world: World
  let drive: InMemoryDrive
  let alex: Who
  let zoe: Who
  let teamId: string
  let projectId: string
  let studyId: string
  /** Every structured request sent to the AI provider, to check what leaves the app (SC-002). */
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
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    url: string,
    payload?: object,
  ) =>
    world.app.inject({
      method,
      url,
      headers: { cookie: who.cookie },
      ...(payload ? { payload } : {}),
    })

  const enrichment = async (study = studyId, who = alex) =>
    (await call(who, 'GET', `/api/studies/${study}/enrichment`)).json<EnrichmentView>()

  const lexicon = async (study = studyId, status = 'all') =>
    (await call(alex, 'GET', `/api/studies/${study}/lexicon?status=${status}`)).json<{
      terms: Term[]
    }>().terms

  const connectDrive = async (who: Who, account: string) => {
    drive.nextConsentAccount = account
    const start = await call(who, 'GET', '/api/sources/google-drive/connect?returnTo=/&access=read')
    const state = new URL(String(start.headers.location)).searchParams.get('state')
    await call(who, 'GET', `/api/sources/google-drive/callback?state=${state}&code=granted`)
  }

  /** A study of the project on its own folder, its interviews validated. */
  const studyWith = async (folder: string, files: Record<string, string>, project = projectId) => {
    drive.addFolder(folder, folder, undefined, 'Alex')
    for (const [id, text] of Object.entries(files)) {
      drive.addFile(id, `${id}.txt`, folder, 'text/plain')
      drive.texts.set(id, text)
    }
    drive.share(folder, 'alex@drive.example')
    drive.share(folder, 'zoe@drive.example')
    const id = (
      await call(alex, 'POST', `/api/projects/${project}/studies`, {
        name: folder,
        type: 'interviews',
      })
    ).json<{ id: string }>().id
    await call(alex, 'PUT', `/api/studies/${id}/source`, { link: folder })
    await world.runJobs()
    const sessions = (await call(alex, 'GET', `/api/studies/${id}/sessions`)).json<{
      sessions: { id: string; version: number }[]
    }>().sessions
    for (const s of sessions)
      await call(alex, 'POST', `/api/sessions/${s.id}/decision`, {
        decision: 'validate',
        version: s.version,
      })
    return id
  }

  const read = async (who: Who, study = studyId, body: object = { consent: true }) => {
    const res = await call(who, 'POST', `/api/studies/${study}/lexicon-runs`, body)
    await world.runJobs()
    return res
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
        AI_PRICES:
          '[{"model":"fake-model","from":"2026-01-01","inputPerMillion":2,"outputPerMillion":10}]',
      },
    })
    alex = await world.session('alex@example.org', 'Alex Martin')
    zoe = await world.session('zoe@research.example.com', 'Zoe Stone')
    teamId = await world.team('Research')
    await world.addMember(alex.id, teamId)
    await world.addMember(zoe.id, teamId)
    for (const who of [alex, zoe])
      await call(who, 'PUT', '/api/ai-provider/api-key', { provider: 'fake', apiKey: 'test-ok-k' })
    projectId = (await call(alex, 'POST', '/api/projects', { name: 'P', teamId })).json<{
      id: string
    }>().id
    await connectDrive(alex, 'alex@drive.example')
    await connectDrive(zoe, 'zoe@drive.example')
    studyId = await studyWith('folder-lexicon', TEXTS)
  })

  afterAll(async () => {
    await world?.close()
  })

  it('lists the validated interviews, not read yet, and asks consent before reading', async () => {
    const view = await enrichment()
    expect(view.interviews.map((i) => i.state)).toEqual(['not-read', 'not-read', 'not-read'])
    expect(view.consentNeeded).toBe(true)
    expect((await read(zoe, studyId, {})).json<{ code: string }>().code).toBe(
      'LEXICON_CONSENT_REQUIRED',
    )
  })

  it('finds the terms with checked quotes, sends no known name nor full text (SC-001, SC-002)', async () => {
    expect((await read(zoe)).statusCode).toBe(202)
    const view = await enrichment()
    expect(view.run).toMatchObject({ phase: 'finished', total: 3, done: 3 })
    expect(view.interviews.every((i) => i.state === 'to-decide')).toBe(true)
    const terms = await lexicon()
    const good = terms.find((t) => t.form === 'Goodresearch')
    expect(good?.variants.map((v) => v.spelling)).toEqual(['Gooresearch'])
    expect(good?.occurrences).toHaveLength(3)
    // Every occurrence on demand, the term as written marked in its excerpt.
    const all = (
      await call(alex, 'GET', `/api/studies/${studyId}/lexicon/terms/${good?.id}/occurrences`)
    ).json<Pick<Term, 'occurrences'>>().occurrences
    // A verdict in context on one place: kept, counted, refused on a place without the term.
    const first = all[0]?.quotes[0]
    if (!first || !all[0]) throw new Error('no quote')
    const place = { sessionId: all[0].sessionId, segmentId: first.segmentId, offset: first.offset }
    const judged = await call(
      alex,
      'PUT',
      `/api/studies/${studyId}/lexicon/terms/${good?.id}/verdicts`,
      {
        ...place,
        verdict: 'no',
      },
    )
    expect(judged.statusCode).toBe(204)
    expect(
      (
        await call(alex, 'PUT', `/api/studies/${studyId}/lexicon/terms/${good?.id}/verdicts`, {
          ...place,
          offset: place.offset + 1,
          verdict: 'yes',
        })
      ).json<{ code: string }>().code,
    ).toBe('OCCURRENCE_NOT_FOUND')
    const after = (await lexicon()).find((t) => t.id === good?.id)
    expect(after?.occurrences.reduce((a, o) => a + o.no, 0)).toBe(1)
    // "I can't tell": kept and counted apart, the place left to decide in Cleaning.
    const second = all[0]?.quotes[1] ?? all[1]?.quotes[0]
    const secondSession = all[0]?.quotes[1] ? all[0].sessionId : all[1]?.sessionId
    if (!second || !secondSession) throw new Error('no second quote')
    expect(
      (
        await call(alex, 'PUT', `/api/studies/${studyId}/lexicon/terms/${good?.id}/verdicts`, {
          sessionId: secondSession,
          segmentId: second.segmentId,
          offset: second.offset,
          verdict: 'unsure',
        })
      ).statusCode,
    ).toBe(204)
    const unsure = (await lexicon()).find((t) => t.id === good?.id)
    expect(unsure?.occurrences.reduce((a, o) => a + o.unsure, 0)).toBe(1)
    expect(all.flatMap((o) => o.quotes.map((q) => q.match)).sort()).toEqual([
      'Goodresearch',
      'Goodresearch',
      'Gooresearch',
    ])
    expect(terms.find((t) => t.form === 'NPS')?.category).toBe('acronym')
    // The fake provider's invented quote is dropped.
    expect(terms.some((t) => t.form === 'Invented')).toBe(false)
    expect(terms.some((t) => /Alex|Martin|Sam|Example|Casey|Robin/.test(t.form))).toBe(false)
    const request = sent.join('\n')
    expect(request).not.toMatch(/Alex Martin|Sam Example|Casey Test|Robin Sample/)
    expect(request).toContain('[Person')
    expect(request).not.toContain(TEXTS['t-one'])
  })

  it('shows the cost of the readings, whoever ran them (SC-004)', async () => {
    // Zoe read: 2,400 tokens in and 200 out at $2 and $10 per million, one call. Alex sees it.
    const view = await enrichment(studyId, alex)
    expect(view.lastRunCost).toBeCloseTo(0.0068, 6)
    expect(view.cost).toBeCloseTo(0.0068, 6)
    // Reading again sends nothing new: no call, no cost.
    expect((await read(alex, studyId, { consent: true, all: true })).statusCode).toBe(202)
    const after = await enrichment(studyId, zoe)
    expect(after.lastRunCost).toBe(0)
    expect(after.cost).toBeCloseTo(0.0068, 6)
  })

  it('never changes a decision nor proposes a rejected term again (SC-003)', async () => {
    const terms = await lexicon()
    const good = terms.find((t) => t.form === 'Goodresearch')
    const hmm = terms.find((t) => t.form === 'Mmhmm')
    if (!good || !hmm) throw new Error('terms missing')
    const accepted = await call(alex, 'PATCH', `/api/studies/${studyId}/lexicon/terms/${good.id}`, {
      version: good.version,
      decision: 'accept',
    })
    expect(accepted.json<Term>().status).toBe('accepted')
    await call(alex, 'PATCH', `/api/studies/${studyId}/lexicon/terms/${hmm.id}`, {
      version: hmm.version,
      decision: 'reject',
    })
    // Someone else decided meanwhile: the old version is refused.
    expect(
      (
        await call(zoe, 'PATCH', `/api/studies/${studyId}/lexicon/terms/${good.id}`, {
          version: good.version,
          decision: 'reject',
        })
      ).json<{ code: string }>().code,
    ).toBe('VERSION_CONFLICT')
    const before = sent.length
    await read(alex, studyId, { all: true })
    const again = await lexicon()
    expect(again.find((t) => t.id === good.id)?.status).toBe('accepted')
    expect(again.find((t) => t.id === hmm.id)?.status).toBe('rejected')
    const candidates = sent.slice(before).join('\n')
    expect(candidates).not.toMatch(/^- Mmhmm$/m)
    expect(candidates).not.toMatch(/^- Goodresearch$/m)
  })

  it('shares the lexicon with the team, never with another team (SC-007)', async () => {
    const second = await studyWith('folder-second', {
      't-four':
        'Lee: So what do you think?\nKim Doe: We use Goodresearch, and it is what we would use again.',
    })
    await read(alex, second)
    const shown = (await lexicon(second)).find((t) => t.form === 'Goodresearch')
    expect(shown).toMatchObject({ status: 'accepted', otherStudies: 1 })
    expect((await enrichment(second)).counts.toDecide).toBe(0)

    const otherTeam = await world.team('Other')
    await world.addMember(alex.id, otherTeam)
    const otherProject = (
      await call(alex, 'POST', '/api/projects', { name: 'Q', teamId: otherTeam })
    ).json<{ id: string }>().id
    const third = await studyWith(
      'folder-third',
      {
        't-five':
          'Lee: So what do you think?\nKim Doe: We use Goodresearch, and it is what we would use again.',
      },
      otherProject,
    )
    await read(alex, third)
    const elsewhere = (await lexicon(third)).find((t) => t.form === 'Goodresearch')
    expect(elsewhere?.status).toBe('proposed')
    expect(elsewhere?.otherStudies).toBe(0)
  })

  it('a merge moves the occurrences and verdicts to the kept term at once', async () => {
    const terms = await lexicon()
    const good = terms.find((t) => t.form === 'Goodresearch')
    const nps = terms.find((t) => t.form === 'NPS')
    if (!good || !nps) throw new Error('terms missing')
    const before = good.occurrences.reduce((a, o) => a + o.count, 0)
    const npsCount = nps.occurrences.reduce((a, o) => a + o.count, 0)
    const merged = await call(
      alex,
      'POST',
      `/api/studies/${studyId}/lexicon/terms/${nps.id}/merge`,
      {
        version: nps.version,
        into: { termId: good.id, version: good.version },
      },
    )
    expect(merged.statusCode).toBe(200)
    const after = (await lexicon()).find((t) => t.id === good.id)
    expect(after?.occurrences.reduce((a, o) => a + o.count, 0)).toBe(before + npsCount)
    expect((await lexicon()).some((t) => t.id === nps.id)).toBe(false)
  })

  it('takes the text and its occurrences away with their interview', async () => {
    const [first] = (await enrichment()).interviews
    if (!first) throw new Error('no interview')
    await world.db.delete(ingestionSessions).where(eq(ingestionSessions.id, first.sessionId))
    const left = await world.db
      .select()
      .from(transcriptsTranscripts)
      .where(eq(transcriptsTranscripts.sessionId, first.sessionId))
    const counts = await world.db
      .select()
      .from(transcriptsOccurrences)
      .where(eq(transcriptsOccurrences.sessionId, first.sessionId))
    expect([left.length, counts.length]).toEqual([0, 0])
  })
})

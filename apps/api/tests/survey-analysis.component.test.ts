import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { InMemoryDrive } from '../src/modules/ingestion/tests/fakes/in-memory-drive.ts'
import { surveysResponses } from '../src/modules/surveys/infrastructure/schema.ts'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }
const FOLDER = 'folder-analysis'

const common = { required: false, subTheme: null, contact: false }
const content = () => ({
  framing: {
    objective: 'Measure',
    hypotheses: [],
    audience: 'Designers',
    recruitment: 'wide-then-filter',
    administration: 'Online',
    targetResponses: 10,
    targetReason: 'Enough',
    language: 'en',
    consent: 'You choose.',
    thanks: 'Thank you.',
    shuffle: false,
  },
  sections: [
    {
      kind: 'profiling',
      title: 'About you',
      items: [
        {
          ...common,
          text: 'Job',
          measure: 'factual',
          kind: 'single-choice',
          options: ['Designer', 'Developer'],
          ordered: false,
        },
      ],
    },
    {
      kind: 'theme',
      title: 'Planning',
      items: [
        {
          ...common,
          text: 'Tools',
          measure: 'factual',
          kind: 'multiple-choice',
          options: ['Sheets', 'Notebooks'],
          ordered: false,
        },
        {
          ...common,
          text: 'Planning is easy',
          measure: 'subjective',
          kind: 'likert',
          points: 5,
          lowLabel: 'Disagree',
          highLabel: 'Agree',
        },
        { ...common, text: 'Tell us more', measure: 'subjective', kind: 'open' },
      ],
    },
  ],
})

describe('Survey analysis figures (spec 029)', () => {
  let world: World
  let drive: InMemoryDrive
  let alex: Who
  let studyId: string
  let fileId: string
  let q: Record<string, string>

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
  const consent = async (access: 'read' | 'write') => {
    drive.nextConsentAccount = 'alex@drive.example'
    const start = await call(
      alex,
      'GET',
      `/api/sources/google-drive/connect?access=${access}&returnTo=/studies/${studyId}`,
    )
    const state = new URL(String(start.headers.location)).searchParams.get('state')
    await call(alex, 'GET', `/api/sources/google-drive/callback?state=${state}&code=ok`)
  }
  const respond = (id: string, job: string | null, tools: string[], scale: string | null) =>
    drive.documents.respond(fileId, {
      id,
      submittedAt: '2026-11-01T10:00:00Z',
      answers: {
        [q.Consent ?? '']: ['I agree to take part'],
        ...(job ? { [q.Job ?? '']: [job] } : {}),
        ...(tools.length ? { [q.Tools ?? '']: tools } : {}),
        ...(scale ? { [q['Planning is easy'] ?? '']: [scale] } : {}),
        [q['Tell us more'] ?? '']: [
          id === 'a'
            ? 'write.me@corp.example about the tools we juggle'
            : id === 'b'
              ? 'Our tool list keeps growing'
              : `Because ${id} plans on Mondays`,
        ],
      },
    })
  const analysis = async (crossBy?: string) =>
    (
      await call(
        alex,
        'GET',
        `/api/studies/${studyId}/survey-analysis${crossBy ? `?crossBy=${crossBy}` : ''}`,
      )
    ).json()
  type Fig = {
    itemId: string
    text: string
    multiple: boolean
    total: object
    columns: { option: string; base: number }[] | null
  }
  const figure = (a: { sections: { figures: Fig[] }[] }, text: string): Fig => {
    const found = a.sections.flatMap((s) => s.figures).find((f) => f.text === text)
    if (!found) throw new Error(`no figure ${text}`)
    return found
  }

  beforeAll(async () => {
    drive = new InMemoryDrive()
    drive.addFolder(FOLDER, 'Study folder', undefined, 'Alex')
    drive.share(FOLDER, 'alex@drive.example')
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
    alex = await world.session('alex@example.org')
    const team = await world.team('Research')
    await world.addMember(alex.id, team)
    await call(alex, 'PUT', '/api/ai-provider/api-key', { provider: 'fake', apiKey: 'test-ok-k' })
    const projectId = (
      await call(alex, 'POST', '/api/projects', { name: 'Planning', goal: 'Goal', teamId: team })
    ).json().id
    studyId = (
      await call(alex, 'POST', `/api/projects/${projectId}/studies`, { name: 'S', type: 'survey' })
    ).json().id
    await call(alex, 'PUT', `/api/studies/${studyId}/questionnaire`, {
      content: content(),
      version: null,
    })
    await consent('read')
    await call(alex, 'PUT', `/api/studies/${studyId}/source`, {
      link: `https://drive.google.com/drive/folders/${FOLDER}`,
    })
    await consent('write')
    const published = await call(alex, 'POST', `/api/studies/${studyId}/publications`, {
      kinds: ['questionnaire'],
      language: 'en',
      timeZone: 'UTC',
    })
    fileId = published.json()[0].webLink.split('/').at(-1)
    q = {}
    for (const b of drive.documents.files.get(fileId)?.form?.blocks ?? []) {
      if (b.kind === 'grid') for (const r of b.rows) q[r.title] = r.questionId
      else if (b.questionId) q[b.title === 'Your consent' ? 'Consent' : b.title] = b.questionId
    }
    respond('a', 'Designer', ['Sheets', 'Notebooks'], '5')
    respond('b', 'Designer', ['Sheets'], '4')
    respond('c', 'Developer', ['Notebooks'], '2')
    respond('d', 'Developer', [], '5')
    respond('e', null, ['Sheets'], 'Strongly agree')
    respond('f', 'Designer', ['Sheets', 'Spreadsheets'], null)
    drive.documents.respond(fileId, {
      id: 'g',
      submittedAt: '2026-11-01T10:00:00Z',
      answers: { [q.Consent ?? '']: ['I do not wish to take part'] },
    })
    await call(alex, 'POST', `/api/studies/${studyId}/responses/read`, { force: true })
  })
  afterAll(async () => {
    await world?.close()
  })

  it('counts each item over the counted responses, as by hand', async () => {
    const a = await analysis()
    expect(a.counts).toEqual({ counted: 6, setAside: 0 })
    expect(a.sections.map((s: { title: string }) => s.title)).toEqual(['About you', 'Planning'])
    const job = figure(a, 'Job')
    expect(job.total).toMatchObject({
      base: 5,
      smallBase: true,
      options: [
        { value: 'Designer', count: 3, percent: 60 },
        { value: 'Developer', count: 2, percent: 40 },
      ],
    })
    const tools = figure(a, 'Tools')
    expect(tools.multiple).toBe(true)
    expect(tools.total).toMatchObject({
      base: 5,
      options: [
        { value: 'Sheets', count: 4, percent: 80 },
        { value: 'Notebooks', count: 2, percent: 40 },
      ],
      other: { count: 1, percent: 20 },
    })
    const scale = figure(a, 'Planning is easy')
    expect(scale.total).toMatchObject({
      base: 5,
      mean: 4,
      median: 4.5,
      agree: 60,
      disagree: 20,
      other: { count: 1, percent: 20 },
    })
    expect(a.openItems).toEqual([
      expect.objectContaining({ text: 'Tell us more', answers: 6, themed: 0, themes: 0 }),
    ])
    expect(a.cost).toBe(0)
  })

  it('crosses by a profiling item, respondents without its answer only in the total', async () => {
    const a = await analysis()
    const job = a.crossable[0].id
    const crossed = await analysis(job)
    expect(crossed.crossBy).toBe(job)
    const scale = figure(crossed, 'Planning is easy')
    expect((scale.columns ?? []).map((c) => [c.option, c.base])).toEqual([
      ['Designer', 2],
      ['Developer', 2],
    ])
    expect(scale.total).toMatchObject({ base: 5 })
    const bad = await call(
      alex,
      'GET',
      `/api/studies/${studyId}/survey-analysis?crossBy=${scale.itemId}`,
    )
    expect(bad.json().code).toBe('VALIDATION')
  })

  it('follows the target rule at once', async () => {
    const summary = (await call(alex, 'GET', `/api/studies/${studyId}/responses/summary`)).json()
    const job = summary.filterable[0].id
    await call(alex, 'PUT', `/api/studies/${studyId}/target-rule`, {
      accepted: { [job]: ['Designer'] },
      version: null,
    })
    const a = await analysis()
    expect(a.counts).toEqual({ counted: 3, setAside: 3 })
    expect(figure(a, 'Job').total).toMatchObject({ base: 3 })
    await call(alex, 'PUT', `/api/studies/${studyId}/target-rule`, { accepted: {}, version: 0 })
    expect((await analysis()).counts.counted).toBe(6)
  })

  it('themes the masked open answers, verifies quotes, and lets a person decide (US3)', async () => {
    const item = (await analysis()).openItems[0].id
    const base = `/api/studies/${studyId}/open-items/${item}`
    const page = (await call(alex, 'GET', `${base}/answers`)).json()
    expect(page.total).toBe(6)
    expect(page.answers[0].text).toBe('[email] about the tools we juggle')
    expect(JSON.stringify(page)).not.toContain('corp.example')
    const estimate = (await call(alex, 'GET', `${base}/themes/estimate`)).json()
    expect(estimate).toMatchObject({ answers: 6, parts: 1, aiConnected: true })
    const started = await call(alex, 'POST', `${base}/themes/runs`, { onlyNew: false })
    expect(started.statusCode).toBe(202)
    await world.runJobs()
    const listed = (await call(alex, 'GET', `${base}/themes`)).json()
    expect(listed.themes.map((t: { label: { en: string } }) => t.label.en)).toEqual([
      'Tools',
      'Other ways',
    ])
    const tools = listed.themes[0]
    // The fake quotes the first words of the masked answer, and invents one (dropped).
    expect(tools).toMatchObject({ status: 'proposed', answers: 2, quotes: ['Our tool list'] })
    expect(listed.unthemed).toBe(0)
    const run = (await analysis()).run
    expect(run).toMatchObject({ state: 'done', answersSent: 6, droppedQuotes: 2 })
    expect((await analysis()).openItems[0]).toMatchObject({ themed: 6, themes: 2 })

    // Decide: accept with the version seen, refused on a stale one; merge; move an answer.
    const other = listed.themes[1]
    const stale = await call(
      alex,
      'POST',
      `/api/studies/${studyId}/survey-themes/${tools.id}/decide`,
      {
        decision: 'accept',
        version: 9,
      },
    )
    expect(stale.json().code).toBe('VERSION_CONFLICT')
    await call(alex, 'POST', `/api/studies/${studyId}/survey-themes/${tools.id}/decide`, {
      decision: 'edit',
      version: 1,
      label: { fr: 'Trop d’outils' },
    })
    await world.runJobs()
    const edited = (await call(alex, 'GET', `${base}/themes`)).json().themes[0]
    expect(edited).toMatchObject({
      status: 'accepted',
      label: { fr: 'Trop d’outils', en: 'EN: Trop d’outils' },
      translation: 'done',
    })
    const moved = await call(alex, 'POST', `${base}/move`, {
      responseId: page.answers[0].responseId,
      to: null,
    })
    expect(moved.statusCode).toBe(204)
    expect((await call(alex, 'GET', `${base}/themes`)).json().unthemed).toBe(1)
    // Only a counted answer of this item moves.
    const bogus = await call(alex, 'POST', `${base}/move`, { responseId: 'bogus', to: tools.id })
    expect(bogus.json().code).toBe('RESPONSE_NOT_FOUND')
    // A merge against a version read before an edit is refused.
    const staleMerge = await call(
      alex,
      'POST',
      `/api/studies/${studyId}/survey-themes/${tools.id}/merge`,
      { from: [other.id], version: 1 },
    )
    expect(staleMerge.json().code).toBe('VERSION_CONFLICT')
    await call(alex, 'POST', `/api/studies/${studyId}/survey-themes/${tools.id}/merge`, {
      from: [other.id],
      version: edited.version,
    })
    const merged = (await call(alex, 'GET', `${base}/themes`)).json()
    expect(merged.themes.map((t: { id: string; answers: number }) => [t.id, t.answers])).toEqual([
      [tools.id, 5],
    ])

    // A fact from the accepted theme takes its description and quotes (US4).
    const fact = await call(alex, 'POST', `/api/studies/${studyId}/survey-facts`, {
      from: { theme: { themeId: tools.id } },
    })
    expect(fact.statusCode).toBe(201)
    const facts = (await call(alex, 'GET', `/api/studies/${studyId}/survey-facts`)).json()
    expect(facts.facts[0]).toMatchObject({
      status: 'proposed',
      statement: { en: 'Respondents speak of tools.' },
      support: { kind: 'theme', share: { answers: 5, base: 6 } },
    })
    // One standing fact per theme.
    const again = await call(alex, 'POST', `/api/studies/${studyId}/survey-facts`, {
      from: { theme: { themeId: tools.id } },
    })
    expect(again.json().code).toBe('FACT_EXISTS')

    // A rejected theme lets its answers go: a new run puts them in its own themes.
    await call(alex, 'POST', `/api/studies/${studyId}/survey-themes/${tools.id}/decide`, {
      decision: 'reject',
      version: merged.themes[0].version,
    })
    await call(alex, 'POST', `${base}/themes/runs`, { onlyNew: true })
    await world.runJobs()
    const rerun = (await call(alex, 'GET', `${base}/themes`)).json()
    const live = rerun.themes.filter((t: { status: string }) => t.status !== 'rejected')
    expect(live.reduce((n: number, t: { answers: number }) => n + t.answers, 0)).toBe(6)
    expect(live.every((t: { answers: number }) => t.answers > 0)).toBe(true)
  })

  it('makes a fact of a figure and sees it move with the target rule (US4)', async () => {
    const a = await analysis()
    const scale = figure(a, 'Planning is easy')
    const made = await call(alex, 'POST', `/api/studies/${studyId}/survey-facts`, {
      from: { figure: { itemId: scale.itemId, measure: 'agree' } },
      polarity: 'positive',
    })
    expect(made.statusCode).toBe(201)
    const list = async () =>
      (await call(alex, 'GET', `/api/studies/${studyId}/survey-facts?status=to-decide`)).json()
    const first = (await list()).facts.find((f: { id: string }) => f.id === made.json().id)
    expect(first).toMatchObject({
      statement: { en: '60 % of the 5 respondents agree with “Planning is easy” (small base).' },
      figureChanged: null,
    })
    const summary = (await call(alex, 'GET', `/api/studies/${studyId}/responses/summary`)).json()
    await call(alex, 'PUT', `/api/studies/${studyId}/target-rule`, {
      accepted: { [summary.filterable[0].id]: ['Developer'] },
      version: summary.rule?.version ?? null,
    })
    const moved = (await list()).facts.find((f: { id: string }) => f.id === made.json().id)
    expect(moved.figureChanged).toEqual({ value: 50, base: 2 })
    const updated = await call(
      alex,
      'POST',
      `/api/studies/${studyId}/survey-facts/${made.json().id}/figure`,
      { action: 'update', version: 1 },
    )
    expect(updated.json()).toMatchObject({ support: { figure: { value: 50, base: 2 } } })
    const twice = await call(alex, 'POST', `/api/studies/${studyId}/survey-facts`, {
      from: { figure: { itemId: scale.itemId, measure: 'agree' } },
    })
    expect(twice.json().code).toBe('FACT_EXISTS')
    await call(alex, 'PUT', `/api/studies/${studyId}/target-rule`, {
      accepted: {},
      version: (summary.rule?.version ?? -1) + 1,
    })
  })

  it('reads 5,000 counted responses and every item within 2 seconds (SC-006)', async () => {
    await world.db.insert(surveysResponses).values(
      Array.from({ length: 5000 }, (_, i) => ({
        studyId,
        sourceId: `bulk-${i}`,
        formFileId: fileId,
        submittedAt: new Date('2026-11-02T10:00:00Z'),
        consent: 'given',
        answers: {
          [figureIds.job]: [i % 2 ? 'Designer' : 'Developer'],
          [figureIds.scale]: [String((i % 5) + 1)],
        },
        readAt: new Date('2026-11-02T10:00:00Z'),
      })),
    )
    const started = Date.now()
    const a = await analysis(figureIds.job)
    expect(Date.now() - started).toBeLessThan(2000)
    expect(a.counts.counted).toBeGreaterThanOrEqual(5000)
  })

  it('deletes themes and facts with the study (US6, FR-017)', async () => {
    const count = async (table: string) =>
      Number(
        (
          await world.db.execute(
            sql.raw(`SELECT count(*)::int AS n FROM ${table} WHERE study_id = '${studyId}'`),
          )
        ).rows[0]?.n,
      )
    expect(await count('surveys_themes')).toBeGreaterThan(0)
    expect(await count('evidence_facts')).toBeGreaterThan(0)
    expect((await call(alex, 'DELETE', `/api/studies/${studyId}`)).statusCode).toBe(204)
    for (const table of [
      'surveys_themes',
      'surveys_theme_answers',
      'surveys_theme_runs',
      'evidence_facts',
    ])
      expect(await count(table)).toBe(0)
  })

  const figureIds = { job: '', scale: '' }
  beforeAll(async () => {
    const a = await analysis()
    figureIds.job = a.crossable[0].id
    figureIds.scale = figure(a, 'Planning is easy').itemId
  })
})

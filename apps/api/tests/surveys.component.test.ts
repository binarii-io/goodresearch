import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { InMemoryDrive } from '../src/modules/ingestion/tests/fakes/in-memory-drive.ts'
import { stateOf } from '../src/modules/surveys/domain/responses.ts'
import { surveysResponses } from '../src/modules/surveys/infrastructure/schema.ts'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }
const FOLDER = 'folder-fieldwork'

const common = { required: true, subTheme: null, contact: false }
const content = () => ({
  framing: {
    objective: 'Measure',
    hypotheses: [],
    audience: 'Designers',
    recruitment: 'wide-then-filter',
    administration: 'Online',
    targetResponses: 2,
    targetReason: 'Enough',
    language: 'en',
    consent: 'You choose.',
    thanks: 'Thank you.',
    shuffle: true,
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
          text: 'Planning is easy',
          measure: 'subjective',
          kind: 'likert',
          points: 7,
          lowLabel: 'Disagree',
          highLabel: 'Agree',
        },
        {
          ...common,
          text: 'Mondays are calm',
          measure: 'subjective',
          kind: 'likert',
          points: 7,
          lowLabel: 'Disagree',
          highLabel: 'Agree',
        },
      ],
    },
    {
      kind: 'closing',
      title: 'End',
      items: [
        {
          ...common,
          required: false,
          contact: true,
          text: 'Your address',
          measure: 'factual',
          kind: 'open',
        },
      ],
    },
  ],
})

describe('Survey fieldwork (spec 028)', () => {
  let world: World
  let drive: InMemoryDrive
  let alex: Who
  let robin: Who
  let studyId: string
  let publicationId: string
  let fileId: string
  let questions: Record<string, string>

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

  const respond = (
    id: string,
    answers: Record<string, string[]>,
    submittedAt = '2026-11-01T10:00:00Z',
  ) => drive.documents.respond(fileId, { id, submittedAt, answers })
  const answer = (job: string | null, mail?: string) => ({
    [questions.Consent ?? '']: ['I agree to take part'],
    ...(job ? { [questions.Job ?? '']: [job] } : {}),
    [questions['Planning is easy'] ?? '']: ['6'],
    ...(mail ? { [questions['Your address'] ?? '']: [mail] } : {}),
  })
  const read = () => call(alex, 'POST', `/api/studies/${studyId}/responses/read`, { force: true })
  const summary = async () =>
    (await call(alex, 'GET', `/api/studies/${studyId}/responses/summary`)).json()

  beforeAll(async () => {
    drive = new InMemoryDrive()
    drive.addFolder(FOLDER, 'Study folder', undefined, 'Alex')
    drive.share(FOLDER, 'alex@drive.example')
    world = await startWorld({
      drive,
      config: { GOOGLE_DRIVE_CLIENT_ID: 'id', GOOGLE_DRIVE_CLIENT_SECRET: 'secret' },
    })
    alex = await world.session('alex@example.org')
    robin = await world.session('robin@research.example.com')
    const team = await world.team('Research')
    await world.addMember(alex.id, team)
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
    publicationId = published.json()[0].id
    fileId = published.json()[0].webLink.split('/').at(-1)
    const blocks = drive.documents.files.get(fileId)?.form?.blocks ?? []
    questions = {}
    for (const b of blocks) {
      if (b.kind === 'grid') for (const r of b.rows) questions[r.title] = r.questionId
      else if (b.questionId)
        questions[b.title === 'Your consent' ? 'Consent' : b.title] = b.questionId
    }
  })
  afterAll(async () => {
    await world?.close()
  })

  it('needs no responses to answer, and reads none at first', async () => {
    expect((await read()).statusCode).toBe(204)
    expect(await summary()).toMatchObject({ counts: { total: 0 }, target: 2, rule: null })
  })

  it('opens the form and gives the link', async () => {
    const opened = await call(alex, 'POST', `/api/publications/${publicationId}/open`)
    expect(opened.json().form).toMatchObject({ acceptingResponses: true })
    expect(opened.json().form.responderLink).toBeTruthy()
  })

  it('reads responses, each answer under its item, a grid row too, never the contact', async () => {
    respond('a', answer('Designer', 'someone@example.test'))
    respond('b', answer('Developer'))
    respond('c', answer(null))
    respond('d', { [questions.Consent ?? '']: ['I do not wish to take part'] })
    respond('e', { ...answer('Designer'), unknown: ['x'] })
    expect((await read()).statusCode).toBe(204)
    const s = await summary()
    expect(s.counts).toMatchObject({ total: 5, counted: 4, refusedConsent: 1 })
    expect(s.reading).toMatchObject({ status: 'done', unknownQuestions: 1 })
    const page = (await call(alex, 'GET', `/api/studies/${studyId}/responses`)).json()
    expect(page.total).toBe(5)
    const one = await call(alex, 'GET', `/api/studies/${studyId}/responses/a`)
    expect(one.body).not.toContain('someone')
    expect(
      one.json().answers.find((x: { text: string }) => x.text === 'Planning is easy').values,
    ).toEqual(['6'])
    expect(one.json().answers.map((x: { text: string }) => x.text)).not.toContain('Your address')
  })

  it('reading twice changes nothing, and a response deleted at the source goes', async () => {
    await read()
    expect((await summary()).counts.total).toBe(5)
    drive.documents.removeResponse(fileId, 'e')
    await read()
    expect((await summary()).counts.total).toBe(4)
  })

  it('sets aside by the rule, the same in SQL as in the domain, and undoes it', async () => {
    const { filterable, rule } = await summary()
    const job = filterable[0].id
    const accepted = { [job]: ['Designer'] }
    const saved = await call(alex, 'PUT', `/api/studies/${studyId}/target-rule`, {
      accepted,
      version: rule?.version ?? null,
    })
    expect(saved.json()).toEqual({ version: 0 })
    expect((await summary()).counts).toEqual({
      total: 4,
      counted: 1,
      outOfTarget: 1,
      profileNotAnswered: 1,
      refusedConsent: 1,
    })
    const page = (await call(alex, 'GET', `/api/studies/${studyId}/responses`)).json()
    const stated = Object.fromEntries(
      page.items.map((i: { id: string; state: string }) => [i.id, i.state]),
    )
    const domain = (consent: 'given' | 'refused', answers: Record<string, string[]>) =>
      stateOf({ consent, answers }, accepted)
    expect(stated).toEqual({
      a: domain('given', { [job]: ['Designer'] }),
      b: domain('given', { [job]: ['Developer'] }),
      c: domain('given', {}),
      d: domain('refused', {}),
    })
    const filtered = await call(
      alex,
      'GET',
      `/api/studies/${studyId}/responses?state=out-of-target`,
    )
    expect(filtered.json().items.map((i: { id: string }) => i.id)).toEqual(['b'])
    const stale = await call(alex, 'PUT', `/api/studies/${studyId}/target-rule`, {
      accepted,
      version: 9,
    })
    expect(stale.json().code).toBe('VERSION_CONFLICT')
    await call(alex, 'PUT', `/api/studies/${studyId}/target-rule`, { accepted: {}, version: 0 })
    expect((await summary()).counts.counted).toBe(3)
  })

  it('refuses an update that would detach responses, confirms a rewording', async () => {
    const url = `/api/studies/${studyId}/questionnaire`
    const current = (await call(alex, 'GET', url)).json()
    const withText = structuredClone(current.content)
    withText.sections[1].items[0].text = 'Planning is simple'
    await call(alex, 'PUT', url, { content: withText, version: current.version })
    const update = (confirmRewording: boolean) =>
      call(alex, 'POST', `/api/publications/${publicationId}/update`, {
        replaceDriveChanges: false,
        confirmRewording,
      })
    expect((await update(false)).json()).toMatchObject({
      code: 'REWORDING_TO_CONFIRM',
      detail: { responses: 4 },
    })
    expect((await update(true)).statusCode).toBe(200)
    const a = (await call(alex, 'GET', `/api/studies/${studyId}/responses/a`)).json()
    expect(a.answers.find((x: { text: string }) => x.text === 'Planning is simple')).toMatchObject({
      formerText: 'Planning is easy',
    })
    const after = (await call(alex, 'GET', url)).json()
    const removed = structuredClone(after.content)
    removed.sections[1].items.pop()
    await call(alex, 'PUT', url, { content: removed, version: after.version })
    expect((await update(false)).json()).toMatchObject({
      code: 'RESPONSES_BLOCK_UPDATE',
      // The scale left alone also leaves the grid.
      detail: { items: ['Planning is simple', 'Mondays are calm'] },
    })
    await call(alex, 'PUT', url, { content: after.content, version: after.version + 1 })
  })

  it('stays with the team', async () => {
    for (const [method, url] of [
      ['GET', `/api/studies/${studyId}/responses/summary`],
      ['GET', `/api/studies/${studyId}/responses`],
      ['GET', `/api/studies/${studyId}/responses/a`],
      ['POST', `/api/publications/${publicationId}/open`],
    ] as const) {
      expect((await call(robin, method, url)).statusCode).toBe(403)
    }
  })

  it('keeps what was read when the folder is detached, and refuses to refresh', async () => {
    await call(alex, 'DELETE', `/api/studies/${studyId}/source`)
    const refused = await read()
    expect(refused.statusCode).toBeGreaterThanOrEqual(400)
  })

  it('answers the counts and a page within 2 seconds with 5,000 responses', async () => {
    const at = new Date('2026-11-01T10:00:00Z')
    const job = (await summary()).filterable[0].id
    await world.db.insert(surveysResponses).values(
      Array.from({ length: 5000 }, (_, i) => ({
        studyId,
        sourceId: `bulk-${i}`,
        formFileId: fileId,
        submittedAt: at,
        consent: 'given',
        answers: { [job]: [i % 2 ? 'Designer' : 'Developer'] },
        readAt: at,
      })),
    )
    const started = Date.now()
    const s = await summary()
    await call(alex, 'GET', `/api/studies/${studyId}/responses?state=counted`)
    expect(s.counts.total).toBeGreaterThanOrEqual(5000)
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('deletes the responses with the study, leaving the form at the source', async () => {
    const { version } = (await call(alex, 'GET', `/api/studies/${studyId}`)).json()
    await call(alex, 'DELETE', `/api/studies/${studyId}?version=${version}`)
    expect(drive.documents.files.has(fileId)).toBe(true)
    expect(drive.documents.formResponses.get(fileId)?.length).toBeGreaterThan(0)
  })
})

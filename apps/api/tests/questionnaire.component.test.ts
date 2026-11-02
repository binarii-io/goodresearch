import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { InMemoryDrive } from '../src/modules/ingestion/tests/fakes/in-memory-drive.ts'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }
const FOLDER = 'folder-survey'

const content = (text = 'Planning is easy for me') => ({
  framing: {
    objective: 'Measure',
    hypotheses: [],
    audience: 'Team leads',
    recruitment: 'targeted',
    administration: 'Online',
    targetResponses: 100,
    targetReason: 'Two teams',
    language: 'en',
    consent: 'You choose.',
    thanks: 'Thank you.',
    shuffle: true,
  },
  sections: [
    {
      kind: 'theme',
      title: 'Planning',
      items: [
        {
          text,
          measure: 'subjective',
          required: true,
          subTheme: null,
          contact: false,
          kind: 'likert',
          points: 7,
          lowLabel: 'Disagree',
          highLabel: 'Agree',
        },
        {
          text: 'Tell us more',
          measure: 'subjective',
          required: false,
          subTheme: null,
          contact: false,
          kind: 'open',
        },
      ],
    },
  ],
})

describe('Survey preparation (spec 027)', () => {
  let world: World
  let drive: InMemoryDrive
  let alex: Who
  let robin: Who
  let surveyId: string
  let interviewsId: string
  let projectId: string

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

  const consent = async (who: Who, account: string, access: 'read' | 'write') => {
    drive.nextConsentAccount = account
    const start = await call(
      who,
      'GET',
      `/api/sources/google-drive/connect?access=${access}&returnTo=/studies/${surveyId}`,
    )
    const state = new URL(String(start.headers.location)).searchParams.get('state')
    await call(who, 'GET', `/api/sources/google-drive/callback?state=${state}&code=ok`)
  }

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
    projectId = (
      await call(alex, 'POST', '/api/projects', { name: 'Planning', goal: 'Goal', teamId: team })
    ).json().id
    const make = async (name: string, type: string) =>
      (await call(alex, 'POST', `/api/projects/${projectId}/studies`, { name, type })).json().id
    surveyId = await make('A survey', 'survey')
    interviewsId = await make('Interviews', 'interviews')
  })
  afterAll(async () => {
    await world?.close()
  })

  it('has no questionnaire at first, and refuses one on an interview study', async () => {
    const first = await call(alex, 'GET', `/api/studies/${surveyId}/questionnaire`)
    expect(first.statusCode).toBe(200)
    expect(first.json()).toBeNull()
    const other = await call(alex, 'GET', `/api/studies/${interviewsId}/questionnaire`)
    expect(other.json().code).toBe('NOT_A_SURVEY_STUDY')
  })

  it('keeps the interview commands refused on a survey study', async () => {
    const guide = await call(alex, 'GET', `/api/studies/${surveyId}/guide`)
    expect(guide.json().code).toBe('NOT_AN_INTERVIEW_STUDY')
    const schedule = await call(alex, 'GET', `/api/studies/${surveyId}/planned-interviews`)
    expect(schedule.json().code).toBe('NOT_AN_INTERVIEW_STUDY')
  })

  it('saves it, reads it back with its checks and estimate, and refuses a stale version', async () => {
    const url = `/api/studies/${surveyId}/questionnaire`
    const saved = await call(alex, 'PUT', url, { content: content(), version: null })
    expect(saved.json()).toEqual({ version: 0 })
    const read = (await call(alex, 'GET', url)).json()
    expect(read).toMatchObject({
      version: 0,
      origin: 'person',
      estimatedMinutes: 2,
      randomisation: { themesFixed: true, optionsShuffled: false, itemsShuffled: false },
      checks: { whole: ['no-profiling'] },
    })
    expect(read.content.sections[0].items[0].id).toBeTruthy()
    const stale = await call(alex, 'PUT', url, { content: content(), version: 5 })
    expect(stale.json().code).toBe('VERSION_CONFLICT')
    const invalid = await call(alex, 'PUT', url, { content: content('   '), version: 0 })
    expect(invalid.statusCode).toBeGreaterThanOrEqual(400)
  })

  it('marks a check, and says when the questionnaire changed since', async () => {
    const url = `/api/studies/${surveyId}/questionnaire`
    const mark = await call(alex, 'PUT', `${url}/readiness/pre-test`, { people: 3 })
    expect(mark.statusCode).toBe(204)
    expect((await call(alex, 'GET', url)).json().readiness).toMatchObject([
      { kind: 'pre-test', people: 3, changedSince: false },
    ])
    await call(alex, 'PUT', url, { content: content('Reworded'), version: 0 })
    const after = (await call(alex, 'GET', url)).json()
    expect(after.version).toBe(1)
    expect(after.readiness[0].changedSince).toBe(true)
    await call(alex, 'DELETE', `${url}/readiness/pre-test`)
    expect((await call(alex, 'GET', url)).json().readiness).toEqual([])
  })

  it('lets a member outside the team read it, without names, and change nothing', async () => {
    const url = `/api/studies/${surveyId}/questionnaire`
    const read = await call(robin, 'GET', url)
    expect(read.statusCode).toBe(200)
    expect(read.json().updatedBy).toBeNull()
    const change = await call(robin, 'PUT', url, { content: content(), version: 1 })
    expect(change.statusCode).toBeGreaterThanOrEqual(400)
  })

  it('tells the cost of the design, nothing spent yet', async () => {
    const cost = await call(alex, 'GET', `/api/studies/${surveyId}/questionnaire/design-cost`)
    expect(cost.json()).toEqual({ currency: 'USD', total: 0 })
  })

  it('publishes it as a form in the folder, creating no session, refusing interview files', async () => {
    await consent(alex, 'alex@drive.example', 'read')
    await call(alex, 'PUT', `/api/studies/${surveyId}/source`, {
      link: `https://drive.google.com/drive/folders/${FOLDER}`,
    })
    await consent(alex, 'alex@drive.example', 'write')
    const body = { language: 'en', timeZone: 'UTC' }
    const url = `/api/studies/${surveyId}/publications`
    const refused = await call(alex, 'POST', url, { ...body, kinds: ['best-practices'] })
    expect(refused.json().code).toBe('NOT_AN_INTERVIEW_STUDY')
    const published = await call(alex, 'POST', url, { ...body, kinds: ['questionnaire'] })
    expect(published.statusCode).toBe(201)
    expect(published.json()[0]).toMatchObject({
      kind: 'questionnaire',
      state: 'in-sync',
      form: { acceptingResponses: false, collectsIdentity: false, linkedSheetLink: null },
    })
    expect(drive.documents.files.size).toBe(1)
  })

  it('deletes it with the study, leaving the form at the source', async () => {
    const files = drive.documents.files.size
    const { version } = (await call(alex, 'GET', `/api/studies/${surveyId}`)).json()
    await call(alex, 'DELETE', `/api/studies/${surveyId}?version=${version}`)
    expect(drive.documents.files.size).toBe(files)
  })
})

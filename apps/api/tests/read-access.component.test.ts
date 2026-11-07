import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { evidenceFacts } from '../src/modules/evidence/infrastructure/schema.ts'
import { InMemoryDrive } from '../src/modules/ingestion/tests/fakes/in-memory-drive.ts'
import { researchStudies } from '../src/modules/research/infrastructure/schema.ts'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type OpenApi = { paths: Record<string, Record<string, unknown>> }

const READ_ONLY_REASON = { code: 'READ_ONLY', detail: { team: { name: 'Research' } } }

/** The reads open to every member (contracts/access.md): any other route is the team's. */
const OPEN = new Set([
  '/api/projects/{projectId}',
  '/api/projects/{projectId}/studies',
  '/api/projects/{projectId}/overview',
  '/api/projects/{projectId}/overview/costs',
  '/api/projects/{projectId}/insights',
  '/api/projects/{projectId}/insights/{insightId}',
  '/api/projects/{projectId}/insight-facts',
  '/api/projects/{projectId}/recommendations',
  '/api/projects/{projectId}/recommendations/{recommendationId}',
  '/api/projects/{projectId}/recommendation-insights',
  '/api/projects/{projectId}/takeaways/freshness',
  '/api/projects/{projectId}/debrief',
  '/api/studies/{studyId}',
  '/api/studies/{studyId}/questionnaire',
  '/api/studies/{studyId}/protocol',
  '/api/studies/{studyId}/guide',
  '/api/studies/{studyId}/source',
  '/api/studies/{studyId}/facts',
  '/api/teams/{teamId}/studies',
  '/api/teams/{teamId}/studies/overview',
  '/api/teams/{teamId}/studies/overview/costs',
])

describe('read for every member, change for the team (spec 026)', () => {
  let world: World
  let drive: InMemoryDrive
  let alex: Who
  let reader: Who
  let readerNoDrive: Who
  let teamId: string
  let projectId: string
  let studyId: string
  let sessionId: string
  let plannedId: string
  const call = (who: Who, method: Method, url: string, payload?: object) =>
    world.app.inject({
      method,
      url,
      headers: { cookie: who.cookie },
      ...(payload ? { payload } : {}),
    })
  const connect = async (who: Who, account: string) => {
    drive.nextConsentAccount = account
    const start = await call(who, 'GET', '/api/sources/google-drive/connect?returnTo=/&access=read')
    const state = new URL(String(start.headers.location)).searchParams.get('state')
    await call(who, 'GET', `/api/sources/google-drive/callback?state=${state}&code=granted`)
  }
  const usage = async () =>
    (await call(alex, 'GET', `/api/projects/${projectId}/overview/costs`)).body

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
    reader = await world.session('zoe@research.example.com', 'Zoe Stone')
    readerNoDrive = await world.session('kim@research.example.com', 'Kim Stone')
    teamId = await world.team('Research')
    await world.addMember(alex.id, teamId)
    await world.addMember(reader.id, await world.team('Other'))
    await call(alex, 'PUT', '/api/ai-provider/api-key', { provider: 'fake', apiKey: 'test-ok-k' })
    projectId = (await call(alex, 'POST', '/api/projects', { name: 'P', teamId })).json<{
      id: string
    }>().id
    await connect(alex, 'alex@drive.example')
    await connect(reader, 'zoe@drive.example')
    drive.addFolder('folder-facts', 'folder-facts', undefined, 'Alex')
    drive.addFile('t-one', 't-one.txt', 'folder-facts', 'text/plain')
    drive.texts.set(
      't-one',
      [
        'Alex Martin: Thanks for joining, Sam Example. How do you find the data?',
        'Sam Example: I never find the data of my team quickly. Alex Martin knows it.',
        'Alex Martin: And the newsletter?',
        'Sam Example: The newsletter helps me every single week. Really.',
      ].join('\n'),
    )
    drive.share('folder-facts', 'alex@drive.example')
    drive.share('folder-facts', 'zoe@drive.example')
    studyId = (
      await call(alex, 'POST', `/api/projects/${projectId}/studies`, {
        name: 'Facts',
        type: 'interviews',
      })
    ).json<{ id: string }>().id
    await call(alex, 'PUT', `/api/studies/${studyId}/source`, { link: 'folder-facts' })
    await world.runJobs()
    const [session] = (await call(alex, 'GET', `/api/studies/${studyId}/sessions`)).json<{
      sessions: { id: string; version: number }[]
    }>().sessions
    if (!session) throw new Error('no session')
    sessionId = session.id
    const edited = await call(alex, 'PATCH', `/api/sessions/${session.id}`, {
      version: session.version,
      roster: [
        { name: 'Sam Example', role: 'interviewee' },
        { name: 'Alex Martin', role: 'interviewer' },
      ],
    })
    await call(alex, 'POST', `/api/sessions/${session.id}/decision`, {
      decision: 'validate',
      version: edited.json<{ version: number }>().version,
    })
    await call(alex, 'POST', `/api/studies/${studyId}/facts-runs`, { all: false, consent: true })
    await world.runJobs()
    plannedId = (
      await call(alex, 'POST', `/api/studies/${studyId}/planned-interviews`, {
        interviewee: 'Planned Person',
        interviewers: 'Lee Sample and Kim Sample',
        status: 'to-contact',
      })
    ).json<{ id: string }>().id
  })

  afterAll(async () => {
    await world?.close()
  })

  const urlOf = (path: string) =>
    path
      .replace('{projectId}', projectId)
      .replace('{studyId}', studyId)
      .replace('{sessionId}', sessionId)
      .replace('{plannedInterviewId}', plannedId)
      .replace('{teamId}', teamId)
      .replace(/\{\w+\}/g, 'unknown')

  const ownedRoutes = async () => {
    const { paths } = (await world.app.inject({ url: '/api/openapi.json' })).json<OpenApi>()
    return Object.entries(paths)
      .filter(
        ([path]) =>
          /\{(projectId|studyId|sessionId|plannedInterviewId)\}/.test(path) ||
          path.startsWith('/api/teams/{teamId}/studies'),
      )
      .flatMap(([path, methods]) =>
        Object.keys(methods).map((m) => ({ path, method: m.toUpperCase() as Method })),
      )
  }

  it('SC-002: refuses every change and reserved read of what the team owns, by name', async () => {
    const before = await usage()
    const routes = await ownedRoutes()
    expect(routes.length).toBeGreaterThan(100)
    for (const { path, method } of routes) {
      if (method === 'GET' && OPEN.has(path)) continue
      const res = await call(reader, method, urlOf(path), method === 'GET' ? undefined : {})
      expect({ path, method, status: res.statusCode }).toEqual({ path, method, status: 403 })
      expect(res.json()).toMatchObject(READ_ONLY_REASON)
    }
    await world.runJobs()
    expect(await usage()).toBe(before)
  })

  it('FR-001: lists and opens what another team owns', async () => {
    const mine = (await call(reader, 'GET', '/api/projects')).json<{ id: string }[]>()
    expect(mine.map((p) => p.id)).not.toContain(projectId)
    const all = (await call(reader, 'GET', '/api/projects?teams=all')).json<
      { id: string; canChange: boolean; team: { name: string } }[]
    >()
    expect(all.find((p) => p.id === projectId)).toMatchObject({
      canChange: false,
      team: { name: 'Research' },
    })
    const project = await call(reader, 'GET', `/api/projects/${projectId}`)
    expect(project.json()).toMatchObject({ canChange: false, canDelete: false })
    const study = await call(reader, 'GET', `/api/studies/${studyId}`)
    expect(study.json()).toMatchObject({ canChange: false, name: 'Facts' })
    for (const url of [
      `/api/projects/${projectId}/studies`,
      `/api/projects/${projectId}/overview`,
      `/api/projects/${projectId}/overview/costs`,
      `/api/projects/${projectId}/insights`,
      `/api/projects/${projectId}/recommendations`,
      `/api/projects/${projectId}/debrief?withProposed=false`,
      `/api/teams/${teamId}/studies`,
      `/api/teams/${teamId}/studies/overview`,
    ])
      expect({ url, status: (await call(reader, 'GET', url)).statusCode }).toEqual({
        url,
        status: 200,
      })
  })

  it('a member of no team reads too, and the team directory lists every team', async () => {
    const res = await call(readerNoDrive, 'GET', `/api/projects/${projectId}`)
    expect(res.statusCode).toBe(200)
    const teams = (await call(readerNoDrive, 'GET', '/api/teams/directory')).json<
      { id: string; name: string }[]
    >()
    expect(teams.map((t) => t.name)).toContain('Research')
  })

  it('FR-012: without the folder, only the name, type and team, and the reason', async () => {
    const study = (await call(readerNoDrive, 'GET', `/api/studies/${studyId}`)).json<{
      goal: string
      projects: unknown[]
      name: string
    }>()
    expect(study).toMatchObject({ goal: '', projects: [], name: 'Facts' })
    const source = (await call(readerNoDrive, 'GET', `/api/studies/${studyId}/source`)).json<{
      access: string
      source: unknown
    }>()
    expect(source).toMatchObject({ access: 'drive-not-connected', source: null })
    const facts = await call(readerNoDrive, 'GET', `/api/studies/${studyId}/facts`)
    expect(facts.json()).toMatchObject({ code: 'FOLDER_ACCESS_REQUIRED' })
  })

  it('gives a reader with the folder its access, never the inventory', async () => {
    const source = (await call(reader, 'GET', `/api/studies/${studyId}/source`)).json<{
      access: string
      source: unknown
    }>()
    expect(source).toMatchObject({ access: 'full', folderOwner: null, source: null })
  })

  it('FR-016, FR-017: a fact holds no name, its verbatims come only when anonymised', async () => {
    const url = `/api/studies/${studyId}/facts?status=all`
    const plain = await call(reader, 'GET', url)
    expect(plain.statusCode).toBe(200)
    const page = plain.json<{
      facts: { interviewNumber: number; verbatims: unknown[] }[]
      verbatimsHidden: boolean
    }>()
    expect(page.facts.length).toBeGreaterThan(0)
    expect(page.verbatimsHidden).toBe(true)
    expect(page.facts[0]).toMatchObject({ interviewNumber: 1, verbatims: [] })
    expect(plain.body).not.toMatch(/Sam|Alex|t-one\.txt|Planned/)

    await world.db
      .update(researchStudies)
      .set({ anonymised: true })
      .where(eq(researchStudies.id, studyId))
    const hidden = await call(reader, 'GET', url)
    const shown = hidden.json<{
      facts: { verbatims: { text: string; participant: string | null }[] }[]
      verbatimsHidden: boolean
    }>()
    expect(shown.verbatimsHidden).toBe(false)
    expect(shown.facts.flatMap((f) => f.verbatims).length).toBeGreaterThan(0)
    expect(hidden.body).not.toMatch(/Sam|Alex|t-one\.txt|Planned/)
    await world.db
      .update(researchStudies)
      .set({ anonymised: false })
      .where(eq(researchStudies.id, studyId))
  })

  it('SC-003: no open read holds a real name, even one written in a statement', async () => {
    await world.db.update(evidenceFacts).set({
      statementEn: 'Sam Example and the team never find the data',
      statementFr: 'Sam Example ne trouve jamais les données',
    })
    const reads = [
      `/api/projects/${projectId}`,
      `/api/projects/${projectId}/studies`,
      `/api/projects/${projectId}/overview`,
      `/api/projects/${projectId}/overview/costs`,
      `/api/projects/${projectId}/insights`,
      `/api/projects/${projectId}/insight-facts?page=1`,
      `/api/projects/${projectId}/recommendations`,
      `/api/projects/${projectId}/recommendation-insights`,
      `/api/projects/${projectId}/debrief?withProposed=true`,
      `/api/studies/${studyId}`,
      `/api/studies/${studyId}/guide`,
      `/api/studies/${studyId}/facts?status=all`,
      `/api/teams/${teamId}/studies`,
      `/api/teams/${teamId}/studies/overview`,
    ]
    for (const url of reads) {
      const res = await call(reader, 'GET', url)
      expect({ url, status: res.statusCode }).toEqual({ url, status: 200 })
      expect({ url, body: res.body }).not.toEqual({
        url,
        body: expect.stringMatching(/Sam Example|Alex Martin|Planned Person|t-one\.txt/),
      })
    }
    const facts = await call(reader, 'GET', `/api/projects/${projectId}/insight-facts?page=1`)
    expect(facts.body).toContain('[Person')
    // A schedule's "A and B" is two names: the word itself is not masked.
    expect(facts.body).toContain(' and the team')
    const found = await call(
      reader,
      'GET',
      `/api/projects/${projectId}/insight-facts?page=1&q=${encodeURIComponent('Sam Example')}`,
    )
    expect(found.json()).toMatchObject({ total: 0 })
  })

  it("FR-022: every team's projects come by page, and the directory counts them", async () => {
    const page = (await call(reader, 'GET', '/api/projects?teams=all&limit=1')).json<unknown[]>()
    expect(page).toHaveLength(1)
    const teams = (await call(reader, 'GET', '/api/teams/directory')).json<
      { name: string; projects: number }[]
    >()
    expect(teams.find((t) => t.name === 'Research')?.projects).toBe(1)
  })

  it("FR-015: masks a reader's text even without access to the folders", async () => {
    const before = await call(readerNoDrive, 'GET', `/api/projects/${projectId}/overview`)
    expect(before.statusCode).toBe(200)
    expect(before.body).not.toMatch(/Sam Example|Alex Martin/)
  })

  it("FR-012: a reader's project-level facts rest on their access now", async () => {
    const url = `/api/projects/${projectId}/insight-facts?page=1`
    expect((await call(reader, 'GET', url)).json()).toMatchObject({ total: expect.any(Number) })
    const before = (await call(reader, 'GET', url)).json<{ total: number }>().total
    expect(before).toBeGreaterThan(0)
    drive.sharedWith.get('folder-facts')?.delete('zoe@drive.example')
    world.clock.advance(6 * 60 * 1000)
    expect((await call(reader, 'GET', url)).json()).toMatchObject({ total: 0 })
    drive.share('folder-facts', 'zoe@drive.example')
    world.clock.advance(6 * 60 * 1000)
  })

  it('FR-012: a reader confirmed at their first opening gets the goal at once', async () => {
    await world.db
      .update(researchStudies)
      .set({ goal: 'Understand waiting' })
      .where(eq(researchStudies.id, studyId))
    const fresh = await world.session('new@research.example.com', 'New Reader')
    await connect(fresh, 'new@drive.example')
    drive.share('folder-facts', 'new@drive.example')
    const study = await call(fresh, 'GET', `/api/studies/${studyId}`)
    expect(study.json()).toMatchObject({ goal: 'Understand waiting' })
  })

  it('keeps what the team sees', async () => {
    const study = await call(alex, 'GET', `/api/studies/${studyId}`)
    expect(study.json()).toMatchObject({ canChange: true })
    expect((await call(alex, 'GET', `/api/studies/${studyId}/sessions`)).statusCode).toBe(200)
    const facts = await call(alex, 'GET', `/api/studies/${studyId}/facts?status=all`)
    expect(facts.json()).toMatchObject({ verbatimsHidden: false })
  })

  it('FR-010: a person removed from a team is refused at their next request', async () => {
    const other = await world.session('tim@research.example.com')
    await world.addMember(other.id, teamId)
    const payload = { version: 1, name: 'Renamed' }
    const url = `/api/projects/${projectId}/name`
    const before = await call(other, 'GET', `/api/projects/${projectId}`)
    expect(before.json()).toMatchObject({ canChange: true })
    expect(payload).toBeDefined()
    const admin = await world.session('admin@example.org')
    await call(admin, 'DELETE', `/api/members/${other.id}/teams/${teamId}`)
    const after = await call(other, 'PUT', url, payload)
    expect(after.json()).toMatchObject(READ_ONLY_REASON)
  })

  it('a creator outside the team cannot delete, and sees it', async () => {
    const creator = await world.session('cre@research.example.com')
    const owning = await world.team('Owning')
    await world.addMember(creator.id, owning)
    const id = (
      await call(creator, 'POST', '/api/projects', { name: 'Mine', teamId: owning })
    ).json<{ id: string }>().id
    const admin = await world.session('admin@example.org')
    await call(admin, 'DELETE', `/api/members/${creator.id}/teams/${owning}`)
    const project = await call(creator, 'GET', `/api/projects/${id}`)
    expect(project.json()).toMatchObject({ canChange: false, canDelete: false })
    const refused = await call(creator, 'POST', `/api/projects/${id}/delete`, { name: 'Mine' })
    expect(refused.statusCode).toBe(403)
  })
})

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auth_sessions, auth_users } from '../src/platform/auth/auth-schema.ts'
import { signIn } from './support/app.ts'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }
const DAY = 24 * 60 * 60 * 1000

describe('team-based access (US3)', () => {
  let world: World
  let admin: Who
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

  beforeAll(async () => {
    world = await startWorld()
    admin = await world.session('admin@example.org')
  })

  afterAll(async () => {
    await world?.close()
  })

  it('SC-004: listings and direct links return exactly the allowed projects', async () => {
    const [none, one, several] = [
      await world.session('none@research.example.com'),
      await world.session('one@research.example.com'),
      await world.session('several@research.example.com'),
    ]
    const teams = { a: await world.team('A'), b: await world.team('B'), c: await world.team('C') }
    const project = async (teamId: string, name: string) =>
      (await call(admin, 'POST', '/api/projects', { name, teamId })).json<{ id: string }>().id
    const projects = {
      a: await project(teams.a, 'PA'),
      b: await project(teams.b, 'PB'),
      c: await project(teams.c, 'PC'),
    }
    await call(admin, 'PUT', `/api/members/${one.id}/teams/${teams.a}`)
    await call(admin, 'PUT', `/api/members/${several.id}/teams/${teams.a}`)
    await call(admin, 'PUT', `/api/members/${several.id}/teams/${teams.b}`)

    const expectations: [Who, string[]][] = [
      [admin, ['a', 'b', 'c']],
      [none, []],
      [one, ['a']],
      [several, ['a', 'b']],
    ]
    for (const [who, allowed] of expectations) {
      const listed = (await call(who, 'GET', '/api/projects'))
        .json<{ id: string }[]>()
        .map((p) => p.id)
      expect(new Set(listed)).toEqual(
        new Set(allowed.map((k) => projects[k as keyof typeof projects])),
      )
      for (const [key, id] of Object.entries(projects)) {
        const status = (await call(who, 'GET', `/api/projects/${id}`)).statusCode
        expect(status).toBe(allowed.includes(key) ? 200 : 404)
      }
    }
  })

  it('lists members for admins only, with teams and provider', async () => {
    const members = await call(admin, 'GET', '/api/members')
    expect(members.statusCode).toBe(200)
    expect(
      members
        .json<{ email: string; provider: string }[]>()
        .find((m) => m.email === 'admin@example.org'),
    ).toMatchObject({
      role: 'admin',
      provider: 'mock',
      status: 'active',
    })
    const member = await world.session('reader@research.example.com')
    expect((await call(member, 'GET', '/api/members')).statusCode).toBe(404)
  })

  it('protects the last active admin', async () => {
    const response = await call(admin, 'PUT', `/api/members/${admin.id}/role`, { role: 'member' })
    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ code: 'LAST_ADMIN' })
  })

  it('ends sessions on deactivation and restores teams on reactivation', async () => {
    const dee = await world.session('dee@research.example.com')
    const team = await world.team('Dee team')
    await call(admin, 'PUT', `/api/members/${dee.id}/teams/${team}`)
    expect((await call(admin, 'POST', `/api/members/${dee.id}/deactivation`)).statusCode).toBe(204)
    expect((await call(dee, 'GET', '/api/me')).statusCode).toBe(401)
    expect((await signIn(world.app, { email: 'dee@research.example.com' })).status).toBe('refused')
    await call(admin, 'DELETE', `/api/members/${dee.id}/deactivation`)
    const again = await world.session('dee@research.example.com')
    expect((await call(again, 'GET', '/api/me')).json()).toMatchObject({ teams: [{ id: team }] })
  })

  it('SC-009 and SC-010: deletion anonymises the account, history records every change', async () => {
    const zoe = await world.session('zoe@research.example.com')
    const team = await world.team('Zoe team')
    await call(admin, 'PUT', `/api/members/${zoe.id}/teams/${team}`)
    await call(admin, 'PUT', `/api/members/${zoe.id}/role`, { role: 'admin' })
    expect(
      (await call(admin, 'DELETE', `/api/members/${zoe.id}`, { confirmation: 'nope' })).json(),
    ).toMatchObject({
      code: 'CONFIRMATION_MISMATCH',
    })
    expect(
      (
        await call(admin, 'DELETE', `/api/members/${zoe.id}`, {
          confirmation: 'zoe@research.example.com',
        })
      ).statusCode,
    ).toBe(204)
    expect((await call(zoe, 'GET', '/api/me')).statusCode).toBe(401)

    const members = (await call(admin, 'GET', '/api/members')).json<{ id: string }[]>()
    expect(members.find((m) => m.id === zoe.id)).toMatchObject({
      name: null,
      email: null,
      status: 'deleted',
      teams: [],
    })
    const everything = JSON.stringify([members, (await call(admin, 'GET', '/api/teams')).json()])
    expect(everything).not.toContain('zoe@research.example.com')

    const history = (await call(admin, 'GET', `/api/members/${zoe.id}/access-history`)).json<
      { type: string; actor: unknown }[]
    >()
    expect(history.map((e) => e.type)).toEqual([
      'deleted',
      'role_changed',
      'membership_granted',
      'account_created',
    ])
    expect(history[0]?.actor).toMatchObject({ id: admin.id })

    const comeback = await world.session('zoe@research.example.com')
    expect(comeback.id).not.toBe(zoe.id)
  })

  it('keeps the access history append-only', async () => {
    const appendOnly = { cause: { message: expect.stringMatching(/append-only/) } }
    await expect(
      world.db.execute(sql`UPDATE workspace_access_events SET type = 'deleted'`),
    ).rejects.toMatchObject(appendOnly)
    await expect(world.db.execute(sql`DELETE FROM workspace_access_events`)).rejects.toMatchObject(
      appendOnly,
    )
  })

  it('enforces the 30-day absolute session limit and the inactivity expiry', async () => {
    const sam = await world.session('sam@research.example.com')
    world.clock.advance(31 * DAY)
    expect((await call(sam, 'GET', '/api/me')).statusCode).toBe(401)
    world.clock.advance(-31 * DAY)

    const lee = await world.session('lee@research.example.com')
    await world.db
      .update(auth_sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(auth_sessions.userId, lee.id))
    expect((await call(lee, 'GET', '/api/me')).statusCode).toBe(401)
  })

  it('stores the interface language', async () => {
    expect((await call(admin, 'PUT', '/api/me/language', { language: 'fr' })).statusCode).toBe(204)
    const [row] = await world.db
      .select({ language: auth_users.language })
      .from(auth_users)
      .where(eq(auth_users.id, admin.id))
    expect(row?.language).toBe('fr')
  })
})

describe('teams API (US4)', () => {
  let world: World
  let admin: Who

  beforeAll(async () => {
    world = await startWorld()
    admin = await world.session('admin@example.org')
  })

  afterAll(async () => {
    await world?.close()
  })

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

  it('creates, renames and deletes teams with the documented rules', async () => {
    const created = await call(admin, 'POST', '/api/teams', { name: 'Growth' })
    expect(created.statusCode).toBe(201)
    const { id } = created.json<{ id: string }>()
    expect((await call(admin, 'POST', '/api/teams', { name: 'growth ' })).json()).toMatchObject({
      code: 'TEAM_NAME_TAKEN',
    })
    expect(
      (await call(admin, 'PUT', `/api/teams/${id}/name`, { name: 'Insights', version: 0 })).json(),
    ).toEqual({ version: 1 })

    const project = (await call(admin, 'POST', '/api/projects', { name: 'P', teamId: id })).json<{
      id: string
    }>().id
    const refused = await call(admin, 'DELETE', `/api/teams/${id}`)
    expect(refused.statusCode).toBe(409)
    expect(refused.json()).toMatchObject({ code: 'TEAM_HAS_PROJECTS', detail: { projectCount: 1 } })

    const other = (await call(admin, 'POST', '/api/teams', { name: 'Other' })).json<{
      id: string
    }>().id
    await call(admin, 'PUT', `/api/projects/${project}/team`, { teamId: other, version: 0 })
    expect((await call(admin, 'DELETE', `/api/teams/${id}`)).statusCode).toBe(204)
  })

  it('shows members their teams read-only, with who is in them', async () => {
    const mia = await world.session('mia@research.example.com')
    const team = (await call(admin, 'POST', '/api/teams', { name: 'Mia team' })).json<{
      id: string
    }>().id
    await call(admin, 'PUT', `/api/members/${mia.id}/teams/${team}`)
    const teams = (await call(mia, 'GET', '/api/teams')).json<
      { name: string; members: { id: string }[] }[]
    >()
    expect(teams.map((t) => t.name)).toEqual(['Mia team'])
    expect(teams[0]?.members.map((m) => m.id)).toEqual([mia.id])
    expect((await call(mia, 'POST', '/api/teams', { name: 'Mine' })).statusCode).toBe(403)
  })
})

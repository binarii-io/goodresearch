import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { createAccessGuard } from './change-guard.ts'
import { registerErrorHandling } from './errors.ts'

const team = { id: 't1', name: 'Team one' }

const build = async (
  account: { id: string; role: 'admin' | 'member' },
  teamIds: readonly string[],
) => {
  const app = Fastify()
  registerErrorHandling(app)
  const preHandler = createAccessGuard({
    session: async (request) => {
      request.account = account
    },
    access: async () => ({ role: account.role, teamIds }),
    owner: async (_kind, id) => (id === 'known' ? team : null),
  })
  const answer = async () => ({ ok: true })
  app.post('/api/studies/:studyId/thing', { preHandler }, answer)
  app.get('/api/studies/:studyId/source/files', { preHandler }, answer)
  app.get('/api/studies/:studyId/facts', { preHandler }, answer)
  app.post('/api/teams/:teamId/studies', { preHandler }, answer)
  app.put('/api/teams/:teamId/name', { preHandler }, answer)
  await app.ready()
  return app
}

describe('access guard (spec 026)', () => {
  let app: FastifyInstance
  const member = { id: 'a', role: 'member' as const }
  afterEach(() => app.close())

  it('refuses a change from outside the team, and names the team', async () => {
    app = await build(member, [])
    const res = await app.inject({ method: 'POST', url: '/api/studies/known/thing' })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ code: 'READ_ONLY', detail: { team } })
  })

  it('refuses a reserved read from outside the team', async () => {
    app = await build(member, [])
    const res = await app.inject({ method: 'GET', url: '/api/studies/known/source/files' })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ code: 'READ_ONLY' })
  })

  it('leaves the reads open to every member', async () => {
    app = await build(member, [])
    expect((await app.inject({ url: '/api/studies/known/facts' })).statusCode).toBe(200)
  })

  it('lets the team and admins through', async () => {
    app = await build(member, ['t1'])
    const res = await app.inject({ method: 'POST', url: '/api/studies/known/thing' })
    expect(res.statusCode).toBe(200)
    await app.close()
    app = await build({ id: 'b', role: 'admin' }, [])
    const admin = await app.inject({ method: 'POST', url: '/api/studies/known/thing' })
    expect(admin.statusCode).toBe(200)
  })

  it('passes an unknown id through, for the use case to answer not found', async () => {
    app = await build(member, [])
    const res = await app.inject({ method: 'POST', url: '/api/studies/nope/thing' })
    expect(res.statusCode).toBe(200)
  })

  it('guards a team only for what it owns, not its management', async () => {
    app = await build(member, [])
    const study = await app.inject({ method: 'POST', url: '/api/teams/known/studies' })
    expect(study.statusCode).toBe(403)
    const rename = await app.inject({ method: 'PUT', url: '/api/teams/known/name' })
    expect(rename.statusCode).toBe(200)
  })
})

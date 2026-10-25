import { describe, expect, it } from 'vitest'
import {
  DriveAccessDenied,
  DriveConnectionLost,
  DriveIncompleteListing,
} from '../domain/drive-gateway.ts'
import { createDriveFetchGateway } from '../infrastructure/drive.fetch-gateway.ts'
import { createGoogleDriveAuthorization } from '../infrastructure/google-oauth.ts'

type Call = { method: string; url: URL; body: string }

/** A fake fetch answering like Google, recording every request. */
const fakeFetch = (routes: (call: Call) => { status: number; body: unknown } | undefined) => {
  const calls: Call[] = []
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const call = {
      method: init?.method ?? 'GET',
      url: new URL(String(input)),
      body: String(init?.body ?? ''),
    }
    calls.push(call)
    const answer = routes(call) ?? { status: 404, body: { error: { code: 404 } } }
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { fetch: fetch as typeof globalThis.fetch, calls }
}

const tokenOk = { status: 200, body: { access_token: 'access-1', expires_in: 3600 } }

const onlyReads = (calls: Call[]) => {
  for (const c of calls) {
    if (c.url.hostname === 'www.googleapis.com') expect(c.method).toBe('GET')
    else expect(['oauth2.googleapis.com']).toContain(c.url.hostname)
  }
}

describe('Drive fetch gateway', () => {
  it('reads an item with the documented fields and refreshes the access token once', async () => {
    const { fetch, calls } = fakeFetch((c) => {
      if (c.url.hostname === 'oauth2.googleapis.com') return tokenOk
      if (c.url.pathname === '/drive/v3/files/folder-1')
        return {
          status: 200,
          body: {
            id: 'folder-1',
            name: 'Q4',
            mimeType: 'application/vnd.google-apps.folder',
            owners: [{ displayName: 'Alice' }],
            webViewLink: 'https://drive.google.com/drive/folders/folder-1',
          },
        }
      return undefined
    })
    const gateway = createDriveFetchGateway({ clientId: 'id', clientSecret: 'secret', fetch })
    expect(await gateway.getItem('refresh-1', 'folder-1')).toMatchObject({
      id: 'folder-1',
      name: 'Q4',
      ownerName: 'Alice',
    })
    await gateway.getItem('refresh-1', 'folder-1')
    expect(calls.filter((c) => c.url.hostname === 'oauth2.googleapis.com')).toHaveLength(1)
    const get = calls.find((c) => c.url.pathname.startsWith('/drive'))
    expect(get?.url.searchParams.get('supportsAllDrives')).toBe('true')
    expect(get?.url.searchParams.get('fields')).toContain('shortcutDetails')
    onlyReads(calls)
  })

  it('returns null for an item the person cannot open', async () => {
    const { fetch } = fakeFetch((c) =>
      c.url.hostname === 'oauth2.googleapis.com' ? tokenOk : undefined,
    )
    expect(
      await createDriveFetchGateway({ clientId: 'id', clientSecret: 's', fetch }).getItem(
        'r',
        'missing',
      ),
    ).toBeNull()
  })

  it('reports a revoked permission as a lost connection', async () => {
    const { fetch } = fakeFetch(() => ({ status: 400, body: { error: 'invalid_grant' } }))
    await expect(
      createDriveFetchGateway({ clientId: 'id', clientSecret: 's', fetch }).getItem('r', 'x'),
    ).rejects.toBeInstanceOf(DriveConnectionLost)
  })

  it('lists children page by page for several parents, and fails on incomplete listings', async () => {
    let page = 0
    const { fetch, calls } = fakeFetch((c) => {
      if (c.url.hostname === 'oauth2.googleapis.com') return tokenOk
      if (c.url.pathname !== '/drive/v3/files') return undefined
      page++
      if (page === 1)
        return {
          status: 200,
          body: {
            nextPageToken: 'p2',
            files: [{ id: 'a', name: 'a.mp4', mimeType: 'video/mp4', parents: ['f1'] }],
          },
        }
      if (page === 2)
        return {
          status: 200,
          body: {
            files: [
              { id: 'b', name: 'b.txt', mimeType: 'text/plain', parents: ['f2'], size: '12' },
            ],
          },
        }
      return { status: 200, body: { incompleteSearch: true, files: [] } }
    })
    const gateway = createDriveFetchGateway({ clientId: 'id', clientSecret: 's', fetch })
    const pages: string[][] = []
    for await (const items of gateway.listChildren('r', ['f1', 'f2']))
      pages.push(items.map((i) => `${i.id}:${i.size ?? ''}`))
    expect(pages).toEqual([['a:'], ['b:12']])
    const q = calls.find((c) => c.url.pathname === '/drive/v3/files')?.url.searchParams.get('q')
    expect(q).toBe("('f1' in parents or 'f2' in parents) and trashed = false")
    await expect(async () => {
      for await (const _ of gateway.listChildren('r', ['f3'])) void _
    }).rejects.toBeInstanceOf(DriveIncompleteListing)
    onlyReads(calls)
  })

  it('treats a non-rate-limit 403 as no access, and refuses listing with DriveAccessDenied', async () => {
    const { fetch } = fakeFetch((c) =>
      c.url.hostname === 'oauth2.googleapis.com'
        ? tokenOk
        : { status: 403, body: { error: { errors: [{ reason: 'appNotAuthorizedToFile' }] } } },
    )
    const gateway = createDriveFetchGateway({
      clientId: 'id',
      clientSecret: 's',
      fetch,
      retryDelayMs: 1,
    })
    expect(await gateway.getItem('r', 'x')).toBeNull()
    await expect(async () => {
      for await (const _ of gateway.listChildren('r', ['f'])) void _
    }).rejects.toBeInstanceOf(DriveAccessDenied)
  })

  it('escapes quotes and backslashes in queries', async () => {
    const { fetch, calls } = fakeFetch((c) =>
      c.url.hostname === 'oauth2.googleapis.com' ? tokenOk : { status: 200, body: { files: [] } },
    )
    for await (const _ of createDriveFetchGateway({
      clientId: 'id',
      clientSecret: 's',
      fetch,
    }).listChildren('r', ["a\\'b"]))
      void _
    expect(calls.at(-1)?.url.searchParams.get('q')).toBe(
      "('a\\\\\\'b' in parents) and trashed = false",
    )
  })

  it('reports Drive as unavailable when rate limiting persists, never as no access', async () => {
    const { fetch } = fakeFetch((c) =>
      c.url.hostname === 'oauth2.googleapis.com' ? tokenOk : { status: 429, body: {} },
    )
    const gateway = createDriveFetchGateway({
      clientId: 'id',
      clientSecret: 's',
      fetch,
      retryDelayMs: 1,
    })
    await expect(gateway.getItem('r', 'x')).rejects.toThrow(/rate limited/)
  })

  it('retries after rate limiting', async () => {
    let attempts = 0
    const { fetch } = fakeFetch((c) => {
      if (c.url.hostname === 'oauth2.googleapis.com') return tokenOk
      attempts++
      return attempts < 3
        ? { status: 429, body: {} }
        : { status: 200, body: { id: 'x', name: 'x', mimeType: 'video/mp4' } }
    })
    const gateway = createDriveFetchGateway({
      clientId: 'id',
      clientSecret: 's',
      fetch,
      retryDelayMs: 1,
    })
    expect(await gateway.getItem('r', 'x')).toMatchObject({ id: 'x' })
  })
})

describe('Google Drive authorization', () => {
  const appUrl = new URL('https://research.example.org')

  it('asks for read-only Drive access, offline, with PKCE', () => {
    const { fetch } = fakeFetch(() => undefined)
    const url = new URL(
      createGoogleDriveAuthorization({
        clientId: 'cid',
        clientSecret: 's',
        appUrl,
        fetch,
      }).authorizationUrl({ state: 'st', codeChallenge: 'ch', loginHint: '', access: 'read' }),
    )
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    // Each consent stays on its own (Drive, Vertex AI): no merged incremental grant.
    expect(url.searchParams.has('include_granted_scopes')).toBe(false)
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'cid',
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state: 'st',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
      redirect_uri: 'https://research.example.org/api/sources/google-drive/callback',
    })
  })

  it('exchanges the code, checks the granted scope and reads the Google account', async () => {
    const { fetch, calls } = fakeFetch((c) => {
      if (c.url.pathname === '/token' && c.body.includes('grant_type=authorization_code'))
        return {
          status: 200,
          body: {
            access_token: 'a',
            refresh_token: 'r',
            scope: 'https://www.googleapis.com/auth/drive.readonly',
          },
        }
      if (c.url.pathname === '/drive/v3/about')
        return { status: 200, body: { user: { emailAddress: 'alice@example.org' } } }
      return undefined
    })
    const auth = createGoogleDriveAuthorization({
      clientId: 'cid',
      clientSecret: 's',
      appUrl,
      fetch,
    })
    expect(await auth.exchange({ code: 'c', codeVerifier: 'v', access: 'read' })).toEqual({
      refreshToken: 'r',
      externalAccount: 'alice@example.org',
      access: 'read',
    })
    expect(calls[0]?.body).toContain('code_verifier=v')
    onlyReads(calls)
  })

  it('refuses a consent where the Drive scope was unticked', async () => {
    const { fetch } = fakeFetch(() => ({
      status: 200,
      body: { access_token: 'a', refresh_token: 'r', scope: 'openid email' },
    }))
    await expect(
      createGoogleDriveAuthorization({
        clientId: 'cid',
        clientSecret: 's',
        appUrl,
        fetch,
      }).exchange({ code: 'c', codeVerifier: 'v', access: 'read' }),
    ).rejects.toThrow(/scope/)
  })

  it('asks the editing scope for publishing and refuses a consent without it (spec 007)', async () => {
    const auth = (body: object) =>
      createGoogleDriveAuthorization({
        clientId: 'cid',
        clientSecret: 's',
        appUrl,
        fetch: fakeFetch((c) =>
          c.url.pathname === '/drive/v3/about'
            ? { status: 200, body: { user: { emailAddress: 'alice@example.org' } } }
            : { status: 200, body },
        ).fetch,
      })
    const url = new URL(
      auth({}).authorizationUrl({
        state: 'st',
        codeChallenge: 'ch',
        loginHint: '',
        access: 'write',
      }),
    )
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive')
    const readOnly = {
      access_token: 'a',
      refresh_token: 'r',
      scope: 'https://www.googleapis.com/auth/drive.readonly',
    }
    await expect(
      auth(readOnly).exchange({ code: 'c', codeVerifier: 'v', access: 'write' }),
    ).rejects.toThrow(/scope/)
    const both = { ...readOnly, scope: `${readOnly.scope} https://www.googleapis.com/auth/drive` }
    expect(
      (await auth(both).exchange({ code: 'c', codeVerifier: 'v', access: 'read' })).access,
    ).toBe('write')
  })

  it('revokes at Google', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: {} }))
    await createGoogleDriveAuthorization({
      clientId: 'cid',
      clientSecret: 's',
      appUrl,
      fetch,
    }).revoke('r')
    expect(calls[0]?.url.href).toBe('https://oauth2.googleapis.com/revoke')
    expect(calls[0]?.body).toBe('token=r')
  })
})

import { describe, expect, it } from 'vitest'
import { createGcsStorage, createMemoryStorage } from './storage.ts'

describe('object storage in memory (spec 038)', () => {
  it('puts, gets and deletes by prefix', async () => {
    const s = createMemoryStorage()
    await s.put('usability/a/1.jpg', new Uint8Array([1, 2]), 'image/jpeg')
    await s.put('usability/a/2.jpg', new Uint8Array([3]), 'image/jpeg')
    await s.put('usability/b/1.jpg', new Uint8Array([4]), 'image/jpeg')
    expect(await s.get('usability/a/1.jpg')).toEqual({
      bytes: new Uint8Array([1, 2]),
      contentType: 'image/jpeg',
    })
    expect(await s.get('missing')).toBeNull()
    expect(await s.deleteByPrefix('usability/a/')).toBe(2)
    expect([...s.objects.keys()]).toEqual(['usability/b/1.jpg'])
  })
})

describe('object storage in Google Cloud Storage (deployment on Google Cloud)', () => {
  /** A bucket in memory behind the JSON API, checking the service's access on every call. */
  const gcs = () => {
    const objects = new Map<string, { bytes: Uint8Array; type: string }>()
    const fake = (async (input: string, init?: RequestInit) => {
      const url = new URL(input)
      const headers = new Headers(init?.headers)
      if (headers.get('authorization') !== 'Bearer service-token')
        return new Response(null, { status: 401 })
      const method = init?.method ?? 'GET'
      if (url.pathname === '/upload/storage/v1/b/screens/o' && method === 'POST') {
        objects.set(url.searchParams.get('name') ?? '', {
          bytes: new Uint8Array(init?.body as Uint8Array),
          type: headers.get('content-type') ?? '',
        })
        return new Response('{}', { status: 200 })
      }
      if (url.pathname === '/storage/v1/b/screens/o' && method === 'GET') {
        const prefix = url.searchParams.get('prefix') ?? ''
        const items = [...objects.keys()]
          .filter((k) => k.startsWith(prefix))
          .map((name) => ({ name }))
        return Response.json({ items })
      }
      const key = decodeURIComponent(url.pathname.replace('/storage/v1/b/screens/o/', ''))
      const found = objects.get(key)
      if (method === 'DELETE')
        return new Response(null, { status: objects.delete(key) ? 204 : 404 })
      if (!found) return new Response(null, { status: 404 })
      return new Response(found.bytes, { status: 200, headers: { 'content-type': found.type } })
    }) as typeof fetch
    return {
      objects,
      storage: createGcsStorage({
        bucket: 'screens',
        fetch: fake,
        accessToken: async () => 'service-token',
      }),
    }
  }

  it('puts, gets and deletes by prefix with the service identity, no key', async () => {
    const { storage, objects } = gcs()
    expect(await storage.isReady()).toBe(true)
    await storage.put('usability/a/1.jpg', new Uint8Array([1, 2]), 'image/jpeg')
    await storage.put('usability/a/2.jpg', new Uint8Array([3]), 'image/jpeg')
    await storage.put('usability/b/1.jpg', new Uint8Array([4]), 'image/jpeg')
    expect(await storage.get('usability/a/1.jpg')).toEqual({
      bytes: new Uint8Array([1, 2]),
      contentType: 'image/jpeg',
    })
    expect(await storage.get('missing')).toBeNull()
    expect(await storage.deleteByPrefix('usability/a/')).toBe(2)
    expect([...objects.keys()]).toEqual(['usability/b/1.jpg'])
  })
})

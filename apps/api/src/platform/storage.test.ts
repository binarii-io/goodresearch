import { describe, expect, it } from 'vitest'
import { createMemoryStorage } from './storage.ts'

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

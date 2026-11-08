import { describe, expect, it } from 'vitest'
import { mp4DurationMs } from '../infrastructure/mp4-duration.ts'

const box = (type: string, content: Uint8Array) => {
  const out = new Uint8Array(8 + content.length)
  new DataView(out.buffer).setUint32(0, out.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(content, 8)
  return out
}

const mvhd = (timescale: number, duration: number) => {
  const content = new Uint8Array(100)
  const view = new DataView(content.buffer)
  view.setUint32(12, timescale)
  view.setUint32(16, duration)
  return box('mvhd', content)
}

const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** Reads of a file in memory, counted. */
const reader = (file: Uint8Array) => {
  const reads: [number, number][] = []
  return {
    reads,
    read: async (start: number, end: number) => {
      reads.push([start, end])
      return file.subarray(start, end + 1)
    },
  }
}

describe('the length of an MP4 video from its header (spec 037 FR-004)', () => {
  it('skips the media data to find the movie header at the end, in a few small reads', async () => {
    const file = join(
      box('ftyp', new Uint8Array(16)),
      box('mdat', new Uint8Array(200_000)),
      box('moov', join(mvhd(1000, 1_865_400), box('trak', new Uint8Array(40)))),
    )
    const r = reader(file)
    expect(await mp4DurationMs(r.read, file.length)).toBe(1_865_400)
    expect(r.reads.length).toBeLessThanOrEqual(5)
    expect(r.reads.every(([a, b]) => b - a < 64)).toBe(true)
  })

  it('reads the movie header placed before the media data', async () => {
    const file = join(box('ftyp', new Uint8Array(8)), box('moov', mvhd(600, 600 * 95)))
    expect(await mp4DurationMs(reader(file).read, file.length)).toBe(95_000)
  })

  it('says nothing for a file that is not an MP4 or has no duration', async () => {
    const text = new TextEncoder().encode('not a video at all, just text')
    expect(await mp4DurationMs(reader(text).read, text.length)).toBeNull()
    const empty = join(box('ftyp', new Uint8Array(8)), box('moov', mvhd(1000, 0)))
    expect(await mp4DurationMs(reader(empty).read, empty.length)).toBeNull()
  })
})

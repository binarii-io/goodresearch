import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMediaTools } from '../infrastructure/media-tools.ts'

const run = promisify(execFile)
const hasFfmpeg = await run('ffmpeg', ['-version']).then(
  () => true,
  () => false,
)

describe.skipIf(!hasFfmpeg)('media tools on a real video (ffmpeg)', () => {
  const tools = createMediaTools()
  let dir: Awaited<ReturnType<typeof tools.workdir>>
  let video: string

  beforeAll(async () => {
    dir = await tools.workdir()
    video = join(dir.path, 'test.mp4')
    await run('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x240:rate=10',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440',
      '-t',
      '9',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      '-y',
      video,
    ])
  })

  afterAll(async () => {
    await dir.release()
  })

  it("crops a box read on 960-wide frames at the video's own size, cut at the edges", async () => {
    // On this 320-wide video, the right half of a 960-wide frame is x 160, width 160.
    const right = await tools.frames(video, [1000], { x: 480, y: 0, width: 480, height: 720 }, 160)
    expect(right).toHaveLength(1)
    // A box past the edges still gives frames and keyframes, never an error.
    const past = { x: 900, y: 600, width: 400, height: 400 }
    expect(await tools.frames(video, [1000], past, 80)).toHaveLength(1)
    expect((await tools.keyframes(video, 3000, past)).length).toBeGreaterThan(0)
  })

  it('reads the length, frames at moments, keyframes and sound', async () => {
    expect(Math.abs((await tools.durationMs(video)) - 9000)).toBeLessThan(300)
    const frames = await tools.frames(
      video,
      [1000, 5000],
      { x: 0, y: 0, width: 160, height: 120 },
      80,
    )
    expect(frames.map((f) => f.atMs)).toEqual([1000, 5000])
    // JPEG magic number.
    expect([...(frames[0]?.jpeg.slice(0, 2) ?? [])]).toEqual([0xff, 0xd8])
    const keyframes = await tools.keyframes(video, 3000, null)
    expect(keyframes.length).toBeGreaterThan(0)
    expect(keyframes.every((f) => f.atMs % 3000 === 0)).toBe(true)
    const audio = await tools.audio(video, 0, 4000, join(dir.path, 'a.flac'))
    expect(audio.endsWith('a.flac')).toBe(true)
  })
})

import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
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

  const local = () => ({ input: video, headers: {} })

  it("crops a box read on 960-wide frames at the video's own size, cut at the edges", async () => {
    // On this 320-wide video, the right half of a 960-wide frame is x 160, width 160.
    const right = await tools.frames(
      local(),
      [1000],
      { x: 480, y: 0, width: 480, height: 720 },
      160,
    )
    expect(right).toHaveLength(1)
    // A box past the edges still gives frames and keyframes, never an error.
    const past = { x: 900, y: 600, width: 400, height: 400 }
    expect(await tools.frames(local(), [1000], past, 80)).toHaveLength(1)
    const work = await tools.workdir()
    expect((await tools.keyframes(local(), 3000, past, work.path)).length).toBeGreaterThan(0)
    await work.release()
  })

  it('reads the length, frames at moments, keyframes by batches and sound as a stream', async () => {
    expect(Math.abs((await tools.durationMs(local())) - 9000)).toBeLessThan(300)
    const frames = await tools.frames(
      local(),
      [1000, 5000],
      { x: 0, y: 0, width: 160, height: 120 },
      80,
    )
    expect(frames.map((f) => f.atMs)).toEqual([1000, 5000])
    // JPEG magic number.
    expect([...(frames[0]?.jpeg.slice(0, 2) ?? [])]).toEqual([0xff, 0xd8])
    const work = await tools.workdir()
    const keyframes = await tools.keyframes(local(), 3000, null, work.path)
    expect(keyframes.length).toBeGreaterThan(0)
    expect(keyframes.every((f) => f.atMs % 3000 === 0)).toBe(true)
    const [first] = await tools.take(keyframes.slice(0, 1))
    expect([...(first?.jpeg.slice(0, 2) ?? [])]).toEqual([0xff, 0xd8])
    // Read once, its file is gone.
    expect((await readdir(work.path)).length).toBe(keyframes.length - 1)
    await work.release()
    const bytes: number[] = []
    for await (const part of tools.audio(local(), 0, 4000)) bytes.push(...part)
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('fLaC')
  })

  it('reads a staged video over https by ranges, with its access header', async () => {
    const data = await readFile(video)
    const seen: { auth: string | undefined; range: string | undefined }[] = []
    const server = createServer((req, res) => {
      seen.push({ auth: req.headers.authorization, range: req.headers.range })
      if (req.headers.authorization !== 'Bearer token') {
        res.writeHead(401).end()
        return
      }
      const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '')
      const start = m ? Number(m[1]) : 0
      const end = m?.[2] ? Math.min(Number(m[2]), data.length - 1) : data.length - 1
      res.writeHead(m ? 206 : 200, {
        'accept-ranges': 'bytes',
        'content-type': 'video/mp4',
        'content-length': String(end - start + 1),
        ...(m ? { 'content-range': `bytes ${start}-${end}/${data.length}` } : {}),
      })
      res.end(data.subarray(start, end + 1))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    const remote = {
      input: `http://127.0.0.1:${port}/v.mp4`,
      headers: { Authorization: 'Bearer token' },
    }
    try {
      expect(Math.abs((await tools.durationMs(remote)) - 9000)).toBeLessThan(300)
      expect(await tools.frames(remote, [6000], null, 80)).toHaveLength(1)
      const bytes: number[] = []
      for await (const part of tools.audio(remote, 1000, 3000)) bytes.push(...part)
      expect(bytes.length).toBeGreaterThan(100)
      expect(seen.every((r) => r.auth === 'Bearer token')).toBe(true)
      // Seeking reads by ranges, not the whole file each time.
      expect(seen.some((r) => r.range && r.range !== 'bytes=0-')).toBe(true)
    } finally {
      server.close()
    }
  })
})

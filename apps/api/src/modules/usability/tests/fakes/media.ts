import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MediaTools } from '../../application/ports.ts'

/** Frames and sound without ffmpeg, for tests that run the whole app (component, CI). */
export const fakeMediaTools: MediaTools = {
  workdir: async () => {
    const path = await mkdtemp(join(tmpdir(), 'usability-test-'))
    return { path, release: () => rm(path, { recursive: true, force: true }) }
  },
  durationMs: async () => 60_000,
  frames: async (_video, atMs) =>
    atMs.map((t) => ({ atMs: t, jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) })),
  keyframes: async () =>
    [0, 15_000, 30_000, 45_000].map((t) => ({
      atMs: t,
      jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    })),
  audio: async (_video, _start, _end, out) => out,
}

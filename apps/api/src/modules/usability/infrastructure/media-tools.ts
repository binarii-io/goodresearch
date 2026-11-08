import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { Crop, Frame, MediaTools } from '../application/ports.ts'

const run = promisify(execFile)

/** ffmpeg and ffprobe of the worker image (ADR-0013); fixed arguments, never a shell. */
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe'
const BUFFER = 64 * 1024 * 1024

const seconds = (ms: number) => (Math.max(0, ms) / 1000).toFixed(3)

/**
 * The crop of the shared screen. Its box is in pixels of a frame scaled to `LAYOUT_WIDTH` wide (the
 * frames the layout was read on); the video is cropped at its own size, so the box is scaled by
 * `iw / LAYOUT_WIDTH` and kept inside the picture (a box past an edge is cut, never an error).
 */
const cropFilter = (crop: Crop | null) => {
  if (!crop || crop.width <= 0 || crop.height <= 0) return []
  const at = (v: number) => `iw*${Math.max(0, Math.round(v))}/${LAYOUT_WIDTH}`
  // Commas inside a filter's expression are escaped for ffmpeg's filter parser (no shell here).
  const w = `min(iw\\,${at(crop.width)})`
  const h = `min(ih\\,${at(crop.height)})`
  const x = `min(iw-out_w\\,${at(crop.x)})`
  const y = `min(ih-out_h\\,${at(crop.y)})`
  return [`crop=w=${w}:h=${h}:x=${x}:y=${y}`]
}

/** The width of the frames the layout is read on: crop boxes are in their pixels. */
export const LAYOUT_WIDTH = 960

/** Frames, keyframes and sound of the local copy of a session's video (research R5). */
export const createMediaTools = (): MediaTools => {
  let dirs = 0
  return {
    workdir: async () => {
      const path = await mkdtemp(join(tmpdir(), `usability-${++dirs}-`))
      return { path, release: () => rm(path, { recursive: true, force: true }) }
    },

    durationMs: async (video) => {
      const { stdout } = await run(FFPROBE, [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'csv=p=0',
        video,
      ])
      return Math.round(Number.parseFloat(stdout.trim()) * 1000)
    },

    frames: async (video, atMs, crop, width = 640) => {
      const dir = await mkdtemp(join(tmpdir(), 'usability-frames-'))
      try {
        const frames: Frame[] = []
        for (const [i, t] of atMs.entries()) {
          const out = join(dir, `${i}.jpg`)
          // Seeking before the input is fast and exact enough at a frame.
          await run(
            FFMPEG,
            [
              '-v',
              'error',
              '-ss',
              seconds(t),
              '-i',
              video,
              '-frames:v',
              '1',
              '-vf',
              [...cropFilter(crop), `scale=${width}:-2`].join(','),
              '-q:v',
              '5',
              '-y',
              out,
            ],
            { maxBuffer: BUFFER },
          ).catch(() => undefined)
          const jpeg = await readFile(out).catch(() => null)
          if (jpeg) frames.push({ atMs: t, jpeg: new Uint8Array(jpeg) })
        }
        return frames
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },

    keyframes: async (video, everyMs, crop) => {
      const dir = await mkdtemp(join(tmpdir(), 'usability-keyframes-'))
      try {
        // One frame every `everyMs`, near-duplicates dropped (the trial's mpdecimate settings);
        // file names carry the frame's time in steps of `everyMs`.
        await run(
          FFMPEG,
          [
            '-v',
            'error',
            '-i',
            video,
            '-vf',
            [
              `fps=1000/${everyMs}`,
              ...cropFilter(crop),
              'mpdecimate=hi=64*40:lo=64*12:frac=0.2',
              'scale=960:-2',
            ].join(','),
            '-fps_mode',
            'vfr',
            '-frame_pts',
            '1',
            '-q:v',
            '5',
            '-y',
            join(dir, '%08d.jpg'),
          ],
          { maxBuffer: BUFFER },
        )
        const names = (await readdir(dir)).filter((n) => n.endsWith('.jpg')).sort()
        // Awaited here: the `finally` must not delete the frames while they are being read.
        return await Promise.all(
          names.map(async (n) => ({
            atMs: Number.parseInt(n, 10) * everyMs,
            jpeg: new Uint8Array(await readFile(join(dir, n))),
          })),
        )
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },

    audio: async (video, startMs, endMs, out) => {
      await run(
        FFMPEG,
        [
          '-v',
          'error',
          '-ss',
          seconds(startMs),
          '-to',
          seconds(endMs),
          '-i',
          video,
          '-vn',
          '-ac',
          '1',
          '-ar',
          '16000',
          '-c:a',
          'flac',
          '-y',
          out,
        ],
        { maxBuffer: BUFFER },
      )
      return out
    },
  }
}

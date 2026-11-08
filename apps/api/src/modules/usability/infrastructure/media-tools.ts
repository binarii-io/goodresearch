import { execFile, spawn } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { Crop, Frame, KeyframeFile, MediaTools, VideoSource } from '../application/ports.ts'

const run = promisify(execFile)

/** ffmpeg and ffprobe of the worker image (ADR-0013); fixed arguments, never a shell. */
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe'
/** One JPEG frame on stdout stays far below this. */
const FRAME_BUFFER = 16 * 1024 * 1024
/** Decoding threads: enough for the pace of an analysis, a bounded memory (ADR-0013 update). */
const THREADS = '2'

const seconds = (ms: number) => (Math.max(0, ms) / 1000).toFixed(3)

/**
 * The input options of an ffmpeg or ffprobe call. A staged video is read over https by ranges,
 * with its short-lived access as a header and reconnection on a network error; nothing of it is
 * stored. A local path (dev and test provider) is read as is.
 */
const remoteOptions = (video: VideoSource) =>
  /^https?:\/\//.test(video.input)
    ? [
        '-reconnect',
        '1',
        '-reconnect_on_network_error',
        '1',
        '-reconnect_delay_max',
        '10',
        '-headers',
        Object.entries(video.headers)
          .map(([name, value]) => `${name}: ${value}\r\n`)
          .join(''),
      ]
    : []

const inputOf = (video: VideoSource) => [...remoteOptions(video), '-i', video.input]

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

/** Frames, keyframes and sound of a session's staged video (research R5, ADR-0013). */
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
        ...remoteOptions(video),
        '-show_entries',
        'format=duration',
        '-of',
        'csv=p=0',
        video.input,
      ])
      return Math.round(Number.parseFloat(stdout.trim()) * 1000)
    },

    frames: async (video, atMs, crop, width = 640) => {
      const frames: Frame[] = []
      let failure: unknown = null
      for (const t of atMs) {
        // Seeking before the input reads only the bytes around the moment; the JPEG comes on
        // stdout, no file written.
        const jpeg = await run(
          FFMPEG,
          [
            '-v',
            'error',
            '-threads',
            THREADS,
            '-ss',
            seconds(t),
            ...inputOf(video),
            '-frames:v',
            '1',
            '-vf',
            [...cropFilter(crop), `scale=${width}:-2`].join(','),
            '-q:v',
            '5',
            '-f',
            'image2pipe',
            '-c:v',
            'mjpeg',
            'pipe:1',
          ],
          { encoding: 'buffer', maxBuffer: FRAME_BUFFER },
        ).then(
          ({ stdout }) => stdout,
          (error: unknown) => {
            failure = error
            return null
          },
        )
        if (jpeg?.byteLength) frames.push({ atMs: t, jpeg: new Uint8Array(jpeg) })
      }
      // A moment past the end gives no frame; none at all is the copy unreadable (its access, the
      // network): said, not hidden behind an empty list.
      if (!frames.length && failure) throw failure
      return frames
    },

    keyframes: async (video, everyMs, crop, dir) => {
      // One frame every `everyMs`, near-duplicates dropped (the trial's mpdecimate settings);
      // file names carry the frame's time in steps of `everyMs`. The video is read once, as it
      // streams; only the small JPEG files stay, until their batch is read.
      await run(FFMPEG, [
        '-v',
        'error',
        '-threads',
        THREADS,
        ...inputOf(video),
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
      ])
      return (await readdir(dir))
        .filter((n) => n.endsWith('.jpg'))
        .sort()
        .map((n): KeyframeFile => ({ atMs: Number.parseInt(n, 10) * everyMs, path: join(dir, n) }))
    },

    take: async (files) => {
      const frames: Frame[] = []
      for (const f of files) {
        frames.push({ atMs: f.atMs, jpeg: new Uint8Array(await readFile(f.path)) })
        await rm(f.path, { force: true })
      }
      return frames
    },

    audio: (video, startMs, endMs) => ({
      async *[Symbol.asyncIterator]() {
        // FLAC, mono 16 kHz, written to stdout as it is encoded: the copy is made from the stream.
        const child = spawn(
          FFMPEG,
          [
            '-v',
            'error',
            '-ss',
            seconds(startMs),
            '-to',
            seconds(endMs),
            ...inputOf(video),
            '-vn',
            '-ac',
            '1',
            '-ar',
            '16000',
            '-c:a',
            'flac',
            '-f',
            'flac',
            'pipe:1',
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        )
        let errors = ''
        child.stderr.on('data', (d: Buffer) => {
          if (errors.length < 4000) errors += d.toString()
        })
        const exit = new Promise<number>((resolve, reject) => {
          child.on('error', reject)
          child.on('close', (code) => resolve(code ?? 1))
        })
        let finished = false
        try {
          for await (const bytes of child.stdout) yield new Uint8Array(bytes as Buffer)
          finished = true
        } finally {
          // Stopped early by the reader: ffmpeg goes too.
          if (!finished) child.kill('SIGKILL')
        }
        const code = await exit
        if (code !== 0) throw new Error(`ffmpeg audio failed: ${errors.trim()}`)
      },
    }),
  }
}

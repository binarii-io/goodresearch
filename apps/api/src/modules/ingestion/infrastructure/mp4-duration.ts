/**
 * Spec 037 FR-004: a video's length when the source gives none. An MP4 or QuickTime file is a list
 * of boxes; its `moov` box holds `mvhd`, whose timescale and duration give the length. Only box
 * headers and `mvhd` are read, by ranges: a few small reads, never the video itself.
 */

/** Reads bytes `start` to `end` included; fewer when the file ends before. */
export type ReadRange = (start: number, end: number) => Promise<Uint8Array>

const HEADER = 16
/** A file with more top-level boxes than this is not worth walking. */
const MAX_BOXES = 64

const typeOf = (bytes: Uint8Array, at: number) =>
  String.fromCharCode(bytes[at] ?? 0, bytes[at + 1] ?? 0, bytes[at + 2] ?? 0, bytes[at + 3] ?? 0)

/** A box at `offset`: its type, where its content starts and its total size; null when unreadable. */
const boxAt = async (read: ReadRange, offset: number, fileSize: number) => {
  const head = await read(offset, offset + HEADER - 1)
  if (head.length < 8) return null
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
  let size = view.getUint32(0)
  let content = 8
  if (size === 1) {
    if (head.length < 16) return null
    size = Number(view.getBigUint64(8))
    content = 16
  } else if (size === 0) size = fileSize - offset
  if (size < content) return null
  return { type: typeOf(head, 4), content: offset + content, size }
}

/** The length in milliseconds from an `mvhd` box's content; null when it says nothing. */
const mvhdDuration = (bytes: Uint8Array): number | null => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 20) return null
  const version = bytes[0]
  const [timescale, duration] =
    version === 1
      ? bytes.length >= 32
        ? [view.getUint32(20), Number(view.getBigUint64(24))]
        : [0, 0]
      : [view.getUint32(12), view.getUint32(16)]
  if (!timescale || !duration || duration === 0xffffffff) return null
  return Math.round((duration / timescale) * 1000)
}

/** The video's length in milliseconds, or null when the file is not an MP4 or says nothing. */
export const mp4DurationMs = async (read: ReadRange, fileSize: number): Promise<number | null> => {
  let offset = 0
  for (let i = 0; i < MAX_BOXES && offset + 8 <= fileSize; i++) {
    const box = await boxAt(read, offset, fileSize)
    if (!box) return null
    if (box.type === 'moov') {
      // `mvhd` is the first child of `moov` in practice; walk a few children to be sure.
      let child = box.content
      const end = offset + box.size
      for (let j = 0; j < 16 && child + 8 <= end; j++) {
        const inner = await boxAt(read, child, end)
        if (!inner) return null
        if (inner.type === 'mvhd')
          return mvhdDuration(await read(inner.content, inner.content + 31))
        child += inner.size
      }
      return null
    }
    offset += box.size
  }
  return null
}

import {
  type DocBlock,
  DriveCannotEdit,
  type DriveDocuments,
  DriveRevisionMismatch,
  type FileMeta,
  type PresentationSlide,
  type TableModel,
  type TableRead,
} from '../domain/drive-documents.ts'
import { DriveConnectionLost } from '../domain/drive-gateway.ts'
import { createGoogleRequests, type GoogleRequests } from './google-requests.ts'
import { instantToSerial, serialToInstant } from './sheet-time.ts'

const DRIVE = 'https://www.googleapis.com/drive/v3'
const DOCS = 'https://docs.googleapis.com/v1/documents'
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'
const DOC_MIME = 'application/vnd.google-apps.document'
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet'
const SLIDES = 'https://slides.googleapis.com/v1/presentations'
const SLIDES_MIME = 'application/vnd.google-apps.presentation'
/** The default 16:9 page, in EMU: where a table goes under the title. */
/** The brand's ink and paper (packages/ui), for the cover slides. */
const INK = { red: 28 / 255, green: 34 / 255, blue: 48 / 255 }
const PAPER = { red: 1, green: 1, blue: 1 }
const PAGE = { width: 9_144_000, left: 311_700, top: 1_150_000, height: 3_600_000 }
/** Named ranges written by goodresearch carry this prefix; others are left alone. */
const ANCHOR = 'gr:'
const ID_HEADER = 'goodresearch id'
const ROWS = 1000

type Paragraph = {
  startIndex: number
  endIndex: number
  paragraph?: {
    elements?: { textRun?: { content?: string } }[]
    paragraphStyle?: { namedStyleType?: string }
    bullet?: { nestingLevel?: number }
  }
}
type RawDoc = {
  revisionId: string
  body?: { content?: Paragraph[] }
  namedRanges?: Record<
    string,
    { namedRanges?: { name: string; ranges?: { startIndex?: number; endIndex?: number }[] }[] }
  >
}

const fail = async (response: Response, what: string): Promise<never> => {
  const text = await response.text().catch(() => '')
  if (response.status === 401) throw new DriveConnectionLost()
  if (response.status === 403 || response.status === 404) throw new DriveCannotEdit()
  if (response.status === 400 && /revision/i.test(text)) throw new DriveRevisionMismatch()
  throw new Error(`${what} failed: ${response.status}`)
}

const ok = async <T>(response: Response, what: string): Promise<T> => {
  if (!response.ok) await fail(response, what)
  return (await response.json()) as T
}

/** One line of text per block: no line breaks or tabs inside (they would split paragraphs). */
const clean = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * The requests that add `slides` at the start of a presentation (spec 015). Object ids carry a
 * prefix of this write, so they never clash with the slides they replace.
 */
const slideRequests = (slides: readonly PresentationSlide[], prefix: string): object[] =>
  slides.flatMap((slide, n) => {
    const id = `${prefix}_${n}`
    const lines = (slide.lines ?? []).map(clean).filter(Boolean)
    const layout = slide.table
      ? 'TITLE_ONLY'
      : slide.cover
        ? 'TITLE'
        : lines.length > 0
          ? 'TITLE_AND_BODY'
          : 'TITLE_ONLY'
    const title = slide.cover ? 'CENTERED_TITLE' : 'TITLE'
    const body = slide.cover ? 'SUBTITLE' : 'BODY'
    const requests: object[] = [
      {
        createSlide: {
          objectId: id,
          insertionIndex: n,
          slideLayoutReference: { predefinedLayout: layout },
          placeholderIdMappings: [
            { layoutPlaceholder: { type: title, index: 0 }, objectId: `${id}_t` },
            ...(layout === 'TITLE_ONLY'
              ? []
              : [{ layoutPlaceholder: { type: body, index: 0 }, objectId: `${id}_b` }]),
          ],
        },
      },
    ]
    if (clean(slide.title))
      requests.push({ insertText: { objectId: `${id}_t`, text: clean(slide.title) } })
    if (layout !== 'TITLE_ONLY' && lines.length > 0)
      requests.push({ insertText: { objectId: `${id}_b`, text: lines.join('\n') } })
    // The opening and closing slides on the brand's ink, as in the app (spec 015).
    if (slide.cover) {
      requests.push({
        updatePageProperties: {
          objectId: id,
          pageProperties: { pageBackgroundFill: { solidFill: { color: { rgbColor: INK } } } },
          fields: 'pageBackgroundFill.solidFill.color',
        },
      })
      const white = (objectId: string) => ({
        updateTextStyle: {
          objectId,
          style: { foregroundColor: { opaqueColor: { rgbColor: PAPER } } },
          textRange: { type: 'ALL' },
          fields: 'foregroundColor',
        },
      })
      if (clean(slide.title)) requests.push(white(`${id}_t`))
      if (lines.length > 0) requests.push(white(`${id}_b`))
    }
    if (slide.table) {
      const rows = [slide.table.header, ...slide.table.rows]
      const columns = Math.max(...rows.map((row) => row.length), 1)
      requests.push({
        createTable: {
          objectId: `${id}_tb`,
          elementProperties: {
            pageObjectId: id,
            size: {
              width: { magnitude: PAGE.width - 2 * PAGE.left, unit: 'EMU' },
              height: { magnitude: PAGE.height, unit: 'EMU' },
            },
            transform: {
              scaleX: 1,
              scaleY: 1,
              translateX: PAGE.left,
              translateY: PAGE.top,
              unit: 'EMU',
            },
          },
          rows: rows.length,
          columns,
        },
      })
      rows.forEach((row, rowIndex) => {
        row.forEach((cell, columnIndex) => {
          if (clean(cell))
            requests.push({
              insertText: {
                objectId: `${id}_tb`,
                cellLocation: { rowIndex, columnIndex },
                text: clean(cell),
              },
            })
        })
      })
    }
    return requests
  })

const STYLE: Record<string, string> = { 1: 'HEADING_1', 2: 'HEADING_2', 3: 'HEADING_3' }

/**
 * Google Docs, Sheets and Drive over plain fetch, with one person's own access (spec 007). Anchors
 * are named ranges (`gr:<anchor>`); table rows carry their id in a hidden, warning-protected
 * first column. Nothing is ever deleted at the source.
 */
export const createGoogleDocuments = (options: {
  clientId: string
  clientSecret: string
  fetch?: typeof fetch
  retryDelayMs?: number
  requests?: GoogleRequests
}): DriveDocuments => {
  const google = options.requests ?? createGoogleRequests(options)
  const call = (token: string, url: string, init?: { method?: string; json?: unknown }) =>
    google.request(token, new URL(url), init)

  const createFile = async (token: string, folderId: string, name: string, mimeType: string) =>
    ok<{ id: string; webViewLink: string }>(
      await call(token, `${DRIVE}/files?supportsAllDrives=true&fields=id,webViewLink`, {
        method: 'POST',
        json: { name, mimeType, parents: [folderId] },
      }),
      'drive files.create',
    )

  /**
   * Adds the slides first, then deletes the ones that were there: never an empty deck. The write
   * requires the revision just read, so an edit made in between is never lost (review of PR #15).
   */
  const writeSlides = async (
    token: string,
    id: string,
    slides: readonly PresentationSlide[],
    expected: string | null = null,
  ): Promise<{ revision: string | null }> => {
    const current = await ok<{ revisionId?: string; slides?: { objectId: string }[] }>(
      await call(token, `${SLIDES}/${encodeURIComponent(id)}?fields=revisionId,slides.objectId`),
      'slides get',
    )
    if (expected !== null && current.revisionId !== expected) throw new DriveRevisionMismatch()
    const done = await ok<{ writeControl?: { requiredRevisionId?: string } }>(
      await call(token, `${SLIDES}/${encodeURIComponent(id)}:batchUpdate`, {
        method: 'POST',
        json: {
          requests: [
            ...slideRequests(slides, `gr${Date.now().toString(36)}`),
            ...(current.slides ?? []).map((s) => ({ deleteObject: { objectId: s.objectId } })),
          ],
          ...(current.revisionId
            ? { writeControl: { requiredRevisionId: current.revisionId } }
            : {}),
        },
      }),
      'slides batchUpdate',
    )
    return { revision: done.writeControl?.requiredRevisionId ?? null }
  }

  const getDoc = async (token: string, id: string) =>
    ok<RawDoc>(await call(token, `${DOCS}/${encodeURIComponent(id)}`), 'docs get')

  const batch = async (token: string, id: string, requests: object[], revision?: string) =>
    ok<{ writeControl?: { requiredRevisionId?: string } }>(
      await call(token, `${DOCS}/${encodeURIComponent(id)}:batchUpdate`, {
        method: 'POST',
        json: { requests, ...(revision ? { writeControl: { requiredRevisionId: revision } } : {}) },
      }),
      'docs batchUpdate',
    )

  /** The text and styles of the blocks, inserted at the start of an empty body. */
  const contentRequests = (blocks: readonly DocBlock[]): object[] => {
    const requests: object[] = []
    const lines = blocks.map(
      (b) => (b.kind === 'listItem' && b.level === 1 ? '\t' : '') + clean(b.text),
    )
    requests.push({ insertText: { location: { index: 1 }, text: `${lines.join('\n')}\n` } })
    // Inserted paragraphs inherit the style of the one they split: start without bullets.
    const length = lines.reduce((n, line) => n + line.length + 1, 0)
    requests.push({
      deleteParagraphBullets: { range: { startIndex: 1, endIndex: 1 + length } },
    })
    // Styles on the text as inserted (with tabs), before bullets remove the tabs.
    let at = 1
    const ranges = lines.map((line) => {
      const range = { startIndex: at, endIndex: at + line.length + 1 }
      at = range.endIndex
      return range
    })
    blocks.forEach((b, i) => {
      requests.push({
        updateParagraphStyle: {
          range: ranges[i],
          paragraphStyle: { namedStyleType: b.kind === 'heading' ? STYLE[b.level] : 'NORMAL_TEXT' },
          fields: 'namedStyleType',
        },
      })
    })
    // Bullets per run of list items, last run first: removing tabs only shifts what follows.
    const runs: { start: number; end: number }[] = []
    blocks.forEach((b, i) => {
      const last = runs.at(-1)
      if (b.kind !== 'listItem') return
      if (last && last.end === i) last.end = i + 1
      else runs.push({ start: i, end: i + 1 })
    })
    for (const run of runs.reverse())
      requests.push({
        createParagraphBullets: {
          range: {
            startIndex: ranges[run.start]?.startIndex ?? 1,
            endIndex: (ranges[run.end - 1]?.endIndex ?? 2) - 1,
          },
          bulletPreset: 'NUMBERED_DECIMAL_ALPHA_ROMAN',
        },
      })
    return requests
  }

  /** Anchors on the paragraphs as they are now (after bullets), one named range each. */
  const anchor = async (token: string, id: string, blocks: readonly DocBlock[]) => {
    const doc = await getDoc(token, id)
    const paragraphs = (doc.body?.content ?? []).filter((c) => c.paragraph)
    const requests = blocks.flatMap((b, i) => {
      const p = paragraphs[i]
      if (!b.anchor || !p) return []
      return [
        {
          createNamedRange: {
            name: `${ANCHOR}${b.anchor}`,
            range: {
              startIndex: p.startIndex,
              endIndex: Math.max(p.startIndex + 1, p.endIndex - 1),
            },
          },
        },
      ]
    })
    if (requests.length) await batch(token, id, requests, doc.revisionId)
  }

  const blocksOf = (doc: RawDoc): DocBlock[] => {
    const anchors = Object.values(doc.namedRanges ?? {})
      .flatMap((group) => group.namedRanges ?? [])
      .filter((r) => r.name.startsWith(ANCHOR))
      .flatMap((r) =>
        (r.ranges ?? []).map((range) => ({
          name: r.name.slice(ANCHOR.length),
          start: range.startIndex ?? 0,
          end: range.endIndex ?? 0,
        })),
      )
    const blocks: DocBlock[] = []
    for (const c of doc.body?.content ?? []) {
      const p = c.paragraph
      if (!p) continue
      const text = (p.elements ?? [])
        .map((e) => e.textRun?.content ?? '')
        .join('')
        .replace(/\n$/, '')
        .trim()
      if (!text) continue
      // The anchor starting at this paragraph, or else one covering its start.
      const found =
        anchors.find((a) => a.start === c.startIndex) ??
        anchors.find((a) => a.start <= c.startIndex && c.startIndex < a.end)
      const withAnchor = found ? { anchor: found.name } : {}
      const style = p.paragraphStyle?.namedStyleType ?? 'NORMAL_TEXT'
      if (p.bullet)
        blocks.push({
          kind: 'listItem',
          level: (p.bullet.nestingLevel ?? 0) > 0 ? 1 : 0,
          text,
          ...withAnchor,
        })
      else if (/^HEADING_[123]$/.test(style) || style === 'TITLE')
        blocks.push({
          kind: 'heading',
          level: style === 'TITLE' ? 1 : (Number(style.slice(-1)) as 1 | 2 | 3),
          text,
          ...withAnchor,
        })
      else blocks.push({ kind: 'paragraph', text, ...withAnchor })
    }
    return blocks
  }

  const firstSheet = async (token: string, id: string) => {
    const meta = await ok<{ sheets?: { properties: { sheetId: number; title: string } }[] }>(
      await call(
        token,
        `${SHEETS}/${encodeURIComponent(id)}?fields=sheets.properties(sheetId,title)`,
      ),
      'sheets get',
    )
    const sheets = meta.sheets ?? []
    const sheet = sheets.find((s) => s.properties.sheetId === 0) ?? sheets[0]
    if (!sheet) throw new DriveCannotEdit()
    return sheet.properties
  }

  const quoted = (title: string) => `'${title.replaceAll("'", "''")}'`

  const rowsOf = (table: TableModel): (string | number)[][] => [
    [ID_HEADER, ...table.columns.map((c) => c.title)],
    ...table.rows.map((r) => [
      r.id,
      ...table.columns.map((c) => {
        const value = r.cells[c.key] ?? ''
        return c.type === 'datetime' && value ? instantToSerial(value, table.timeZone) : value
      }),
    ]),
  ]

  /** Column letter of a 1-based index (1 → A … 26 → Z). */
  const column = (n: number) => String.fromCharCode(64 + n)

  /**
   * Writes each of the app's columns where its title is in the sheet (people may move columns or
   * add their own between them: those are never written), the ids in column A, then clears what
   * is left below in those columns only. A failure between the steps never empties the sheet
   * (PR #7 review).
   */
  const writeValues = async (token: string, id: string, title: string, table: TableModel) => {
    const header = await ok<{ values?: unknown[][] }>(
      await call(
        token,
        `${SHEETS}/${encodeURIComponent(id)}/values/${encodeURIComponent(`${quoted(title)}!A1:Z1`)}`,
      ),
      'sheets values.get',
    )
    const titles = (header.values?.[0] ?? []).map((h) => String(h ?? '').trim())
    let next = Math.max(titles.length, 1) + 1
    const positions = table.columns.map((c) => {
      const at = titles.indexOf(c.title)
      return at >= 1 ? at + 1 : next++
    })
    const rows = rowsOf(table)
    const last = rows.length
    const data = [1, ...positions].map((n, i) => ({
      range: `${quoted(title)}!${column(n)}1:${column(n)}${last}`,
      values: rows.map((r) => [r[i] ?? '']),
    }))
    await ok(
      await call(token, `${SHEETS}/${encodeURIComponent(id)}/values:batchUpdate`, {
        method: 'POST',
        json: { valueInputOption: 'RAW', data },
      }),
      'sheets values.batchUpdate',
    )
    await ok(
      await call(token, `${SHEETS}/${encodeURIComponent(id)}/values:batchClear`, {
        method: 'POST',
        json: {
          ranges: [1, ...positions].map(
            (n) => `${quoted(title)}!${column(n)}${last + 1}:${column(n)}${ROWS}`,
          ),
        },
      }),
      'sheets values.batchClear',
    )
  }

  const adapter: DriveDocuments = {
    createFolder: async (token, parentId, name) =>
      createFile(token, parentId, name, 'application/vnd.google-apps.folder'),

    createDocument: async (token, folderId, name, doc) => {
      const file = await createFile(token, folderId, name, DOC_MIME)
      // Once the file exists it is returned even if filling it fails: the caller tracks it and
      // can rewrite it, instead of leaving an untracked file in the folder (PR #7 review).
      await (async () => {
        await batch(token, file.id, contentRequests(doc.blocks))
        await anchor(token, file.id, doc.blocks)
      })().catch(() => undefined)
      return file
    },

    readDocument: async (token, fileId) => {
      const doc = await getDoc(token, fileId)
      return { doc: { blocks: blocksOf(doc) }, revision: doc.revisionId }
    },

    rewriteDocument: async (token, fileId, doc, revision) => {
      const current = await getDoc(token, fileId)
      if (current.revisionId !== revision) throw new DriveRevisionMismatch()
      const end = Math.max(...(current.body?.content ?? []).map((c) => c.endIndex), 2)
      const names = new Set(
        Object.values(current.namedRanges ?? {})
          .flatMap((group) => group.namedRanges ?? [])
          .map((r) => r.name)
          .filter((name) => name.startsWith(ANCHOR)),
      )
      await batch(
        token,
        fileId,
        [
          ...[...names].map((name) => ({ deleteNamedRange: { name } })),
          ...(end - 1 > 1
            ? [{ deleteContentRange: { range: { startIndex: 1, endIndex: end - 1 } } }]
            : []),
          ...contentRequests(doc.blocks),
        ],
        revision,
      )
      await anchor(token, fileId, doc.blocks)
    },

    createPresentation: async (token, folderId, name, slides) => {
      const file = await createFile(token, folderId, name, SLIDES_MIME)
      // As for documents: the file is returned even if filling it fails; an update rewrites it.
      const result = await writeSlides(token, file.id, slides).then(
        (r) => ({ written: true, revision: r.revision }),
        () => ({ written: false, revision: null }),
      )
      return { ...file, ...result }
    },

    rewritePresentation: (token, fileId, slides, expected) =>
      writeSlides(token, fileId, slides, expected),

    createTable: async (token, folderId, name, table) => {
      const file = await createFile(token, folderId, name, SHEET_MIME)
      // As for documents: the file is returned even if setting it up fails.
      await (async () => {
        const sheet = await firstSheet(token, file.id)
        const column = (i: number) => ({
          sheetId: sheet.sheetId,
          startRowIndex: 1,
          endRowIndex: ROWS,
          startColumnIndex: i + 1,
          endColumnIndex: i + 2,
        })
        const requests: object[] = [
          {
            updateSpreadsheetProperties: {
              properties: { timeZone: table.timeZone },
              fields: 'timeZone',
            },
          },
          {
            updateSheetProperties: {
              properties: {
                sheetId: sheet.sheetId,
                title: table.sheetTitle,
                gridProperties: { frozenRowCount: 1 },
              },
              fields: 'title,gridProperties.frozenRowCount',
            },
          },
          {
            updateDimensionProperties: {
              range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
              properties: { hiddenByUser: true },
              fields: 'hiddenByUser',
            },
          },
          {
            addProtectedRange: {
              protectedRange: {
                range: { sheetId: sheet.sheetId, startColumnIndex: 0, endColumnIndex: 1 },
                description: 'goodresearch row ids: do not edit',
                warningOnly: true,
              },
            },
          },
          {
            repeatCell: {
              range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: 'userEnteredFormat.textFormat.bold',
            },
          },
          ...table.columns.flatMap((c, i): object[] =>
            c.type === 'status'
              ? [
                  {
                    setDataValidation: {
                      range: column(i),
                      rule: {
                        condition: {
                          type: 'ONE_OF_LIST',
                          values: (c.options ?? []).map((value) => ({ userEnteredValue: value })),
                        },
                        strict: true,
                        showCustomUi: true,
                      },
                    },
                  },
                ]
              : c.type === 'datetime'
                ? [
                    {
                      setDataValidation: {
                        range: column(i),
                        rule: { condition: { type: 'DATE_IS_VALID' }, strict: true },
                      },
                    },
                    {
                      repeatCell: {
                        range: column(i),
                        cell: {
                          userEnteredFormat: {
                            numberFormat: { type: 'DATE_TIME', pattern: 'yyyy-mm-dd hh:mm' },
                          },
                        },
                        fields: 'userEnteredFormat.numberFormat',
                      },
                    },
                  ]
                : [],
          ),
        ]
        await ok(
          await call(token, `${SHEETS}/${encodeURIComponent(file.id)}:batchUpdate`, {
            method: 'POST',
            json: { requests },
          }),
          'sheets batchUpdate',
        )
        await writeValues(token, file.id, table.sheetTitle, table)
      })().catch(() => undefined)
      return file
    },

    readTable: async (token, fileId, table): Promise<TableRead> => {
      const sheet = await firstSheet(token, fileId)
      const values = await ok<{ values?: unknown[][] }>(
        await call(
          token,
          `${SHEETS}/${encodeURIComponent(fileId)}/values/${encodeURIComponent(`${quoted(sheet.title)}!A1:Z${ROWS}`)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
        ),
        'sheets values.get',
      )
      const [header = [], ...rows] = values.values ?? []
      const headers = header.slice(1).map((h) => String(h ?? '').trim())
      // The hidden id column must still be the first one, or the ids cannot be trusted.
      const idColumn = String(header[0] ?? '').trim() === ID_HEADER
      // Columns are found by title: people may move them.
      const position = new Map(table.columns.map((c) => [c.key, headers.indexOf(c.title)]))
      return {
        headers,
        idColumn,
        rows: rows
          .filter((r) => r.some((v) => v !== '' && v !== null && v !== undefined))
          .map((r) => {
            const id = typeof r[0] === 'string' && r[0].trim() ? r[0].trim() : null
            const cells: Record<string, string | null> = {}
            for (const c of table.columns) {
              const at = position.get(c.key) ?? -1
              const raw = at >= 0 ? r[at + 1] : undefined
              cells[c.key] =
                raw === undefined || raw === null || raw === ''
                  ? null
                  : c.type === 'datetime' && typeof raw === 'number'
                    ? serialToInstant(raw, table.timeZone)
                    : String(raw)
            }
            return { id, cells }
          }),
      }
    },

    rewriteTable: async (token, fileId, table) => {
      const sheet = await firstSheet(token, fileId)
      await writeValues(token, fileId, sheet.title, table)
    },

    renameFile: async (token, fileId, name) => {
      const response = await call(
        token,
        `${DRIVE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id`,
        { method: 'PATCH', json: { name } },
      )
      if (response.status === 404) return null
      if (response.status === 403) throw new DriveCannotEdit()
      await ok<{ id: string }>(response, 'drive files.update')
      return adapter.metadata(token, fileId)
    },

    metadata: async (token, fileId): Promise<FileMeta | null> => {
      const response = await call(
        token,
        `${DRIVE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,version,trashed,parents,webViewLink,modifiedTime,capabilities(canEdit),owners(displayName),lastModifyingUser(displayName)`,
      )
      if (response.status === 404 || response.status === 403) return null
      const raw = await ok<{
        id: string
        name: string
        version?: string
        trashed?: boolean
        parents?: string[]
        webViewLink?: string
        modifiedTime?: string
        capabilities?: { canEdit?: boolean }
        owners?: { displayName?: string }[]
        lastModifyingUser?: { displayName?: string }
      }>(response, 'drive files.get')
      return {
        id: raw.id,
        name: raw.name,
        version: Number(raw.version ?? 0),
        trashed: raw.trashed ?? false,
        parents: raw.parents ?? [],
        canEdit: raw.capabilities?.canEdit ?? false,
        ownerName: raw.owners?.[0]?.displayName ?? null,
        lastEditorName: raw.lastModifyingUser?.displayName ?? null,
        webViewLink: raw.webViewLink ?? `https://drive.google.com/file/d/${raw.id}`,
        modifiedAt: raw.modifiedTime ?? null,
      }
    },
  }
  return adapter
}

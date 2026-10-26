import { describe, expect, it } from 'vitest'
import { DriveCannotEdit, DriveRevisionMismatch } from '../domain/drive-documents.ts'
import { createGoogleDocuments } from '../infrastructure/google-documents.ts'
import { instantToSerial, serialToInstant } from '../infrastructure/sheet-time.ts'

type Call = { method: string; url: URL; body: string }

const fakeFetch = (routes: (call: Call) => { status: number; body: unknown } | undefined) => {
  const calls: Call[] = []
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const call = {
      method: init?.method ?? 'GET',
      url: new URL(String(input)),
      body: String(init?.body ?? ''),
    }
    calls.push(call)
    if (call.url.hostname === 'oauth2.googleapis.com')
      return Response.json({ access_token: 'access', expires_in: 3600 })
    const answer = routes(call) ?? { status: 404, body: { error: { code: 404 } } }
    return Response.json(answer.body, { status: answer.status })
  }
  return { fetch: fetch as typeof globalThis.fetch, calls }
}

const documents = (fetch: typeof globalThis.fetch) =>
  createGoogleDocuments({ clientId: 'cid', clientSecret: 's', fetch, retryDelayMs: 1 })

const paragraph = (start: number, text: string, extra: object = {}) => ({
  startIndex: start,
  endIndex: start + text.length + 1,
  paragraph: { elements: [{ textRun: { content: `${text}\n` } }], ...extra },
})

describe('sheet time', () => {
  it('converts instants to serial wall times of the file time zone and back, DST included', () => {
    expect(instantToSerial('1899-12-31T00:00:00.000Z', 'UTC')).toBe(1)
    const summer = '2026-07-01T12:00:00.000Z'
    // 14:00 in Paris in summer.
    expect(instantToSerial(summer, 'Europe/Paris') % 1).toBeCloseTo(14 / 24, 6)
    expect(serialToInstant(instantToSerial(summer, 'Europe/Paris'), 'Europe/Paris')).toBe(summer)
    const winter = '2026-11-02T13:00:00.000Z'
    expect(serialToInstant(instantToSerial(winter, 'Europe/Paris'), 'Europe/Paris')).toBe(winter)
  })
})

describe('Google documents adapter (spec 007)', () => {
  it('creates a document in the folder, styles it, lists last first, then anchors paragraphs', async () => {
    const { fetch, calls } = fakeFetch((c) => {
      if (c.url.pathname === '/drive/v3/files' && c.method === 'POST')
        return { status: 200, body: { id: 'doc-1', webViewLink: 'https://docs/doc-1' } }
      if (c.url.pathname.endsWith(':batchUpdate')) return { status: 200, body: {} }
      if (c.url.pathname === '/v1/documents/doc-1')
        return {
          status: 200,
          body: {
            revisionId: 'rev-2',
            body: {
              content: [
                paragraph(1, 'Planning (30 min)'),
                paragraph(19, 'Tell me', { bullet: { nestingLevel: 0 } }),
                paragraph(27, 'Why?', { bullet: { nestingLevel: 1 } }),
              ],
            },
          },
        }
      return undefined
    })
    const created = await documents(fetch).createDocument('token', 'folder-1', 'Guide', {
      blocks: [
        { kind: 'heading', level: 2, text: 'Planning (30 min)', anchor: 'section:s1' },
        { kind: 'listItem', level: 0, text: 'Tell me\nmore', anchor: 'question:q1' },
        { kind: 'listItem', level: 1, text: 'Why?' },
      ],
    })
    expect(created).toEqual({ id: 'doc-1', webViewLink: 'https://docs/doc-1' })
    const create = JSON.parse(calls.find((c) => c.url.pathname === '/drive/v3/files')?.body ?? '{}')
    expect(create).toEqual({
      name: 'Guide',
      mimeType: 'application/vnd.google-apps.document',
      parents: ['folder-1'],
    })
    const [content, anchors] = calls
      .filter((c) => c.url.pathname.endsWith(':batchUpdate'))
      .map((c) => JSON.parse(c.body))
    expect(content.requests[0]).toEqual({
      insertText: { location: { index: 1 }, text: 'Planning (30 min)\nTell me more\n\tWhy?\n' },
    })
    expect(content.requests.at(-1)).toMatchObject({
      createParagraphBullets: { range: { startIndex: 19, endIndex: 37 } },
    })
    expect(anchors).toEqual({
      requests: [
        { createNamedRange: { name: 'gr:section:s1', range: { startIndex: 1, endIndex: 18 } } },
        { createNamedRange: { name: 'gr:question:q1', range: { startIndex: 19, endIndex: 26 } } },
      ],
      writeControl: { requiredRevisionId: 'rev-2' },
    })
  })

  it('reads blocks with their anchors and kinds, skipping empty lines', async () => {
    const { fetch } = fakeFetch(() => ({
      status: 200,
      body: {
        revisionId: 'rev-9',
        body: {
          content: [
            paragraph(1, 'Planning (30 min)', { paragraphStyle: { namedStyleType: 'HEADING_2' } }),
            paragraph(19, ''),
            paragraph(20, 'Tell me about last week', { bullet: { nestingLevel: 0 } }),
            paragraph(44, 'Why?', { bullet: { nestingLevel: 1 } }),
            paragraph(49, 'A note'),
          ],
        },
        namedRanges: {
          'gr:question:q1': {
            namedRanges: [{ name: 'gr:question:q1', ranges: [{ startIndex: 20, endIndex: 43 }] }],
          },
          other: { namedRanges: [{ name: 'other', ranges: [{ startIndex: 49, endIndex: 55 }] }] },
        },
      },
    }))
    expect(await documents(fetch).readDocument('token', 'doc-1')).toEqual({
      revision: 'rev-9',
      doc: {
        blocks: [
          { kind: 'heading', level: 2, text: 'Planning (30 min)' },
          { kind: 'listItem', level: 0, text: 'Tell me about last week', anchor: 'question:q1' },
          { kind: 'listItem', level: 1, text: 'Why?' },
          { kind: 'paragraph', text: 'A note' },
        ],
      },
    })
  })

  it('rewrites only at the revision read, and maps refusals', async () => {
    const { fetch } = fakeFetch((c) =>
      c.method === 'GET'
        ? { status: 200, body: { revisionId: 'rev-3', body: { content: [paragraph(1, 'x')] } } }
        : { status: 403, body: {} },
    )
    await expect(
      documents(fetch).rewriteDocument('token', 'doc-1', { blocks: [] }, 'rev-2'),
    ).rejects.toBeInstanceOf(DriveRevisionMismatch)
    await expect(
      documents(fetch).rewriteDocument('token', 'doc-1', { blocks: [] }, 'rev-3'),
    ).rejects.toBeInstanceOf(DriveCannotEdit)
  })

  it('reads a table by column titles, row ids from the hidden column, dates in the file zone', async () => {
    const { fetch } = fakeFetch((c) => {
      if (c.url.pathname === '/v4/spreadsheets/sheet-1')
        return {
          status: 200,
          body: { sheets: [{ properties: { sheetId: 0, title: 'Schedule' } }] },
        }
      return {
        status: 200,
        body: {
          values: [
            ['goodresearch id', 'Status', 'Person', 'Extra'],
            ['row-1', 'Done', 'Sam', 'x'],
            ['', 'Invited', 'New person'],
            [],
            ['row-2', 'Scheduled', 'Lee', '', 46000.5],
          ],
        },
      }
    })
    const read = await documents(fetch).readTable('token', 'sheet-1', {
      timeZone: 'UTC',
      columns: [
        { key: 'interviewee', title: 'Person', type: 'text' },
        { key: 'status', title: 'Status', type: 'status' },
        { key: 'when', title: 'Missing', type: 'datetime' },
      ],
    })
    expect(read.headers).toEqual(['Status', 'Person', 'Extra'])
    expect(read.rows).toEqual([
      { id: 'row-1', cells: { interviewee: 'Sam', status: 'Done', when: null } },
      { id: null, cells: { interviewee: 'New person', status: 'Invited', when: null } },
      { id: 'row-2', cells: { interviewee: 'Lee', status: 'Scheduled', when: null } },
    ])
  })

  it('maps file metadata, and an unknown file to null', async () => {
    const { fetch } = fakeFetch((c) =>
      c.url.pathname === '/drive/v3/files/f1'
        ? {
            status: 200,
            body: {
              id: 'f1',
              name: 'Guide',
              version: '12',
              parents: ['folder-1'],
              webViewLink: 'https://docs/f1',
              capabilities: { canEdit: false },
              owners: [{ displayName: 'Alex' }],
              lastModifyingUser: { displayName: 'Sam' },
            },
          }
        : undefined,
    )
    expect(await documents(fetch).metadata('token', 'f1')).toEqual({
      id: 'f1',
      name: 'Guide',
      version: 12,
      trashed: false,
      parents: ['folder-1'],
      canEdit: false,
      ownerName: 'Alex',
      lastEditorName: 'Sam',
      webViewLink: 'https://docs/f1',
      modifiedAt: null,
    })
    expect(await documents(fetch).metadata('token', 'nope')).toBeNull()
  })

  it('rewrites each column where its title is, never over columns people added (PR #7 review)', async () => {
    const { fetch, calls } = fakeFetch((c) => {
      if (c.url.pathname === '/v4/spreadsheets/sheet-1')
        return {
          status: 200,
          body: { sheets: [{ properties: { sheetId: 0, title: 'Schedule' } }] },
        }
      if (c.method === 'GET')
        return { status: 200, body: { values: [['goodresearch id', 'Role', 'Phone', 'Person']] } }
      return { status: 200, body: {} }
    })
    await documents(fetch).rewriteTable('token', 'sheet-1', {
      sheetTitle: 'Schedule',
      timeZone: 'UTC',
      columns: [
        { key: 'interviewee', title: 'Person', type: 'text' },
        { key: 'role', title: 'Role', type: 'text' },
      ],
      rows: [{ id: 'r1', cells: { interviewee: 'Sam', role: 'Planner' } }],
    })
    const update = JSON.parse(
      calls.find((c) => c.url.pathname.endsWith('values:batchUpdate'))?.body ?? '{}',
    )
    expect(update.data.map((d: { range: string }) => d.range)).toEqual([
      "'Schedule'!A1:A2",
      "'Schedule'!D1:D2",
      "'Schedule'!B1:B2",
    ])
    expect(update.data[1].values).toEqual([['Person'], ['Sam']])
    const clear = JSON.parse(
      calls.find((c) => c.url.pathname.endsWith('values:batchClear'))?.body ?? '{}',
    )
    expect(clear.ranges).toEqual([
      "'Schedule'!A3:A1000",
      "'Schedule'!D3:D1000",
      "'Schedule'!B3:B1000",
    ])
    // The write comes before the clear: a failure in between never empties the sheet.
    const order = calls.map((c) => c.url.pathname).filter((p) => p.includes('values:'))
    expect(order).toEqual([
      expect.stringMatching(/batchUpdate$/),
      expect.stringMatching(/batchClear$/),
    ])
  })
})

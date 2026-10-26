import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { TranscriptUnreadable } from '../domain/drive-gateway.ts'
import { speakersOf } from '../domain/header-rules.ts'
import { looksLikeTranscript, subtitlesToText } from '../domain/transcript-text.ts'
import { docxText } from '../infrastructure/docx-text.ts'
import { createDriveFetchGateway } from '../infrastructure/drive.fetch-gateway.ts'

type Call = { url: URL; headers: Headers }

/** A fake Google answering each path with its body, recording every request. */
const google = (routes: Record<string, () => Response>) => {
  const calls: Call[] = []
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.push({ url, headers: new Headers(init?.headers) })
    if (url.hostname === 'oauth2.googleapis.com')
      return Response.json({ access_token: 'access', expires_in: 3600 })
    return routes[url.pathname]?.() ?? new Response('{}', { status: 404 })
  }
  return {
    gateway: createDriveFetchGateway({
      clientId: 'id',
      clientSecret: 'secret',
      fetch: fetch as typeof globalThis.fetch,
    }),
    calls,
  }
}

const docx = (paragraphs: string[]) =>
  zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(
      `<w:document><w:body>${paragraphs
        .map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`)
        .join('')}</w:body></w:document>`,
    ),
  })

describe('reading the beginning of a transcript (spec 009 research R2)', () => {
  it('reads the transcript tab of a Google document', async () => {
    const { gateway, calls } = google({
      '/v1/documents/doc-1': () =>
        Response.json({
          tabs: [
            {
              tabProperties: { title: 'Notes' },
              documentTab: {
                body: {
                  content: [{ paragraph: { elements: [{ textRun: { content: 'Notes\n' } }] } }],
                },
              },
            },
            {
              tabProperties: { title: 'Transcript' },
              documentTab: {
                body: {
                  content: [
                    { paragraph: { elements: [{ textRun: { content: 'Lee: Hello\n' } }] } },
                    { paragraph: { elements: [{ textRun: { content: 'Sam: Hi\n' } }] } },
                  ],
                },
              },
            },
          ],
        }),
    })
    const text = await gateway.readTextStart(
      'refresh',
      { id: 'doc-1', name: 'Call - Notes', mimeType: 'application/vnd.google-apps.document' },
      9,
    )
    expect(text).toBe('Lee: Hell')
    expect(calls.at(-1)?.url.searchParams.get('includeTabsContent')).toBe('true')
  })

  it('reads the other tabs of a document for its meeting notes', async () => {
    const { gateway } = google({
      '/v1/documents/doc-2': () =>
        Response.json({
          tabs: [
            {
              tabProperties: { title: 'Notes' },
              documentTab: {
                body: {
                  content: [
                    {
                      paragraph: {
                        elements: [
                          { textRun: { content: 'Invited ' } },
                          { person: { personProperties: { name: 'A B', email: 'a@x.org' } } },
                          { textRun: { content: ' ' } },
                          { person: { personProperties: { email: 'c.d@x.org' } } },
                          { textRun: { content: '\n' } },
                        ],
                      },
                    },
                  ],
                },
              },
            },
            { tabProperties: { title: 'Transcript' }, documentTab: { body: { content: [] } } },
          ],
        }),
    })
    expect(await gateway.readNotesStart('refresh', 'doc-2', 100)).toBe(
      'Invited [[person:A B]] [[person:c.d@x.org]]\n',
    )
    expect(await gateway.readNotesStart('refresh', 'gone', 100)).toBeNull()
  })

  it('downloads only the first bytes of a text file, and cleans subtitles', async () => {
    const { gateway, calls } = google({
      '/drive/v3/files/t-1': () => new Response('Sam: café ✓ and more', { status: 206 }),
      '/drive/v3/files/v-1': () =>
        new Response(
          'WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\n<v Lee Example>Hello there</v>\n\n2\n00:00:04.000 --> 00:00:05.000\n<v Sam>Hi\n',
          { status: 200 },
        ),
    })
    expect(
      await gateway.readTextStart(
        'refresh',
        { id: 't-1', name: 'a.txt', mimeType: 'text/plain' },
        10,
      ),
    ).toBe('Sam: café ')
    expect(calls.at(-1)?.headers.get('range')).toBe('bytes=0-39')
    expect(calls.at(-1)?.url.searchParams.get('alt')).toBe('media')
    expect(
      await gateway.readTextStart(
        'refresh',
        { id: 'v-1', name: 'a.vtt', mimeType: 'text/vtt' },
        100,
      ),
    ).toBe('Lee Example: Hello there\n\nSam: Hi')
  })

  it('unzips a Word file, and refuses old Word files and other formats', async () => {
    const { gateway } = google({
      '/drive/v3/files/w-1': () => new Response(docx(['Lee: Hello &amp; welcome', 'Sam: Thanks'])),
    })
    expect(
      await gateway.readTextStart(
        'refresh',
        { id: 'w-1', name: 'Camille.docx', mimeType: 'application/octet-stream' },
        100,
      ),
    ).toBe('Lee: Hello & welcome\nSam: Thanks')
    await expect(
      gateway.readTextStart(
        'refresh',
        { id: 'x', name: 'old.doc', mimeType: 'application/msword' },
        100,
      ),
    ).rejects.toBeInstanceOf(TranscriptUnreadable)
    expect(() => docxText(strToU8('not a zip'))).toThrow(TranscriptUnreadable)
  })

  it('answers null for a file that is gone', async () => {
    const { gateway } = google({})
    expect(
      await gateway.readTextStart(
        'refresh',
        { id: 'gone', name: 'a.txt', mimeType: 'text/plain' },
        10,
      ),
    ).toBeNull()
  })

  it('keeps speakers when subtitles have SubRip numbering', () => {
    expect(
      subtitlesToText(
        '1\n00:00:01,000 --> 00:00:02,000\nLee: Hello\n\n2\n00:00:03,000 --> 00:00:04,000\nSam: Hi',
      ),
    ).toBe('Lee: Hello\n\nSam: Hi')
  })

  it('tells a transcript from a summary by its speaker turns', () => {
    const turns = Array.from({ length: 20 }, (_, i) =>
      i % 2 ? 'Sam: I plan the week on Sunday evening.' : 'Lee: And what happens next then?',
    ).join('\n')
    expect(looksLikeTranscript(turns)).toBe(true)
    const stamped = Array.from(
      { length: 20 },
      (_, i) =>
        `00:00:${String(i).padStart(2, '0')}\nWe talked about the planning of the week again.`,
    ).join('\n')
    expect(looksLikeTranscript(stamped)).toBe(true)
    const summary = [
      'Summary',
      ...Array.from(
        { length: 12 },
        (_, i) =>
          `Point ${i + 1}. The participant explained how the week is planned with the family.`,
      ),
      'Next steps: send the survey, plan a second session.',
      'Decisions: keep the paper list on the fridge.',
    ].join('\n')
    expect(looksLikeTranscript(summary)).toBe(false)
    // Too short to tell: kept as a transcript.
    expect(looksLikeTranscript('Short note')).toBe(true)
  })

  it('reads Teams and Otter layouts: the name and the time on one line, the words below', () => {
    const teams = Array.from({ length: 12 }, (_, i) =>
      [
        i % 2 ? 'Casey Test   0:' + String(10 + i) : 'Robin Sample   0:' + String(10 + i),
        'We talked about how the week is planned at home and at work, every Sunday.',
        '',
      ].join('\n'),
    ).join('\n')
    expect(looksLikeTranscript(teams)).toBe(true)
    expect(speakersOf(teams)).toEqual(['Robin Sample', 'Casey Test'])
    const otter = Array.from(
      { length: 12 },
      (_, i) =>
        `${i % 2 ? 'Casey Test' : 'Robin Sample'}  (00:0${i % 10}:15)\nWe keep the list on the fridge and update it.\n`,
    ).join('\n')
    expect(looksLikeTranscript(otter)).toBe(true)
  })
})

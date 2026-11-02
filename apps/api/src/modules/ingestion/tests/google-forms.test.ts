import { describe, expect, it } from 'vitest'
import { DriveCannotEdit, DriveRevisionMismatch } from '../domain/drive-documents.ts'
import { FormServiceDisabled } from '../domain/form-model.ts'
import { createGoogleForms, toFormRead, toFormRequests } from '../infrastructure/google-forms.ts'

type RawItem = {
  questionItem: { question: { choiceQuestion: { options: { goToAction: string }[] } } }
  questionGroupItem: {
    questions: { questionId?: string }[]
    grid: { shuffleQuestions: boolean }
  }
}

const consent = {
  type: 'create' as const,
  index: 0,
  block: {
    kind: 'choice' as const,
    questionId: null,
    title: 'Consent',
    description: 'You choose.',
    required: true,
    multiple: false,
    shuffle: false,
    options: [
      { value: 'Yes', exit: false },
      { value: 'No', exit: true },
    ],
  },
}

describe('toFormRequests', () => {
  it('always says not to collect identities, first', () => {
    expect(toFormRequests([])[0]).toEqual({
      updateSettings: {
        settings: { emailCollectionType: 'DO_NOT_COLLECT' },
        updateMask: 'emailCollectionType',
      },
    })
  })

  it('makes refusing the consent submit the form', () => {
    const [, request] = toFormRequests([consent]) as [unknown, { createItem: { item: RawItem } }]
    const options = request.createItem.item.questionItem.question.choiceQuestion.options
    expect(options.map((o: { goToAction: string }) => o.goToAction)).toEqual([
      'NEXT_SECTION',
      'SUBMIT_FORM',
    ])
  })

  it('leaves ids out of the mask of an item, and keeps those of grid rows', () => {
    const requests = toFormRequests([
      {
        type: 'update',
        index: 2,
        formItemId: 'f',
        block: { kind: 'open', questionId: 'q', title: 'T', description: '', required: true },
      },
      {
        type: 'update',
        index: 3,
        formItemId: 'g',
        block: {
          kind: 'grid',
          questionId: null,
          title: 'G',
          description: '',
          required: true,
          shuffle: true,
          columns: ['1 – L', '2 – H'],
          rows: [
            { questionId: 'r1', title: 'A' },
            { questionId: null, title: 'B' },
          ],
        },
      },
    ]) as { updateItem: { updateMask: string; item: RawItem } }[]
    expect(requests[1]?.updateItem.updateMask).not.toMatch(/[iI]d\b/)
    const rows = requests[2]?.updateItem.item.questionGroupItem.questions
    expect(rows?.[0]?.questionId).toBe('r1')
    expect(rows?.[1]?.questionId).toBeUndefined()
    expect(requests[2]?.updateItem.item.questionGroupItem.grid.shuffleQuestions).toBe(true)
  })
})

describe('toFormRead', () => {
  it('reads each kind, and an unknown one as unsupported', () => {
    const read = toFormRead({
      revisionId: 'r',
      settings: { emailCollectionType: 'DO_NOT_COLLECT' },
      items: [
        { itemId: 's', title: 'S', pageBreakItem: {} },
        { itemId: 't', title: 'T', description: 'D', textItem: {} },
        {
          itemId: 'c',
          title: 'C',
          questionItem: {
            question: {
              questionId: 'qc',
              required: true,
              choiceQuestion: {
                type: 'RADIO',
                options: [{ value: 'A' }, { value: 'B', goToAction: 'SUBMIT_FORM' }],
              },
            },
          },
        },
        {
          itemId: 'l',
          title: 'L',
          questionItem: {
            question: { questionId: 'ql', scaleQuestion: { low: 1, high: 7, lowLabel: 'x' } },
          },
        },
        {
          itemId: 'g',
          title: 'G',
          questionGroupItem: {
            questions: [
              { questionId: 'r1', required: true, rowQuestion: { title: 'A' } },
              { questionId: 'r2', required: true, rowQuestion: { title: 'B' } },
            ],
            grid: {
              shuffleQuestions: true,
              columns: { type: 'RADIO', options: [{ value: '1' }, { value: '2' }] },
            },
          },
        },
        { itemId: 'i', title: 'An image', imageItem: {} },
        {
          itemId: 'f',
          title: 'A file',
          questionItem: { question: { questionId: 'qf', fileUploadQuestion: {} } },
        },
      ],
    })
    expect(read.blocks.map((b) => b.kind)).toEqual([
      'section',
      'text',
      'choice',
      'scale',
      'grid',
      'unsupported',
      'unsupported',
    ])
    expect(read.blocks[2]).toMatchObject({
      required: true,
      options: [
        { value: 'A', exit: false },
        { value: 'B', exit: true },
      ],
    })
    expect(read.blocks[3]).toMatchObject({ points: 7, required: false })
    expect(read.blocks[4]).toMatchObject({ required: true, shuffle: true })
    expect(read.collectsIdentity).toBe(false)
  })

  it('warns on any other collection setting, or none, and reads the spreadsheet and state', () => {
    expect(toFormRead({ revisionId: 'r' }).collectsIdentity).toBe(true)
    expect(
      toFormRead({ revisionId: 'r', settings: { emailCollectionType: 'VERIFIED' } })
        .collectsIdentity,
    ).toBe(true)
    const read = toFormRead({
      revisionId: 'r',
      linkedSheetId: 'sheet',
      publishSettings: { publishState: { isAcceptingResponses: true } },
    })
    expect(read.linkedSheetLink).toContain('sheet')
    expect(read.acceptingResponses).toBe(true)
    expect(toFormRead({ revisionId: 'r' }).acceptingResponses).toBe(false)
  })
})

describe('createGoogleForms', () => {
  const respond = (status: number, body: unknown) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })

  it('creates, moves into the folder, fills, and closes a form found open', async () => {
    const calls: string[] = []
    const forms = createGoogleForms(async (_token, url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url.split('?')[0]}`)
      if (url.endsWith('/forms')) return respond(200, { formId: 'F' })
      if (url.includes('fields=parents')) return respond(200, { parents: ['root'] })
      if (url.includes('addParents'))
        return respond(200, { id: 'F', webViewLink: 'https://link.test' })
      if (url.endsWith(':batchUpdate')) return respond(200, {})
      if (url.endsWith(':setPublishSettings')) return respond(200, {})
      return respond(200, {
        revisionId: 'r',
        publishSettings: { publishState: { isAcceptingResponses: true } },
      })
    })
    const file = await forms.createForm('t', 'folder', 'Name', 'Title', [consent])
    expect(file.id).toBe('F')
    expect(calls.map((c) => c.split('/').at(-1))).toEqual([
      'forms',
      'F',
      'F',
      'F:batchUpdate',
      'F:batchUpdate',
      'F',
      'F:setPublishSettings',
    ])
  })

  it('still closes the form when its items are refused', async () => {
    const calls: string[] = []
    let batches = 0
    const forms = createGoogleForms(async (_token, url) => {
      calls.push(url.split('?')[0]?.split('/').at(-1) ?? '')
      if (url.endsWith('/forms')) return respond(200, { formId: 'F' })
      if (url.includes('fields=parents')) return respond(200, { parents: [] })
      if (url.includes('addParents')) return respond(200, { id: 'F', webViewLink: 'l' })
      if (url.endsWith(':batchUpdate'))
        return ++batches === 2 ? respond(400, 'bad') : respond(200, {})
      if (url.endsWith(':setPublishSettings')) return respond(200, {})
      return respond(200, {
        revisionId: 'r',
        publishSettings: { publishState: { isAcceptingResponses: true } },
      })
    })
    await forms.createForm('t', 'folder', 'Name', 'Title', [consent])
    expect(calls).toContain('F:setPublishSettings')
  })

  it('tells a disabled service from a refusal and from a stale revision', async () => {
    const failing = (status: number, body: string) =>
      createGoogleForms(async () => respond(status, body))
    await expect(failing(403, 'SERVICE_DISABLED').readForm('t', 'F')).rejects.toBeInstanceOf(
      FormServiceDisabled,
    )
    await expect(failing(403, 'nope').readForm('t', 'F')).rejects.toBeInstanceOf(DriveCannotEdit)
    await expect(
      failing(400, 'requiredRevisionId is stale').updateForm('t', 'F', [], 'r'),
    ).rejects.toBeInstanceOf(DriveRevisionMismatch)
  })
})

import { z } from 'zod'
import {
  type CreatedFile,
  DriveCannotEdit,
  DriveRevisionMismatch,
} from '../domain/drive-documents.ts'
import { DriveConnectionLost } from '../domain/drive-gateway.ts'
import {
  type FormOperation,
  type FormRead,
  type FormReadBlock,
  FormServiceDisabled,
  type FormWriteBlock,
} from '../domain/form-model.ts'

const FORMS = 'https://forms.googleapis.com/v1/forms'
const DRIVE = 'https://www.googleapis.com/drive/v3'

const Question = z.looseObject({
  questionId: z.string().optional(),
  required: z.boolean().optional(),
  choiceQuestion: z
    .looseObject({
      type: z.string().optional(),
      shuffle: z.boolean().optional(),
      options: z
        .array(z.looseObject({ value: z.string().optional(), goToAction: z.string().optional() }))
        .optional(),
    })
    .optional(),
  scaleQuestion: z
    .looseObject({
      low: z.number().optional(),
      high: z.number().optional(),
      lowLabel: z.string().optional(),
      highLabel: z.string().optional(),
    })
    .optional(),
  textQuestion: z.looseObject({}).optional(),
  rowQuestion: z.looseObject({ title: z.string().optional() }).optional(),
})

const RawForm = z.looseObject({
  revisionId: z.string(),
  linkedSheetId: z.string().optional(),
  settings: z.looseObject({ emailCollectionType: z.string().optional() }).optional(),
  publishSettings: z
    .looseObject({
      publishState: z.looseObject({ isAcceptingResponses: z.boolean().optional() }).optional(),
    })
    .optional(),
  items: z
    .array(
      z.looseObject({
        itemId: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        pageBreakItem: z.unknown().optional(),
        textItem: z.unknown().optional(),
        questionItem: z.looseObject({ question: Question }).optional(),
        questionGroupItem: z
          .looseObject({
            questions: z.array(Question).optional(),
            grid: z
              .looseObject({
                shuffleQuestions: z.boolean().optional(),
                columns: z
                  .looseObject({
                    options: z.array(z.looseObject({ value: z.string().optional() })).optional(),
                  })
                  .optional(),
              })
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
})
type RawForm = z.infer<typeof RawForm>

const blockOf = (item: NonNullable<RawForm['items']>[number]): FormReadBlock => {
  const base = {
    formItemId: item.itemId,
    questionId: null,
    title: item.title ?? '',
    description: item.description ?? '',
  }
  if (item.pageBreakItem !== undefined) return { ...base, kind: 'section' }
  if (item.textItem !== undefined) return { ...base, kind: 'text' }
  const group = item.questionGroupItem
  if (group?.grid) {
    const questions = group.questions ?? []
    return {
      ...base,
      kind: 'grid',
      required: questions.length > 0 && questions.every((q) => q.required === true),
      shuffle: group.grid.shuffleQuestions === true,
      columns: (group.grid.columns?.options ?? []).map((o) => o.value ?? ''),
      rows: questions.map((q) => ({
        questionId: q.questionId ?? '',
        title: q.rowQuestion?.title ?? '',
      })),
    }
  }
  const q = item.questionItem?.question
  if (!q) return { ...base, kind: 'unsupported' }
  const question = { ...base, questionId: q.questionId ?? null, required: q.required === true }
  if (q.textQuestion) return { ...question, kind: 'open' }
  if (q.scaleQuestion)
    return {
      ...question,
      kind: 'scale',
      points: (q.scaleQuestion.high ?? 0) - (q.scaleQuestion.low ?? 0) + 1,
      lowLabel: q.scaleQuestion.lowLabel ?? '',
      highLabel: q.scaleQuestion.highLabel ?? '',
    }
  if (q.choiceQuestion)
    return {
      ...question,
      kind: 'choice',
      multiple: q.choiceQuestion.type === 'CHECKBOX',
      shuffle: q.choiceQuestion.shuffle === true,
      options: (q.choiceQuestion.options ?? []).map((o) => ({
        value: o.value ?? '',
        exit: o.goToAction === 'SUBMIT_FORM',
      })),
    }
  return { ...base, kind: 'unsupported' }
}

/** Only the absence of collection is safe to assume: anything else shows the warning. */
export const toFormRead = (raw: unknown): FormRead => {
  const form = RawForm.parse(raw)
  return {
    blocks: (form.items ?? []).map(blockOf),
    revision: form.revisionId,
    linkedSheetLink: form.linkedSheetId
      ? `https://docs.google.com/spreadsheets/d/${form.linkedSheetId}`
      : null,
    acceptingResponses: form.publishSettings?.publishState?.isAcceptingResponses === true,
    collectsIdentity: form.settings?.emailCollectionType !== 'DO_NOT_COLLECT',
  }
}

const texts = (b: FormWriteBlock) => ({
  title: b.title,
  ...(b.description ? { description: b.description } : {}),
})

const itemOf = (b: FormWriteBlock): object => {
  if (b.kind === 'section') return { ...texts(b), pageBreakItem: {} }
  if (b.kind === 'text' || b.kind === 'unsupported') return { ...texts(b), textItem: {} }
  if (b.kind === 'grid')
    return {
      ...texts(b),
      questionGroupItem: {
        questions: b.rows.map((r) => ({
          required: b.required,
          ...(r.questionId ? { questionId: r.questionId } : {}),
          rowQuestion: { title: r.title },
        })),
        grid: {
          shuffleQuestions: b.shuffle,
          columns: { type: 'RADIO', options: b.columns.map((value) => ({ value })) },
        },
      },
    }
  const common = { required: b.required, ...(b.questionId ? { questionId: b.questionId } : {}) }
  if (b.kind === 'open')
    return {
      ...texts(b),
      questionItem: { question: { ...common, textQuestion: { paragraph: true } } },
    }
  if (b.kind === 'scale')
    return {
      ...texts(b),
      questionItem: {
        question: {
          ...common,
          scaleQuestion: {
            low: 1,
            high: b.points,
            lowLabel: b.lowLabel,
            highLabel: b.highLabel,
          },
        },
      },
    }
  const leadsOut = b.options.some((o) => o.exit)
  return {
    ...texts(b),
    questionItem: {
      question: {
        ...common,
        choiceQuestion: {
          type: b.multiple ? 'CHECKBOX' : 'RADIO',
          shuffle: b.shuffle,
          options: b.options.map((o) => ({
            value: o.value,
            ...(leadsOut ? { goToAction: o.exit ? 'SUBMIT_FORM' : 'NEXT_SECTION' } : {}),
          })),
        },
      },
    },
  }
}

/** Ids stay out of the mask: the service keeps them (research R7); a grid's rows carry theirs. */
const maskOf = (b: FormWriteBlock): string => {
  const required = 'questionItem.question.required'
  switch (b.kind) {
    case 'grid':
      return 'title,description,questionGroupItem'
    case 'open':
      return `title,description,${required},questionItem.question.textQuestion`
    case 'scale':
      return `title,description,${required},questionItem.question.scaleQuestion`
    case 'choice':
      return `title,description,${required},questionItem.question.choiceQuestion`
    default:
      return 'title,description'
  }
}

const requestOf = (op: FormOperation): object => {
  switch (op.type) {
    case 'create':
      return { createItem: { item: itemOf(op.block), location: { index: op.index } } }
    case 'update':
      return {
        updateItem: {
          item: { itemId: op.formItemId, ...itemOf(op.block) },
          location: { index: op.index },
          updateMask: maskOf(op.block),
        },
      }
    case 'move':
      return { moveItem: { originalLocation: { index: op.from }, newLocation: { index: op.to } } }
    case 'delete':
      return { deleteItem: { location: { index: op.index } } }
  }
}

export const toFormRequests = (operations: readonly FormOperation[]): object[] => [
  // The default of organisation accounts collects addresses: always said explicitly (research R3).
  {
    updateSettings: {
      settings: { emailCollectionType: 'DO_NOT_COLLECT' },
      updateMask: 'emailCollectionType',
    },
  },
  ...operations.map(requestOf),
]

type Call = (
  token: string,
  url: string,
  init?: { method?: string; json?: unknown },
) => Promise<Response>

const fail = async (response: Response, what: string): Promise<never> => {
  const text = await response.text().catch(() => '')
  if (response.status === 401) throw new DriveConnectionLost()
  if (response.status === 403 && /SERVICE_DISABLED|has not been used|is disabled/i.test(text))
    throw new FormServiceDisabled()
  if (response.status === 403 || response.status === 404) throw new DriveCannotEdit()
  if (response.status === 400 && /revision/i.test(text)) throw new DriveRevisionMismatch()
  throw new Error(`${what} failed: ${response.status}`)
}

const json = async <T>(response: Response, what: string): Promise<T> => {
  if (!response.ok) await fail(response, what)
  return (await response.json()) as T
}

/** Forms with one person's access (spec 027 research R3 to R7). */
export const createGoogleForms = (call: Call) => {
  const url = (id: string) => `${FORMS}/${encodeURIComponent(id)}`

  const readForm = async (token: string, fileId: string): Promise<FormRead> =>
    toFormRead(await json(await call(token, url(fileId)), 'forms.get'))

  const batch = async (
    token: string,
    fileId: string,
    operations: readonly FormOperation[],
    revision: string | null,
  ) =>
    json(
      await call(token, `${url(fileId)}:batchUpdate`, {
        method: 'POST',
        json: {
          requests: toFormRequests(operations),
          ...(revision ? { writeControl: { requiredRevisionId: revision } } : {}),
        },
      }),
      'forms.batchUpdate',
    )

  /** The service takes no folder at creation: the form moves in before it holds anything. */
  const moveToFolder = async (token: string, fileId: string, folderId: string) => {
    const file = encodeURIComponent(fileId)
    const { parents = [] } = await json<{ parents?: string[] }>(
      await call(token, `${DRIVE}/files/${file}?supportsAllDrives=true&fields=parents`),
      'drive files.get',
    )
    const query = new URLSearchParams({
      supportsAllDrives: 'true',
      fields: 'id,webViewLink',
      addParents: folderId,
      removeParents: parents.join(','),
    })
    return json<CreatedFile>(
      await call(token, `${DRIVE}/files/${file}?${query}`, { method: 'PATCH', json: {} }),
      'drive files.update',
    )
  }

  /** New forms start closed; never trusted: checked, and closed if found open (research R4). */
  const ensureClosed = async (token: string, fileId: string) => {
    const form = await readForm(token, fileId)
    if (!form.acceptingResponses) return
    await json(
      await call(token, `${url(fileId)}:setPublishSettings`, {
        method: 'POST',
        json: {
          publishSettings: { publishState: { isPublished: false, isAcceptingResponses: false } },
        },
      }),
      'forms.setPublishSettings',
    )
  }

  return {
    createForm: async (
      token: string,
      folderId: string,
      name: string,
      title: string,
      operations: readonly FormOperation[],
    ): Promise<CreatedFile> => {
      const { formId } = await json<{ formId: string }>(
        await call(token, FORMS, {
          method: 'POST',
          json: { info: { title, documentTitle: name } },
        }),
        'forms.create',
      )
      const file = await moveToFolder(token, formId, folderId)
      // Once in the folder it is returned even if filling it fails: the caller tracks it, shows it
      // out of date and can write it again.
      // Identities and opening are settled whatever happens to the items.
      await batch(token, formId, [], null).catch(() => undefined)
      await batch(token, formId, operations, null).catch(() => undefined)
      await ensureClosed(token, formId).catch(() => undefined)
      return file
    },
    readForm,
    updateForm: async (
      token: string,
      fileId: string,
      operations: readonly FormOperation[],
      revision: string,
    ): Promise<void> => {
      await batch(token, fileId, operations, revision)
    },
  }
}

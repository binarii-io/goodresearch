import { err, ok } from '@goodresearch/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeSurveyCommands } from '../application/commands/survey-commands.ts'
import type {
  FormFiles,
  ReadingRow,
  RuleRow,
  SurveysDeps,
  SurveysStore,
} from '../application/ports.ts'
import type { RawResponse, StoredResponse } from '../domain/responses.ts'

const ada = { id: 'ada', role: 'member' as const }
const clock = { value: new Date('2026-11-02T10:00:00Z') }

const sections = [
  {
    id: 's0',
    kind: 'profiling' as const,
    items: [
      {
        id: 'job',
        text: 'Job',
        contact: false,
        kind: 'single-choice' as const,
        options: ['Designer', 'Developer'],
      },
    ],
  },
]

const world = () => {
  const rows = new Map<string, StoredResponse & { formFileId: string }>()
  let reading: ReadingRow | null = null
  let rule: RuleRow | null = null
  const store: SurveysStore = {
    reading: async () => reading,
    markFailed: async (studyId, at, by) => {
      reading = reading
        ? { ...reading, status: 'failed' }
        : {
            studyId,
            status: 'failed',
            readAt: at,
            readBy: by,
            unknownQuestions: 0,
            unknownValues: 0,
          }
    },
    replaceResponses: async (c) => {
      for (const r of c.responses) rows.set(r.sourceId, { ...r, formFileId: c.formFileId })
      if (c.complete)
        for (const [id, r] of rows)
          if (r.formFileId === c.formFileId && !c.responses.some((x) => x.sourceId === id))
            rows.delete(id)
      reading = c.reading
    },
    rule: async () => rule,
    saveRule: async (r, expected) => {
      if ((rule?.version ?? null) !== expected) return false
      rule = r
      return true
    },
    count: async () => rows.size,
    recordWordings: async () => {},
  }
  const source = {
    responses: [] as RawResponse[],
    complete: true,
    fail: false,
    canEdit: true,
    reads: 0,
  }
  const files: FormFiles = {
    folderId: 'folder',
    metadata: async () => ok({ canEdit: source.canEdit, trashed: false, parents: ['folder'] }),
    readForm: async () =>
      ok({
        blocks: [
          {
            formItemId: 'f0',
            kind: 'choice',
            options: [
              { value: 'Yes', exit: false },
              { value: 'No', exit: true },
            ],
          },
        ],
      }),
    listResponses: async () => {
      source.reads += 1
      return source.fail
        ? err('DRIVE_UNAVAILABLE')
        : ok({ responses: source.responses, complete: source.complete })
    },
  }
  const deps: SurveysDeps = {
    store,
    clock: { now: () => clock.value },
    costs: async () => new Map(),
    files: async () => ok(files),
    questionnaire: async () =>
      ok({ version: 1, content: { framing: { targetResponses: 10 }, sections } }),
    form: async () => ({
      fileId: 'form-1',
      itemMap: {
        consent: { formItemId: 'f0', questionId: 'qc' },
        'item:job': { formItemId: 'f1', questionId: 'qj' },
      },
    }),
  }
  return { rows, source, commands: makeSurveyCommands(deps), reading: () => reading, deps }
}

const response = (id: string, job = 'Designer'): RawResponse => ({
  id,
  submittedAt: '2026-11-02T09:00:00Z',
  answers: { qc: ['Yes'], qj: [job] },
})

describe('reading the responses (spec 028 US2)', () => {
  let w: ReturnType<typeof world>
  beforeEach(() => {
    w = world()
    clock.value = new Date('2026-11-02T10:00:00Z')
  })
  const read = (force = true) => w.commands.read({ actor: ada, studyId: 's', force })

  it('stores what it reads, and reading twice changes nothing', async () => {
    w.source.responses = [response('a'), response('b')]
    expect((await read()).ok).toBe(true)
    await read()
    expect(w.rows.size).toBe(2)
    expect(w.reading()).toMatchObject({ status: 'done', readBy: 'ada' })
  })

  it('updates a changed response and removes one gone from the source', async () => {
    w.source.responses = [response('a'), response('b')]
    await read()
    w.source.responses = [response('a', 'Developer')]
    await read()
    expect([...w.rows.keys()]).toEqual(['a'])
    expect(w.rows.get('a')?.answers.job).toEqual(['Developer'])
  })

  it('removes nothing when the reading stopped before the end', async () => {
    w.source.responses = [response('a'), response('b')]
    await read()
    w.source.responses = [response('a')]
    w.source.complete = false
    await read()
    expect(w.rows.size).toBe(2)
    expect(w.reading()?.status).toBe('stopped')
  })

  it('keeps what was read when the source fails, and says so', async () => {
    w.source.responses = [response('a')]
    await read()
    w.source.fail = true
    expect(await read()).toEqual({ ok: false, error: 'DRIVE_UNAVAILABLE' })
    expect(w.rows.size).toBe(1)
    expect(w.reading()?.status).toBe('failed')
  })

  it('keeps the time and the warnings of the last good reading after a failure', async () => {
    w.source.responses = [{ ...response('a'), answers: { ...response('a').answers, other: ['x'] } }]
    await read()
    clock.value = new Date('2026-11-02T11:00:00Z')
    w.source.fail = true
    await read()
    expect(w.reading()).toMatchObject({
      readAt: new Date('2026-11-02T10:00:00Z'),
      unknownQuestions: 1,
    })
  })

  it('counts the questions it left out', async () => {
    w.source.responses = [
      { ...response('a'), answers: { ...response('a').answers, other: ['x'] } },
      { ...response('b'), answers: { ...response('b').answers, other: ['y'] } },
    ]
    await read()
    expect(w.reading()?.unknownQuestions).toBe(1)
  })

  it('reads at most once a minute when the tab opens, always on Refresh', async () => {
    await read(false)
    await read(false)
    expect(w.source.reads).toBe(1)
    await read(true)
    expect(w.source.reads).toBe(2)
    clock.value = new Date('2026-11-02T10:01:01Z')
    await read(false)
    expect(w.source.reads).toBe(3)
  })

  it('refuses a person who cannot edit the form, keeping what was read', async () => {
    w.source.responses = [response('a')]
    await read()
    w.source.canEdit = false
    expect(await read()).toEqual({ ok: false, error: 'DRIVE_CANNOT_EDIT' })
    expect(w.rows.size).toBe(1)
  })

  it('needs a published form', async () => {
    const c = makeSurveyCommands({ ...w.deps, form: async () => null })
    expect(await c.read({ actor: ada, studyId: 's', force: true })).toEqual({
      ok: false,
      error: 'FORM_NOT_PUBLISHED',
    })
  })
})

describe('the target rule (spec 028 US3)', () => {
  const save = (
    w: ReturnType<typeof world>,
    accepted: Record<string, string[]>,
    version: number | null,
  ) => w.commands.saveRule({ actor: ada, studyId: 's', accepted, version, origin: 'person' })

  it('saves against the version seen', async () => {
    const w = world()
    expect(await save(w, { job: ['Designer'] }, null)).toEqual({ ok: true, value: { version: 0 } })
    expect(await save(w, { job: ['Developer'] }, 0)).toEqual({ ok: true, value: { version: 1 } })
    expect(await save(w, { job: ['Designer'] }, 0)).toEqual({
      ok: false,
      error: 'VERSION_CONFLICT',
    })
  })

  it('refuses what is not a choice of a profiling item', async () => {
    expect(await save(world(), { job: ['Unknown'] }, null)).toEqual({
      ok: false,
      error: 'VALIDATION',
    })
  })
})

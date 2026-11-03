import { err, ok, type Result } from '@goodresearch/shared'
import { type Accepted, toStored, validRule } from '../../domain/responses.ts'
import type { Actor, SurveysDeps } from '../ports.ts'

/** Spec 028 FR-004: when the tab opens; Refresh always reads. */
const READ_EVERY_MS = 60_000
/** Beyond this the reading stops and says so. */
export const MAX_RESPONSES = 20_000

/** Reading a study's responses and keeping its target rule (spec 028). */
export const makeSurveyCommands = (deps: SurveysDeps) => {
  const now = () => deps.clock.now()

  return {
    read: async (c: {
      actor: Actor
      studyId: string
      force: boolean
    }): Promise<Result<void, string>> => {
      const questionnaire = await deps.questionnaire(c.actor.id, c.studyId)
      if (!questionnaire.ok) return questionnaire
      const form = await deps.form(c.studyId)
      if (!questionnaire.value || !form?.itemMap) return err('FORM_NOT_PUBLISHED')
      if (!c.force) {
        const last = await deps.store.reading(c.studyId)
        if (last && now().getTime() - last.readAt.getTime() < READ_EVERY_MS) return ok(undefined)
      }
      const files = await deps.files(c.actor.id, c.studyId)
      if (!files.ok) return files
      const failed = async (error: string) => {
        await deps.store.markFailed(c.studyId, now(), c.actor.id)
        return err(error)
      }
      const meta = await files.value.metadata(form.fileId)
      if (!meta.ok) return failed(meta.error)
      if (!meta.value || meta.value.trashed || !meta.value.parents.includes(files.value.folderId))
        return failed('PUBLICATION_NOT_FOUND')
      if (!meta.value.canEdit) return err('DRIVE_CANNOT_EDIT')
      const read = await files.value.readForm(form.fileId)
      if (!read.ok) return failed(read.error)
      const consentItem = form.itemMap.consent?.formItemId
      const agree =
        read.value.blocks.find((b) => b.formItemId === consentItem)?.options?.find((o) => !o.exit)
          ?.value ?? ''
      const listed = await files.value.listResponses(form.fileId, MAX_RESPONSES)
      if (!listed.ok) return failed(listed.error)
      const { itemMap } = form
      const { sections } = questionnaire.value.content
      const stored = listed.value.responses.map((r) => toStored(r, itemMap, sections, agree))
      const at = now()
      await deps.store.replaceResponses({
        studyId: c.studyId,
        formFileId: form.fileId,
        responses: stored.map((s) => s.response),
        complete: listed.value.complete,
        readAt: at,
        reading: {
          studyId: c.studyId,
          status: listed.value.complete ? 'done' : 'stopped',
          readAt: at,
          readBy: c.actor.id,
          unknownQuestions: new Set(stored.flatMap((s) => s.unknownQuestions)).size,
          unknownValues: stored.reduce((n, s) => n + s.unknownValues, 0),
        },
      })
      return ok(undefined)
    },

    saveRule: async (c: {
      actor: Actor
      studyId: string
      accepted: Accepted
      version: number | null
      origin: 'person' | 'assistant'
    }): Promise<Result<{ version: number }, string>> => {
      const questionnaire = await deps.questionnaire(c.actor.id, c.studyId)
      if (!questionnaire.ok) return questionnaire
      if (!questionnaire.value) return err('QUESTIONNAIRE_NOT_FOUND')
      if (!validRule(c.accepted, questionnaire.value.content.sections)) return err('VALIDATION')
      const version = c.version === null ? 0 : c.version + 1
      const saved = await deps.store.saveRule(
        {
          studyId: c.studyId,
          accepted: c.accepted,
          version,
          origin: c.origin,
          updatedBy: c.actor.id,
          updatedAt: now(),
        },
        c.version,
      )
      return saved ? ok({ version }) : err('VERSION_CONFLICT')
    },
  }
}

export type SurveyCommands = ReturnType<typeof makeSurveyCommands>

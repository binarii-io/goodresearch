import { and, eq, inArray, sql } from 'drizzle-orm'
import type { Db } from '#platform/db.ts'
import { stateSql } from '../application/queries/response-queries.ts'
import type { StoredTheme, ThemeRun, ThemeStore } from '../application/theme-ports.ts'
import { surveysResponses, surveysThemeAnswers, surveysThemeRuns, surveysThemes } from './schema.ts'

type ThemeRow = typeof surveysThemes.$inferSelect
type RunRow = typeof surveysThemeRuns.$inferSelect

const themeOf = (r: ThemeRow): StoredTheme => ({
  id: r.id,
  studyId: r.studyId,
  itemId: r.itemId,
  label: { en: r.labelEn, fr: r.labelFr },
  description: { en: r.descriptionEn, fr: r.descriptionFr },
  translation: r.translation as StoredTheme['translation'],
  origin: r.origin as StoredTheme['origin'],
  status: r.status as StoredTheme['status'],
  mergedInto: r.mergedInto,
  version: r.version,
  runId: r.runId,
  decidedBy: r.decidedBy,
  decidedAt: r.decidedAt,
  createdAt: r.createdAt,
})

const themeRow = (t: StoredTheme) => ({
  id: t.id,
  studyId: t.studyId,
  itemId: t.itemId,
  labelEn: t.label.en,
  labelFr: t.label.fr,
  descriptionEn: t.description.en,
  descriptionFr: t.description.fr,
  translation: t.translation,
  origin: t.origin,
  status: t.status,
  mergedInto: t.mergedInto,
  version: t.version,
  runId: t.runId,
  decidedBy: t.decidedBy,
  decidedAt: t.decidedAt,
  createdAt: t.createdAt,
})

const runOf = (r: RunRow): ThemeRun => ({ ...r, state: r.state as ThemeRun['state'] })

/** Spec 029: themes of open answers, their answers and runs. */
export const createThemeStore = (db: Db): ThemeStore => ({
  openAnswers: async (studyId, fileId, accepted, itemId) => {
    const rows = await db
      .select({
        sourceId: surveysResponses.sourceId,
        text: sql<string>`array_to_string(ARRAY(SELECT jsonb_array_elements_text(${surveysResponses.answers} -> ${itemId})), ' ')`,
      })
      .from(surveysResponses)
      .where(
        and(
          eq(surveysResponses.studyId, studyId),
          eq(surveysResponses.formFileId, fileId),
          sql`${stateSql(accepted)} = 'counted'`,
          sql`coalesce(jsonb_array_length(${surveysResponses.answers} -> ${itemId}), 0) > 0`,
        ),
      )
      .orderBy(surveysResponses.submittedAt, surveysResponses.sourceId)
    return rows.filter((r) => r.text.trim().length > 0)
  },
  themesOf: async (studyId, itemId) =>
    (
      await db
        .select()
        .from(surveysThemes)
        .where(and(eq(surveysThemes.studyId, studyId), eq(surveysThemes.itemId, itemId)))
        .orderBy(surveysThemes.createdAt, surveysThemes.id)
    ).map(themeOf),
  answersOf: async (studyId, itemId) =>
    db
      .select({
        themeId: surveysThemeAnswers.themeId,
        sourceId: surveysThemeAnswers.sourceId,
        quote: surveysThemeAnswers.quote,
      })
      .from(surveysThemeAnswers)
      .where(and(eq(surveysThemeAnswers.studyId, studyId), eq(surveysThemeAnswers.itemId, itemId))),
  getTheme: async (id) => {
    const [row] = await db.select().from(surveysThemes).where(eq(surveysThemes.id, id))
    return row ? themeOf(row) : null
  },
  saveTheme: async (theme, expected) => {
    const done = await db
      .update(surveysThemes)
      .set(themeRow(theme))
      .where(and(eq(surveysThemes.id, theme.id), eq(surveysThemes.version, expected)))
      .returning({ id: surveysThemes.id })
    return done.length ? 'ok' : 'conflict'
  },
  liveRun: async (studyId) => {
    const [row] = await db
      .select()
      .from(surveysThemeRuns)
      .where(and(eq(surveysThemeRuns.studyId, studyId), eq(surveysThemeRuns.state, 'running')))
    return row ? runOf(row) : null
  },
  getRun: async (id) => {
    const [row] = await db.select().from(surveysThemeRuns).where(eq(surveysThemeRuns.id, id))
    return row ? runOf(row) : null
  },
  startRun: async (run) => {
    // One live run per study: the partial unique index refuses a second one.
    const done = await db
      .insert(surveysThemeRuns)
      .values(run)
      .onConflictDoNothing()
      .returning({ id: surveysThemeRuns.id })
    return done.length ? 'ok' : 'busy'
  },
  saveRun: async (run) => {
    await db.update(surveysThemeRuns).set(run).where(eq(surveysThemeRuns.id, run.id))
  },
  addThemes: async (created, joined) => {
    await db.transaction(async (tx) => {
      if (created.length)
        await tx.insert(surveysThemes).values(created.map((c) => themeRow(c.theme)))
      const answers = [
        ...created.flatMap((c) => c.answers.map((a) => ({ ...a, theme: c.theme }))),
        ...joined.map((a) => ({ ...a, theme: null })),
      ]
      for (const a of answers) {
        const theme =
          a.theme ??
          (await tx.select().from(surveysThemes).where(eq(surveysThemes.id, a.themeId)))[0]
        if (!theme) continue
        // An answer is in one theme of its item: a later run never takes it from a live theme,
        // but one a person rejected lets it go.
        await tx.execute(
          sql`DELETE FROM ${surveysThemeAnswers} USING ${surveysThemes}
              WHERE ${surveysThemes.id} = ${surveysThemeAnswers.themeId}
                AND ${surveysThemes.status} = 'rejected'
                AND ${surveysThemeAnswers.studyId} = ${theme.studyId}
                AND ${surveysThemeAnswers.itemId} = ${theme.itemId}
                AND ${surveysThemeAnswers.sourceId} = ${a.sourceId}`,
        )
        await tx
          .insert(surveysThemeAnswers)
          .values({
            themeId: a.themeId,
            studyId: theme.studyId,
            itemId: theme.itemId,
            sourceId: a.sourceId,
            quote: a.quote,
          })
          .onConflictDoNothing()
      }
      // A new theme whose answers all stayed in live themes holds nothing: it is not kept.
      if (created.length)
        await tx.execute(
          sql`DELETE FROM ${surveysThemes} WHERE ${inArray(
            surveysThemes.id,
            created.map((c) => c.theme.id),
          )} AND NOT EXISTS (SELECT 1 FROM ${surveysThemeAnswers}
              WHERE ${surveysThemeAnswers.themeId} = ${surveysThemes.id})`,
        )
    })
  },
  moveAnswer: async (studyId, itemId, sourceId, to) => {
    await db.transaction(async (tx) => {
      await tx
        .delete(surveysThemeAnswers)
        .where(
          and(
            eq(surveysThemeAnswers.studyId, studyId),
            eq(surveysThemeAnswers.itemId, itemId),
            eq(surveysThemeAnswers.sourceId, sourceId),
          ),
        )
      if (to)
        await tx
          .insert(surveysThemeAnswers)
          .values({ themeId: to, studyId, itemId, sourceId, quote: null })
    })
  },
  merge: async (into, from, by, at) => {
    const ids = from.map((t) => t.id)
    const moved = new Error('theme moved')
    return db
      .transaction(async (tx) => {
        // Against the versions read: a theme decided meanwhile is a conflict, nothing moves.
        const kept = await tx
          .update(surveysThemes)
          .set({ version: sql`${surveysThemes.version} + 1`, decidedBy: by, decidedAt: at })
          .where(and(eq(surveysThemes.id, into.id), eq(surveysThemes.version, into.version)))
          .returning({ id: surveysThemes.id })
        if (kept.length === 0) return 'conflict' as const
        for (const t of from) {
          const done = await tx
            .update(surveysThemes)
            .set({
              status: 'rejected',
              mergedInto: into.id,
              decidedBy: by,
              decidedAt: at,
              version: sql`${surveysThemes.version} + 1`,
            })
            .where(and(eq(surveysThemes.id, t.id), eq(surveysThemes.version, t.version)))
            .returning({ id: surveysThemes.id })
          if (done.length === 0) throw moved
        }
        await tx
          .update(surveysThemeAnswers)
          .set({ themeId: into.id })
          .where(inArray(surveysThemeAnswers.themeId, ids))
        return 'ok' as const
      })
      .catch((error: unknown) => {
        if (error === moved) return 'conflict' as const
        throw error
      })
  },
})

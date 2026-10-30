import { z } from 'zod'
import { Id, Language } from './common.ts'

/** Spec 015: the debrief deck of a project, built on the fly, and its Google Slides copy. */
const Level = z.enum(['high', 'medium', 'low'])
const Kind = z.enum(['build', 'test', 'investigate'])
const Polarity = z.enum(['positive', 'negative', 'neutral', 'mixed'])
const Who = z.object({ id: z.string(), name: z.string().nullable() })
const Paged = { page: z.number().int(), pages: z.number().int() }
/** Holds something still to decide (FR-003). */
const toValidate = z.boolean()

/** One slide, typed by its kind; the project's own texts in the deck's language. */
export const DeckSlide = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('title'),
      title: z.string(),
      interviews: z.number().int(),
      first: z.string().nullable(),
      last: z.string().nullable(),
      participants: z.number().int(),
      team: z.string().nullable(),
    }),
    z.object({
      kind: z.literal('takeaways'),
      text: z.string(),
      /** The text is the AI draft, not validated by a person. */
      draft: z.boolean(),
      toValidate: z.number().int(),
      recommendations: z.array(z.object({ action: z.string(), toValidate })),
    }),
    z.object({
      kind: z.literal('context'),
      goal: z.string(),
      studies: z.array(z.object({ name: z.string(), type: z.string() })),
    }),
    z.object({
      kind: z.literal('method'),
      studies: z.array(
        z.object({
          name: z.string(),
          type: z.string(),
          interviews: z.number().int(),
          themes: z.array(z.string()),
          questions: z.number().int(),
        }),
      ),
    }),
    z.object({
      kind: z.literal('numbers'),
      interviews: z.number().int(),
      participants: z.number().int(),
      /** Of the participants, those known only from facts still to decide (FR-003). */
      toValidate: z.number().int(),
      studies: z.number().int(),
      themes: z.number().int(),
      first: z.string().nullable(),
      last: z.string().nullable(),
    }),
    z.object({
      kind: z.literal('insightsTable'),
      group: z.enum(['works', 'blocks', 'findings']),
      ...Paged,
      rows: z.array(
        z.object({
          number: z.number().int(),
          statement: z.string(),
          theme: z.string().nullable(),
          level: Level,
          support: z.number().int(),
          panel: z.number().int(),
          toValidate,
        }),
      ),
    }),
    z.object({
      kind: z.literal('insight'),
      number: z.number().int(),
      theme: z.string().nullable(),
      statement: z.string(),
      description: z.string(),
      level: Level,
      polarity: Polarity,
      support: z.number().int(),
      counter: z.number().int(),
      panel: z.number().int(),
      facts: z.number().int(),
      counterEvidence: z.string().nullable(),
      minorityView: z.string().nullable(),
      /** The emblematic verbatim, with its participant's code (FR-004). */
      quote: z.object({ participant: z.string(), text: z.string() }).nullable(),
      toValidate,
    }),
    z.object({
      kind: z.literal('nuances'),
      ...Paged,
      items: z.array(
        z.object({
          statement: z.string(),
          counterEvidence: z.string().nullable(),
          minorityView: z.string().nullable(),
          toValidate,
        }),
      ),
    }),
    z.object({
      kind: z.literal('recommendations'),
      ...Paged,
      rows: z.array(
        z.object({
          number: z.number().int(),
          action: z.string(),
          kind: Kind,
          impact: Level,
          effort: Level,
          priority: z.number().int(),
          evidence: Level.nullable(),
          toValidate,
        }),
      ),
    }),
    z.object({
      kind: z.literal('matrix'),
      items: z.array(
        z.object({
          number: z.number().int(),
          action: z.string(),
          kind: Kind,
          impact: Level,
          effort: Level,
          toValidate,
        }),
      ),
    }),
    z.object({
      kind: z.literal('nextSteps'),
      ...Paged,
      rows: z.array(
        z.object({
          action: z.string(),
          owner: z.string().nullable(),
          measure: z.string().nullable(),
          toValidate,
        }),
      ),
    }),
    z.object({ kind: z.literal('thanks'), title: z.string() }),
  ])
  .meta({ id: 'DeckSlide' })

export const PublishedDeck = z
  .object({
    link: z.string(),
    studyId: Id,
    language: Language,
    withProposed: z.boolean(),
    publishedBy: Who,
    publishedAt: z.string(),
  })
  .meta({ id: 'PublishedDeck' })

export const DebriefView = z
  .object({
    language: Language,
    slides: z.array(DeckSlide),
    published: PublishedDeck.nullable(),
    /** The deck now differs from the one published (in its language and options). */
    outOfDate: z.boolean(),
    /** The published deck was built from other studies than this person can open. */
    otherAccess: z.boolean(),
    /** An AI draft of the key takeaways not used yet (shown with what is still to decide). */
    takeawaysDraft: z.boolean(),
    /** The project's studies whose folder the person can write to. */
    folders: z.array(z.object({ studyId: Id, name: z.string() })),
    counts: z.object({
      insights: z.object({ validated: z.number().int(), toDecide: z.number().int() }),
      recommendations: z.object({ validated: z.number().int(), toDecide: z.number().int() }),
    }),
  })
  .meta({ id: 'DebriefView' })

export const DebriefQuery = z.object({
  withProposed: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
})

export const PublishDebrief = z
  .object({ studyId: Id, language: Language, withProposed: z.boolean() })
  .meta({ id: 'PublishDebrief' })

export const UpdateDebrief = z
  .object({
    /** Replace the changes made in Google Slides (FR-009). */
    replace: z.boolean().default(false),
  })
  .meta({ id: 'UpdateDebrief' })

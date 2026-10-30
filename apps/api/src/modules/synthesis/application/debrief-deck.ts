import type { PublishedDeck } from '../domain/debrief.ts'
import { buildDeck, type DeckInput, fingerprintOf } from '../domain/deck.ts'
import { kindShown, priority } from '../domain/recommendations.ts'
import { toValidate } from '../domain/takeaways.ts'
import { insightsNow } from './insights-now.ts'
import type { SynthesisDeps } from './ports.ts'
import { type ProjectView, projectNames } from './project.ts'

const decided = (status: string) => status === 'accepted' || status === 'edited'

/** The guide's own numbering ("Theme 2: …") gives way to the slide's (app and Slides alike). */
const themeTitle = (title: string) =>
  title.replace(/^(th[eè]me|theme|partie|part|section)\s*\d+\s*[:.\-–—]\s*/iu, '').trim() || title
const LEVEL_ORDER = { high: 0, medium: 1, low: 2 } as const

/** Whether a deck built from `open` studies covers the ones a deck was published from (FR-010). */
export const coversStudies = (open: readonly string[], published: readonly string[]) =>
  published.every((id) => open.includes(id))

type DeckOptions = { readonly language: 'en' | 'fr'; readonly withProposed: boolean }

/**
 * Spec 015 FR-001, FR-010: what the deck is built from, read once from the project as it is now,
 * from what the person may see: studies whose folder they cannot open give neither facts,
 * verbatims nor counts. One read serves several decks (languages, options).
 */
const readDeck = async (
  deps: SynthesisDeps,
  accountId: string,
  projectId: string,
  project: ProjectView,
) => {
  const open = project.studies.filter((s) => s.access)
  const openIds = new Set(open.map((s) => s.id))
  const facts = await deps.sources.facts([...openIds])
  const studies = await Promise.all(
    open.map(async (s) => {
      const interviews = await deps.sources.interviews(accountId, s.id)
      const guide = await deps.sources.guide(accountId, s.id)
      const of = facts.filter((f) => f.studyId === s.id)
      const participants = new Set(
        of.filter((f) => decided(f.status)).flatMap((f) => f.participants),
      )
      // People heard only in facts still to decide: counted when those are included (FR-003).
      const toValidate = new Set(
        of
          .filter((f) => f.status === 'proposed')
          .flatMap((f) => f.participants)
          .filter((p) => !participants.has(p)),
      )
      return {
        id: s.id,
        name: s.name,
        type: s.type ?? 'interviews',
        hasFolder: s.hasFolder ?? false,
        interviews: interviews.count,
        first: interviews.first,
        last: interviews.last,
        themes: guide.themes.map(themeTitle),
        questions: guide.questions,
        participants: participants.size,
        toValidate: toValidate.size,
      }
    }),
  )
  const raw = await deps.store.insightsOf(projectId)
  // Only the studies the person can open count (FR-010): a closed study's facts are "outside".
  const visible: ProjectView = { ...project, studies: open, studyIds: openIds }
  const lines = {
    decided: await insightsNow(deps, visible, projectId, raw, { facts }),
    // With what is still to decide, every slide counts its facts too (FR-003).
    all: await insightsNow(deps, visible, projectId, raw, { facts, withToDecide: true }),
  }
  const recommendations = await deps.store.recommendationsOf(projectId)
  const supporting = [
    ...new Set(
      raw.flatMap((i) =>
        i.links.filter((l) => l.role === 'support' && l.state === 'counted').map((l) => l.factId),
      ),
    ),
  ]
  const verbatims = (await deps.sources.verbatims(supporting)).filter((v) => openIds.has(v.studyId))
  return {
    project,
    open: [...openIds].sort(),
    facts: new Map(facts.map((f) => [f.id, f])),
    studies,
    raw,
    lines,
    recommendations,
    verbatims,
    takeaways: await deps.store.getTakeaways(projectId),
    names: await projectNames(deps, accountId, openIds),
  }
}

type DeckData = Awaited<ReturnType<typeof readDeck>>

/** The deck in one language, with or without what is still to decide, from what was read. */
const deckOf = (data: DeckData, options: DeckOptions) => {
  const { raw, recommendations, takeaways } = data
  const lines = options.withProposed ? data.lines.all : data.lines.decided
  // The verbatims of the supporting facts that count, as the figures do: accepted ones, and
  // those still to decide when included; never a rejected, deleted or closed study's fact.
  const counts = (factId: string) => {
    const f = data.facts.get(factId)
    return !!f && (decided(f.status) || (options.withProposed && f.status === 'proposed'))
  }
  const input: DeckInput = {
    language: options.language,
    withProposed: options.withProposed,
    names: data.names,
    project: {
      name: data.project.name,
      goal: data.project.goal,
      team: data.project.team ?? null,
    },
    studies: data.studies,
    takeaways:
      takeaways &&
      (takeaways.text.en ||
        takeaways.text.fr ||
        (takeaways.draft.state === 'ready' && takeaways.draft.text))
        ? {
            text: takeaways.text,
            draft: takeaways.draft.state === 'ready' ? takeaways.draft.text : null,
            toValidate: toValidate(takeaways.savedOver, [...raw, ...recommendations]),
          }
        : null,
    insights: raw.flatMap((i) => {
      const line = lines.get(i.id)
      if (!line) return []
      const ids = new Set(
        i.links
          .filter((l) => l.role === 'support' && l.state === 'counted' && counts(l.factId))
          .map((l) => l.factId),
      )
      return [
        {
          id: i.id,
          status: i.status,
          theme: {
            key: line.themeKey,
            title: line.themeTitle ? themeTitle(line.themeTitle) : null,
          },
          statement: i.statement,
          description: i.description,
          level: line.level,
          polarity: line.polarity,
          support: line.support,
          counter: line.counter,
          panel: line.panel,
          facts: line.facts,
          counterEvidence: i.counterEvidence,
          minorityView: i.minorityView,
          verbatims: data.verbatims
            .filter((v) => ids.has(v.factId))
            .map((v) => ({ participant: v.participant, text: v.text })),
        },
      ]
    }),
    // The most useful first, then the most supported (prototype); the list order otherwise.
    recommendations: recommendations
      .map((r, n) => {
        const levels = r.links
          .filter((l) => l.state === 'counted')
          .flatMap((l) => {
            const level = lines.get(l.insightId)?.level
            return level ? [level] : []
          })
          .sort((a, b) => LEVEL_ORDER[b] - LEVEL_ORDER[a])
        return { r, n, evidence: levels[0] ?? null, links: levels.length }
      })
      .sort(
        (a, b) =>
          priority(b.r.impact, b.r.effort) - priority(a.r.impact, a.r.effort) ||
          b.links - a.links ||
          a.n - b.n,
      )
      .map(({ r, evidence }) => ({
        id: r.id,
        status: r.status,
        action: r.action,
        successMeasure: r.successMeasure,
        kind: kindShown(r, lines).kind,
        impact: r.impact,
        effort: r.effort,
        priority: priority(r.impact, r.effort),
        owner: r.owner,
        evidence,
      })),
  }
  const slides = buildDeck(input)
  return {
    slides,
    fingerprint: fingerprintOf(slides),
    studies: data.studies,
    /** An AI draft of the key takeaways not used yet: shown with what is still to decide. */
    takeawaysDraft:
      takeaways?.draft.state === 'ready' &&
      !!takeaways.draft.text &&
      (takeaways.draft.text.en !== takeaways.text.en ||
        takeaways.draft.text.fr !== takeaways.text.fr),
    /** The studies the deck was built from: another set of access builds another deck. */
    openStudyIds: data.open,
    counts: {
      insights: {
        validated: raw.filter((i) => i.status === 'validated' || i.status === 'edited').length,
        toDecide: raw.filter((i) => i.status === 'proposed').length,
      },
      recommendations: {
        validated: recommendations.filter((r) => r.status === 'validated' || r.status === 'edited')
          .length,
        toDecide: recommendations.filter((r) => r.status === 'proposed').length,
      },
    },
  }
}

/** Decks of the project for these options, from one read (review of PR #15). */
export const debriefDecks = async (
  deps: SynthesisDeps,
  accountId: string,
  projectId: string,
  project: ProjectView,
  options: readonly DeckOptions[],
) => {
  const data = await readDeck(deps, accountId, projectId, project)
  return options.map((o) => deckOf(data, o))
}

/** One deck of the project. */
export const debriefDeck = async (
  deps: SynthesisDeps,
  accountId: string,
  projectId: string,
  project: ProjectView,
  options: DeckOptions,
) => {
  const [deck] = await debriefDecks(deps, accountId, projectId, project, [options])
  if (!deck) throw new Error('no deck')
  return deck
}

/** The published deck as the Debrief tab shows it. */
export const publishedView = async (deps: SynthesisDeps, d: PublishedDeck) => {
  const names = await deps.store.accountNames([d.publishedBy])
  return {
    link: d.link,
    studyId: d.studyId,
    language: d.language,
    withProposed: d.withProposed,
    publishedBy: { id: d.publishedBy, name: names.get(d.publishedBy) ?? null },
    publishedAt: d.publishedAt.toISOString(),
  }
}

import { type InsightGroup, type Slide, unbreakable } from './deck.ts'

type Language = 'en' | 'fr'
type Rating = 'high' | 'medium' | 'low'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * The words of the deck in Google Slides (spec 015), as the app shows them. They are deck content
 * in the publication's language, not interface strings: the API has no Lingui (as publishing's
 * labels); the app words its slides through Lingui with the same terms.
 */
const LABELS = {
  en: {
    debrief: 'Research debrief',
    interviews: (n: number) => plural(n, 'interview', 'interviews'),
    participants: (n: number) => plural(n, 'participant', 'participants'),
    team: (name: string) => `Team ${name}`,
    takeaways: 'What to remember',
    recommend: 'What we recommend',
    restsOn: (n: number) => `Rests on ${plural(n, 'item', 'items')} to validate`,
    draft: 'AI draft of the key takeaways, not saved yet',
    sep: ': ',
    other: 'Other',
    period: 'Period',
    context: 'The research question',
    method: 'How we ran the research',
    how: {
      interviews: 'Individual interviews, recorded and transcribed.',
      survey: 'Survey answers.',
      'usability-test': 'Usability test sessions.',
    } as Record<string, string>,
    guide: (n: number) => `Interview guide: ${plural(n, 'question', 'questions')}`,
    retained: (n: number) => `${plural(n, 'interview', 'interviews')} retained`,
    numbers: 'The interviews in numbers',
    studies: (n: number) => plural(n, 'study', 'studies'),
    themes: (n: number) => plural(n, 'guide theme', 'guide themes'),
    between: (from: string, to: string) => (from === to ? `On ${from}` : `${from} – ${to}`),
    fromToValidate: (n: number) => `Including ${n} known only from facts still to validate`,
    groups: {
      works: 'What works',
      blocks: 'What holds back',
      findings: 'Findings and mixed topics',
    } satisfies Record<InsightGroup, string>,
    insightColumns: ['#', 'Insight', 'Theme', 'Confidence', 'Participants'],
    insight: (n: number) => `Insight ${n}`,
    evidence: 'Evidence',
    evidenceLine: (support: number, panel: number, facts: number) =>
      `${support} of ${plural(panel, 'participant', 'participants')}, ${plural(facts, 'fact', 'facts')}`,
    but: 'But',
    noCounter: 'No counter-evidence found.',
    minority: 'Minority view',
    nuances: 'What we also heard',
    recommendations: 'What we recommend',
    recColumns: ['#', 'Action', 'Kind', 'Impact', 'Effort', 'Evidence'],
    matrix: 'Impact × effort',
    corner: 'Impact \\ effort',
    quadrants: {
      'high-low': 'Quick wins',
      'high-high': 'Major projects',
      'low-low': 'Small extras',
      'low-high': 'To reconsider',
    } as Record<string, string>,
    nextSteps: 'Who does what',
    stepColumns: ['Action', 'Owner', 'Success measure'],
    toAssign: 'to assign',
    thanks: 'Thank you',
    questions: 'Any questions?',
    toValidate: 'to validate',
    levels: { high: 'High', medium: 'Medium', low: 'Low' } satisfies Record<Rating, string>,
    polarities: { positive: 'Positive', negative: 'Negative', neutral: 'Neutral', mixed: 'Mixed' },
    kinds: { build: 'Build', test: 'Test', investigate: 'Investigate' },
    types: {
      interviews: 'Interviews',
      survey: 'Survey',
      'usability-test': 'Usability test',
    } as Record<string, string>,
  },
  fr: {
    debrief: 'Restitution de la recherche',
    interviews: (n: number) => plural(n, 'entretien', 'entretiens'),
    participants: (n: number) => plural(n, 'participant', 'participants'),
    team: (name: string) => `Équipe ${name}`,
    takeaways: 'Ce qu’il faut retenir',
    recommend: 'Ce que nous recommandons',
    restsOn: (n: number) => `Repose sur ${plural(n, 'élément', 'éléments')} à valider`,
    draft: 'Brouillon IA des points clés, pas encore enregistré',
    sep: ' : ',
    other: 'Autre',
    period: 'Période',
    context: 'L’enjeu de la recherche',
    method: 'Comment nous avons mené la recherche',
    how: {
      interviews: 'Entretiens individuels enregistrés et transcrits.',
      survey: 'Réponses au questionnaire.',
      'usability-test': 'Sessions de test utilisateur.',
    } as Record<string, string>,
    guide: (n: number) => `Guide d’entretien : ${plural(n, 'question', 'questions')}`,
    retained: (n: number) => plural(n, 'entretien retenu', 'entretiens retenus'),
    numbers: 'Les entretiens en chiffres',
    studies: (n: number) => plural(n, 'étude', 'études'),
    themes: (n: number) => plural(n, 'thématique du guide', 'thématiques du guide'),
    between: (from: string, to: string) => (from === to ? `Le ${from}` : `${from} – ${to}`),
    fromToValidate: (n: number) =>
      `Dont ${n} ${n === 1 ? 'connu' : 'connus'} seulement par des faits encore à valider`,
    groups: {
      works: 'Ce qui fonctionne',
      blocks: 'Ce qui freine',
      findings: 'Constats et sujets mitigés',
    } satisfies Record<InsightGroup, string>,
    insightColumns: ['#', 'Insight', 'Thématique', 'Confiance', 'Participants'],
    insight: (n: number) => `Insight ${n}`,
    evidence: 'Preuves',
    evidenceLine: (support: number, panel: number, facts: number) =>
      `${support} sur ${plural(panel, 'participant', 'participants')}, ${plural(facts, 'fait', 'faits')}`,
    but: 'Mais',
    noCounter: 'Aucun contre-exemple relevé.',
    minority: 'Point de vue minoritaire',
    nuances: 'Ce que nous avons aussi entendu',
    recommendations: 'Ce que nous recommandons',
    recColumns: ['#', 'Action', 'Type', 'Impact', 'Effort', 'Preuve'],
    matrix: 'Impact × effort',
    corner: 'Impact \\ effort',
    quadrants: {
      'high-low': 'Gains rapides',
      'high-high': 'Chantiers structurants',
      'low-low': 'Petits plus',
      'low-high': 'À reconsidérer',
    } as Record<string, string>,
    nextSteps: 'Qui fait quoi',
    stepColumns: ['Action', 'Responsable', 'Mesure du succès'],
    toAssign: 'à attribuer',
    thanks: 'Merci !',
    questions: 'Des questions ?',
    toValidate: 'à valider',
    levels: { high: 'Élevée', medium: 'Moyenne', low: 'Faible' } satisfies Record<Rating, string>,
    polarities: { positive: 'Positif', negative: 'Négatif', neutral: 'Neutre', mixed: 'Mitigé' },
    kinds: { build: 'Construire', test: 'Tester', investigate: 'Investiguer' },
    types: {
      interviews: 'Entretiens',
      survey: 'Questionnaire',
      'usability-test': 'Test utilisateur',
    } as Record<string, string>,
  },
} as const

/** One slide as written to Google Slides. */
export type PresentationPage = {
  readonly title: string
  readonly cover?: boolean
  readonly lines?: readonly string[]
  readonly table?: { readonly header: readonly string[]; readonly rows: readonly string[][] }
}

const RATINGS: readonly Rating[] = ['high', 'medium', 'low']

/** A date of the deck (`YYYY-MM-DD`) as the language writes it. */
export const dateIn = (language: Language, date: string) =>
  new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date.slice(0, 10)}T00:00:00Z`))

const paged = (title: string, page: number, pages: number) =>
  pages > 1 ? `${title} (${page}/${pages})` : title

/**
 * Spec 015 FR-007, SC-003: the deck for Google Slides, slide for slide as the app shows it; what
 * is still to decide is written "to validate", never shown by a colour alone.
 */
export const presentationOf = (
  slides: readonly Slide[],
  language: Language,
): PresentationPage[] => {
  const l = LABELS[language]
  const mark = (text: string, toValidate: boolean) =>
    toValidate ? `${text} (${l.toValidate})` : text
  const period = (first: string | null, last: string | null) =>
    first && last ? l.between(dateIn(language, first), dateIn(language, last)) : null
  const pageOf = (s: Slide): PresentationPage => {
    switch (s.kind) {
      case 'title':
        return {
          title: s.title,
          cover: true,
          lines: [
            l.debrief,
            [
              s.interviews > 0 ? l.interviews(s.interviews) : null,
              period(s.first, s.last),
              s.participants > 0 ? l.participants(s.participants) : null,
              s.team ? l.team(s.team) : null,
            ]
              .filter(Boolean)
              .join(' · '),
          ],
        }
      case 'takeaways':
        return {
          title: l.takeaways,
          lines: [
            ...(s.text ? [s.text] : []),
            ...(s.draft ? [`${l.draft} (${l.toValidate})`] : []),
            ...(s.toValidate > 0 ? [l.restsOn(s.toValidate)] : []),
            ...(s.recommendations.length > 0
              ? [
                  l.recommend,
                  ...s.recommendations.map((r, n) => `${n + 1}. ${mark(r.action, r.toValidate)}`),
                ]
              : []),
          ],
        }
      case 'context':
        return {
          title: l.context,
          lines: [
            ...(s.goal ? [s.goal] : []),
            ...s.studies.map((x) => `${l.types[x.type] ?? x.type} · ${x.name}`),
          ],
        }
      case 'method':
        return {
          title: l.method,
          lines: s.studies.flatMap((x) => [
            `${l.types[x.type] ?? x.type} · ${x.name}${l.sep}${l.retained(x.interviews)}`,
            ...(l.how[x.type] ? [l.how[x.type] ?? ''] : []),
            ...(x.questions > 0 ? [l.guide(x.questions)] : []),
            ...x.themes.map((t, n) => `${n + 1}. ${t}`),
          ]),
        }
      case 'numbers': {
        const when = period(s.first, s.last)
        return {
          title: l.numbers,
          lines: [
            l.retained(s.interviews),
            l.participants(s.participants),
            ...(s.toValidate > 0 ? [l.fromToValidate(s.toValidate)] : []),
            l.studies(s.studies),
            l.themes(s.themes),
            ...(when ? [`${l.period}${l.sep}${when}`] : []),
          ],
        }
      }
      case 'insightsTable':
        return {
          title: paged(l.groups[s.group], s.page, s.pages),
          table: {
            header: [...l.insightColumns],
            rows: s.rows.map((r) => [
              String(r.number),
              mark(r.statement, r.toValidate),
              r.theme ?? l.other,
              l.levels[r.level],
              `${r.support}/${r.panel}`,
            ]),
          },
        }
      case 'insight':
        return {
          title: mark(s.statement, s.toValidate),
          lines: [
            [l.insight(s.number), l.polarities[s.polarity], s.theme ?? l.other, l.levels[s.level]]
              .filter(Boolean)
              .join(' · '),
            `${l.evidence}${l.sep}${l.evidenceLine(s.support, s.panel, s.facts)}`,
            ...(s.description ? [s.description] : []),
            `${l.but}${l.sep}${
              [s.counterEvidence, s.minorityView && `${l.minority}${l.sep}${s.minorityView}`]
                .filter(Boolean)
                .join(' ') || l.noCounter
            }`,
            ...(s.quote ? [`“${s.quote.text}” (${s.quote.participant})`] : []),
          ],
        }
      case 'nuances':
        return {
          title: paged(l.nuances, s.page, s.pages),
          lines: s.items.flatMap((i) => [
            mark(i.statement, i.toValidate),
            ...[i.minorityView, i.counterEvidence].filter((x): x is string => !!x),
          ]),
        }
      case 'recommendations':
        return {
          title: paged(l.recommendations, s.page, s.pages),
          table: {
            header: [...l.recColumns],
            rows: s.rows.map((r) => [
              String(r.number),
              mark(r.action, r.toValidate),
              l.kinds[r.kind],
              l.levels[r.impact],
              l.levels[r.effort],
              r.evidence ? l.levels[r.evidence] : '',
            ]),
          },
        }
      case 'matrix': {
        const cell = (impact: Rating, effort: Rating) => {
          const quadrant = l.quadrants[`${impact}-${effort}`]
          const numbers = s.items
            .filter((i) => i.impact === impact && i.effort === effort)
            .map((i) => mark(String(i.number), i.toValidate))
            .join(', ')
          return [quadrant, numbers].filter(Boolean).join(l.sep)
        }
        const efforts = [...RATINGS].reverse()
        return {
          title: l.matrix,
          table: {
            header: [l.corner, ...efforts.map((e) => l.levels[e])],
            rows: RATINGS.map((impact) => [
              l.levels[impact],
              ...efforts.map((effort) => cell(impact, effort)),
            ]),
          },
        }
      }
      case 'nextSteps':
        return {
          title: paged(l.nextSteps, s.page, s.pages),
          table: {
            header: [...l.stepColumns],
            rows: s.rows.map((r) => [
              mark(r.action, r.toValidate),
              r.owner ?? l.toAssign,
              r.measure ?? '',
            ]),
          },
        }
      case 'thanks':
        return { title: l.thanks, cover: true, lines: [s.title, l.questions] }
    }
  }
  // French typography: the space before a colon never breaks (the app does the same).
  const typeset = (text: string) => (language === 'fr' ? unbreakable(text) : text)
  return slides.map(pageOf).map((p) => ({
    ...p,
    title: typeset(p.title),
    ...(p.lines ? { lines: p.lines.map(typeset) } : {}),
    ...(p.table
      ? {
          table: {
            header: p.table.header.map(typeset),
            rows: p.table.rows.map((row) => row.map(typeset)),
          },
        }
      : {}),
  }))
}

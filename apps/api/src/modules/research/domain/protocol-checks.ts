import type { TestProtocolContent, TestTask } from './test-protocol.ts'

/**
 * The app's fixed writing rules for a test protocol (spec 036 FR-007, research R3). They flag and never
 * block; the screen and the assistant's tool use the same ones. English and French words are both
 * looked for, whatever the protocol's language: a protocol often mixes interface labels and prose.
 */
export type TaskFlag = 'gives-the-way' | 'several-tasks' | 'no-goal' | 'too-long'
export type ProtocolFlag =
  | 'too-long-for-session'
  | 'too-many-tasks'
  | 'no-think-aloud'
  | 'consent-without-ai'

const MAX_WORDS = 40
const DEFAULT_TASK_MINUTES = 5
const SCRIPT_MINUTES = 5 + 10
const SUS_MINUTES = 3
const SEQ_MINUTES = 0.5

/** Whole words or phrases, accents included (JavaScript's `\b` only knows ASCII letters). */
const phrases = (list: readonly string[]) =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.join('|')})(?![\\p{L}\\p{N}])`, 'iu')

const GIVES_THE_WAY = phrases([
  'click(?:s|ing)?(?: on)?',
  'tap(?: on)?',
  'press',
  'scroll(?: down| up)?',
  'go to the',
  'open the (?:menu|tab)',
  'button',
  'tab',
  'menu',
  'clique[rz]?(?: sur)?',
  'appuye[rz](?: sur)?',
  'tape[rz] sur',
  'faites défiler',
  'allez (?:dans|sur)',
  'rendez-vous (?:dans|sur)',
  'ouvre[rz] le menu',
  'bouton',
  'onglet',
])
/** A quoted label: "Export", « Exporter », “Export”. */
const QUOTED = /["“«‘]\s*[^"”»’]{1,40}\s*["”»’]/u

const SEQUENCE = phrases([
  'then',
  'and then',
  'after that',
  'afterwards',
  'puis',
  'ensuite',
  'et après',
  'après cela',
])
const ACTIONS = phrases([
  'find',
  'add',
  'send',
  'pay',
  'create',
  'share',
  'change',
  'buy',
  'book',
  'delete',
  'save',
  'compare',
  'download',
  'trouve[zr]',
  'retrouve[zr]',
  'ajoute[zr]',
  'envoye[zr]',
  'paye[zr]',
  'crée[zr]',
  'partage[zr]',
  'modifie[zr]',
  'achete[zr]',
  'réserve[zr]',
  'supprime[zr]',
  'enregistre[zr]',
  'compare[zr]',
  'télécharge[zr]',
])
// A bare "to" is in almost every English sentence: only words that state a purpose count (PR #51).
const GOAL = phrases([
  'so that',
  'so you can',
  'in order to',
  'you want',
  'you need',
  'you would like',
  'because',
  'pour',
  'afin de',
  'afin que',
  'vous souhaitez',
  'vous voulez',
  'vous devez',
  'vous aimeriez',
  'parce que',
])
const RECORDING = /record|enregistr/iu
const AI = phrases(['ai', 'artificial intelligence', 'ia', 'intelligence artificielle'])

const words = (text: string) => text.split(/\s+/).filter(Boolean)

const countMatches = (pattern: RegExp, text: string) =>
  words(text.replace(/[,.;:!?()]/g, ' ')).filter((w) => pattern.test(w)).length

/** Words of at least five letters, to see whether an instruction picks up the scenario. */
const significant = (text: string) =>
  new Set(words(text.toLowerCase().replace(/[^\p{L}\s'-]/gu, ' ')).filter((w) => w.length >= 5))

/** The scenario's words, read once per protocol and given to every task check. */
export const scenarioWords = (scenario: string): ReadonlySet<string> => significant(scenario)

export const checkTask = (task: TestTask, scenario: ReadonlySet<string>): TaskFlag[] => {
  const text = task.instruction
  const flags: TaskFlag[] = []
  if (GIVES_THE_WAY.test(text) || QUOTED.test(text)) flags.push('gives-the-way')
  if (SEQUENCE.test(text) || countMatches(ACTIONS, text) >= 3) flags.push('several-tasks')
  const count = words(text).length
  const fromScenario = [...significant(text)].some((w) => scenario.has(w))
  if (count < 6 || (!GOAL.test(text) && !fromScenario)) flags.push('no-goal')
  if (count > MAX_WORDS) flags.push('too-long')
  return flags
}

/** An estimate computed by the app, never by a model (FR-008). */
export const plannedMinutes = (p: TestProtocolContent): number => {
  const tasks = p.tasks.reduce((n, t) => n + (t.minutes ?? DEFAULT_TASK_MINUTES), 0)
  const sus = p.questionnaire === 'sus-v1' ? SUS_MINUTES : 0
  const seq = p.easeQuestion === 'seq-v1' ? SEQ_MINUTES * p.tasks.length : 0
  return Math.ceil(tasks + SCRIPT_MINUTES + sus + seq)
}

export const checkProtocol = (p: TestProtocolContent): ProtocolFlag[] => {
  const flags: ProtocolFlag[] = []
  if (plannedMinutes(p) > p.framing.sessionMinutes) flags.push('too-long-for-session')
  if (p.tasks.length > 8 && p.framing.sessionMinutes <= 60) flags.push('too-many-tasks')
  if (p.script.thinkAloud.trim().length === 0) flags.push('no-think-aloud')
  if (!RECORDING.test(p.framing.consent) || !AI.test(p.framing.consent))
    flags.push('consent-without-ai')
  return flags
}

/** Flags of every task by id, and of the whole. */
export const checksOf = (p: TestProtocolContent) => ({
  tasks: (() => {
    const scenario = scenarioWords(p.scenario)
    return Object.fromEntries(p.tasks.map((t) => [t.id, checkTask(t, scenario)]))
  })(),
  whole: checkProtocol(p),
})

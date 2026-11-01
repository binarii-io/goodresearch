import type { ChatMessage, ModelRequest, ModelRunner, StreamPart } from '../application/ports.ts'
import { MAX_STEPS, ProviderCallError } from '../application/ports.ts'
import type { Credential } from '../domain/provider.ts'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let calls = 0

const squash = (word: string) =>
  word
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')

/** Edit distance, for the fake grouping only. */
const distance = (a: string, b: string): number => {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        (row[j] ?? 0) + 1,
        (next[j - 1] ?? 0) + 1,
        (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    row = next
  }
  return row[b.length] ?? 0
}

/** The test provider's cleaning of one chunk (spec 011). */
const cleaningAnswer = (prompt: string) => {
  const turns = [...prompt.matchAll(/^(t\d+)( \(context\))? — [^:\n]*: (.*)$/gm)]
    .filter((m) => !m[2])
    .map((m) => ({ id: m[1] ?? '', text: m[3] ?? '' }))
  const corrections: {
    turn: string
    kind: 'transcription'
    original: string
    before: null
    replacement: string
    reason: string | null
    confidence: 'high' | 'low'
  }[] = turns
    .filter((t) => /\beating\b/.test(t.text))
    .map((t) => ({
      turn: t.id,
      kind: 'transcription',
      original: 'eating',
      before: null,
      replacement: 'meeting',
      reason: 'The speaker talks about a meeting.',
      confidence: 'high',
    }))
  const first = turns[0]
  if (first)
    corrections.push(
      {
        turn: first.id,
        kind: 'transcription',
        original: 'words not in this turn',
        before: null,
        replacement: 'x',
        reason: null,
        confidence: 'low',
      },
      {
        turn: first.id,
        kind: 'transcription',
        original: first.text.split(' ')[0] ?? '',
        before: null,
        replacement: 'one two three four five six seven eight nine ten eleven twelve',
        reason: null,
        confidence: 'low',
      },
    )
  const decisions = [...prompt.matchAll(/^(o\d+) in t\d+:/gm)].map((m) => ({
    occurrence: m[1] ?? '',
    isTerm: true,
    reason: 'It fits the context.',
  }))
  return { corrections, decisions }
}

/**
 * Spec 012: per part, the first sentence of each new interviewee turn, plus one quote not in the
 * text and one from an interviewer's turn (the app must drop both).
 */
const verbatimsAnswer = (prompt: string) => {
  const turns = [...prompt.matchAll(/^(t\d+)( \(context\))? — ([^:\n]*): (.*)$/gm)]
    .filter((m) => !m[2])
    .map((m) => ({ id: m[1] ?? '', speaker: m[3] ?? '', text: m[4] ?? '' }))
  const firstSentence = (text: string) => text.split(/(?<=[.!?])\s/)[0] ?? text
  const verbatims: { turn: string; text: string; reason: string | null }[] = turns
    .filter((t) => t.speaker.startsWith('interviewee') || t.speaker === 'unknown speaker')
    .filter((t) => firstSentence(t.text).split(/\s+/).length >= 3)
    .map((t) => ({ turn: t.id, text: firstSentence(t.text), reason: 'It says how they work.' }))
  const first = turns[0]
  const interviewer = turns.find((t) => t.speaker === 'interviewer')
  if (first) verbatims.push({ turn: first.id, text: 'words never said here', reason: null })
  if (interviewer)
    verbatims.push({ turn: interviewer.id, text: firstSentence(interviewer.text), reason: null })
  return { verbatims }
}

/**
 * Spec 012: one fact over every verbatim, in the first theme; one citing an unknown id only, and
 * one naming a placeholder (the app must drop both).
 */
const factsAnswer = (prompt: string) => {
  const ids = [...prompt.matchAll(/^(v\d+) — /gm)].map((m) => m[1] ?? '')
  const theme = /^(s\d+): /m.exec(prompt)?.[1] ?? 'other'
  return {
    facts: [
      {
        ref: null,
        statement: {
          en: 'The interviewee describes how they work with their team',
          fr: "L'interviewé décrit comment il travaille avec son équipe",
        },
        polarity: 'neutral',
        theme,
        verbatims: ids,
      },
      {
        ref: null,
        statement: { en: 'A fact without support', fr: 'Un fait sans appui' },
        polarity: 'neutral',
        theme: 'other',
        verbatims: ['v999'],
      },
      {
        ref: null,
        statement: { en: '[Person 1] says so', fr: '[Person 1] le dit' },
        polarity: 'neutral',
        theme: 'other',
        verbatims: ids.slice(0, 1),
      },
    ],
  }
}

/**
 * Spec 016: a sentence ending in a question mark is a question; "right?" or "non ?" makes it
 * leading; "so you" or "donc vous" makes it a simple reformulation.
 */
const reviewAnswer = (prompt: string) => ({
  sentences: [...prompt.matchAll(/^ {2}(t\d+\.\d+): (.*)$/gm)].flatMap((m): object[] => {
    const id = m[1] ?? ''
    const text = (m[2] ?? '').trim()
    if (/(right\?|non \?)$/i.test(text))
      return [
        {
          id,
          kind: 'question',
          flag: {
            kind: 'leading-question',
            reason: { en: 'It suggests the answer.', fr: 'Elle suggère la réponse.' },
            recommendation: 'How did this go for you?',
            addedElement: null,
            excerpt: null,
          },
        },
      ]
    if (/^(so you|donc vous)/i.test(text)) return [{ id, kind: 'simple-reformulation', flag: null }]
    return text.endsWith('?') ? [{ id, kind: 'question', flag: null }] : []
  }),
})

/**
 * Spec 013: one insight per theme of the fact lines, supported by its facts that are not positive
 * and countered by the positive ones, plus a citation of a fact not sent (the app drops it).
 */
const insightsAnswer = (prompt: string) => {
  const body = prompt.split('\n<fact-lines>\n')[1] ?? ''
  const lines = body
    .split('\n')
    .filter((l) => /^f\d+ \| /.test(l))
    .map((l) => l.split(' | '))
  const themes = [...new Set(lines.map((l) => l[2] ?? 'other'))]
  const title = (ref: string) => new RegExp(`^${ref}: (.+)$`, 'm').exec(prompt)?.[1] ?? ref
  return {
    insights: themes.map((theme) => ({
      ref: null,
      theme,
      statement: {
        en: `Participants share a finding about ${title(theme)}`,
        fr: `Les participants partagent un constat sur ${title(theme)}`,
      },
      description: {
        en: 'What the facts of this theme show.',
        fr: 'Ce que montrent les faits de ce thème.',
      },
      counterEvidence: { en: 'None', fr: 'Aucun' },
      minorityView: { en: 'None', fr: 'Aucun' },
      support: [
        ...lines.filter((l) => l[2] === theme && l[1] !== 'positive').map((l) => l[0] ?? ''),
        'f999',
      ],
      counter: lines.filter((l) => l[2] === theme && l[1] === 'positive').map((l) => l[0] ?? ''),
    })),
  }
}

/**
 * Spec 014: one recommendation per insight line (a build, high impact, medium effort) resting on
 * it, plus one citing an insight not sent (the app drops it).
 */
const recommendationsAnswer = (prompt: string) => {
  const body = prompt.split('\n<insight-lines>\n')[1] ?? ''
  const lines = body
    .split('\n')
    .filter((l) => /^i\d+ \| /.test(l))
    .map((l) => l.split(' | '))
  const text = (en: string, fr: string) => ({ en, fr })
  return {
    recommendations: [
      ...lines.map((l) => ({
        ref: null,
        action: text(
          `Act on: ${l.at(-1) ?? ''}`.slice(0, 200),
          `Agir sur : ${l.at(-1) ?? ''}`.slice(0, 200),
        ),
        rationale: text('The insight shows a need.', "L'insight montre un besoin."),
        kind: 'build',
        impact: 'high',
        effort: 'medium',
        successMeasure: text('The need is met.', 'Le besoin est couvert.'),
        insights: [l[0] ?? 'i1'],
      })),
      {
        ref: null,
        action: text('Unsupported idea', 'Idée sans appui'),
        rationale: text('', ''),
        kind: 'test',
        impact: 'low',
        effort: 'low',
        successMeasure: text('', ''),
        insights: ['i999'],
      },
    ],
  }
}

/** Spec 014: three sentences, one with a percentage (the app drops it). */
const takeawaysAnswer = () => ({
  sentences: [
    {
      en: 'The teams lose time finding their data.',
      fr: 'Les équipes perdent du temps à trouver leurs données.',
    },
    { en: 'About 40% of them rebuild reports.', fr: 'Environ 40 % refont des rapports.' },
    { en: 'A shared catalogue would help them.', fr: 'Un catalogue partagé les aiderait.' },
  ],
})

/** The test provider's lexicon: candidates within 2 edits are one term, the known form first. */
const lexiconAnswer = (prompt: string) => {
  const candidates: { spelling: string; excerpts: string[] }[] = []
  const known: string[] = []
  let inKnown = false
  for (const line of prompt.split('\n')) {
    if (line.startsWith('<known-terms>')) inKnown = true
    const item = /^- (.+)$/.exec(line)?.[1]
    if (item && inKnown) known.push(item)
    else if (item) candidates.push({ spelling: item, excerpts: [] })
    const excerpt = /^ {2}> (.+)$/.exec(line)?.[1]
    if (excerpt) candidates.at(-1)?.excerpts.push(excerpt)
  }
  const close = (a: string, b: string) => distance(squash(a), squash(b)) <= 2
  const terms: {
    form: string
    kind: 'domain'
    correction: null
    category: 'acronym' | 'product'
    definition: string | null
    variants: string[]
    existingTerm: string | null
    quote: string
  }[] = []
  for (const c of candidates) {
    const group = terms.find((t) => close(t.form, c.spelling))
    if (group) {
      group.variants.push(c.spelling)
      continue
    }
    const existing = known.find((k) => close(k, c.spelling)) ?? null
    terms.push({
      form: existing ?? c.spelling,
      kind: 'domain',
      correction: null,
      category: /^[A-Z]{2,6}$/.test(c.spelling) ? 'acronym' : 'product',
      definition: null,
      variants: [c.spelling],
      existingTerm: existing,
      quote: c.excerpts[0] ?? '',
    })
  }
  const first = candidates[0]
  if (first)
    terms.push({
      form: 'Invented',
      kind: 'domain',
      correction: null,
      category: 'product',
      definition: null,
      variants: [first.spelling],
      existingTerm: null,
      quote: 'This sentence is in no excerpt.',
    })
  return terms
}

/** A fixed interview guide, as the assistant writes it (spec 006 research R8). */
const FAKE_GUIDE = {
  framing: {
    objectives: 'Understand how people plan their week.',
    hypotheses: ['People plan on Sunday evening.'],
    audience: 'Eight people who plan for a household.',
    format: '45 minutes by video call, recorded with consent.',
  },
  sections: [
    {
      kind: 'introduction',
      title: 'Introduction',
      minutes: 5,
      questions: [{ text: 'Could you introduce yourself in a few words?', followUps: [] }],
    },
    {
      kind: 'warm-up',
      title: 'About you',
      minutes: 5,
      questions: [{ text: 'How is a usual week organised for you?', followUps: ['For example?'] }],
    },
    {
      kind: 'theme',
      title: 'Planning the week',
      minutes: 30,
      questions: [
        {
          text: 'Tell me about the last time you planned your week.',
          followUps: ['What happened next?', 'Why that way?'],
        },
        { text: 'How do you keep track of changes during the week?', followUps: [] },
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Wrap-up',
      minutes: 5,
      questions: [{ text: 'Is there anything you would like to add?', followUps: [] }],
    },
  ],
}

/**
 * Scripted conversation of the test provider (spec 005 research R7, spec 006 R8): "propose goal"
 * and "propose study" call the matching tool for the project named in the context, "design the
 * interview guide" loads the skill then reports progress, "write the guide" checks the questions
 * then proposes a guide, "help me create a project", "framing answered" and "propose the project"
 * follow spec 018, "long answer" streams slowly (to test Stop), anything else echoes.
 */
const script = (request: ModelRequest): { parts: StreamPart[]; delayMs: number } => {
  const messages = request.messages ?? []
  const lastMessage = messages.at(-1)
  const ranTool = lastMessage?.role === 'tool' ? lastMessage.results[0]?.name : undefined
  const last = [...messages].reverse().find((m) => m.role === 'user')
  // The assistant starts each message with where it was sent from (spec 005): not part of the text.
  const text = (last?.role === 'user' ? last.content : (request.prompt ?? '')).replace(
    /^\[[^\]]*\]\n/,
    '',
  )
  const projectId = /Project id: (\S+)/.exec(request.system ?? '')?.[1]
  const offered = (name: string) => request.tools?.some((t) => t.name === name) ?? false
  const call = (name: string, input: unknown): StreamPart => {
    calls += 1
    return { type: 'tool-call', call: { id: `fake-call-${Date.now()}-${calls}`, name, input } }
  }
  const guideStudy = /Study id: (\S+?)[),;\s]/.exec(`${request.system ?? ''} `)?.[1]
  const toolOutput = lastMessage?.role === 'tool' ? lastMessage.results[0]?.output : undefined
  const framingStates = (state: string, question = state) => ({
    question,
    audience: state,
    decision: state,
    hypotheses: state,
    team: state,
  })
  // Spec 018: the journey of a new project.
  if (ranTool === 'load_skill' && toolOutput?.includes('frame a research project'))
    return {
      parts: [
        { type: 'text', delta: 'Let us frame it. What do you want to understand, and about whom?' },
        call('report_project_progress', framingStates('missing', 'partial')),
      ],
      delayMs: 0,
    }
  if (ranTool === 'create_project' && toolOutput?.startsWith('Applied') && projectId)
    return {
      parts: [
        { type: 'text', delta: 'The project is ready. I suggest a first study.' },
        call('create_study', { projectId, name: 'First interviews' }),
      ],
      delayMs: 0,
    }
  if (ranTool === 'load_skill' && guideStudy)
    return {
      parts: [
        { type: 'text', delta: 'Let us design the guide. What are the main research themes?' },
        call('report_guide_progress', {
          studyId: guideStudy,
          objectives: 'partial',
          hypotheses: 'missing',
          audience: 'missing',
          format: 'missing',
          intro: 'missing',
          themes: 'missing',
          followUps: 'missing',
          biasReview: 'missing',
        }),
      ],
      delayMs: 0,
    }
  if (ranTool === 'check_guide_questions' && guideStudy)
    return {
      parts: [
        { type: 'text', delta: 'Here is the interview guide.' },
        call('propose_interview_guide', { studyId: guideStudy, guide: FAKE_GUIDE }),
      ],
      delayMs: 0,
    }
  // After any other tool run, the answer is over.
  if (ranTool) return { parts: [], delayMs: 0 }
  if (/help me create a project/i.test(text) && offered('load_skill'))
    return { parts: [call('load_skill', { name: 'project-framing' })], delayMs: 0 }
  if (/framing answered/i.test(text) && offered('report_project_progress'))
    return {
      parts: [
        { type: 'text', delta: 'Here is what I understood. May I propose the project?' },
        call('report_project_progress', framingStates('done')),
      ],
      delayMs: 0,
    }
  const teamId = /Team id: (\S+?)\)/.exec(request.system ?? '')?.[1]
  if (/propose the project/i.test(text) && teamId && offered('create_project'))
    return {
      parts: [
        { type: 'text', delta: 'Here is the project.' },
        call('create_project', {
          name: `Framed project ${Date.now()}`,
          teamId,
          question: 'Why do new users drop off, and who are they?',
          objectives: 'Decide what to fix in the first week.',
          hypotheses: '',
        }),
      ],
      delayMs: 0,
    }
  const attachable = /attachable study id (\S+?)\)/.exec(request.system ?? '')?.[1]
  if (/attach the study/i.test(text) && attachable && projectId && offered('attach_study'))
    return {
      parts: [
        { type: 'text', delta: 'Here is what reusing it means.' },
        call('attach_study', { studyId: attachable, projectId }),
      ],
      delayMs: 0,
    }
  const ownStudy = /Study id: (\S+?)[),;\s]/.exec(`${request.system ?? ''} `)?.[1]
  if (/detach the study/i.test(text) && ownStudy && projectId && offered('detach_study'))
    return {
      parts: [
        { type: 'text', delta: 'Here is what removing it means.' },
        call('detach_study', { studyId: ownStudy, projectId }),
      ],
      delayMs: 0,
    }
  if (/delete this project/i.test(text) && projectId && offered('delete_project'))
    return {
      parts: [
        { type: 'text', delta: 'Here is what deleting it means.' },
        call('delete_project', { projectId }),
      ],
      delayMs: 0,
    }
  if (/design the interview guide/i.test(text) && offered('load_skill'))
    return { parts: [call('load_skill', { name: 'interview-guide-design' })], delayMs: 0 }
  if (/write the guide/i.test(text) && offered('check_guide_questions'))
    return {
      parts: [
        call('check_guide_questions', {
          questions: FAKE_GUIDE.sections.flatMap((s) => s.questions.map((q) => q.text)),
        }),
      ],
      delayMs: 0,
    }
  if (/propose goal/i.test(text) && projectId && offered('update_project_goal'))
    return {
      parts: [
        { type: 'text', delta: 'Here is a proposal for the research goal.' },
        call('update_project_goal', {
          projectId,
          goal: 'Understand why new users drop off during their first week.',
        }),
      ],
      delayMs: 0,
    }
  const anyProject = /project id (\S+?)\)/.exec(request.system ?? '')?.[1]
  const studyId = /Study id: (\S+?)[),;\s]/.exec(`${request.system ?? ''} `)?.[1]
  if (/open project/i.test(text) && anyProject && offered('open_project'))
    return {
      parts: [
        { type: 'text', delta: 'Opening it.' },
        call('open_project', { projectId: anyProject }),
      ],
      delayMs: 0,
    }
  const tab = /open (preparation|fieldwork|analysis)/i.exec(text)?.[1]?.toLowerCase()
  if (tab && studyId && offered('open_study'))
    return {
      parts: [
        { type: 'text', delta: 'Switching tab.' },
        call('open_study', { studyId, phase: tab }),
      ],
      delayMs: 0,
    }
  if (/open study/i.test(text) && studyId && offered('open_study'))
    return {
      parts: [{ type: 'text', delta: 'Opening it.' }, call('open_study', { studyId })],
      delayMs: 0,
    }
  if (/propose study/i.test(text) && projectId && offered('create_study'))
    return {
      parts: [
        { type: 'text', delta: 'I suggest this study.' },
        call('create_study', { projectId, name: 'Interviews with new users' }),
      ],
      delayMs: 0,
    }
  const slow = /long answer/i.test(text)
  const words = slow
    ? Array.from({ length: 300 }, (_, i) => `word${i} `)
    : `You said: ${text}`.split(/(?<= )/)
  return { parts: words.map((delta) => ({ type: 'text', delta })), delayMs: slow ? 30 : 0 }
}

/**
 * Test provider (dev stack and tests only, `AI_FAKE_PROVIDER`, research R8): keys starting with
 * `test-ok` work, `test-quota` has no credit, anything else is invalid. Answers "OK", or follows
 * the conversation script when streaming.
 */
export const createFakeRunner = (): ModelRunner => {
  const check = (credential: Credential) => {
    const key = credential.provider === 'vertex' ? '' : credential.apiKey
    if (key.startsWith('test-ok')) return
    throw new ProviderCallError(
      key.startsWith('test-quota') ? 'NO_CREDIT_OR_QUOTA' : 'INVALID_CREDENTIAL',
    )
  }
  const usage = { inputTokens: 8, outputTokens: 1 }
  return {
    generateText: async (credential) => {
      check(credential)
      return { text: 'OK', usage }
    },
    generateObject: async (credential, _model, request) => {
      check(credential)
      // Spec 009: an interview analysis is answered from the speakers of the transcript, with one
      // quote that is not in it (the app must drop it).
      if (request.prompt?.startsWith('<transcript>')) {
        // Like a real model, an analysis takes a moment: the queue and spinners can be seen.
        await sleep(1500)
        const text = request.prompt.slice('<transcript>'.length)
        const lines = [...text.matchAll(/^([^:\n]{1,60}?)\s*:\s+(.{1,200})$/gm)]
        const speakers = [
          ...new Map(
            lines
              .filter((m) => !/^(participants?|attendees|invit)/i.test(m[1] ?? ''))
              .map((m) => [m[1]?.trim() ?? '', m[2] ?? '']),
          ).entries(),
        ]
        const [first, second] = speakers
        const answer = {
          interviewers: first ? [{ name: first[0], quote: first[1].slice(0, 120) }] : [],
          interviewees: [
            ...(second ? [{ name: second[0], quote: second[1].slice(0, 120) }] : []),
            { name: 'Nobody Here', quote: 'This sentence is not in the transcript.' },
          ],
          date: null,
        }
        const parsed = request.schema.safeParse(answer)
        if (!parsed.success) throw new ProviderCallError('UNKNOWN')
        return { object: parsed.data, usage: { inputTokens: 1200, outputTokens: 80 } }
      }
      // Spec 010: a lexicon reading groups close spellings of the candidates, quotes their first
      // excerpt, and adds one term with an invented quote (the app must drop it).
      if (request.prompt?.startsWith('<candidates>')) {
        await sleep(500)
        const answer = { terms: lexiconAnswer(request.prompt) }
        const parsed = request.schema.safeParse(answer)
        if (!parsed.success) throw new ProviderCallError('UNKNOWN')
        return { object: parsed.data, usage: { inputTokens: 2400, outputTokens: 200 } }
      }
      // Spec 012: verbatims, facts and translations, answered from the prompt.
      if (request.prompt?.includes('\n<interview-turns>\n')) {
        await sleep(300)
        const parsed = request.schema.safeParse(verbatimsAnswer(request.prompt))
        if (!parsed.success) throw new ProviderCallError('UNKNOWN')
        return { object: parsed.data, usage: { inputTokens: 5000, outputTokens: 400 } }
      }
      // Spec 016: questions, simple reformulations and one kind of leading sentence, from the prompt.
      if (request.prompt?.includes('\n<review-turns>\n')) {
        await sleep(300)
        const parsed = request.schema.safeParse(reviewAnswer(request.prompt))
        if (!parsed.success) throw new ProviderCallError('UNKNOWN')
        return { object: parsed.data, usage: { inputTokens: 4000, outputTokens: 300 } }
      }
      if (request.prompt?.includes('\n<verbatims>\n')) {
        await sleep(300)
        const parsed = request.schema.safeParse(factsAnswer(request.prompt))
        if (!parsed.success) throw new ProviderCallError('UNKNOWN')
        return { object: parsed.data, usage: { inputTokens: 2000, outputTokens: 500 } }
      }
      if (request.prompt?.includes('\n<insight-lines>\n')) {
        await sleep(300)
        const parsed = request.schema.safeParse(recommendationsAnswer(request.prompt))
        if (!parsed.success) throw new ProviderCallError('UNKNOWN')
        return { object: parsed.data, usage: { inputTokens: 2000, outputTokens: 700 } }
      }
      if (request.prompt?.startsWith('<takeaways-input>\n')) {
        await sleep(200)
        const parsed = request.schema.safeParse(takeawaysAnswer())
        if (!parsed.success) throw new ProviderCallError('UNKNOWN')
        return { object: parsed.data, usage: { inputTokens: 1500, outputTokens: 200 } }
      }
      if (request.prompt?.includes('\n<fact-lines>\n')) {
        await sleep(300)
        const parsed = request.schema.safeParse(insightsAnswer(request.prompt))
        if (!parsed.success) throw new ProviderCallError('UNKNOWN')
        return { object: parsed.data, usage: { inputTokens: 3000, outputTokens: 800 } }
      }
      if (request.prompt?.startsWith('<translate-insight>\n')) {
        const [, , to, ...rest] = request.prompt.split('\n')
        const texts = JSON.parse(rest.join('\n')) as Record<string, string>
        const lang = to?.replace('to: ', '').toUpperCase()
        const parsed = request.schema.safeParse({
          statement: null,
          description: null,
          counterEvidence: null,
          minorityView: null,
          action: null,
          rationale: null,
          successMeasure: null,
          text: null,
          ...Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, `${lang}: ${v}`])),
        })
        if (!parsed.success) throw new ProviderCallError('UNKNOWN')
        return { object: parsed.data, usage: { inputTokens: 300, outputTokens: 80 } }
      }
      if (request.prompt?.startsWith('<translate>\n')) {
        const [, , to, ...text] = request.prompt.split('\n')
        const parsed = request.schema.safeParse({
          statement: `${to?.replace('to: ', '').toUpperCase()}: ${text.join(' ')}`,
        })
        if (!parsed.success) throw new ProviderCallError('UNKNOWN')
        return { object: parsed.data, usage: { inputTokens: 200, outputTokens: 40 } }
      }
      // Spec 011: a cleaning corrects "eating" into "meeting" in each new turn that writes it, says
      // yes to each place to decide, and adds one correction not in the turn and one of 12 words
      // (the app must drop both).
      if (request.prompt?.includes('\n<turns>\n')) {
        await sleep(500)
        const answer = cleaningAnswer(request.prompt)
        const parsed = request.schema.safeParse(answer)
        if (!parsed.success) throw new ProviderCallError('UNKNOWN')
        return { object: parsed.data, usage: { inputTokens: 6000, outputTokens: 300 } }
      }
      // Only schemas with defaults can be answered without a model.
      const parsed = request.schema.safeParse({})
      if (!parsed.success) throw new ProviderCallError('UNKNOWN')
      return { object: parsed.data, usage }
    },
    // Like the AI SDK: `done` settles only once the stream has been read to its end.
    stream: (credential, _model, request) => {
      let settle: { resolve: (u: typeof usage) => void; reject: (e: unknown) => void } | undefined
      const done = new Promise<typeof usage>((resolve, reject) => {
        settle = { resolve, reject }
      })
      async function* parts(): AsyncGenerator<StreamPart> {
        try {
          check(credential)
        } catch (error) {
          settle?.reject(error)
          throw error
        }
        // Like the AI SDK's steps: tools the app runs feed the next step, until none ran.
        let messages: ChatMessage[] = [...(request.messages ?? [])]
        let written = ''
        for (let step = 0; step < MAX_STEPS; step++) {
          const { parts: scripted, delayMs } = script({ ...request, messages })
          const ran: { id: string; name: string; output: string }[] = []
          const calls: { id: string; name: string; input: unknown }[] = []
          let text = ''
          for (const part of scripted) {
            if (delayMs) await sleep(delayMs)
            // A new step's text is a new paragraph, as with the AI SDK runner.
            if (part.type === 'text' && step > 0 && written && !text && !written.endsWith('\n\n')) {
              written += '\n\n'
              yield { type: 'text', delta: '\n\n' }
            }
            yield part
            if (part.type === 'text') {
              text += part.delta
              written += part.delta
            } else {
              calls.push(part.call)
              const tool = request.tools?.find((t) => t.name === part.call.name)
              if (tool?.run)
                ran.push({ ...part.call, output: await tool.run(part.call.input, part.call) })
            }
          }
          if (ran.length === 0) break
          messages = [
            ...messages,
            { role: 'assistant', content: text, toolCalls: calls },
            { role: 'tool', results: ran },
          ]
        }
        settle?.resolve(usage)
      }
      return { parts: parts(), done }
    },
  }
}

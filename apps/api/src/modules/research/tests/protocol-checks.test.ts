import { describe, expect, it } from 'vitest'
import {
  checkProtocol,
  checkTask,
  plannedMinutes,
  scenarioWords,
} from '../domain/protocol-checks.ts'
import type { TestProtocolContent, TestTask } from '../domain/test-protocol.ts'

const task = (instruction: string, minutes: number | null = null): TestTask => ({
  id: instruction,
  instruction,
  criterion: 'Done',
  startUrl: null,
  minutes,
})

const protocol = (over: Partial<TestProtocolContent> = {}): TestProtocolContent => ({
  framing: {
    objective: 'Share reports',
    hypotheses: [],
    participants: '',
    format: 'moderated-remote',
    sessionMinutes: 60,
    language: 'en',
    consent: 'The session is recorded. The recordings are read by an AI service.',
    interface: { url: 'https://x.example.org', kind: 'prototype', description: null },
  },
  script: { introduction: '', thinkAloud: 'Think aloud.', warmUp: [], debrief: [], closing: '' },
  scenario: 'You prepare the weekly review of your team.',
  tasks: [task('Send this report to your manager so that they can read it before Monday')],
  questionnaire: 'none',
  easeQuestion: 'none',
  retiredTaskIds: [],
  ...over,
})

const flags = (instruction: string, scenario = protocol().scenario) =>
  checkTask(task(instruction), scenarioWords(scenario))

describe('task checks (spec 036 FR-007)', () => {
  it('flags an instruction that gives the way, in English and in French', () => {
    expect(flags('Click on Settings, then on Export to get the file')).toContain('gives-the-way')
    expect(flags('Open the "Reports" tab so that you can find last week')).toContain(
      'gives-the-way',
    )
    expect(flags('Cliquez sur le bouton Exporter pour récupérer le fichier')).toContain(
      'gives-the-way',
    )
    expect(flags('Allez dans l’onglet « Rapports » pour retrouver la semaine dernière')).toContain(
      'gives-the-way',
    )
    expect(flags('Send this report to your manager so that they can read it')).not.toContain(
      'gives-the-way',
    )
    expect(flags('Envoyez ce rapport à votre responsable pour qu’il le lise lundi')).not.toContain(
      'gives-the-way',
    )
  })

  it('flags several tasks in one, in English and in French', () => {
    expect(flags('Find a product and add it to your basket and pay for your order')).toContain(
      'several-tasks',
    )
    expect(flags('Find the report then share it with your team to prepare Monday')).toContain(
      'several-tasks',
    )
    expect(flags('Trouvez un produit, ajoutez-le au panier et payez votre commande')).toContain(
      'several-tasks',
    )
    expect(flags('Retrouvez le rapport puis partagez-le avec votre équipe pour lundi')).toContain(
      'several-tasks',
    )
    expect(flags('Find a jacket you would wear to run in the rain this winter')).not.toContain(
      'several-tasks',
    )
    expect(flags('Trouvez une veste que vous porteriez pour courir sous la pluie')).not.toContain(
      'several-tasks',
    )
  })

  it('flags an instruction without a goal, in English and in French', () => {
    expect(flags('Export the file')).toContain('no-goal')
    // "to" alone is no purpose (PR #51).
    expect(flags('Go to the account page and look around')).toContain('no-goal')
    expect(flags('Exportez le fichier')).toContain('no-goal')
    expect(flags('Export the file so that your manager has the figures on Monday')).not.toContain(
      'no-goal',
    )
    expect(
      flags('Exportez le fichier pour que votre responsable ait les chiffres lundi'),
    ).not.toContain('no-goal')
    // A word of the scenario gives the context.
    expect(
      flags('Prepare the weekly review with these figures', protocol().scenario),
    ).not.toContain('no-goal')
  })

  it('flags an instruction over 40 words', () => {
    const long = `Send this report to your manager so that ${'they can read it '.repeat(9)}`
    expect(long.split(/\s+/).filter(Boolean).length).toBeGreaterThan(40)
    expect(flags(long)).toContain('too-long')
    expect(flags('Send this report to your manager so that they can read it')).not.toContain(
      'too-long',
    )
  })
})

describe('protocol checks and planned length (spec 036 FR-007, FR-008)', () => {
  it('computes the planned length: 5 per task without one, 5 + 10 for the script, 3 for the SUS, 0.5 per task for the SEQ, rounded up', () => {
    expect(plannedMinutes(protocol())).toBe(5 + 5 + 10)
    expect(
      plannedMinutes(protocol({ tasks: [task('A goal to reach', 7), task('B goal to reach')] })),
    ).toBe(7 + 5 + 15)
    expect(plannedMinutes(protocol({ questionnaire: 'sus-v1' }))).toBe(23)
    expect(plannedMinutes(protocol({ easeQuestion: 'seq-v1' }))).toBe(21)
    expect(
      plannedMinutes(
        protocol({
          easeQuestion: 'seq-v1',
          tasks: [task('A goal', 5), task('B goal', 5), task('C goal', 5)],
        }),
      ),
    ).toBe(15 + 15 + 2)
  })

  it('flags a planned length beyond the session', () => {
    const framing = protocol().framing
    expect(checkProtocol(protocol({ framing: { ...framing, sessionMinutes: 15 } }))).toContain(
      'too-long-for-session',
    )
    expect(checkProtocol(protocol())).not.toContain('too-long-for-session')
  })

  it('flags more than 8 tasks with a session of 60 minutes or less', () => {
    const nine = Array.from({ length: 9 }, (_, i) => task(`Goal ${i} to reach for the review`, 2))
    expect(checkProtocol(protocol({ tasks: nine }))).toContain('too-many-tasks')
    const framing = protocol().framing
    expect(
      checkProtocol(protocol({ tasks: nine, framing: { ...framing, sessionMinutes: 90 } })),
    ).not.toContain('too-many-tasks')
    expect(checkProtocol(protocol({ tasks: nine.slice(0, 8) }))).not.toContain('too-many-tasks')
  })

  it('flags missing think-aloud instructions', () => {
    const script = protocol().script
    expect(checkProtocol(protocol({ script: { ...script, thinkAloud: '' } }))).toContain(
      'no-think-aloud',
    )
    expect(checkProtocol(protocol())).not.toContain('no-think-aloud')
  })

  it('flags a consent that does not mention the recording and the AI reading, in both languages', () => {
    const framing = protocol().framing
    const consent = (text: string) =>
      checkProtocol(protocol({ framing: { ...framing, consent: text } }))
    expect(consent('You can stop at any time.')).toContain('consent-without-ai')
    expect(consent('The session is recorded.')).toContain('consent-without-ai')
    expect(consent('The session is recorded and read by artificial intelligence.')).not.toContain(
      'consent-without-ai',
    )
    expect(consent('La séance est enregistrée et lue par une IA.')).not.toContain(
      'consent-without-ai',
    )
    expect(consent('La séance est enregistrée.')).toContain('consent-without-ai')
  })
})

import type { BestPractices } from './best-practices.types.ts'

export const usabilityPractices: BestPractices = {
  title: 'Usability test best practices',
  intro:
    'A usability test watches people try to reach their own goals with an interface. It shows **where they get stuck**, not what they say they like. Five to eight participants per profile already reveal most of the problems; what matters most is how the tasks are written and how neutral the facilitator stays.',
  sections: [
    {
      heading: '1. Frame the test',
      blocks: [
        {
          list: [
            '**One objective**, taken from the research goal: what decision will the test help to make?',
            '**Hypotheses** you want to confirm or refute: they decide which tasks to write.',
            '**The tested interface**: a prototype or the live application, with the link and the account participants will use. Check both on their device before the first session.',
            '**Participants** who match the people who will really use it. Colleagues who built the interface are not participants.',
          ],
        },
      ],
    },
    {
      heading: '2. Write realistic tasks',
      blocks: [
        {
          p: 'A task is a goal the participant could have in real life, given in a short scenario. It never says how to do it.',
        },
        {
          list: [
            '**One goal per task.** "Find a product and pay for it" is two tasks.',
            '**Never name the interface**: no button, menu or tab names, no steps. "Click on Export" tests reading, not the interface; "Send this report to your manager" tests the interface.',
            '**A success criterion** you can see on screen: what must be visible or done for the task to count as reached.',
            '**Realistic data**: give the participant what they need (a product name, a date) instead of letting them invent it.',
            '**Few tasks**: plan about five minutes per task, and keep time for the introduction and the debrief. An hour holds five to eight tasks.',
          ],
        },
      ],
    },
    {
      heading: '3. Run the session',
      blocks: [
        {
          list: [
            '**Consent first**: say what is recorded, that the recordings are read by an AI service, and that names and faces cannot be hidden from it.',
            '**Think-aloud**: ask the participant to say what they look for, expect and find surprising. Remind them gently if they fall silent.',
            '**Read the instruction as written**, the same way for everyone, so sessions can be compared task by task.',
            '**Stay neutral**: no "great", no hints, no explaining the interface. Answer a question with a question: "What would you do?"',
            '**Help only when blocked**, after a fixed delay, and say it out loud ("I am helping you here") so the help is visible in the recording and the task counts as reached with help.',
          ],
        },
      ],
    },
    {
      heading: '4. Standard questions',
      blocks: [
        {
          p: 'Two short questionnaires give comparable numbers across sessions and versions. Read them as written, in the same order.',
        },
        {
          list: [
            '**Single Ease Question**, after each task: one question from 1 (very difficult) to 7 (very easy). It points at the hardest tasks.',
            '**System Usability Scale**, at the end: ten fixed statements rated from 1 to 5. The app computes the score; it is read as a whole, never item by item.',
          ],
        },
      ],
    },
    {
      heading: 'The System Usability Scale, a standard',
      level: 3,
      blocks: [
        {
          p: 'It is a standardised questionnaire: its value comes from being given the same way everywhere. Never reword, shorten, reorder or translate it yourself.',
        },
        {
          list: [
            '**When**: right after the last task, before the debrief, so the debrief does not colour the answers.',
            '**How**: the participant answers alone, on the participant sheet, all ten statements in their order. Ask for an immediate reaction; if they cannot answer one, the middle box (3). Say nothing while they answer.',
            '**Why it alternates**: odd statements are positive, even ones negative, so that answering without reading shows.',
            '**The score**: for odd statements, the answer minus 1; for even ones, 5 minus the answer; the sum times 2.5 gives a score from 0 to 100. It is not a percentage. The app computes it.',
            '**Reading it**: about 68 is the average across many studies; above 80 is usually seen as excellent; below 68, usability needs work. Compare a product with itself over versions rather than with another product: two products with the same score can have different strengths.',
            '**How many people**: five to ten give a first reading alongside observation; twenty to thirty for a robust score.',
          ],
        },
      ],
    },
    {
      heading: '5. Debrief and pilot',
      blocks: [
        {
          list: [
            '**Debrief questions** ask about the whole experience: what was hardest, what was missing, what they would change.',
            '**A pilot session** with someone outside the project shows unclear instructions, broken links and a too long session before real participants come.',
            '**A review by another person** catches leading wordings you no longer see.',
          ],
        },
      ],
    },
    {
      heading: '6. How the sessions will be read',
      blocks: [
        {
          p: 'Each recorded session is read task by task against the protocol: whether the task was reached, with or without help, where people hesitated or erred, and what they said. That reading only works if every session follows the same tasks with the same instructions. Every observation keeps its time in the recording, so anyone can watch the moment again.',
        },
      ],
    },
    {
      heading: 'Sources',
      blocks: [
        {
          list: [
            'Nielsen, J. (1993). *Usability Engineering*. Academic Press.',
            'Rubin, J. & Chisnell, D. (2008). *Handbook of Usability Testing* (2nd ed.). Wiley.',
            'ISO 9241-11:2018. *Ergonomics of human-system interaction — Usability: definitions and concepts*.',
            'Brooke, J. (1996). SUS: a "quick and dirty" usability scale. In *Usability Evaluation in Industry*. Taylor & Francis. (Created in 1986, free to use.)',
            'Bangor, A., Kortum, P. T. & Miller, J. T. (2008). An empirical evaluation of the System Usability Scale. *International Journal of Human–Computer Interaction*, 24(6).',
            'Sauro, J. & Dumas, J. S. (2009). Comparison of three one-question, post-task usability questionnaires. *Proceedings of CHI 2009*.',
          ],
        },
      ],
    },
  ],
}

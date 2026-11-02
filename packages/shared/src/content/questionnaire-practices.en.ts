import type { BestPractices } from './best-practices.types.ts'

export const questionnairePractices: BestPractices = {
  title: 'Questionnaire best practices',
  intro:
    'A questionnaire collects **quantifiable data** through methodically built items, for one precise research objective. Most biases are decided before the first response: in the order you build it, in the wording, and in how it is sent.',
  sections: [
    {
      heading: '1. Structure before writing',
      blocks: [
        {
          p: 'Build in this order: objective, themes, optional sub-themes, and only then items. Starting from items scatters the questionnaire and brings in irrelevant ones.',
        },
        {
          list: [
            '**A concrete objective**: what exactly will be measured, described or compared?',
            '**Themes**: ask "what information do I need?". Brainstorm with one or two people, then check with experts or published work.',
            '**Build together**: another view at each step removes biases early.',
          ],
        },
      ],
    },
    {
      heading: '2. Write the items',
      blocks: [
        {
          p: 'Keep only the necessary items. An item is not always a question: it can be a statement rated for agreement.',
        },
        {
          list: [
            '**A fact**: a categorical item, yes or no, a forced choice or a multiple choice.',
            '**A perception, an opinion, a feeling**: a Likert scale. Seven points give enough choice and limit differences between individuals.',
            '**An open question**: a complement, harder to interpret. It lets people express themselves and breaks a long series.',
          ],
        },
        {
          p: 'One idea per item, in the participant\'s words. Avoid double questions, negations, leading wordings and absolute words such as "always".',
        },
      ],
    },
    {
      heading: '3. Present and order',
      blocks: [
        {
          list: [
            '**Vary to keep attention**: for example, an open question about every 10 closed items, against fatigue and automatic answers.',
            '**Stay consistent**: the same legend on every scale, and the same sentence structure across the items of a scale.',
            '**Randomise where you can**: it spreads fatigue, boredom and learning effects across items. Say plainly what cannot be randomised: here, the order of themes stays fixed.',
          ],
        },
      ],
    },
    {
      heading: '4. Before sending',
      blocks: [
        {
          p: '**Have it reviewed** by at least one other person, then pre-test it with a few naive participants, people who did not build it: is it understood, is anything blocking?',
        },
        {
          p: '**Inform people.** A short consent text says the objective, the format and length, anonymity and the use of the data, that there is no right or wrong answer, and that taking part is a free choice. Announce sensitive themes (health, lived experience, personal habits) beforehand. Refusing ends the questionnaire. Finish with a thank-you.',
        },
        {
          p: '**Ask only what you need.** Avoid anything directly linked to a person, such as a first name or an email address. If people want the results, offer one optional address at the end, used only to send them, and delete it afterwards: it stays in the form and its spreadsheet until someone does.',
        },
        { p: '**Limit social interaction.** Answering alone reduces social desirability bias.' },
        {
          list: [
            '**Recruit**: send it to people matching the target, or widely and then filter. Either way, put a few profiling items at the start to check who answered.',
            '**Sample size**: no universal threshold. It depends on the objectives, the number of parameters and the analysis planned.',
          ],
        },
      ],
    },
    {
      heading: '5. Think ahead to the analysis',
      blocks: [
        {
          p: 'Choose each item knowing what you will do with it. This section comes from common survey practice.',
        },
        {
          list: [
            '**Likert scales** are ordered, not measures: read the distribution and the median rather than an average alone.',
            '**Choices** give counts and shares. Cross them with profiling items only where groups are large enough, and always show the number of responses.',
            '**Open answers** are read by theme, with a person validating what comes out.',
            '**Before reading any result**, filter out people outside the target and those who refused, and say how many were set aside.',
          ],
        },
      ],
    },
    {
      heading: 'Checklist',
      blocks: [
        {
          checklist: [
            'A concrete objective, then themes, then items',
            'Each item serves the objective and tells what analysis it allows',
            'Facts as choices, perceptions as scales',
            'One legend on all scales',
            'Consent, sensitive themes announced, thanks',
            'No directly identifying data',
            'Reviewed by another person and pre-tested',
            'Recruitment and target number written',
          ],
        },
      ],
    },
    {
      heading: 'Sources',
      blocks: [
        {
          p: 'The four steps follow J. Desdevises, "Comment construire un questionnaire en 4 étapes", OCTO Talks, 2022, which itself cites Alwin & Krosnick 1991 and Tourangeau et al. 2000.',
        },
      ],
    },
  ],
}

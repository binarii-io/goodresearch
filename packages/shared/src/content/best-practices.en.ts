import type { BestPractices } from './best-practices.types.ts'

export const bestPractices: BestPractices = {
  title: 'Interview best practices',
  intro:
    'This document goes with the study’s interview guide. The guide says **what** to ask; this document says **how** to run the interview.',
  sections: [
    {
      heading: 'Before the interview',
      blocks: [
        {
          list: [
            '**Clear objective**: reread the research goal, the themes and the hypotheses to confirm or refute.',
            '**Recruitment**: aim for a diversity of profiles (roles, teams, seniority, relationship with the topic) and plan a few more interviews than needed (no-shows, rescheduling).',
            '**Format**: 45 to 60 minutes, remote by video call or in the participant’s own context, to see them in their real environment.',
            '**Roles**: a single interviewer, who leads the conversation. At most two observers, who take notes and do not speak unless invited at the end.',
            '**No line manager** of the participant in the room or on the call.',
            '**Logistics**: invitation sent with the purpose and duration of the session; recording and transcription ready; guide printed or open, but not read word for word.',
          ],
        },
      ],
    },
    { heading: 'The four phases', blocks: [] },
    {
      heading: '1. Introduction (≈ 5 min)',
      level: 3,
      blocks: [
        {
          list: [
            'Introduce yourself, the observers and their role.',
            'Recall the context and the objective: we want to understand practices, not to assess the person. There are no right or wrong answers.',
            'Thank them for their time.',
            'Recall confidentiality: what they say is anonymised in the readout.',
            '**Ask for consent (written or verbal) to record**, before starting the recording.',
          ],
        },
      ],
    },
    {
      heading: '2. Warm-up questions (5 to 10 min)',
      level: 3,
      blocks: [
        {
          list: [
            'The person introduces themselves: role, missions, team, seniority, relationship with the topic.',
            'This information is used to segment profiles during the analysis: collect it the same way with every participant.',
          ],
        },
      ],
    },
    {
      heading: '3. Thematic questions (30 to 40 min)',
      level: 3,
      blocks: [
        {
          list: [
            'The core of the interview: one section per research theme.',
            'Cover **every theme with every participant**, otherwise a missing answer cannot be interpreted.',
            'Follow the order of the guide without being bound by it: if the person brings up a later theme on their own, follow them, then come back to the themes not yet covered.',
          ],
        },
      ],
    },
    {
      heading: '4. Wrap-up (≈ 5 min)',
      level: 3,
      blocks: [
        {
          list: [
            '“Is there anything you would like to add?”',
            'Let the observers ask a question if they have one.',
            'Thank them and present the next steps (analysis, readout).',
            'Ask whether the person would agree to take part in future research.',
          ],
        },
      ],
    },
    {
      heading: 'Asking questions',
      blocks: [
        {
          list: [
            '**Open** and focused on **lived experience**: “Tell me about the last time you…”, “How do you currently…?”',
            '**One idea per question**, in the participant’s words rather than the project team’s jargon.',
            '**Avoid** questions that suggest the answer (“You find that complicated, don’t you?”), closed (yes or no) main questions, hypothetical questions (“If you had…”) or questions about the future (“Would you use…?”), and asking for solutions (“What should we build?”): focus instead on the concrete difficulties they face.',
          ],
        },
      ],
    },
    {
      heading: 'Follow-up questions',
      blocks: [
        {
          list: [
            'Ask for clarification: “What do you mean?”, “Can you tell me more?”',
            'Ask for a concrete example: “Do you remember a time when…?”',
            'Dig into reasons: “Why?”, “What makes you say that?”',
            'Walk through the sequence: “And then?”, “What happened next?”',
            'Rephrase what was said to check your understanding: “If I understand correctly…”',
            '**Never contradict**: if a statement seems wrong, ask them to clarify.',
            '**Embrace silences**: wait a few seconds after an answer, people often add to it on their own.',
          ],
        },
      ],
    },
    {
      heading: 'Posture',
      blocks: [
        {
          list: [
            '**Benevolent neutrality**: set aside your assumptions and do not defend the product or the project.',
            '**Active listening**: look at the person, nod, do not bury yourself in your notes.',
            '**Do not analyse during the interview**: collect now, analyse later.',
            'Speak little: the participant should have the vast majority of the speaking time (see the thresholds below).',
          ],
        },
      ],
    },
    {
      heading: 'Biases to avoid',
      blocks: [
        {
          list: [
            '**Conformity bias**: the participant wants to please. Show neither your opinion nor your expectations, and do not react more enthusiastically to one answer than to another.',
            '**Authority bias**: a line manager’s presence changes the answers. Do not invite them.',
            '**Sunk cost bias**: do not mention the time spent, the team size or the project budget, which push people to spare what already exists.',
          ],
        },
      ],
    },
    {
      heading: 'What is measured after the interview',
      blocks: [
        {
          p: 'Each recorded interview can be reviewed to assess how the interviewer led it. Knowing the indicators before the interview helps you stay neutral.',
        },
      ],
    },
    {
      heading: 'Interviewer talk share',
      level: 3,
      blocks: [
        { p: 'Share of the words spoken by the interviewer over the whole interview.' },
        {
          list: [
            '**30 % or less**: good, the participant is speaking.',
            '**Up to 40 %**: to watch.',
            '**More than 40 %**: the interviewer talks too much, the participant has no room to develop.',
          ],
        },
        {
          p: 'To stay under 30 %: short questions, one at a time, no explanation of your own point of view, and let silences be rather than filling them.',
        },
      ],
    },
    {
      heading: 'The interviewer’s interventions',
      level: 3,
      blocks: [
        {
          p: 'Each intervention of the interviewer is classified as a guide question, a follow-up, a rephrasing, context or logistics, or an opinion or leading question. Two shares are computed, in words:',
        },
        {
          list: [
            '**Opinions and leading questions**: 5 % or less is good, up to 10 % to watch, above that a problem. This is the main bias: it steers the answers.',
            '**Follow-ups and guide questions**: 60 % or more is good, from 40 % to watch, below that a problem. A good interview is mostly questions and follow-ups, not comments.',
          ],
        },
      ],
    },
    {
      heading: 'Guide coverage',
      level: 3,
      blocks: [
        {
          p: 'The number of main questions of the guide actually asked. It is an indicator, not a score: the order can change and a question can be skipped if the person already answered it. Every **theme**, however, must be covered with every participant.',
        },
      ],
    },
    {
      heading: 'After the interview',
      blocks: [
        {
          list: [
            'Send a thank-you message.',
            'Take 10 minutes right away with the observers: striking impressions, strong quotes, themes barely covered to address better next time.',
            'Store the recording and the transcript in the study’s folder, and update the status in the interview schedule.',
            'Adjust the guide if a question does not work, without changing the themes, so that interviews remain comparable.',
          ],
        },
      ],
    },
    {
      heading: 'Thinking ahead to the analysis',
      blocks: [
        {
          list: [
            'Each theme of the guide maps to an analysis category: quotes will be classified by theme, then counted (how many participants mention what).',
            'The hypotheses stated upfront will be confirmed or refuted during the analysis.',
            'The warm-up questions feed the participant profiles in the readout.',
          ],
        },
      ],
    },
    {
      heading: 'Checklist',
      blocks: [
        {
          checklist: [
            'Objective, themes and hypotheses reread',
            'Invitation sent, schedule up to date',
            'Roles assigned: one interviewer, at most two observers',
            'Consent to record asked before starting',
            'Every theme covered',
            'Open questions, without suggesting the answer',
            'Short interviewer talk share (30 % or less), mostly questions and follow-ups',
            'Wrap-up: open floor, next steps, thanks',
            'Debrief right away and files stored in the folder',
          ],
        },
      ],
    },
  ],
}

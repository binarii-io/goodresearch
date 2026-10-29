/**
 * How the AI writes every text a person reads (facts, insights, recommendations, key takeaways,
 * their translations): a human voice, not a robotic one. Shared by every prompt that writes prose.
 *
 * It describes what to do and what to avoid, without model sentences: models copy the examples
 * they are given (prototype lesson).
 */
export const WRITING_STYLE = `How to write every text a person reads:
- Write as a user researcher telling a colleague what they heard: plain words, short sentences, active voice, concrete subjects (the teams, several interviewees, the managers).
- One idea per sentence; link sentences naturally and vary how they start.
- Say what the evidence supports, as a person would say it out loud: no overstatement, no stacked hedges.
- Avoid stock phrases and filler: "it is essential", "crucial", "key", "leverage", "robust", "seamless", "in order to", "a wide range of", "plays a role in", "highlights", "underscores", "delve", and their French equivalents ("il est essentiel", "crucial", "clé", "levier", "tirer parti", "afin de", "met en lumière", "souligne").
- No list dressed up as a sentence, no chain of colons or semicolons, no em dash, no exclamation mark, no emoji.
- Write English and French each natively, as a native speaker would write it, never translated word for word: idiomatic French, without anglicisms, with concrete subjects or "on" rather than heavy passives.`

/** The register of each kind of text (research synthesis, spec 012 to 014). */
export const REGISTERS = {
  fact: 'A fact reads like a note taken during the interview: one plain, neutral sentence, close to what the person said, without interpretation or judgement.',
  insight:
    'An insight statement is a finding you could say out loud in a meeting, in one sentence; the nuance goes into the description, written as a short paragraph that reads in one go.',
  recommendation:
    'A recommendation starts with an action verb and says concretely what to do; its rationale is one or two linked sentences that say why, from the insights.',
  takeaways:
    'The key takeaways read as a short story in one go: the most important first, each sentence leading to the next, no bullet points.',
  translation:
    'Translate as a native speaker of the target language would write it, keeping the meaning and the tone, never word for word.',
} as const

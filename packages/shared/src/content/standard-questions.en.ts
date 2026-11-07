import type { StandardQuestions } from './standard-questions.types.ts'

/** English original of the System Usability Scale (Brooke, 1996) and of the Single Ease Question (Sauro & Dumas, 2009). */
export const standardQuestions: StandardQuestions = {
  'sus-v1': {
    title: 'System Usability Scale',
    scale: { points: 5, low: 'Strongly disagree', high: 'Strongly agree' },
    instructions:
      'For each of the following statements, mark one box that best describes your reactions to the system today. Record your immediate response to each item, rather than thinking about it for a long time. Answer every item; if you feel you cannot respond to one, mark the centre box (3).',
    facilitatorNote:
      'Right after the last task and before the debrief: the participant answers alone, all ten statements, in this order, word for word, without comment from you. The statements alternate positive and negative on purpose: never reword or reorder them. The app computes the score; it is read as a whole, never item by item.',
    items: [
      'I think that I would like to use this system frequently.',
      'I found the system unnecessarily complex.',
      'I thought the system was easy to use.',
      'I think that I would need the support of a technical person to be able to use this system.',
      'I found the various functions in this system were well integrated.',
      'I thought there was too much inconsistency in this system.',
      'I would imagine that most people would learn to use this system very quickly.',
      'I found the system very cumbersome to use.',
      'I felt very confident using the system.',
      'I needed to learn a lot of things before I could get going with this system.',
    ],
  },
  'seq-v1': {
    title: 'Ease of the task',
    question: 'Overall, how difficult or easy was the task to complete?',
    scale: { points: 7, low: 'Very difficult', high: 'Very easy' },
  },
  defaults: {
    consent:
      'Thank you for taking part. Today we are testing an interface, not you: there are no right or wrong answers, and anything that is hard for you helps us improve it.\n\n' +
      'The session is recorded: your screen, your voice and your image. The recordings will be read by an AI service to help us analyse the session, and the names and faces they contain cannot be hidden from it. Only the research team sees the recordings.\n\n' +
      'Taking part is your choice. You can stop at any time without giving a reason. Do you agree to take part and to be recorded?',
    thinkAloud:
      'While you use the interface, please think aloud: say what you are looking for, what you expect to happen, and what surprises you. I may stay quiet; that is on purpose, to see how you would do on your own.',
  },
}

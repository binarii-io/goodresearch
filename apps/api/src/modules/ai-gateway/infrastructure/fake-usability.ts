/**
 * Spec 038: the dev and test provider's answers to the usability analysis stages, matched by the
 * marker that starts their text (`<usability:stage>`). Null when the text is not one of them.
 * The answers are fixed and plausible: one quote is not in the transcript (the app drops it) and
 * one observation is doubted by the judge (the arbiter settles it).
 */
const SPEECH = [
  {
    speaker: 'Facilitator',
    start: 2,
    end: 8,
    text: 'Thank you for joining. Please think aloud while you try the tasks.',
  },
  { speaker: 'Facilitator', start: 10, end: 16, text: 'First task: find the report of last week.' },
  {
    speaker: 'Participant',
    start: 20,
    end: 27,
    text: "Hmm, where's the export? I would expect it in the menu.",
  },
  {
    speaker: 'Participant',
    start: 35,
    end: 41,
    text: 'Oh, there it is. That was easy in the end.',
  },
  {
    speaker: 'Facilitator',
    start: 45,
    end: 50,
    text: 'Thanks. Next task, please share it with your manager.',
  },
  {
    speaker: 'Participant',
    start: 52,
    end: 58,
    text: 'I click share, and I am not sure it was sent.',
  },
]

const taskIds = (text: string) => [...text.matchAll(/^- ([^:\n]+): /gm)].map((m) => m[1] as string)

const frameTimes = (text: string) =>
  [...text.matchAll(/Frame at (\d\d):(\d\d):/g)].map((m) => Number(m[1]) * 60 + Number(m[2]))

export const fakeUsabilityAnswer = (text: string): unknown => {
  if (!text.startsWith('<usability:')) return null
  const stage = /^<usability:([a-zA-Z]+)>/.exec(text)?.[1]
  switch (stage) {
    case 'layout':
      return { shared: false, x: 0, y: 0, width: 0, height: 0 }
    case 'transcript': {
      // Only the first chunk speaks: the dev videos are short.
      const from = /covers (\d\d):(\d\d)/.exec(text)
      const start = from ? Number(from[1]) * 60 + Number(from[2]) : 0
      return { language: 'en', segments: start === 0 ? SPEECH : [] }
    }
    case 'screenLog':
      return {
        entries: frameTimes(text).map((at) => ({
          at,
          screen: at < 30 ? 'Home page' : at < 45 ? 'Reports page' : 'Share dialog',
          action: at < 30 ? 'looks around the menu' : at < 45 ? 'opens the report' : 'clicks Share',
        })),
      }
    case 'taskMap': {
      const ids = taskIds(text)
      return {
        tasks: ids.map((taskId, i) => ({
          taskId,
          found: i < 2,
          start: i === 0 ? 10 : i === 1 ? 45 : null,
          end: i === 0 ? 42 : i === 1 ? 59 : null,
          note: i < 2 ? 'Given by the facilitator.' : 'Not reached in the session.',
        })),
      }
    }
    case 'task': {
      const second = /Task [^:]+: .*share/i.test(text)
      return second
        ? {
            outcome: 'partial',
            path: 'Report, Share, Send',
            ease: 4,
            assisted: false,
            observations: [
              {
                kind: 'difficulty',
                at: 54,
                text: 'Is not sure the report was sent after clicking Share.',
                quote: 'I am not sure it was sent',
                seen: 'No confirmation after Send',
                susItem: null,
                susValue: null,
              },
            ],
          }
        : {
            outcome: 'success',
            path: 'Home, Menu, Reports, Last week',
            ease: 6,
            assisted: false,
            observations: [
              {
                kind: 'difficulty',
                at: 22,
                text: 'Looks for the export in the menu first.',
                quote: "where's the export?",
                seen: 'Menu open',
                susItem: null,
                susValue: null,
              },
              {
                kind: 'positive',
                at: 37,
                text: 'Finds the report and says it was easy.',
                quote: 'That was easy in the end',
                seen: null,
                susItem: null,
                susValue: null,
              },
              {
                kind: 'verbatim',
                at: 30,
                text: 'Praises the product.',
                quote: 'I love this product so much',
                seen: null,
                susItem: null,
                susValue: null,
              },
            ],
          }
    }
    case 'judge':
      return /not sure it was sent/.test(text)
        ? {
            verdict: 'not-confirmed',
            contrary: null,
            reason: 'No confirmation message is seen, nor its absence for sure.',
          }
        : {
            verdict: 'kept',
            contrary: null,
            reason: 'Seen on the frames and said in the transcript.',
          }
    case 'arbiter':
      return {
        verdict: 'kept',
        reason: 'The dialog closes with no confirmation: the doubt is real.',
      }
    default:
      return null
  }
}

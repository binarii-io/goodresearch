# Data model: Interviews with the assistant

## States of an interview

| Filter | Meaning |
|---|---|
| `to-decide` | Still proposed, with a suggestion undecided |
| `no-transcript` | No transcript |
| `no-recording` | No recording |
| `not-analysed` | Still proposed, and its analysis is missing, failed or waiting |
| `ready` | Still proposed, with a transcript, analysed, nothing undecided |
| `validated`, `excluded` | Decided by a person |

An interview can match several. Filters combine with AND.

## Item of a list

`id`, `title`, `state`, `hasTranscript`, `recordings`, `date`, `language`, `analysed`, `excludedReason`, `toDecide` (field and value of each suggestion undecided). Never the transcript's text.

## Proposal kinds (migration 0053)

`count_interviews`, `list_interviews` (recorded, panel line), `propose_analysis` (card: `interviews`, `estimatedCost`, `consentNeeded`).

## Refusals

`NOTHING_TO_ANALYZE`, `ANALYSIS_RUNNING`, `AI_PROVIDER_REQUIRED`, and those of spec 024.

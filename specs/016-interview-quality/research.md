# Research: Interview quality

Decisions for spec 016. Each one: decision, why, alternatives rejected.

## R1. A new `interview-quality` module

- **Decision**: `apps/api/src/modules/interview-quality`, reaching other modules only through ports wired in `compose.ts`: transcripts (`analysedText`, `importTranscripts`, `enrichmentLive`), ingestion (`enrichmentSessions`, `cleaningNames`, `knownNames`), research (study access, goal, guide), evidence (`speakerAttributions`, `factsLive`), ai-gateway.
- **Why**: the context map makes it a core context; it does not depend on facts.
- **Rejected**: living inside Evidence.

## R2. The app cuts the sentences

- **Decision**: a pure function cuts each interviewer turn at sentence ends (`.`, `?`, `!`, `…`, keeping abbreviations and decimals whole), giving ids such as `t3.2`. Fragments of at most 2 words ("OK.", "I see.") are not sentences: never sent for classification, never counted. A turn without punctuation is one sentence.
- **Why**: totals must be reproducible (SC-004) and the quote exact by construction (SC-003). Letting the AI cut would change the denominators between two reviews.
- **Rejected**: AI cutting; counting `?` for questions (automatic transcripts often miss them, and a statement can ask).
- **Limit**: in an unpunctuated turn, the AI returns an `excerpt` of the sentence, verified word for word, so that a remark does not show a whole monologue. Totals for such turns stay low; the tooltip says how sentences are counted.

## R3. What the AI answers

- **Decision**: one task `interview-review`, per chunk. Sent: research goal, main guide questions, every turn of the chunk with role and speaker placeholder, interviewer sentences with ids. Answer: only the sentences that are not `other`: `{ id, kind: question | simple-reformulation, flag?: { kind, reason: {en, fr}, recommendation, addedElement, excerpt } }`.
- **Why**: most interviewer sentences are short; listing only what matters keeps the output and cost down, and a missing sentence is safely `other`.
- **Rejected**: a line for each sentence (cost for nothing); two passes (classification then flags: double cost for the same reading).

## R4. Guarding simple reformulations

The prototype's main error, handled at three levels:
1. **Prompt**: states the rule and gives counter-instructions without examples to copy (spec 010 lesson): restating is good practice, whatever the wording or the question mark; if in doubt, no flag.
2. **Required added element**: a `reformulation-with-opinion` without `addedElement` is reclassified as simple.
3. **App check**: the element's content words (folded, 4 letters or more) are searched in what interviewees said earlier in the whole interview, not only in the chunk. All found → reclassified as simple, counted "left out".

**Limit**: the check catches words, not meaning. A paraphrase passes it, which is why SC-001 is measured on a real provider and why people can disagree. The opposite error is covered by the filter and requalification (clarification 4).

## R5. Who said a sentence

- **Decision**: `speakerRole` moves from `evidence/domain` to `packages/shared`, and gains the interviewer's code for a label matching one. Attributions stay in Evidence, read through `speakerAttributions(studyId)`; the Quality tab links to the existing attribution in Analysis. An interview with one interviewer gives them generic labels ("Interviewer"). With several and a generic label or a label attributed to "an interviewer", the sentences go to an **"Interviewer not identified"** row, so rows still add up.
- **Why**: one rule; spec 012's attribution only knows "an interviewer", not who.
- **Rejected**: a second attribution in Quality (two answers to the same question). Attribution per interviewer is left for the speaker mapping of a later spec.

## R6. Speaking times

- **Decision**: at read time, shares from words per role over the analysed text. Minutes per role from gaps between turn starts (`Turn` has `start`, no reliable end); the last turn has no gap and is left out, so minutes read "about". Shown only when every turn has a start. Summed words for groups, never averaged percentages. Above 95% of interviewer words: not measurable.
- **Why**: deterministic; never stored, so a correction or attribution shows at once.
- **Risk**: the overview computes the analysed text of each interview, as Evidence's list does; if slow with 30 interviews, cache by fingerprint in memory (decide on measure).

## R7. What is stored per review

- **Decision**: per interview, counts by **speaker label** (`sentences`, `questions`), simple reformulations as rows, remarks as rows. Figures per person are derived by mapping labels at read time.
- **Why**: fixing a speaker attribution moves the figures with no AI cost. Storing every `other` sentence adds rows no screen needs.
- **Rejected**: counts per person (stale after an attribution).

## R8. Counting

- **Decision**: `leading` = AI and person remarks minus the disagreed ones. Leading questions over questions; all leading over counted sentences. A leading question is also a question. Disagreed remarks are shown apart. A disagreed `reformulation-with-opinion` is not reclassified as simple: a person gave an opinion on a remark, not a new classification.
- **5% reference**: computed as a share of sentences; the prototype's was a share of words. Guidance only (spec Assumptions).

## R9. The reference set

- **Decision**: `tests/reference/` holds synthetic excerpts, written for this purpose with no real person's data, at least 30 simple reformulations and 20 with opinion, in English and French, with tricky cases (question marks, other words, a reformulation of something said much earlier). A runner (`apps/api/scripts/quality-reference.ts`) uses a connection from the environment, prints the two rates and the cost, and is run by hand before release; results go in the PR. The set's fixtures also run with the fake provider in CI to test the guards.
- **Why**: the model's judgement can only be measured with the model.

## R10. Estimate and cost

- **Decision**: same formula as spec 012 (`deps.ai.estimate`), with a constant for the answer size set from the first reference run. Ledger ref `quality:<runId>:<sessionId>`, consent kept per person and provider in `quality_consents` (a separate consent since the purpose differs). No figure is promised before that measure.

**Measured (2026-10-31)**, on Vertex `gemini-3.8-flash`, 217 parts of real interviews: 3,136 output tokens on average, 7,685 at most among those that fit, 25 s per part. The constant is now 3,200. Answers cut at the 8,000 limit failed 2 of 51 interviews, so the limit is 16,000.

## R11. Tab placement

- **Decision**: phase value `quality`, label "5 · Quality"; Analysis becomes "6 · Analysis". It follows the prototype's order and stays usable during fieldwork; it blocks nothing.
- **Rejected**: an unnumbered tab (reads as secondary) or after Analysis (later than the moment it helps most).

## R12. Re-review and re-anchoring

- **Decision**: as spec 012. A remark stores turn, offset, length and its own text; found again at read time, flagged "text changed" otherwise. Remarks with an opinion and person remarks stay; others are replaced. A new flag whose normalised text equals a disagreed remark's in the same turn is dropped. State derived: `to-review-again` when a remark is lost, the raw was re-imported, or `anonymised` / `textAnalysed` changed; a word corrected alone does not mark it.

## R13. Reference run (2026-10-31)

- **Result**, Vertex `gemini-3.8-flash`, synthetic set, one excerpt per call: 0 of 30 simple reformulations flagged, 20 of 20 reformulations with opinion found; cost 0.2017 for 50 calls; about 50,461 input and 43,691 output tokens; on average 874 output tokens and 8 s per call.
- **What it does not say**: these are isolated short excerpts written by us. It does not measure real interviews, their cost per part or the 30-minute goal (SC-009).
- **Estimate**: `PROVISIONAL_ANSWER_TOKENS` is 4,000, half of a call's limit, because one excerpt already takes 874 tokens and a part of 60 turns takes more. A real interview must calibrate it.

## R14. Who speaks, and the false 0%

- **Cause, reproduced on a synthetic fixture**, three layers:
  1. On a read, `cleaningNames` (ingestion) dropped the people without a code, and codes are given only by a run. An interview nobody had run had no interviewer on its roster.
  2. `speakerRole` reads one label at a time. With one interviewee, it gives them any label it does not know. So an interviewer's words became the interviewee's, with nothing in "unknown": 0%.
  3. A label close to an interviewer's name stays unknown ("A. Martin"): 0% again, the words in "unknown".
- **Decision**: Quality asks for the people without a code as well (`uncoded`), and reads all the labels of an interview at once (`conductRoles`, shared): the only label left goes to the only interviewer of the roster; a guess holds only if no one else speaks; others are unknown until a person attributes them. No interviewer word, or more than 20% of unknown words, gives "Speakers not identified", never a percentage.
- **Limit**: `speakerRole` and `cleaningNames` are unchanged for Evidence, whose results must not move here. The first still gives an interviewer's unrecognised label to a single interviewee, so such a turn can yield verbatims. It needs its own fix.
- **Attribution**: a person says who speaks in the interview's view, through Evidence's attribution, which only knows "an interviewer". The Analysis tab does not list a label it already gave the interviewee, which is why the view lists all the labels.

## R14a. Three real causes of a false figure (2026-10-31)

Seen on real transcripts, reproduced on synthetic fixtures:
- **Turns glued together**: labels with no colon inside a line went to the previous speaker. Fixed in the transcripts parser (`fix/transcript-inline-speaker-labels`).
- **The end note read as a speaker**: "Transcription ended after 00:42:50" made one more unknown label, so a room name was no longer the only label left to give to the only interviewer. Ignored by `conductRoles`; new imports no longer read it as a speaker. No forced re-import: it would mark every interview "To analyse again".
- **Words nobody speaks**: a document's title or the end note counted as unknown words, and a null start kept minutes off. Left out of the speaking times.
- **One voice in the source**: both people on one microphone gives one label. The app cannot split them; the row says so, and "Review anyway" would flag the interviewee's sentences.

## R15. An interview not imported yet

- **Decision**: the source session tells whether a transcript file exists. With a file not imported, the state is `not-reviewed` and the review imports it. Opening the interview to read imports it too (`importToRead`, called by the route before the query, so the query stays read-only). No AI, no cost.
- **Why**: otherwise every interview untouched by Enrichment read "No transcript" and had no button.

## R16. The overview's read time (T039)

Measured once on PostgreSQL in a test container: 30 reviewed interviews of 800 turns each, 18,000 counted sentences: 297 ms for the first read. No cache.

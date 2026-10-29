# Research: Interview verbatims and facts

Decisions for spec 012. Each one: decision, why, alternatives rejected.

## R1. A new `evidence` module

- **Decision**: verbatims, facts and analysis runs live in a new module `apps/api/src/modules/evidence` (context map #6, Evidence, core, domain model). It reaches the other modules only through ports wired in `compose.ts`:
  - **transcripts** (returned by `createTranscriptsModule`): `analysedText`, `importTranscripts`, `personNames` and `enrichmentLive`;
  - **ingestion**: `enrichmentSessions`, `cleaningNames` (people with role and code), `knownNames`;
  - **research**: study access, the study's settings (`anonymised`, `textAnalysed`), the project's research goal, the guide's sections;
  - **ai-gateway**: `gateway`, `estimateCost`, `studyCosts`.
- **Why**: the context map puts Fact in Evidence, a core context; Transcripts is supporting. Facts outlive a transcript version (re-anchoring), and insights (Synthesis) will read them.
- **Rejected**: adding facts to the transcripts module (mixes a core context into a supporting one, and the module is already the largest).

## R2. The analysed text

- **Decision**: the transcripts module computes it, so Evidence never reads corrections:
  - `with-corrections` (default): the raw version with the effective corrections (spec 011 `effectiveCorrections`) of status `accepted`, `edited` **and** `proposed` applied; `rejected` not. Lexicon and name corrections are computed live as in Cleaning, so an interview never cleaned still gets the lexicon and, anonymised, the pseudonyms.
  - `clean-only`: the latest validated clean version; none → `null` ("Not clean yet").
  - It returns the turns (same ids as the raw version), the raw import date, and a **fingerprint** of the text (cyrb53 over the turns, as spec 011).
- **Why**: one place knows how corrections apply; the prototype read "the latest correction run with its edits".
- **Rejected**: copying the clean text into Evidence at each reading (a second copy that drifts).

## R3. Re-anchoring is computed, the state derived

- **Decision**: a verbatim stores its turn, offset, length and **its own text**. At each read, the app looks for the text in the current analysed text: first in its turn near its offset, then in the other turns of the same speaker; found → shown there; not found → "text changed". Commands (a run, a decision) save the new places they see. The interview state is derived:
  - `to-analyse-again` when a verbatim is lost, when the raw version was imported after the reading, or when `anonymised` / `textAnalysed` differs from the reading's;
  - a fingerprint change alone (a word corrected) does **not** mark it (clarification 3).
- **Why**: queries never write (AGENTS.md); Cleaning changes text in another module, without events between modules. Matching one interview's verbatims is a few hundred string searches.
- **Rejected**: a domain event from Transcripts on each decision (no event bus yet; a lot of plumbing for a read-time check).

## R4. Chunks shared

- **Decision**: `makeChunks` (60 turns, overlap 5, at most 24,000 characters, parts of at most 6,000) moves from `transcripts/domain/chunks.ts` to `packages/shared/src/chunks.ts`; both modules import it.
- **Why**: one rule for both readings; modules may not import each other's domain.
- **Rejected**: a copy in Evidence.

## R5. Two passes, the second per interview

- **Decision**:
  1. **Verbatim pass**, per chunk (2 chunks of an interview at once, 3 interviews at once): the turns of the chunk with their speaker's role (`interviewee`, `interviewer`, `unknown`), placeholders for known names, the research goal and the guide's themes. The answer: `{ verbatims: [{ turn, text, reason }] }`.
  2. **Fact pass**, per interview, after its verbatims: the kept verbatims (`v1`… in turn order, with their speaker code), the themes (`s1`… plus `other`) and the goal. The answer: `{ facts: [{ statement: { en, fr }, polarity, theme, verbatims: ["v3", "v7"] }] }`. Over 150 verbatims, the pass runs per batch of 150 in turn order.
- **Why**: the user's order (verbatims one by one, then facts); a fact pass sees the whole interview, so the same idea is grouped across the interview.
- **Rejected**: one pass giving facts and quotes together (the prototype; duplicates when an idea comes back).

## R6. The checks

- **Verbatim** (FR-005): turn in the chunk's new part; speaker `interviewee` (or attributed, R8); text found with `quoteFound` (case, spaces, apostrophes); kept text = the turn's own span; 3–120 words; does not cross a placeholder boundary; a verbatim inside another of the same turn merges into the longer one; overlapping chunks give it once.
- **Fact** (FR-006): at least one known `vN`; theme one of those sent; each statement 1–200 characters, no placeholder, no known name (`findMatches` with the names); polarity in the enum. Unknown ids dropped; a fact left without verbatim dropped and counted.
- Counts per run: `leftOut.verbatims`, `leftOut.facts`.

## R7. Re-reading, rejected and set-aside items

- **Decision**: a reading of an interview:
  - deletes its facts still `proposed` and its `ai` verbatims used by no decided fact and not set aside;
  - merges a verbatim found again (same turn, overlapping span) with an existing one;
  - never keeps a verbatim overlapping one **set aside**;
  - drops a new fact whose verbatims are all in one rejected fact, or whose statement (either language) shares ≥ 60% of its words with a rejected fact's (`words` + `fold`);
  - within one reading, drops a fact whose statement shares ≥ 60% of its words with one already proposed (`isRepeated`); sharing a verbatim is not enough, one rich quote can back several facts.
- **Why**: constitution IV (never re-propose a rejected item, never overwrite a decision).

## R8. Who speaks

- **Decision**: a turn's speaker label is matched to the interview's people (`cleaningNames`) by `nameKey`, on the name or, anonymised, the code (`P01`, "Interviewer 1"); a label holding the full name with words added (a meeting tool adds the office: "Ann Smith -OFFICE PARIS-") matches too. An interviewer → no verbatim. One interviewee and an unmatched label that shares no word of an interviewer's name → that interviewee. Otherwise `unknown`: verbatims are kept with no participant, and a person attributes the label once per interview (`evidence_speakers`), which attributes all its verbatims. A person may also attribute a label to the interviewers: its verbatims are set aside. A fact with an unattributed verbatim cannot be accepted (`SPEAKER_TO_ATTRIBUTE`). A label that names a role, not a person ("Interviewer", "Speaker 2", "Interviewée", `P01`: `isGenericLabel`), is no name: it is not replaced by a placeholder and does not stop a statement; an interviewer's role as the label ("Interviewer", "Moderator") is an interviewer's turn. A verbatim moved to another turn takes that turn's speaker. A fact whose verbatims were set aside after its decision can still be rejected (its verbatims set aside are skipped); kept, it needs one left (`FACT_NEEDS_VERBATIM`).
- **Participant identity**: the person's pseudonym code (`P01`), stable per study (`ingestion_pseudonyms`); the name or the code is shown as the study's anonymisation says.

## R9. Two languages

- **Decision**: the fact pass returns `statement.en` and `statement.fr`. When a person writes or edits one language, the fact is saved with the other marked `translating`, and a job `evidence.translate` translates it with the person's connection (task `fact-translation`, ledger ref `facts-translation:<sessionId>`). Failure → `not-translated`, retry from the fact. A person can edit both by hand (then no translation runs). The job carries the words written and applies while they are still the fact's, whatever is decided meanwhile (a polarity, an accept); a decision that writes no statement queues nothing.
- **Why**: clarification 2; the save is never blocked by the AI.
- **Rejected now**: a lighter model per task (a gateway change, later spec).

## R10. Runs, consent, costs

- **Decision**: as spec 011.
  - `AnalysisRun` per study, queue `evidence.facts`, stale after 10 min without heartbeat, stop between chunks.
  - Exclusive with the Enrichment runs both ways: Evidence asks `transcripts.enrichmentLive(studyId)` (`ENRICHMENT_RUNNING`); Transcripts gets an `otherRunLive` from Evidence (`FACTS_RUNNING`).
  - Consent `evidence_consents` (person, study, provider), asked again when the provider changes.
  - Ledger refs `facts:<runId>:<sessionId>`; interview cost = its run refs + `facts-translation:<sessionId>`; study total = all refs of its runs + translations.
- **Estimate**: chunks' characters + an estimated fact pass (verbatims ≈ 15% of the text) at the person's model price.

## R11. The study setting

- **Decision**: `research_studies.text_analysed` (`with-corrections` | `clean-only`, default `with-corrections`), changed with the study's version like `anonymised` (spec 009). The reading stores the setting it used.

## R12. Themes

- **Decision**: the guide's sections of kind `theme` (plus "Other"); each fact stores the section id and its title at reading time. No guide → only "Other". A section removed later keeps its facts, shown with the stored title.
- **Why**: introduction / warm-up / wrap-up sections are not research themes.

## R13. The views

- **Decision**: the Analysis tab gets two inner tabs, **Interviews** and **Facts**.
  - Interviews: the list (state, counts, cost, "Find facts" per row), the run dialog with progress.
  - Interview view (in place of the tab, as Cleaning's review; the interview open is in the address, `interview` and `turn`, so the page bar's back button and breadcrumb lead to the analysis — Projects folds into "…" — and the view has no back button of its own; Cleaning's review of one interview follows the same rule since, `phase=enrichment&interview=`, "Back to the cleaning"): the transcript laid out as the prototype (time in a column, the speaker's name in bold before the words, interviewers' turns muted), verbatims highlighted (`<mark>` with a text label), each filled with the polarity of its facts not rejected (positive, negative, neutral, mixed when they differ, the highlighter when it supports no fact; tokens `--polarity-*` in `packages/ui`, a legend above, the polarity in the mark's text label), the facts beside it in a panel of their own (each fact's polarity tag in its verbatims' colour), as the assistant's (one header line: "Facts 15 - 0,15 $" — shown/all when filtered —, then the buttons "New fact" and "Find facts" (dark, as the other AI actions) — the state only when "To analyse again" —, the filters, the list scrolling inside, a footer with "Accept all shown"; it stays in view while the transcript scrolls); selecting text in an interviewee's turn opens a small panel next to the selection (`Popover` of `packages/ui`, anchored on the selection) offering "Add verbatim", "Add and write a fact" or "Add to a fact" (the interview's facts not rejected, listed in a second panel beside the first, which does not move; the fact keeps its status); selecting words inside one verbatim offers "Narrow the verbatim to this selection" (it keeps its facts, becomes the person's; the marks are not `<button>`s, whose words cannot be selected).
  - Facts: a paginated table over the study (50 per page), filters, the same decisions, a link to the verbatim in its interview.

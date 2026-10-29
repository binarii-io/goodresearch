# transcripts module

Context #4 of the [context map](../../../../../docs/domain/context-map.md#4-transcripts). Spec 010 ([specs/010-enrichment-vocabulary](../../../../../specs/010-enrichment-vocabulary/)): the **Enrichment** phase of interview studies.

- **Transcript**: the raw version of each validated interview, imported through ingestion's public API (`enrichment.readTranscript`) and parsed into speaker turns whose ids stay the same across imports (`domain/segments.ts`). A label may carry what a meeting tool adds after the name (" -OFFICE PARIS-", "(Acme)"): only the name counts for the four-word rule (`personName`, shared with ingestion). A transcript whose turns still hold a label inside (read by the older rule) is imported again at the next run (`hasUnsplitTurns`). Deleted with its session (foreign key in migration `0024`).
- **LexiconTerm**: the team's lexicon, per language (`domain/lexicon-term.ts`): decisions, merge, what a new reading may change.
- **Lexicon reading**: `application/commands/lexicon-commands.ts`, run by the `transcripts.lexicon` queue in the worker: import, candidates (`domain/candidates.ts`), excerpts with placeholders (`domain/excerpts.ts`), AI batches checked by `domain/answer-check.ts`, occurrences (`domain/occurrences.ts`).
- Ledger: task `lexicon`, ref `lexicon-reading:<runId>`; costs shown on the Enrichment tab.

## Cleaning (spec 011)

[specs/011-transcript-cleaning](../../../../../specs/011-transcript-cleaning/): each validated interview gets reviewed, numbered **clean versions** of its transcript (same turn ids as the raw version).

- **Corrections** (`domain/corrections.ts`): the lexicon's (`lex:<termId>:<segmentId>:<offset>`) and the names' (`name:<segmentId>:<target>:<offset>`, anonymisation on: interviewees `P01`…, interviewers "Interviewer 1"…, people terms "[Person]") are **computed at each read** from the raw version, the team's lexicon, its verdicts and the study's people; the AI's and a person's own are stored. A decision on a `lex:` key **is** the spec 010 verdict of that occurrence. A verdict `unsure` ("can't tell") leaves its `lex:` correction proposed, for a person, never the AI. Overlap priority: person > lexicon > name > ai-lexicon > ai-other.
- **Cleaning run** (`application/commands/cleaning-commands.ts`, queue `transcripts.cleaning`): imports what is missing (spec 010 import), then, with the AI, reads each transcript in chunks of 60 turns with 5 turns of context (`makeChunks` in `@goodresearch/shared`), the lexicon and names applied and known names as placeholders (`domain/correction-check.ts` `prepareChunk`). Each AI correction is placed in its turn, narrowed to the words that change (at most 8) and dropped if it touches a placeholder, a known name or a lexicon/name correction (`checkCorrections`). Changed transcripts: only the turns the AI never read are sent again. Mode `lexicon`: no AI, no cost. `sessionIds` cleans chosen interviews alone, again in full ("Clean again" on a row).
- **Taking one interview out of a reading**: `stoppedSessions` on the run, written only by `requestSessionStop` (appended in the database, so the worker saving its progress never clears it); the worker checks it before each import, and after it once the interview is saved done; `requestSessionStop` appends only if the interview is still waiting or reading during the import, in the same statement, so a take-out after that save is refused (`TOO_LATE_TO_STOP`) rather than accepted and ignored. A second take-out gives the same answer; an interrupted run keeps a taken-out interview as `STOPPED`. The views show a stopped interview at once (`withStops`). Only during the import: afterwards the candidates of all the interviews read are sent together.
- **One Enrichment run per study**: a lexicon reading answers `LEXICON_RUNNING` while another reading is live and `ENRICHMENT_RUNNING` while a cleaning is live; a cleaning answers `ENRICHMENT_RUNNING` while either is live.
- **Validation**: needs nothing left to decide and the fingerprint the person saw (`VERSION_CONFLICT` otherwise). States: `domain/cleaning-state.ts`.
- **Publishing**: a Google Doc per interview in the study folder's "Clean transcripts" / « Transcriptions nettoyées » subfolder (kept by id), through ingestion's `studyFiles` with the person's write access; republishing rewrites the same document, `DRIVE_CHANGED` when it was edited in Drive (overwrite on request). The original transcript is never written.
- Consent: `transcripts_consents.purpose` `cleaning` (the full text, names replaced, is sent). Ledger: task `cleaning`, ref `cleaning:<runId>:<sessionId>` (per interview, as an analysis).
- Later phases read from the module (spec 012): `analysedText(accountId, studyId, sessionId, mode)` — `with-corrections` applies every correction not rejected (`analysedCorrections`), `clean-only` returns the latest validated clean version; `importTranscripts` (the missing or changed raw versions), `personNames` (never sent to the AI) and `enrichmentLive`. A live "Find facts" of the study also blocks the Enrichment runs (`otherRunLive`).

## Common words

The rules need the common words of each language (research R2). They ship as folded word lists, one per line, gzipped, in `infrastructure/words/`:

| File | Source | Licence |
|---|---|---|
| `en.txt.gz` | SCOWL up to size 60 (English, American, British), from the npm package `wordlist-english@1.2.1`, plus common contractions and capitalised words (weekdays, months, nationalities) | SCOWL licence, permissive: [`SCOWL-COPYRIGHT.txt`](infrastructure/words/SCOWL-COPYRIGHT.txt) |
| `fr.txt.gz` | The Hunspell French dictionary of Grammalecte (Dicollecte 7.5), from the npm package `dictionary-fr@3.0.0`, with its suffixes applied | MPL-2.0: [`DICOLLECTE-LICENSE.txt`](infrastructure/words/DICOLLECTE-LICENSE.txt) |

Proper nouns are left out, so place and product names stay candidates. The files are built by hand with `infrastructure/words/build-words.ts` (instructions at its top), never in CI, and committed.

## Tests

- `tests/*.test.ts`: domain rules and use cases with in-memory fakes (`tests/fakes/`).
- `apps/api/tests/lexicon.component.test.ts`, `apps/api/tests/cleaning.component.test.ts`: PostgreSQL, the HTTP API, the fake AI runner recording what is sent.

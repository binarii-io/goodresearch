# Research: Enrichment phase and team lexicon

## R1 — Where it lives

- **Decision**: A new module **`transcripts`** (context map #4) owns the imported **Transcript** (raw version, speaker turns), the team **LexiconTerm**s with their variants and occurrences, the **lexicon readings** (runs) and the consents of this step. Ingestion stays the owner of sessions, files and Drive. It exposes through its `index.ts`:
  - the validated sessions of a study, as Enrichment needs them;
  - the full text of a session's transcript;
  - the names the app knows for the study.
- **Rationale**: The context map already places Transcript and LexiconTerm in Transcripts. Cleaning (spec 011) adds clean versions and corrections in the same module. Spec 009 kept the analysis in ingestion only because it needed no text kept; now the text is kept (clarification 2026-10-26).
- **Alternatives**: grow ingestion again (it would hold sessions, Drive, analysis, text, lexicon and corrections: two contexts in one); a lexicon module separate from transcripts (occurrences need the text and its segment ids).

## R2 — Common words of a language (FR-005)

- **Decision**: Ship a **word list per language** (English, French) as a data file of the transcripts module: inflected forms, one per line, normalised (lower case, accents kept for matching, a folded copy for lookups), gzipped. It is loaded once, lazily, into a `Set` behind a `CommonWords` port; tests use a small in-memory list.
  - English: SCOWL up to size 60 (npm `wordlist-english@1.2.1`, permissive licence), plus common contractions and the capitalised weekdays, months and nationalities.
  - French: the Hunspell dictionary of Grammalecte (Dicollecte 7.5, npm `dictionary-fr@3.0.0`, MPL-2.0), its suffixes applied by the build script. Proper nouns are left out in both lists.
  - Each source, its version, its licence and the script that builds the file (`infrastructure/words/build-words.ts`) are in the module README. The script runs by hand, not in CI. The files are committed with the licences next to them.
- **Rationale**: A set lookup is enough: no spell-checker engine is needed, only "is this a common word". Inflected forms avoid writing grammar rules. Both licences allow redistribution alongside AGPL code as separate files.
- **Alternatives**:
  - Hunspell dictionaries with `nspell`: the French affix rules are slow and memory-heavy in JavaScript.
  - Subtitle word-frequency lists: their CC BY-SA licence is unclear next to AGPL.
  - Asking the AI to judge every word: it costs much more and sends the whole text (rejected by the clarification).

## R3 — Importing the transcript (FR-004)

- **Decision**: Ingestion gets `readTranscript(accountId, studyId, sessionId)`. It returns the full text and the file's `modifiedAt`, read with the person's own Drive access through the existing gateway.
  - It reuses `readTextStart` with a ceiling of **400,000 characters** (about 6 hours of speech). Longer files fail with `TOO_LONG`.
  - Subtitles keep their times: a cue becomes `[hh:mm:ss] Name: text`.
  - The transcripts module parses the text into **segments**:
    - speaker labels use the same forms as spec 009 (`Name: text`, `<v Name>`, `Name 0:03`, `Name (00:01:15)`), plus an optional leading `[hh:mm:ss]`;
    - lines without a label continue the previous turn;
    - text before the first label is a turn with a null speaker.
  - **Segment ids** are kept across re-imports by position and text. A new import keeps the id of every turn whose speaker and text are unchanged (longest common subsequence on turns). New turns get new ids.
- **Re-import**: only when the session's transcript `modifiedAt` differs from the stored one.
- **Deletion**: `transcripts_transcripts.session_id` references `ingestion_sessions(id) ON DELETE CASCADE` (standards §6: integrity only), so the text goes with its session (folder replaced or detached, study deleted).
- **Alternatives**: store only counts (Cleaning would read Drive again and anchors would move); store the Drive export as is (no segments, no stable anchors).

## R4 — Candidates by the app's rules (FR-005, FR-006)

Pure domain functions over the segments of the study's validated interviews:

1. **Tokenise** the text of the turns (letters, digits inside words, `-` and `'` inside words). Speaker labels, timestamps and pure numbers are not words.
2. **Candidate** when one of these holds:
   - the word, lower-cased, is absent from the common words of the interview's language;
   - a capitalised word that does not start a sentence (two or three capitalised words in a row make one phrase);
   - an acronym: 2–6 capitals, optional digits;
   - a word or phrase close to a term or variant already in the team's lexicon. Close means a Damerau–Levenshtein distance ≤ 1 for up to 6 letters and ≤ 2 above, on the folded form.
3. **Excluded**:
   - the names the app knows: the study's rosters, schedule and team members (ingestion `knownNames`), compared by name words;
   - the speaker labels of the transcript;
   - placeholders such as `[Person 1]`;
   - words of 1–2 letters that are not acronyms;
   - terms and variants a person rejected (compared on the folded form);
   - spellings of accepted terms and variants. These are counted, not proposed.
4. **Repeated across interviews**: a candidate found in ≥ 2 interviews ranks first. Then the count of occurrences.
5. **Limit**: at most **300** candidates go to the AI per reading. Close spellings of known terms are always kept. The number left out is recorded on the run.

## R5 — What goes to the AI (FR-007, SC-002)

- **Decision**:
  - **Batches**: candidates go in batches of **30** per call, each call with a time limit of 2 minutes (it runs in the worker; the default limit of 15 seconds is for calls a person waits on). Update 2026-10-26: batches of 50 hit the default limit with a thinking model; the output ceiling is 16,000 tokens (a ceiling, not a cost: thinking models count their reasoning, and 4,000 cut answers of 30 terms).
  - **Excerpts**: each candidate has at most **3** excerpts of at most **200** characters around its occurrences, taken from different interviews first.
  - **Known terms**: the batch also lists, without excerpts, the forms of the team's accepted terms that are close to its candidates. The AI can then attach a variant to an existing term.
  - **Known names**: they are always replaced by placeholders in the excerpts (the shared `withPlaceholders`, R9), whether anonymisation is on or off (spec FR-006, SC-002). This covers the rosters, schedule, team members and the transcripts' speaker labels. They are never candidates either.
- **Output** (schema-constrained, Zod):
  - `terms[]`, each with: `form`, `kind` (`domain | suspect`), `correction` (for `suspect`), `category` (`product | organisation | place | acronym | jargon | role | person | other`), `definition` (≤ 200 characters), `variants[]` (spellings copied from the candidates), `existingTerm` (a known form or null) and `quote`.
  - The app keeps a variant only when it is one of the batch's candidates, and a quote only when it is found in the excerpts sent (`quoteFound`). Proposals with no valid variant or quote are dropped.
  - `category: person` marks a name the app did not know: shown as such, never proposed again once rejected.
- **Rationale**: about 30 × 3 × 200 = 18,000 characters per call, so 10 calls for 300 candidates whatever the length of the interviews. No full text leaves the app.
- **Alternatives**: one call per interview (no grouping across interviews; cost grows with length); the full transcripts (rejected in clarification).

## R6 — Occurrences (FR-009)

- **Decision**: After each reading, the app recounts, over each validated interview of the study, the occurrences of every term and variant of the team (accepted or proposed) whose language is the interview's.
  - **Match rule** (context map): whole word or phrase; acronyms case-sensitive, others case-insensitive and accent-insensitive.
  - The rule is in `@goodresearch/shared`, so Cleaning and the UI use the same one.
  - Occurrences are stored per `(term, variant, session)` with the count and up to 50 places (segment id, start, length) for the quotes shown: the lexicon shows 3 per interview. The term dialog counts every occurrence again in the imported text on demand (never stale, up to 500 quotes per interview), the term marked, overlapping places of several spellings once.
  - Counts are shown for **validated** sessions only, filtered at read time with ingestion's list.
- **Alternatives**: counting in SQL with regular expressions (the match rule would differ from the UI's); storing every occurrence (many rows for nothing until Cleaning).

## R7 — Merging and decisions (FR-010, FR-011)

- **Decision**: **LexiconTerm** is an aggregate: form, kind, correction, category, definition, language, status, version, its variants (each with a status), who decided and when.
  - **Decisions**: accept, edit, reject; the variant decisions are part of the same aggregate.
  - **Merging**: merging B into A moves B's variants (B's form included) to A as accepted, and marks B `merged` (pointing to A). A later reading finds B's spellings as variants of A, so they are not proposed again.
  - **"Accept all shown"**: one command per term, each with its version. The result says how many succeeded and how many changed meanwhile.
  - **A new reading**:
    - only adds variants (status `proposed`) and occurrences to a decided term;
    - a proposed term still undecided may get a new definition and category from the AI;
    - a term rejected, or a variant rejected, is matched first and never comes back.
- **Uniqueness**: one term per `(team, language, folded form)`. An AI proposal whose form is an existing term's becomes new variants of that term.

## R8 — Runs, costs, consent (FR-014–FR-016)

- **Decision**: a pg-boss queue `transcripts.lexicon`, policy `exclusive` keyed by study. The run row `transcripts_lexicon_runs` holds:
  - who started it and the sessions it covers;
  - the state per session (`waiting | reading | done | failed` + reason);
  - the phase (`import | candidates | ai | counting`);
  - `stopRequested`, a heartbeat (stale after 10 minutes, as spec 009) and the count of candidates left out.
  - **Steps**: imports run 3 at a time. Then the candidates over the study. Then the AI batches one after the other, with a stop check between batches. Then the counting.
  - A stop keeps the terms already written; interviews not imported stay "Not read".
- **Costs**: every call of a run carries `ref = lexicon-reading:<runId>`. The tab shows the last run's cost and the study total: the sum of the refs of the study's runs, for every account, through the existing `studyCosts`.
- **Estimate**:
  - chars = the size of the excerpts of the candidates known before reading;
  - when nothing is imported yet: 300 candidates × 3 × 200 characters at most;
  - output: 1,500 tokens per batch.
  - It is shown as an order of magnitude ("about"): answers can be longer than usual, up to the output ceiling. The instructions are counted once per call.
- **Consent**: per account, study and provider, task `lexicon` (table `transcripts_consents`); same wording rules as spec 009 FR-011, saying excerpts are sent.

## R9 — Shared text helpers

- **Decision**: Move `normaliseQuote`, `quoteFound`, `withPlaceholders` / `fromPlaceholders` and `nameKey` from ingestion's domain to `@goodresearch/shared` (`text/`). Ingestion and transcripts import them from there. Add the lexicon match rule (`termPattern`, `countMatches`) and `fold` (lower case, no accents).
- **Rationale**: two modules and the web app need the same rules; modules never import each other's internals.

## R10 — The Enrichment tab (FR-001–FR-003, FR-013)

- **Decision**: The phase enum gains `enrichment` in the web route search params and the assistant's page context.
  - **Tab**: `3 · Enrichment`, with Analysis moving to `4 · Analysis`.
  - **Interviews table**: the validated interviews with their state ("Not read", "Terms to decide (X)", "Read", "No transcript", "Changed since"), plus stat tiles: interviews read, terms to decide, accepted terms, cost.
  - **Lexicon table**:
    - filters in one row: status, kind, category, language, interview, search;
    - **"Accept all shown"**;
    - each row: form, kind and category, variants (with their decisions), occurrences in this study, and the count in the team's other studies (a number, without their names: the person may not have access to them);
    - a dialog to edit or merge.
  - All pieces come from `packages/ui`.
- **Other studies**: the term's other studies are shown as a count only (FR-017: no study names the person cannot see).

## R11 — Changes after the review of PR #10

- **Names**: the speakers of the transcripts and the terms marked as a person are replaced by placeholders too; a known name with a possessive or an elision ("Dana's", "d'Amélie") is never a candidate; accepted person terms are never sent as known forms.
- **Read**: an interview is "read" only when a reading went through to the end (`readAt`). A stopped or failed reading leaves it to read again, and the occurrences of the terms written so far are still counted.
- **Access**: decisions, merges, verdicts and stops need the folder access the lexicon needs to be seen.
- **Counts**: a recount without the list of validated interviews (Drive unavailable) changes nothing. Overlapping spellings of one term count one place once, for the longest. A merge moves the occurrences of every study of the team. Only verdicts on places that still hold the term are counted.
- **Runs**: a run the queue refuses is closed at once (`LEXICON_RUNNING`). A finished run is never written again, so a slow worker of a replaced run stops.
- **Stable ids**: the unchanged beginning and end of a transcript are kept first; a very large changed middle is matched in order by text (bounded memory).
- **Estimate**: shown as "about", the instructions counted per call.
- **Lexicon pages**: back to the first page after a decision.

# Research: Transcript cleaning

## R1 — Where it lives

- **Decision**:
  - The **transcripts** module owns the cleaning: correction runs, corrections, clean versions, the published clean transcripts and the clean-transcripts folder of a study.
  - Ingestion's public API gains what the cleaning needs:
    - `cleaningNames`: the people of an interview with their role and label;
    - `cleanFiles`: the study folder with the person's own write access, to make the subfolder and to write the documents.
- **Rationale**: The context map puts CorrectionRun, Edit and clean versions in Transcripts. Drive tokens never leave ingestion (spec 007).
- **Alternatives considered**:
  - The publishing module (spec 007). Rejected: its PublishedDocument is a three-way sync that brings Drive edits back. Here the app only writes (FR-019), and the content is a transcript, not a preparation item.

## R2 — Which corrections are stored, which are computed

- **Decision**: Corrections are computed live, or stored, depending on their source.

  | Source | Kept as | Status comes from |
  |---|---|---|
  | **lexicon** (`rule` in the context map) | computed live from the raw version, the team's lexicon and the verdicts, at each read of an interview | the verdict: yes → accepted, no → rejected; no verdict → accepted for scope `global`, nothing for `case-by-case` |
  | **ai-lexicon** | stored suggestion (term, turn, offset, yes/no, reason) on a case-by-case occurrence without verdict | the verdict once given; before that, `proposed` when the AI says yes |
  | **name** (anonymisation) | computed live from the interview's people (R5) | accepted by default; a person's undo is stored as a decision on the correction's key |
  | **ai-other** (transcription, speaker, names the app does not know) | stored with their own status | the person's decision |
  | **person** | stored, accepted | — |

  - Deciding a lexicon or ai-lexicon correction **writes the verdict** of that occurrence (spec 010).
  - A verdict given in the lexicon is therefore the same decision, by construction (FR-010).
- **Rationale**:
  - The lexicon and the names change after a run. Computing their corrections live keeps the review always in line with the current lexicon, with no AI and no sync job (FR-014).
  - The verdict stays the single truth for "is this the term here".
- **Alternatives considered**: Materialising every correction at each run and syncing statuses both ways. Rejected: two places for one decision, and drift after every lexicon edit.

## R3 — Overlap, keys and inheritance (FR-008)

- **Decision**:
  - **Key**:
    - Every correction has a deterministic key: `lex:<termId>:<segmentId>:<offset>`, `name:<segmentId>:<target>:<offset>`.
    - Stored corrections use their id.
  - **Overlap**: `effectiveCorrections(raw, all)` keeps, at each place, the first by priority:
    1. person
    2. lexicon
    3. name
    4. ai-lexicon
    5. ai-other

    Ties go to the longest span. It only considers corrections that are not rejected.
  - **Inheritance**: a new AI correction equal to a decided one (same turn, `original` and `replacement`) takes that decision (FR-008).
  - A speaker correction targets the turn's `speaker`, not its text, so it never overlaps a text correction.
- **Rationale**: Same order as the context map. Deterministic keys let a decision on a computed correction survive recomputation.

## R4 — The AI pass (FR-004–FR-007)

- **Decision**:
  - **Chunks**:
    - `CHUNK_TURNS` = 60 turns, overlapping the previous chunk by `CHUNK_OVERLAP` = 5 turns (sent as context only, marked).
    - Each chunk stays under `CHUNK_MAX_CHARS` = 24,000 characters. A longer turn is cut at sentence ends into parts that keep their offsets.
  - **Text sent**:
    - The raw turns with the accepted lexicon and name corrections already applied (an offset map keeps the way back).
    - The names the app knows replaced by placeholders (`withPlaceholders`).
    - Turns written as `t<n> [Speaker]: text`, with short turn ids mapped back by the app.
  - **Request**:
    - The accepted terms whose spellings occur in the chunk: form, variants, definition, scope.
    - The case-by-case occurrences to decide, each `t<n>#k` with its spelling.
    - The speakers of the transcript.
  - **Answer** (schema): `corrections[] { turn, kind: term | transcription | speaker | name, original, before, replacement, reason, confidence }` and `decisions[] { occurrence, isTerm, reason }`.
    - `before` holds up to 5 words just before `original`, to place it when the turn holds it twice.
    - The `name` kind exists only when anonymisation is on.
  - **Checks** (`checkCorrections`):
    1. The turn is in the chunk's new part.
    2. `before + original` is found exactly once in the sent turn (the quote rule: case, spaces, apostrophes).
    3. At most 8 words change (word diff).
    4. The replacement differs from the original.
    5. Neither side contains a placeholder or a known name.
    6. A speaker correction names a speaker of the transcript.
    7. The place maps back to the raw turn outside a lexicon or name correction.

    Anything else is counted as `leftOut`.
  - **Limits**: `maxOutputTokens` 8,000; timeout 120 s; one retry per chunk.
  - **Ledger**: task `cleaning`, ref `cleaning:<runId>:<sessionId>` (per interview, as an analysis).
  - **Changed transcripts**: only the chunks holding turns the AI never read are sent again (the set of read turn ids is kept per interview), with their neighbours as context.
- **Rationale**:
  - 60 turns fit the POC and stay well inside every provider's context.
  - The overlap gives context at the edges, and corrections are kept only in the new part, so they are never counted twice.
  - Applying the lexicon first stops the AI from proposing it again.
- **Alternatives considered**:
  - Asking for the full corrected text and diffing it. Rejected: it invites rewording and costs output tokens for the whole transcript.
  - Excerpts only. Rejected: the user chose quality (clarification).

## R5 — Names in the clean version (FR-012, clarification)

- **Decision**:
  - `cleaningNames(accountId, studyId, sessionId)` returns the interview's roster entries with their role and label:
    - an interviewee gets their pseudonym `P01`…;
    - an interviewer gets an interviewer code `I01`…, shown as "Interviewer 1" / « Intervieweur 1 ».
  - Interviewer codes are assigned by `assignPseudonyms` with the prefix `I`, in the same table (`ingestion_pseudonyms`, unique per study), in the order of interview dates, never reused.
  - **Name corrections** are made on:
    - the full name;
    - each name word of 2 letters or more (shared `nameKey` match, whole words);
    - the speaker labels equal to the name or one of its words.
  - Lexicon terms of category `person` → "[Person]" / « [Personne] » (the study language).
  - **Anonymisation toggled**: each clean version records `anonymised`. One that differs from the study setting is "To clean again".
- **Rationale**: Reuses the study-level pseudonyms of spec 009. Interviewer labels follow the same rules.

## R6 — Runs, consent, costs (FR-015–FR-017)

- **Decision**:
  - **Run**: a `CorrectionRun`, with the same states as the lexicon run (heartbeat, stale after 10 min, stop). Queue `transcripts.cleaning`, singleton per study.
  - **One run per study**: a cleaning refuses to start while a lexicon reading is live, and the reverse (`ENRICHMENT_RUNNING`); both import transcripts.
  - **Modes**: `lexicon` (import only, then the state is refreshed, no AI) and `ai`.
  - **Consent**: `transcripts_consents` gets a `purpose` column (`lexicon | cleaning`, part of the key). The cleaning one says the full text, names replaced, is sent.
  - **Estimate**:
    - input = characters of all chunks + system + lexicon per chunk;
    - output = 1,500 tokens per chunk;
    - priced with the person's model (spec 005).
  - **Costs**: the Enrichment tab shows the cleaning costs (last run, study total) next to the readings', from the ledger over every account.

## R7 — Clean versions (FR-011)

- **Decision**:
  - Validating writes `transcripts_clean_versions (sessionId, number, segments, anonymised, fingerprint, createdBy, createdAt)`:
    - the turns of the raw version, with the same ids, and the effective corrections applied;
    - `fingerprint` is a hash of the applied correction set.
  - Validating needs:
    - no correction to decide;
    - the fingerprint the person saw ("changed meanwhile" otherwise).
  - **Interview states** (derived at read):

    | State | Condition |
    |---|---|
    | `no-transcript` | the interview has no transcript |
    | `not-cleaned` | never cleaned |
    | `to-redo` | the raw version changed after the last clean version, or anonymisation differs |
    | `to-decide` | corrections are left to decide |
    | `lexicon-changed` | a clean version exists, nothing to decide, but the current fingerprint differs from it |
    | `clean` | — |
    | `published` | clean, and published up to date |
    | `out-of-date` | published, and a newer clean version exists |

  - Later phases read the latest clean version (or the raw one); `latestClean(sessionId)` is exported from `index.ts` for them.

## R8 — Publishing to Drive (FR-018, FR-019)

- **Decision**:
  - **Ingestion `cleanFiles`** (write access) offers:
    - `ensureFolder(name, knownId)`: finds the subfolder by id inside the study folder, or creates it;
    - `createDocument(folderId, name, doc)`;
    - `rewriteDocument`;
    - `metadata`.

    The Drive adapter gains `createFolder` and a parent folder for `createDocument`; the fake Drive supports both.
  - **Content**: a heading (the interview title + « – clean » / « – nettoyée »), then one paragraph per turn: `[hh:mm:ss] Speaker: text`, the time when the raw version has one.
  - **State kept**: `transcripts_clean_publications (sessionId, fileId, webLink, versionNumber, revision)` and `transcripts_clean_folders (studyId, folderId)`.
  - **Publishing again**:
    - reads the file's revision;
    - when it differs from the one kept, answers `DRIVE_CHANGED` unless `overwrite: true`;
    - a file trashed, missing or moved out of the folder → a new document is created.
  - **Consent**: editing consent and write access as in spec 007 (`DRIVE_WRITE_REQUIRED`).
- **Rationale**: One-way writes, reusing the neutral DocModel of spec 007.

## R9 — The review view (US2)

- **Decision**:
  - A review view that takes the place of the Enrichment tab's content (a back button returns to the list; no separate route):
    - the turns with corrections inline: original struck through plus the replacement, each with a source badge and a text label, so a state never shows by colour alone;
    - "Only turns with corrections" on by default;
    - filters (source, status, kind, confidence) and "Accept all shown";
    - a correction dialog (edit the replacement, reason, decide);
    - "Add a correction" on a text selection;
    - a sticky footer with "Validate the clean version" and "Publish to Drive".
  - The Enrichment tab gets a third inner tab, **Cleaning**: the interview rows with their state, and the run dialog with mode, estimate and consent.
- **Rationale**: An hour-long interview is too long for a dialog. The same table and dialog patterns as spec 010.

## R10 — Changes during implementation

- Error codes: `CLEANING_CONSENT_REQUIRED` (as `LEXICON_CONSENT_REQUIRED`), and `VERSION_CONFLICT` for "changed meanwhile" (the lexicon's code); `REPLACEMENT_REQUIRED` for an empty edit.
- The Enrichment tab reads `GET …/cleaning` for its third inner tab; `GET …/enrichment` is unchanged.
- Lexicon-only runs and AI runs both record, per interview, the anonymisation they ran with (`transcripts_cleanings.anonymised`): a different study setting shows "To clean again".
- The run view keeps the last run with `finished` (as the lexicon's), so the tab can show its failure and the corrections left out.
- `publish` takes the person's language, which names the subfolder the first time.
- With no correction left to decide and no clean version yet, the list shows "Clean version to validate" (state `to-decide`, 0 to decide), and the review shows a banner with the last step, "Validate the clean version" (people took "accept all" for the end).
- Costs per interview: runs of the first ledger format (`cleaning:<runId>`) that cleaned one interview count for it.

## R11 — Changes after the review of PR #11

- A provider that goes away fails every interview of the run still to read (`AI_PROVIDER_REQUIRED`), none is counted done.
- "Clean transcripts" with the AI also takes the interviews with turns the AI has not read (a part that failed, a run stopped, a lexicon-only cleaning).
- A known name inside a term, a definition or a place to decide is replaced before the AI, like in the turns.
- An AI "name" correction applies only while the study is anonymised.
- Pseudonyms and interviewer codes are given by runs only (`cleaningNames` with `assign`); the views read them once per study and never write.
- A person adding a correction the AI proposed takes that correction over, accepted.
- "Accept all shown" reads the corrections once; a lexicon decision writes its verdict directly.
- A job delivered again takes back the interview it was cleaning.
- An unknown revision of the published document counts as changed in Drive.
- The list of clean versions no longer reads their turns; only the latest one is read whole.

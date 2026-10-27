# Feature Specification: Transcript cleaning

**Feature Branch**: `011-transcript-cleaning`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Cleaning (« Nettoyage ») of the interview transcripts, second step of the Enrichment phase (spec 010), before Analysis. For each validated interview, produce a clean version of the transcript that later phases read instead of the raw one. Pass 1 by the app, no AI, no cost: the lexicon's terms are applied where the lexicon already says so. Pass 2 by the AI: a full reading of the transcript in chunks of about 60 turns with a small overlap, with the lexicon, proposing corrections (case-by-case terms, misheard words, obvious transcription errors, wrong speaker), never rewording. Every correction is checked by the app and decided by a person. With anonymisation on, names in the text become pseudonyms. Runs in the worker per study, with an estimate and consent; cost on the Enrichment tab. The clean version can be published to Drive as a new document in a dedicated subfolder of the study folder, never overwriting the original."

## Clarifications

### Session 2026-10-26

- Q: Does the clean version go to Drive? → A: Yes, on request: a new document per interview in a dedicated subfolder of the study's folder. The original file is never changed; publishing again updates the same document.
- Q: What does the AI read? → A: The full transcript, in chunks of about 60 turns with a small overlap (the best result: it also finds errors the lexicon does not know). The lexicon's own corrections are applied by the app first, at no cost.
- Q: With anonymisation on, what happens to the interviewers' names in the clean version? → A: They become "Interviewer 1", "Interviewer 2"… (« Intervieweur 1 »…), in the speaker labels and in the text, numbered once per study in the order of interview dates; interviewees get their pseudonyms.
- Q: Are high-confidence AI corrections accepted automatically? → A: No. A person always decides every AI correction; only the lexicon's own corrections and the pseudonyms are accepted by default (a person's earlier decision, kept or inherited, still applies).
- Q: Can one interview be cleaned alone? → A: Yes, from its row or its review ("Clean again"), like the analysis in Fieldwork: that interview only, read again in full; decisions already made stay.
- Q: How many words can one AI correction change at most? → A: 8 words, inside one turn; a longer correction is dropped and counted as "left out".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Clean the transcripts with the lexicon and the AI (Priority: P1)

In « 3 · Enrichment », next to the Lexicon, a **Cleaning** view lists the validated interviews. The person activates "Clean transcripts". A confirmation shows how many interviews will be cleaned, how many will be read by the AI and the estimated cost. The app first applies the lexicon by itself: each spelling of a term accepted "everywhere" becomes its correct form, and each occurrence a person already judged follows that verdict. The AI then reads each transcript in full, chunk by chunk, with the lexicon, and proposes **corrections**: case-by-case terms decided in context, misheard words, obvious transcription errors, a turn given to the wrong speaker. Each correction is checked by the app before it is kept.

**Why this priority**: Transcription tools mishear names, products and jargon, and analysis built on wrong words gives wrong evidence. This is the reason the lexicon exists.

**Independent Test**: With a validated interview where "Gooresearch" (a variant of the accepted, everywhere term "Goodresearch") appears 3 times, "NPS" (case by case) appears twice, and the word "meeting" was transcribed "meeting" in one place and "eating" in a sentence where it makes no sense, cleaning gives 3 accepted lexicon corrections, AI corrections for the 2 "NPS" places decided in context, and one AI correction "eating → meeting" with its reason; none of them changes anything else in the text.

**Acceptance Scenarios**:

1. **Given** a study with validated interviews, **When** the person activates "Clean transcripts", **Then** a confirmation shows the number of interviews, the number of chunks the AI will read, the estimated cost and, the first time, that the full text of the transcripts (names replaced) will be sent to their AI provider; nothing runs before it is confirmed. The person can also choose "lexicon only", which sends nothing and costs nothing.
2. **Given** a term accepted with the scope "everywhere", **When** cleaning runs, **Then** each of its occurrences becomes a **lexicon correction** to the correct form, accepted by default, except the occurrences a person judged "not this term".
3. **Given** a term with the scope "case by case", **When** cleaning runs, **Then** the occurrences judged "this is the term" become accepted lexicon corrections, those judged "not this term" are left as they are, and the others are decided by the AI in their context.
4. **Given** a transcript, **When** the AI reads it, **Then** it reads it in full, in chunks of about 60 turns that overlap by a few turns, receives the lexicon (correct forms, definitions, case-by-case terms) and the names the app knows replaced by placeholders, and proposes only corrections of a few words inside one turn, or a change of speaker for a turn; it never rewords, summarises, or changes the meaning.
5. **Given** a correction proposed by the AI, **When** it comes back, **Then** the app keeps it only if its original text is found at that place in that turn, it changes at most a short span of words, it does not touch a placeholder, and it differs from the original; otherwise it is dropped and counted.
6. **Given** a cleaning in progress, **When** the person looks at the view, **Then** each interview shows waiting, cleaning (chunk X of Y), done or failed (with its reason), and the run can be stopped; corrections already found are kept.
7. **Given** a cleaning, **When** it ends, **Then** its cost is shown on the Enrichment tab (this run and the study total) and recorded in the usage ledger.

---

### User Story 2 - Review the corrections of an interview (Priority: P1)

The person opens an interview and sees its transcript with each correction highlighted in place: the original struck through, the replacement next to it, its source (lexicon or AI), its reason and confidence. They accept, reject or edit each correction, or accept all those shown. When nothing is left to decide, they **validate the clean version**.

**Why this priority**: AI proposes, people decide. The clean version is what Analysis will quote; it must be checked.

**Independent Test**: The person rejects one AI correction, edits another, undoes one lexicon correction, accepts all the others shown and validates. The clean version holds exactly the accepted and edited corrections, and the raw version is unchanged.

**Acceptance Scenarios**:

1. **Given** an interview with corrections, **When** the person opens it, **Then** the transcript shows each correction in place, with filters by source (lexicon, AI), by status (to decide, accepted, rejected) and by kind (term, transcription error, speaker, name) and by confidence, and a count of what is left to decide.
2. **Given** a correction, **When** the person accepts, rejects or edits it, **Then** the decision is kept with who and when, and the version seen is checked ("changed meanwhile").
3. **Given** a lexicon correction, **When** the person undoes or accepts it, **Then** the verdict of that occurrence in the lexicon becomes "not this term" or "this is the term", and the reverse: a verdict given in the lexicon changes the matching correction.
4. **Given** corrections that overlap, **When** they are shown, **Then** only one applies at a place, in this order: the person's own, the lexicon's, the names', the AI's from the lexicon, the AI's other ones.
5. **Given** no correction left to decide, **When** the person validates, **Then** a **clean version** is created from the raw version and the accepted corrections; earlier clean versions are kept, and the interview shows "Clean".
6. **Given** a clean version, **When** a person reopens the interview's corrections, **Then** they can change decisions and validate again, which creates a new clean version.

---

### User Story 3 - Pseudonymise the text when anonymisation is on (Priority: P2)

When the study's anonymisation setting is on, the clean version replaces the names of interviewees with their pseudonyms (`P01`…) and the names of interviewers with "Interviewer 1", "Interviewer 2"…, in the text and in the speaker labels. Other names of people found in the text (colleagues mentioned, names the AI spots) are proposed as **name corrections** to a neutral label, decided like the others.

**Why this priority**: The evidence and the deck must not carry real names; the replacement belongs to Cleaning (context map). Needed only for anonymised studies.

**Independent Test**: In an anonymised study, an interview with the interviewee "Sam Example" and a mention of a colleague "Lee" and the interviewer "Alex Sample" gives a clean version where every "Sam Example", "Sam" and their speaker label read "P01", every "Alex Sample" and its speaker label read "Interviewer 1", and a proposed name correction "Lee → [Person]".

**Acceptance Scenarios**:

1. **Given** anonymisation on, **When** cleaning runs, **Then** every occurrence of a known interviewee's name (full name, first name, last name, with the match rule of the context map) and their speaker labels become name corrections to their pseudonym, and those of a known interviewer to their interviewer label ("Interviewer 1"…), accepted by default.
2. **Given** anonymisation on, **When** the AI reads a chunk, **Then** it may propose name corrections for people's names it finds that the app does not know; they are to decide like other corrections.
3. **Given** a lexicon term of category "person", **When** anonymisation is on, **Then** its occurrences become name corrections to a neutral label.
4. **Given** anonymisation off, **When** cleaning runs, **Then** no name correction is made.
5. **Given** anonymisation turned on after a clean version was validated, **When** the view is shown, **Then** the interview is marked "to clean again".

---

### User Story 4 - Publish the clean version to Drive (Priority: P2)

On a clean interview, the person activates "Publish to Drive". The app creates a new document in a subfolder « Clean transcripts » (« Transcriptions nettoyées ») of the study's folder, created the first time. Publishing again after a new clean version updates the same document.

**Why this priority**: Teams also read and share transcripts outside the app; the clean one must be where the raw one is, without touching it.

**Independent Test**: After validating the clean version of one interview and publishing it, the study folder holds a subfolder with one new document whose turns match the clean version; the original transcript file is unchanged. A second clean version published updates that same document.

**Acceptance Scenarios**:

1. **Given** a clean interview, **When** the person publishes, **Then** a new document is created in the subfolder, named after the interview's title with « – clean » (« – nettoyée »), holding one paragraph per turn (`[time] Speaker: text`, the time when the raw version has one), with the person's own source access and an editing consent asked the first time (as spec 007).
2. **Given** a published document, **When** a newer clean version exists, **Then** the interview shows "Out of date" and publishing again replaces the document's content; it never creates a second one.
3. **Given** a published document changed in Drive since the last publish, **When** the person publishes again, **Then** they are told it changed in Drive and choose to overwrite it or to cancel; Drive edits are not brought back into the app.
4. **Given** a published document deleted or moved out of the folder in Drive, **When** the person publishes again, **Then** a new document is created and the interview shows the new link.
5. **Given** any publish, **When** it runs, **Then** the original transcript file in Drive is never written.

---

### User Story 5 - Follow the cleaning of each interview (Priority: P3)

The Cleaning view lists the validated interviews with their state: "Not cleaned", "Corrections to decide (X)", "Clean", "Published", "Out of date", "To clean again", with the date of the last run and the number of corrections accepted.

**Why this priority**: Shows what is left to do before Analysis.

**Independent Test**: With four interviews, one never cleaned, one with 5 corrections to decide, one clean and one published, the view shows the four states, and changing the raw transcript of the published one in Drive marks it "To clean again".

**Acceptance Scenarios**:

1. **Given** validated interviews, **When** the view opens, **Then** each shows its state, the last run date and the counts, and the tab's header counts the clean interviews.
2. **Given** an interview whose raw transcript changed in Drive since its cleaning, **When** the next run or reading imports it, **Then** it is marked "To clean again"; corrections on unchanged turns keep their decisions, and turns that changed are cleaned again.
3. **Given** a lexicon decision made after an interview was cleaned (a term accepted, a scope or verdict changed), **When** the view is shown, **Then** the interview is marked "Lexicon changed", its corrections already follow the new lexicon with no AI call, and the person validates again.

---

### Edge Cases

- No validated interview, or none imported yet: the view explains that interviews are validated in Fieldwork and imported by "Find terms", with links.
- An interview without transcript: listed as "No transcript", not cleaned.
- An empty lexicon: cleaning still runs; the AI reads without terms.
- A very long transcript: it is read in full, in as many chunks as needed; the estimate shows the number of chunks before consent.
- A very long turn: it is split across chunks at sentence ends; a correction never spans two chunks' new parts.
- The same correction proposed in two overlapping chunks: kept once.
- An AI correction identical to a correction already decided in an earlier run: it inherits that decision.
- The AI proposes a correction for a known name or a placeholder: dropped.
- The AI proposes more than a short span, or a whole sentence: dropped and counted as "left out".
- The provider fails or times out on a chunk: that chunk is retried once, then the interview fails with its reason; the other interviews go on, and the corrections of chunks already read are kept.
- An interview reopened in Fieldwork after cleaning: its corrections and clean versions stay but it is no longer listed until validated again.
- An interview excluded: like a reopened one, it is no longer listed; its corrections and clean versions are kept and deleted only with its session.
- Two people decide the same correction at once: the second is told it changed meanwhile.
- The study's folder is not writable by the person: publishing is refused with the reason; cleaning still works.
- The subfolder was renamed in Drive: the app finds it by its identity, not its name; if it was deleted, it is created again.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Enrichment tab MUST offer a Cleaning view next to the Lexicon, listing the validated interviews (spec 009) with their cleaning state ("Not cleaned", "Corrections to decide (X)", "Clean", "Published", "Out of date", "To clean again", "Lexicon changed", "No transcript"), the last run date and the counts of corrections accepted and to decide.
- **FR-002**: "Clean transcripts" MUST clean the validated interviews never cleaned, to clean again or whose lexicon changed, with an option to clean them all again; each interview MUST also be cleanable alone ("Clean" / "Clean again" on its row and in its review, like "Analyze again" in Fieldwork), cleaned again in full whatever its state, with the same estimate and consent. It MUST import the raw versions that are missing or changed in Drive as spec 010 FR-004 does. A confirmation MUST show the number of interviews, the number of chunks for the AI and the estimated cost before running, and offer "lexicon only" (no AI, no cost).
- **FR-003**: The **lexicon pass** MUST be computed by the app, without AI, from the team's lexicon with its match rule: for each accepted term of scope "everywhere" (its form and its accepted variants; proposed variants give none), every occurrence except those with the verdict "not this term"; for each accepted term of scope "case by case", every occurrence with the verdict "this is the term". Each gives a lexicon correction to the term's correct form (for a `suspect` term, its correction), accepted by default. Rejected and proposed terms give none.
- **FR-004**: The **AI pass** MUST read the full raw version of each interview in chunks of about 60 turns, each chunk overlapping the previous by a few turns and kept under a size limit, with the corrections of the lexicon pass already applied. Each request MUST carry the accepted terms (correct forms, variants, definitions, scope) that matter to the chunk and the case-by-case occurrences to decide in it.
- **FR-005**: The AI MUST be asked only for corrections of these kinds: a term (a case-by-case occurrence, or a spelling of a term the lexicon knows), a transcription error (a misheard or mistyped word), a speaker (the turn is spoken by another speaker of the transcript), and, with anonymisation on, a name (a person's name the app does not know). Each correction gives its turn, the original text, its replacement, its kind, a reason of at most 200 characters and a confidence (high, medium, low). Answers MUST be checked against the expected shape. Every AI correction MUST be kept as `proposed`, whatever its confidence, unless it inherits a person's decision (FR-008).
- **FR-006**: The app MUST keep an AI correction only when: its turn is in the chunk's new part, its original text is found in that turn (ignoring case, spaces and apostrophe style), it changes at most 8 words, it differs from the original, it does not contain or touch a placeholder or a known name, and for a speaker correction the new speaker is one of the transcript's speakers. Others MUST be dropped and counted as "left out".
- **FR-007**: The names the app knows (rosters, schedule, team members, speaker labels, lexicon terms of category person) MUST be replaced by placeholders in every chunk sent, whether anonymisation is on or off, and the answers MUST be read back with the real names only inside the app (spec 010 FR-006).
- **FR-008**: Each correction MUST record its interview, turn, place in the turn, original, replacement, kind, source (`person | lexicon | name | ai-lexicon | ai-other`), reason, confidence, status (`proposed | accepted | edited | rejected`), the run that found it, who decided and when. Where corrections overlap, only one applies, in the order person > lexicon > name > ai-lexicon > ai-other. A correction identical to one already decided (same turn, original and replacement) MUST inherit that decision.
- **FR-009**: The person MUST be able to accept, reject or edit a correction (its replacement), add one of their own on a selected text, and accept all corrections shown at once. Each decision records who and when and checks the version seen.
- **FR-010**: A decision on a lexicon or ai-lexicon correction MUST set the verdict of that occurrence in the lexicon (accept → "this is the term", reject → "not this term"), and a verdict changed in the lexicon MUST update the matching correction, so the two never disagree.
- **FR-011**: When an interview has no correction left to decide, the person MUST be able to validate it, which creates a new **clean version** of the transcript: the raw version's turns, with the same ids, and the accepted and edited corrections applied. Earlier clean versions are kept; the latest is the one later phases read. The raw version is never changed.
- **FR-012**: With the study's anonymisation on, the cleaning MUST propose, accepted by default, a name correction to the interviewee's pseudonym for every occurrence of a known interviewee's name and for their speaker labels, and to "Interviewer N" / « Intervieweur N » for the known interviewers (numbered once per study in the order of interview dates, never reused); lexicon terms of category person MUST give name corrections to a neutral label ("[Person]" / « [Personne] »). Turning anonymisation on or off MUST mark the clean interviews "To clean again".
- **FR-013**: When a raw version is imported again because its file changed, corrections and decisions on unchanged turns MUST be kept; the changed turns MUST be cleaned again at the next run; the interview MUST show "To clean again".
- **FR-014**: A lexicon decision that changes the lexicon pass of an interview already cleaned (term accepted or rejected, scope, variant, verdict) MUST mark it "Lexicon changed"; its lexicon corrections MUST follow the current lexicon without calling the AI, and validating again creates a new clean version.
- **FR-015**: A cleaning MUST run in the background, one per study at a time, show the state of each interview (waiting, cleaning chunk X of Y, done, failed with a reason), allow stopping it, and keep what was found. A chunk that fails is retried once; a failure of one interview MUST NOT stop the others.
- **FR-016**: Each AI call MUST go through the AI Gateway with the person's own AI connection and be recorded in the usage ledger with what it was for. The Enrichment tab MUST show the cost of the last cleaning and the total of the study's cleanings, next to the lexicon readings' costs, and each interview's row (and its review) MUST show what its own cleanings cost, as an analysis in Fieldwork, whoever ran them.
- **FR-017**: Before the first cleaning of a study by a person, a confirmation MUST say that the full text of the transcripts, names replaced, is sent to their AI provider; it is asked again when the provider changes (spec 009 FR-011).
- **FR-018**: "Publish to Drive" MUST be available on a clean interview: it creates a new document in a dedicated subfolder of the study's folder ("Clean transcripts" / « Transcriptions nettoyées », created the first time and then found by its identity), with the person's own source access and editing consent (spec 007). The document holds a title line and one paragraph per turn of the latest clean version. The original transcript file MUST never be written.
- **FR-019**: Publishing again MUST update the same document. When the document changed in Drive since the last publish, the person MUST be told and choose to overwrite or cancel. When it is gone, a new one is created. The interview MUST show "Out of date" when its latest clean version is newer than what was published, and a link to the document.
- **FR-020**: Cleaning, decisions and publishing MUST follow the study's access rules (spec 002 FR-010a, folder access).
- **FR-021**: All texts MUST exist in English and French; the Cleaning view, the transcript with its corrections and the dialogs MUST meet WCAG 2.2 AA, and a correction's state MUST never be shown by colour alone.

### Key Entities

- **Correction run** (Transcripts context, per study): one "Clean transcripts": who started it, lexicon only or with the AI, the interviews it covers, state per interview (chunks read of total), stopped or finished, its cost reference, how many AI corrections were left out.
- **Correction** (an **Edit** of the context map): a change on one turn of an interview's raw version: place, original, replacement, kind (`term | transcription | speaker | name`), source (`person | lexicon | name | ai-lexicon | ai-other`), reason, confidence, status, who decided and when.
- **Clean version** (of a Transcript): the turns of the raw version with the accepted corrections applied, same turn ids, numbered; created when a person validates an interview's cleaning.
- **Published clean transcript**: the Drive document of an interview's clean version: its subfolder, the version it holds, its state (in sync, out of date, changed in Drive, unavailable).
- **Verdict** (spec 010): stays the single place where "this occurrence is / is not the term" is kept; lexicon corrections follow it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the reference test folder, every seeded misspelling of an accepted "everywhere" term is corrected by the lexicon pass with no AI call, and no correction changes text outside its own span (tested).
- **SC-002**: No AI correction is kept whose original text is absent from its turn, that changes more than 8 words, or that touches a known name or placeholder (tested).
- **SC-003**: No name the app knows is sent to an AI provider; with anonymisation on, no known interviewee name remains in a validated clean version (tested).
- **SC-004**: Every AI call of a cleaning appears in the usage ledger, and the cost on the Enrichment tab equals the sum of the ledger entries of the study's cleanings (tested).
- **SC-005**: A person can review and validate the corrections of a one-hour interview (about 40 corrections) in under 10 minutes, using filters and "accept all shown".
- **SC-006**: Cleaning 30 one-hour interviews completes in under 20 minutes with a standard AI provider, and the page stays usable meanwhile.
- **SC-007**: Re-importing a transcript with one changed turn keeps every decision on the other turns (tested).
- **SC-008**: Publishing never writes the original transcript file, and publishing twice leaves one document in the subfolder (tested).
- **SC-009**: The Cleaning view, the transcript with corrections and the dialogs have no axe violation in light and dark themes.

## Assumptions

- Only validated interviews already imported by spec 010 (or imported by the cleaning run itself) are cleaned; the lexicon is the team's (spec 010).
- With anonymisation on, interviewees get their pseudonyms (spec 008/009), interviewers an "Interviewer N" label, and other people's names a neutral label.
- A speaker correction changes the speaker of a whole turn; splitting or merging turns is out of scope.
- The estimate uses the text size of the chunks and the person's model price from the pricing catalog (spec 005); the real cost comes from the ledger.
- The subfolder's name follows the language of the person who first publishes; the document's name follows the interview's title (spec 009), which already uses pseudonyms when anonymisation is on.
- Any member of the team (or an admin) with access to the study can clean, decide and publish; no separate role.
- Analysis (a later spec) reads the latest clean version, or the raw version for interviews never cleaned.
- Out of scope: editing the clean text freely as a document; bringing Drive edits of the published document back into the app; splitting or merging turns; speaker mapping to roster entries; a global, cross-team lexicon; Analysis itself.

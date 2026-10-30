# Feature Specification: Enrichment phase and team lexicon

**Feature Branch**: `010-enrichment-vocabulary`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "A new study phase « Enrichissement » (Enrichment) before Analysis: phases become Preparation → Fieldwork → Enrichment → Analysis. It works on the validated interviews. Its first content is the team lexicon (the vocabulary): a deep reading of the transcripts finds unusual words (names of products, places, organisations, acronyms, jargon, words the transcription tool probably misheard); the app's rules first, then the AI groups variants and proposes a canonical form; people decide; the lexicon belongs to the team. Cleaning (spec 011) comes next, in the same phase."

## Clarifications

### Session 2026-10-26

- Q: Where does the vocabulary step go? → A: In a new study phase « Enrichissement », between Fieldwork and Analysis (`1 · Preparation`, `2 · Fieldwork`, `3 · Enrichment`, `4 · Analysis`). Cleaning (spec 011) will be the second step of this phase.
- Q: At which level is the lexicon kept? → A: Per team, the team that owns the study's projects (spec 009 clarification). A global, cross-team lexicon comes later.
- Q: Does the app keep the text of the transcripts? → A: Yes. The text of each validated interview is imported once into the app as its raw version (speaker turns). It is imported again only when the file changed in Drive. Cleaning (spec 011) works on it.
- Q: Can a person say, for each example shown, whether it is the term (as in the prototype)? → Yes: a yes / no verdict on each occurrence, in its context, kept across readings; and each term has a scope, everywhere or case by case (case by case by default when a spelling has 3 letters or less), which Cleaning (spec 011) follows.
- Q: What does the AI receive? → A: Only the candidates found by the app's rules, each with at most 3 short excerpts around it (known names removed or replaced), never the full transcripts.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find the unusual words of the study (Priority: P1)

In the new tab « 3 · Enrichment », the person sees the validated interviews of the study and activates "Find terms". A confirmation shows how many interviews will be read and the expected cost. The app reads the transcripts and lists the **candidate terms**: words and short phrases that are not common words of the language (product names, organisations, places, acronyms, jargon) or that look like transcription errors (a word close to a known term, a word that makes no sense in its sentence). The AI then groups the spellings of the same term, proposes its correct form, its kind and a short definition, each backed by a quote from the transcripts.

**Why this priority**: Transcription tools mishear product names, acronyms and jargon; before anything is analyzed, the team must know its words. Without this list, Cleaning (spec 011) has nothing to correct with.

**Independent Test**: With three validated interviews where "Goodresearch", "good research" and "Gooresearch" appear and "NPS" appears in two, "Find terms" proposes one term "Goodresearch" with its two variants and its occurrences, and one acronym "NPS", each with a quote found in the text.

**Acceptance Scenarios**:

1. **Given** a study with validated interviews, **When** the person activates "Find terms", **Then** a confirmation shows the number of interviews, the estimated cost and, the first time, that excerpts of the transcripts will be sent to their AI provider; nothing runs before it is confirmed.
2. **Given** a reading, **When** it runs, **Then** the app's own rules find the candidates first (words absent from the common words of the language, capitalised words inside a sentence, acronyms, words repeated across interviews, spellings close to a term already in the lexicon); the AI is asked only to group, name and explain them.
3. **Given** the AI answers, **When** a proposal comes back, **Then** each variant and the quote of each proposal are checked in the transcripts; a variant not found is dropped, a proposal without a valid quote is dropped.
4. **Given** names of people the app knows (rosters, schedule, team members), **When** candidates are found, **Then** they are never sent to the AI and never proposed as terms.
5. **Given** a reading in progress, **When** the person looks at the tab, **Then** each interview shows waiting, importing, imported, finding the terms, counting the terms or failed (with its reason), the AI step shows its batch out of the total, the list can be folded, and the reading can be stopped (update 2026-10-30); terms already found are kept.
6. **Given** a reading, **When** it ends, **Then** its cost is shown on the tab (this reading and the study total) and recorded in the usage ledger.

---

### User Story 2 - Decide the terms (Priority: P1)

The person reviews the proposed terms: accept, edit (correct form, kind, definition, variants), merge two terms into one, or reject. Each term shows where it was found (studies, interviews, number of times) and its quotes.

**Why this priority**: AI proposes, people decide. Only decided terms are used by Cleaning.

**Independent Test**: The person accepts "Goodresearch", edits "NPS" to add the definition "Net Promoter Score", merges "Ack" into "Acknowledgement", and rejects "Hmm". A new reading proposes none of these again, and the merged spelling is a variant of "Acknowledgement".

**Acceptance Scenarios**:

1. **Given** proposed terms, **When** the person opens the lexicon, **Then** they can filter by status (to decide, accepted, rejected), by kind and by language, and search a spelling.
2. **Given** a term, **When** the person accepts, edits or rejects it, **Then** the decision is kept with who and when, and the version seen is checked ("changed meanwhile").
3. **Given** two terms, **When** the person merges them, **Then** one term remains, with the other's spellings as variants and both occurrences.
4. **Given** a rejected term or variant, **When** a new reading finds it, **Then** it is not proposed again.
5. **Given** a decided term, **When** a new reading finds new occurrences or a new variant, **Then** the occurrences are added and a new variant is proposed on the term, without changing what the person decided.
7. **Given** an occurrence shown with its excerpt, **When** the person says it is not this term, **Then** the verdict is kept, counted, and the next reading does not change it.
6. **Given** a term marked as a probable transcription error ("suspect"), **When** it is accepted, **Then** it carries its correct form, which Cleaning will use.

---

### User Story 3 - One lexicon for the team (Priority: P2)

The lexicon belongs to the team that owns the study's projects. A term decided in one study is known in the team's other studies: a new reading there proposes only what is new, and the terms already decided are shown with their occurrences in this study.

**Why this priority**: Teams run many studies on the same product; deciding the same words again for each study wastes time. Useful from the second study only.

**Independent Test**: In a second study of the same team, "Find terms" does not propose "Goodresearch" again: the lexicon shows it as accepted, found in both studies.

**Acceptance Scenarios**:

1. **Given** a term accepted in study A, **When** study B of the same team is read, **Then** the term is shown as accepted with its occurrences in B, and nothing is to decide for it.
2. **Given** a study whose projects belong to another team, **When** it is read, **Then** the first team's lexicon is not used and not shown.
3. **Given** a person who is not in the team, **When** they open a study they can access through another way, **Then** they see the lexicon only through that study's access rules.

---

### User Story 4 - Follow the enrichment of each interview (Priority: P3)

The tab lists the validated interviews with their enrichment state: "Not read", "Terms to decide (X)" and "Read", with the date of the last reading. Interviews whose transcript changed since are marked and can be read again.

**Why this priority**: Shows what is left to do; the core is the lexicon itself.

**Independent Test**: After reading two of three interviews and deciding all terms of one, the tab shows "Read", "Terms to decide (2)" and "Not read".

**Acceptance Scenarios**:

1. **Given** validated interviews, **When** the tab opens, **Then** each one shows its state, and only validated interviews are listed (others are counted: "N interviews still to validate in Fieldwork").
2. **Given** an interview whose transcript changed in Drive since its reading, **When** the tab is shown, **Then** it is marked "changed since" and "Find terms" offers it again.
3. **Given** "Terms to decide (X)" on a row, **When** the person activates it, **Then** the lexicon opens filtered on that interview.

---

### Edge Cases

- No validated interview: the tab explains that interviews are validated in Fieldwork, with a link to it.
- An interview without transcript (recordings only): listed as "no transcript", not read.
- An interview reopened in Fieldwork after its reading: its occurrences stay but it is no longer listed until validated again.
- An interview excluded after its reading: its occurrences are removed from the counts; decided terms stay.
- A very long transcript: it is read in full by the rules; the AI receives at most a fixed number of excerpts per candidate.
- A study in two languages: each term has a language; the same spelling may be a term in one language and a common word in the other.
- A candidate that is a name of a person not known to the app (a colleague mentioned): it may be proposed; the person rejects it or marks it as a person's name, which is never proposed again and is kept for the anonymisation of spec 011.
- Two people decide the same term at once: the second one is told it changed meanwhile.
- Hundreds of candidates: the app keeps the most frequent (and all close spellings of known terms) up to a limit per reading, and says how many were left out.
- The study changes team (its project moves): its occurrences follow the study; the old team's decided terms stay in the old team's lexicon, and the study now shows and uses the new team's.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The study page MUST show four phases in this order: `1 · Preparation`, `2 · Fieldwork`, `3 · Enrichment`, `4 · Analysis` (`Préparation`, `Passation`, `Enrichissement`, `Analyse`). The assistant's page context MUST know the new phase. *Update after spec 012*: the lexicon became a phase of its own, before the cleaning: `1 · Preparation`, `2 · Fieldwork`, `3 · Lexicon`, `4 · Enrichment` (the cleaning, spec 011), `5 · Analysis` (`Préparation`, `Passation`, `Lexique`, `Enrichissement`, `Analyse`); the address keeps `phase=lexicon` and `phase=enrichment`.
- **FR-002**: Enrichment MUST list the validated interviews of the study (spec 008/009) with their enrichment state ("Not read", "Terms to decide (X)", "Read", "No transcript"), the date of the last reading, a "changed since" mark, and the count of interviews still to validate in Fieldwork.
- **FR-003**: "Find terms" MUST read the transcripts of the validated interviews never read or changed since, with an option to read them all again. A confirmation MUST show the number of interviews and the estimated cost before running. *Update after spec 012*: each row of the Interviews list also has its own "Find terms" ("Find terms again" once read), which reads that one interview again whatever its state, with the same confirmation.
- **FR-004**: A reading MUST first import the full transcript of each interview it covers as the interview's **raw version**: its speaker turns (speaker label, time when written, text), each with an id that stays the same across versions. For a Google document, only the tab holding the transcript is imported. An interview already imported is imported again only when its file changed in Drive; the raw version is never edited. An unreadable transcript fails that interview with its reason. The imported text is deleted with its interview (folder replaced or detached, study deleted).
- **FR-005**: The app's rules MUST find the candidates first, with no AI: words and phrases of up to 4 words absent from the common words of the interview's language, capitalised words not at the start of a sentence, acronyms (2–6 capital letters), and spellings close to a term or variant already in the team's lexicon. Candidates found in several interviews rank first. Speaker labels, timestamps and numbers are not candidates.
- **FR-006**: Names the app knows (the study's rosters, its schedule, the team members, the speaker labels of the transcripts) MUST NOT be candidates and MUST NOT be sent to the AI: they MUST be replaced by placeholders in every excerpt sent, whether anonymisation is on or off.
- **FR-007**: The AI MUST be asked only to group the candidates into terms and, for each, propose its correct form, its kind (`domain`: a real term to keep; `suspect`: a probable transcription error, with its correction), a category (product, organisation, place, acronym, jargon, role, person, other), a definition of at most 200 characters, its variants and one quote. The AI MUST receive only the candidates, each with at most 3 excerpts of at most 200 characters around its occurrences, never a full transcript. Answers MUST be checked against the expected shape.
- **FR-008**: Each variant and each quote returned by the AI MUST be found in the transcripts (ignoring case, spaces and apostrophe style); variants not found and proposals without a valid quote MUST be dropped.
- **FR-009**: Each term MUST have a status `proposed | accepted | edited | rejected`, a language, its variants (each proposed, accepted or rejected), and its **occurrences** (interview, count) recomputed by the app at each reading with the matching rule of the context map (whole word or phrase; acronyms case-sensitive, others not). Occurrence counts are computed by the app, never by the AI.
- **FR-010**: The person MUST be able to accept, edit, merge or reject a term, and accept or reject a variant, one by one or all the terms shown at once. Each decision records who and when and checks the version seen.
- **FR-011**: A new reading MUST never change a decided term (its form, kind, definition, status), never propose again a rejected term or variant, and add new occurrences and new variants as proposals on the existing term.
- **FR-012**: The lexicon MUST belong to the team that owns the study's projects and be shared by all its studies; each term keeps the studies and interviews where it was found. The study's team is the team of its project (one project per study today).
- **FR-013**: The lexicon view MUST filter by status, kind, category, language and interview, search spellings, and show for each term its variants, its occurrences per study and interview, its quotes and its origin (rules, AI).
- **FR-014**: A reading MUST run in the background, one per study at a time, show the state of each interview (waiting, importing, imported, finding the terms, counting the terms, failed with a reason; update 2026-10-30), allow stopping it, and keep what was found. A failure of one interview MUST NOT stop the others. *Update after spec 012*: the Lexicon phase shows the reading in progress interview by interview, and a person can take one interview out while it waits or its transcript is imported ("Taken out", read again later like an interview never read); once the terms are being found, the words of the interviews read go to the AI together and only the whole reading can be stopped (`TOO_LATE_TO_STOP`).
- **FR-015**: Each AI call MUST go through the AI Gateway with the person's own AI connection and be recorded in the usage ledger with what it was for. The Enrichment tab MUST show the cost of the last reading and the total of the study's readings, whoever ran them.
- **FR-016**: Before the first reading of a study by a person, a confirmation MUST say what is sent to their AI provider; it is asked again when the provider changes (as spec 009 FR-011).
- **FR-017**: Readings and decisions MUST follow the study's access rules (spec 002 FR-010a); a person sees and decides the team's lexicon only through a study they can access.
- **FR-018**: A reading MUST keep at most 300 candidates sent to the AI per reading (the most frequent first, close spellings of known terms always kept) and say how many were left out.
- **FR-020**: Each term MUST have a scope: `everywhere` (every occurrence is the term) or `case by case` (each occurrence is judged in its context). The app proposes case by case when a counted spelling has 3 letters or less, everywhere otherwise; a person's choice wins and is kept.
- **FR-021**: For each occurrence shown with its excerpt, a person MUST be able to say "this is the term", "not this term" or "can't tell" (the place is then left for a person to decide in Cleaning, spec 011), or take it back. A verdict is kept across readings while the turn is unchanged, follows a merge, and is counted per interview and term. The place MUST hold one of the term's spellings in a validated interview.
- **FR-019**: All texts MUST exist in English and French; the new tab, lists and dialogs MUST meet WCAG 2.2 AA.

### Key Entities

- **Enrichment** (study phase): the step between Fieldwork and Analysis, working on the validated interviews; its steps are the lexicon (this spec) and Cleaning (spec 011).
- **Transcript** (Transcripts context, per interview): the imported text of a validated interview. Its **raw version** is a list of speaker turns with stable ids, plus the file version it came from (to know it changed in Drive). Cleaning (spec 011) adds clean versions.
- **LexiconTerm** (Transcripts context, per team and language): the correct form, kind (`domain | suspect`), category, definition, status, its **variants** and **occurrences**, who decided and when.
- **Variant**: one spelling of a term found in the transcripts, with its own status.
- **Occurrence**: how many times a term or variant appears in one interview, recomputed by the app.
- **Verdict**: a person's yes / no / unsure on one occurrence (term, interview, turn, place), kept across readings.
- **Scope** of a term: everywhere or case by case.
- **Lexicon reading**: one "Find terms" over a study: who started it, the interviews it covers, state per interview, stopped or finished, its cost reference.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the reference test folder, every seeded misspelling of a known product name is grouped under its correct form, and no proposal is backed by a quote absent from the transcripts (tested).
- **SC-002**: No name the app knows is sent to an AI provider; with anonymisation on, no such name appears in any excerpt sent (tested).
- **SC-003**: A second reading of the same interviews proposes no term or variant a person already decided or rejected (tested).
- **SC-004**: Every AI call of a reading appears in the usage ledger, and the cost on the Enrichment tab equals the sum of the ledger entries of the study's readings (tested).
- **SC-005**: A person can decide the 50 proposed terms of a study in under 10 minutes using filters and "accept all shown".
- **SC-006**: A reading of 30 one-hour interviews completes in under 10 minutes with a standard AI provider, and the page stays usable meanwhile.
- **SC-007**: In a second study of the same team, terms decided in the first are shown as decided with no new decision needed (tested).
- **SC-008**: Reading an interview again without changes in Drive imports nothing again and keeps the same speaker turn ids (tested).
- **SC-009**: The new tab, lists and dialogs have no axe violation in light and dark themes.

## Assumptions

- Only validated interviews are enriched: a person has confirmed who, when and which transcript (spec 009).
- The common words of English and French ship with the app (a word-frequency list per language); other languages get only the capitalisation, acronym and repetition rules.
- Any member of the team (or an admin) can decide terms; no separate lexicon role for now.
- The estimated cost uses the size sent and the person's model price from the pricing catalog (spec 005); the real cost comes from the ledger.
- Speaker mapping (transcript labels to roster entries) is not part of this spec; it may become another Enrichment step.
- Out of scope: Cleaning, i.e. correcting the transcripts with the lexicon and replacing names in the text when anonymisation is on (spec 011); a global, cross-team lexicon; editing the lexicon outside a study; exporting it.

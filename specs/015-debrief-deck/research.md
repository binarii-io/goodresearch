# Research: Debrief deck

## R1. Where it lives

- **Decision**: the deck is a read model of the `synthesis` module.
  - A pure builder, `domain/deck.ts` `buildDeck`, turns the project's data into typed slides.
  - The published-deck record is stored with the synthesis tables; the next steps are computed, no limits slide for now (update 2026-10-29).
- **Why**: the deck reads only Synthesis objects (insights, recommendations, takeaways) and a few counts from Research and Ingestion. Creating a separate Reporting module for one read model is not worth it yet.
- **Rejected**:
  - a `reporting` module: one more boundary, and it needs the same ports;
  - the Publishing module: its three-way sync (spec 007) does not apply to a one-way export.

## R2. On the fly, in one language

- **Decision**: the deck is built at each request in one language: the viewer's in the tab, the chosen one for a publication.
- **Fingerprint**: a fingerprint of the built deck (cyrb53 over its JSON) tells "out of date" against the published one.

## R3. Content

- **Verbatims**: up to two per insight slide, from its counted supporting facts, through Evidence's public read `verbatimsOf(factIds)`.
- **Order of the verbatims**: different participants first, then the shortest.
- **Names**: names the app knows are replaced by `[…]`.
- **Length**: cut at 300 characters, at a word.
- **What is still to decide** is added only on request and marked "to validate".
- **Studies the person cannot open**: their facts give no verbatim (counts only).
- **Method slide**: built from the validated interviews of each study (count, first and last interview date) and the guides' theme sections.

## R4. Google Slides through its API

- **Decision**: the presentation is created in the chosen folder with the Drive API (`mimeType` `application/vnd.google-apps.presentation`, as spec 007 creates Docs).
  - It is then written with `presentations.batchUpdate`, with one slide per deck slide:
    - `TITLE` / `TITLE_AND_BODY` layouts and their placeholders;
    - `createTable` for the recommendations and the matrix.
  - An update deletes the presentation's slides and writes the deck again in the same file, which keeps its link and sharing.
  - It uses the person's own Drive write consent (spec 007): the `drive` scope covers the Slides API.
- **Why**: no new dependency, and an update in place is natural.
- **Rejected**:
  - generating a `.pptx` (`pptxgenjs` pulls a dubious `https` package) and letting Drive convert it: a supply-chain risk, and an update in place by conversion is not reliable.
- **Edited in Google Slides**: the presentation's content revision (Slides `revisionId`) is kept at each write. An update reads it and writes only while it is unchanged, with `writeControl.requiredRevisionId` in the same request, so an edit made meanwhile is never lost; sharing or renaming does not count. An unknown revision asks too. (First the Drive file `version` was kept; it also rises on sharing and renaming, review of PR #15.)

## R5. Limits and next steps (updated 2026-10-29)

- **Decision**: next steps computed from the recommendations, as in the prototype (owner or "to assign", success measure). No limits and open questions slide for now: a product decision after review.
- **Rationale**: a block to fill in by hand added nothing; a computed limits slide was not wanted for now.
- **Alternatives considered**: texts typed per project and translated by the AI (first version, dropped); limits computed from the data (second version, removed).

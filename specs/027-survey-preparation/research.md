# Research: Survey preparation

Form service facts come from its REST reference, read on 2026-11-02. "Docs silent" marks what only the real service can settle ([quickstart.md](quickstart.md) scenario 5).

## R1. Item identity at the source

**Decision**: Let the service assign item and question ids, read the form back after each write, and store a map from app key to `{ formItemId, questionId }` in the publication (`item_map`): known blocks come first in the model's order, so creating and updating share one path. A grid's rows each have their own question id.

**Rationale**: The reference says ids "can be provided" at creation yet calls the field read-only and states no format. A stored map avoids depending on that, and spec 028 reads responses through it.

**Alternatives**: Supplying app ids (format undocumented). Matching by title (a reworded item would lose its identity).

## R2. Form rendering

**Decision**: A pure `renderForm(questionnaire, labels)` gives ordered blocks: the consent question, one page break per section, its items, then the thanks as a final text item.

| App | Form |
|---|---|
| single `likert` | `scaleQuestion` low 1, high 5 or 7, two labels |
| 2+ consecutive `likert` with the same legend in a theme, shuffle on | one grid (`RADIO`), rows shuffled; end columns hold the labels (`1 – …`, `7 – …`) |
| `single-choice` | `RADIO`, `shuffle` unless ordered |
| `multiple-choice` | `CHECKBOX`, `shuffle` unless ordered |
| `open` | `textQuestion` paragraph |

**Rationale**: Grid rows are the only shuffle of items available. Grids have no legend field, so the labels go in the columns; read-back parses them.

**Docs silent**: allowed values of a scale's `low`/`high`.

## R3. Consent and identity

**Decision**: Consent is a required `RADIO` with two ordered options: agree (`NEXT_SECTION`), refuse (`SUBMIT_FORM`). After creation, `updateSettings` sets `emailCollectionType: DO_NOT_COLLECT`, then the read-back confirms it. The value is stored in `collects_identity` and read at each check, outside the comparison: an unresolvable `invalid` change would leave the file "changed in Drive" for good. Anything but "do not collect" shows a dedicated warning; "Update in Drive" sets it again, and spec 028 refuses to open such a form.

**Rationale**: `VERIFIED` is the service's default for organisation accounts, so leaving the default would collect identities, breaking FR-014 and SC-004. A refusal submits a response holding only the refusal; spec 028 ignores it.

**Docs silent**: whether `SUBMIT_FORM` works as expected on a required `RADIO` (the reference only says radio supports it), and whether an organisation's policy can force collection. If it can, the warning stays and the person decides.

## R4. Closed to responses

**Decision**: New forms start unpublished (documented since 2026-06-30). The adapter reads `publishSettings` after creation and calls `setPublishSettings` with both flags false if it finds otherwise. Each check reads `isAcceptingResponses`, shown on the tab: a person may open the form by hand.

**Rationale**: SC-004 must hold without trusting a default. A manual opening is the person's choice, and the screen says so.

## R5. Creating in the folder

**Decision**: `forms.create` (title only), then Drive `files.update` with `addParents`/`removeParents`, then `batchUpdate` for items and settings. If a later step fails, the app returns the error, stores nothing, and names the file left in place.

**Rationale**: `forms.create` takes no parent. The move comes first, so a person's failure leaves an empty form rather than one holding the questionnaire outside the folder. The app never deletes at the source (constitution VII).

**Alternatives**: Drive `files.create` with the form's mime type (existing `createFile` helper): undocumented for forms, tried first in quickstart scenario 5; adopted if it works, as it removes the move.

## R6. Scope

**Decision**: Reuse `DRIVE_WRITE_SCOPE` (`drive`) and the editing consent. `forms.create` and `responses.list` accept it. `batchUpdate` and `get` are checked in scenario 5.

**Rationale**: No new consent screen or Google verification step. The deployer must enable the Forms API: documented in the README's Drive section; the service's "disabled" failure maps to the existing `DRIVE_UNAVAILABLE` family with a specific message.

## R7. Update

**Decision**: A pure `planFormUpdate(current, target, map)` gives minimal requests: `updateItem` with a mask that leaves ids out, `moveItem`, `createItem`, `deleteItem`; a grid's rows are updated through `updateItem`, existing rows keeping their question ids. Sent with `requiredRevisionId` from a read just before: a stale one gives `DRIVE_CHANGED_MEANWHILE`.

**Rationale**: FR-016, and revision ids are valid for only 24 hours, so a stored one is not reused for writing. Moving a Likert item out of a grid replaces its question id: acceptable before responses, and spec 028 must refuse it afterwards.

## R8. Three-way comparison

**Decision**: Reuse `threeWay`. Items: `framing:title`, `consent`, `thanks`, `section:<id>`, `item:<id>`, `order:sections`, `order:section:<id>`. A form item absent from the map gives `{ type: 'unread' }`, so `not-understood`. Unsupported kinds likewise. Items added in the form come as `new:<formItemId>:<questionId>`: accepted, they take the id the app gives them, under their identity at the source. `layout` compares which scales form grids, so changing the shuffle setting shows the form out of date. `applyChanges` builds a questionnaire input and calls `saveQuestionnaire`, origin `drive`.

**Rationale**: `looksAccepted` is unnecessary here: an added item has its identity from the source.

## R9. Results spreadsheet

**Decision**: `linkedSheetId` is read at each check; its link, built by the adapter, is stored in `linked_sheet_link` and shown. The tab explains the link in the form. The spreadsheet is never read.

## R10. Checks and estimate

**Decision**: `questionnaire-checks.ts` in Research's domain, pure: `checkItem`, `checkQuestionnaire`, `estimateSeconds`. The query returns the result with the questionnaire; the assistant tool calls it through Research's `index.ts`. Reuses wording-rule ideas from `assistant/domain/question-checks.ts` without importing them; rules differ, since a closed item is normal here. Estimate: Likert 8 s, choice 12 s, open 45 s, plus 30 s reading the consent; rounded up to the minute, labelled an estimate.

**Rationale**: The assistant depends on Research, never the reverse. The rates are common survey rules of thumb, hence "estimate".

**Alternatives**: Moving the checks to `packages/shared` for the editor to run live. Rejected for now: checks show on save and on the card.

Randomisation is computed here too (`randomisationOf`), as the tab says it before anything is published; it must follow `groupsOf` in `publishing/domain/form.ts`.

## R11. Design cost on the tab

**Decision**: An assistant route sums the ledger refs of the answers given on this study's page in conversations that loaded the `questionnaire-design` skill there, across people, through `studyCosts`. Totals only; a conversation stays private. A route of its own, so Research does not depend on the assistant.

**Rationale**: AGENTS.md requires the cost in the screen using it; the interview guide's tab does not show it today, so this is new. Not added to the guide here (out of scope, noted for later).

## R12. Types in the app

**Decision**: `CREATABLE` gets `survey`; `usability-test` stays refused. The existing guards hold: `run-inventory` makes no session unless the type is `interviews`, and the commands return `NOT_AN_INTERVIEW_STUDY`. Overview read models filter on type where they count interviews (task to verify each). The assistant's `create_study` tool gets a `type`.

## R13. Best practices

**Decision**: One typed module per language in `packages/shared` (ADR-0006), own wording following the method's structure, sources cited, no vendor. Not published as a file in this spec (the spec asks for a dialog and a download), unlike the interview ones.

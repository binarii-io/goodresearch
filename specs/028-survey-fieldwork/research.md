# Research: Survey fieldwork

Facts from the form service's reference, read on 2026-11-02. "Docs silent" marks what only the real service settles (quickstart scenario 4).

## R1. Reading

**Decision**: List every response at each reading, page by page, without the timestamp filter; upsert by response id, then delete those not seen, in one transaction, only if the reading finished.

**Rationale**: FR-007 needs deletions, and the docs do not say deleted responses are signalled. The filter is on an unspecified timestamp, and an edited response may be missed. Simplicity at our volumes.

**Alternatives**: Incremental with `timestamp >`: cannot see deletions.

## R2. Answers

**Decision**: `answers` is keyed by `questionId`. The adapter gives `{ responseId, submittedAt, answers: { questionId: string[] } }` and never passes `respondentEmail`. A pure `toStored(raw, map, items)` gives: consent, answers per item id, and the unknown questions. Likert stored as an integer: a scale's string number, or a grid column's leading number. Unknown or unparsable values are kept as given and flagged by reading.

**Rationale**: Docs: scale is "a string containing the number", checkbox several values, each grid row "a separate Answer". The contact item is dropped here, in one tested place.

**Docs silent**: that grid answers are keyed by the row's `questionId`, and whether unanswered questions appear. Scenario 4.

## R3. Consent

**Decision**: `given` when the answer is the option leading on; `refused` for anything else, including none (spec edge case). Refused responses store no answer.

## R4. States in SQL

**Decision**: `stateOf` is pure and tested; the query builds the same rule in SQL (`answers->item ?| accepted`), and an integration test runs both on the same responses and compares.

**Rationale**: Project rule: counts and pages in SQL, not rows filtered in JS. States are never stored (FR-008), so a rule change applies at once.

## R5. Opening

**Decision**: `setPublishSettings`: open `{isPublished: true, isAcceptingResponses: true}`, close `{isPublished: true, isAcceptingResponses: false}`. The link comes from `responderUri`, stored at each read. `setOpen` reads the form first and refuses on identities, consent, or not in sync.

**Rationale**: Closing keeps the page and shows a closed message, per the guide; unpublishing would hide it.

**Docs silent**: reopening after closing, and whether an editor (not owner) may publish. A refusal shows the source's reason. Scenario 4.

## R6. Guarding updates

**Decision**: Pure `impactOfUpdate(base, app)` on the comparable items of spec 027: `breaking` when a based item is gone, its non-text fields changed, or the `layout` of existing items changed; `reworded` when only text changed. `update` asks Surveys for the number of responses through a port: refused with `RESPONSES_BLOCK_UPDATE` naming items; a rewording needs `confirmRewording`, and records the former wording first.

**Rationale**: Comparing items rather than operations covers grids and moves in one rule. An item added has no base, so it passes.

## R7. Former wordings

**Decision**: `surveys_item_wordings(study, item, text, until)`. A response answered a former wording when submitted before `until`. Saved before the write: a failed write leaves a harmless line, as `until` ages only with no later response.

## R8. Access

**Decision**: Reading needs `canEdit` at the source, as checks do since spec 027's review; otherwise the tab shows the last reading and why. Docs state only scopes (`drive` accepted), so this is the safe assumption. Scenario 4 tells if viewers can do more.

## R9. When to read

**Decision**: The tab calls `POST /read` on mount; the server skips it if read under a minute ago (FR-004), and Refresh passes `force`. The screen shows what is stored while reading.

## R10. Cost

**Decision**: Reuse the assistant's route (spec 027): answers of the study's page in conversations with a `propose_target_rule` card, summed through `studyCosts`.

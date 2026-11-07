# Research: Usability test preparation

The code facts come from the 027 implementation (commit `e2e9f08`) and the current modules. "By hand" marks what only the real Docs service can settle ([quickstart.md](quickstart.md) scenario 6).

## R1. Where the protocol lives

**Decision**: A `TestProtocol` aggregate in Research (`domain/test-protocol.ts`), one row per study in `research_test_protocols` with `content` jsonb, `origin`, `version`, as `research_questionnaires`. Validation in `build()`; limits mirrored in `packages/contracts/src/test-protocol.ts` (`TEST_PROTOCOL_LIMITS`).

**Rationale**: Same lifecycle and versioning as the guide and the questionnaire; JSON fits a document edited as a whole.

**Alternatives**: Tables per task (no query needs them; the later analysis reads the protocol whole). Generalising `Questionnaire` (rejected by 027 for the same reasons: different rules).

## R2. Task identity

**Decision**: Copy the two-pass `identify` of `questionnaire.ts`: pass 1 keeps sent ids the previous version knows; pass 2 matches on normalised instruction; otherwise a new id. Ids are opaque (`t_` + random), never positions, so reordering keeps them. Ids of removed tasks are kept in `content.retiredTaskIds` so they are never minted again (FR-004).

**Rationale**: The later analysis judges sessions against task ids; a reused id would attach old results to a new task.

**Alternatives**: Ids from positions (break on reorder). Shared helper in `packages/shared` (027 chose copies; kept consistent).

## R3. Writing rules and planned length

**Decision**: `domain/protocol-checks.ts`, pure: `checkTask(task, language)`, `checkProtocol(protocol)` and `plannedMinutes(protocol)`. Rules, each a closed flag code translated by the web app:

| Flag | Rule (en and fr word lists, Unicode word boundaries) |
|---|---|
| `gives-the-way` | an interface verb (click, tap, select, open the menu, go to / cliquez, appuyez, sélectionnez, ouvrez le menu, allez dans) or a quoted label (`"…"`, `« … »`) or the words button, tab, menu / bouton, onglet, menu |
| `several-tasks` | `then`, `and then`, `after that` / `puis`, `ensuite`, `et après`, or three or more action verbs from a fixed list |
| `no-goal` | fewer than 6 words, or no goal marker (`to`, `so that`, `in order to`, `you want` / `pour`, `afin de`, `vous souhaitez`, `vous voulez`) and no scenario word reused |
| `too-long` | over 40 words |
| whole `too-long-for-session` | planned minutes above the session length |
| whole `too-many-tasks` | more than 8 tasks with a session of 60 minutes or less |
| whole `no-think-aloud` | empty think-aloud instructions |
| whole `consent-without-ai` | consent mentions none of: record/enregistr, and none of: AI, artificial intelligence / IA, intelligence artificielle |

An empty success criterion or a link that is not an `http(s)` address is refused at save, from the editor, the assistant or a Drive change (FR-002, FR-003), so it is never a flag.

Planned length: sum of expected durations (5 minutes for a task without one) + 5 (introduction and warm-up) + 10 (debrief and closing) + 3 if SUS + 0.5 per task if SEQ, rounded up. Labelled an estimate.

**Rationale**: Heuristics found in the trial's sessions; flags never block (FR-007), so false positives cost a glance. Shared by the screen (query) and the assistant (`checkTestProtocol` exported by Research's module, as `checkQuestionnaire`).

## R4. Standard questions

**Decision**: Fixed content in `packages/shared/src/content/standard-questions.{en,fr}.ts`: `sus-v1` (ten items, five-point agreement scale), `seq-v1` (one question, seven points), plus the default consent and think-aloud texts. The protocol stores `questionnaire: 'none' | 'sus-v1'` and `easeQuestion: 'none' | 'seq-v1'`; the editor shows a switch, the view and documents render the fixed text of the protocol's language.

**Sources**: SUS, Brooke (1996), free to use with attribution; French text from the validated F-SUS (Gronier & Baudet, 2021). SEQ, Sauro & Dumas (2009); French wording ours, named as a translation in the best practices.

**Rationale**: A versioned key lets the later analysis know exactly which items and scale were used (FR-006, FR-006a), and keeps the texts out of the model's reach.

## R5. Readiness checks

**Decision**: A new table `research_protocol_checks` (PK `study_id` + `kind` in `pilot | interface | review`, `protocol_version`, `marked_by`, `marked_at`), same commands shape as the questionnaire's. Computed checks (consent present, every task with a criterion, published and in sync) are never stored; "published and in sync" comes from Publishing through the web, as for the questionnaire.

**Rationale**: 027's table has a `people` column and kinds of its own; a second small table is simpler than widening it and keeps survey code unchanged (SC-007). The context map extends the "Readiness check" concept to both instruments.

## R6. Publishing the protocol

**Decision**: New publication kind `protocol`, three-way as the guide: `renderProtocol(protocol, labels)` writes a `DocModel` with invisible anchors on each framing block, script block, the scenario and each task (instruction and criterion as two anchored paragraphs); `readProtocol` reads anchors back; `protocolItems` gives comparable items (`framing:*`, `script:*`, `scenario`, `task:<id>:instruction`, `task:<id>:criterion`, `task:<id>:start`, `task:<id>:minutes`, `order:tasks`, and `standard:questionnaire`, `standard:ease` so that turning the SUS or the SEQ on or off makes the document out of date); `applyToProtocol` brings accepted values back through Research with origin `drive`, validated by the same rules. SUS and SEQ are rendered as text without anchors (not editable, a change there is `not-understood`).

Layout (FR-014): each task as a numbered heading, its instruction in a block marked "Read aloud", its criterion in a paragraph prefixed "For the facilitator only", then the SEQ when on.

**Rationale**: Reuses `threeWay`, `DocModel` and `StudyFiles.createDocument/readDocument` unchanged.

**By hand**: anchors surviving a manual edit of a task paragraph, as for the guide (quickstart).

## R7. Participant sheet, one way

**Decision**: New kind `participant-sheet`, rendered by `renderParticipantSheet(protocol)`: title, scenario, numbered instructions with start links, in the protocol's language. Its items are one `unread` item, as `practicesItems`, so a Drive edit is reported and `decide` refuses acceptance; "Update in Drive" rewrites it. Publishing the protocol publishes both in one command; each keeps its own row and state. A failure on the second is reported with the first kept (nothing deleted at source).

**Rationale**: The best-practices path already is "fixed content, never read back" (spec 007 FR-011); the sheet is the same contract.

## R8. Best practices by study type

**Decision**: Keep the kind `best-practices`; `renderPractices(language, studyType)` picks `USABILITY_PRACTICES` for a usability test study. Content in `packages/shared/src/content/usability-practices.{en,fr}.ts` with the existing `BestPractices` type. Sources cited by author and publication (Nielsen, *Usability Engineering*, 1993, on think-aloud; Rubin & Chisnell, *Handbook of Usability Testing*, 2008, on task writing; ISO 9241-11; Brooke, 1996; Sauro & Dumas, 2009); no company or vendor named (FR-017).

**Rationale**: One row per study and kind; a study has one type, so no collision. The web dialog already renders `BestPractices`.

## R9. Study type branches

**Decision**: `CREATABLE` gets `usability-test`; the SQL type check is widened. Each branch of the code map gets an explicit third case:

- Phases (`$studyId.tsx`): Preparation, Fieldwork, Lexicon, Enrichment, Analysis; no Quality; all but Preparation show "coming later" for this type and mount no interview component.
- Refusals: new `NOT_A_USABILITY_TEST_STUDY` (422) for protocol routes; existing interview and survey guards already refuse other types.
- `publication-queries.ts`: the schedule → questionnaire fallback gets a protocol branch, ordered by the study's type instead of by trial.
- Overview (`overview-queries.ts`, `project-journey.tsx`, `study-card.tsx`): counts and badges by type; a usability test counts neither as interviews nor as a survey.
- `run-inventory` keeps making no session unless `interviews` (verified by test).
- Assistant: `create_study` takes the new type; study-framing skill text updated.

**Rationale**: SC-007; the code map found two places where a third type would silently count as interviews.

## R10. Assistant

**Decision**: Skill `test-protocol-design` in `skills.ts` (English instructions, answer in the person's language, as the others): the nine points in order, realistic and simple tasks, one goal per task, no interface names, success criteria observable on screen, consent with the AI reading, SUS and SEQ offered not imposed. Progress `PROTOCOL_CHECKLIST` in `domain/protocol-progress.ts` with the weights of US2, keys added to the contract enum. Tools `PROTOCOL_TOOLS`: `check_protocol_tasks` (runs during the answer), `report_protocol_progress` (ends the answer), `propose_protocol` (card, `targetVersion`), and `publish_preparation` with documents `protocol` (which brings the participant sheet) and `best-practices`. Context: the protocol JSON (without the link fetched, FR-022), the research goal, `usabilityNextStep` text. Next step: protocol → folder → publication → checks → Fieldwork (when it exists).

**Rationale**: Mirrors the questionnaire wiring point by point (code map §3).

## R11. Design cost

**Decision**: `GET /api/studies/:studyId/protocol/design-cost`, the questionnaire's query with the skill name as a parameter (`answersWithSkill(studyId, 'test-protocol-design')`).

## R12. Anonymisation warning

**Decision**: `study-settings.tsx` is shown for usability test studies too (anonymise switch only; "text analysed" stays for interviews), with a fixed notice under the switch (FR-022a). The creation forms and the assistant card do not show the setting today, so nothing changes there.

**Rationale**: The setting is shown in one place; the warning goes where it is.

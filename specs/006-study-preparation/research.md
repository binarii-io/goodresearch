# Research: Study preparation

## R1. Guide design in the existing assistant, as a skill

- Decision: no second assistant. On the page of an interview study the person can act on, the context adds the current guide (JSON, version), the schedule counts and the **list of skills** (name and summary). The guide design method (adapted from the prototype's skill, generic) is a **skill** the assistant loads with `load_skill` when the person works on the guide: the tool returns its instructions, and the system context includes them in every later turn of that conversation (a `load_skill` record marks it loaded). Four tools are added to those of spec 005: `load_skill`, `check_guide_questions`, `report_guide_progress`, `propose_interview_guide`. The Preparation tab opens the panel on a new conversation and sends a fixed request as the person's message, so the start is visible and replayable.
- Rationale: one place for every AI conversation (spec 005), the same cost, history and privacy rules; the person can ask anything else in the same thread.
- Alternatives: a dedicated full-page chat (prototype) — duplicates the panel; a hidden "opening" instruction — the conversation would not start with the person (providers require it).

## R2. Writing the guide: a proposal, not a flag

- Decision: the prototype's `ready_to_write` flag and second "finalize" call become a tool call `propose_interview_guide { studyId, guide }` with the complete structured guide. It is validated with the same limits as the hand editor and shown as a card; Apply calls the research `saveGuide` command with the guide version seen at proposal time (`null` when there was none: then any existing guide makes it fail with `VERSION_CONFLICT`).
- Rationale: one model call instead of two, the person's Apply is the decision (constitution IV), the conditional claim of spec 005 gives "at most once".
- Alternatives: model writes Markdown parsed by the app — fragile; saving at once then undo — contradicts "AI proposes".

## R3. Progress (completeness)

- Decision: tool `report_guide_progress { studyId, objectives, hypotheses, audience, format, intro, themes, followUps, biasReview }`, each `missing | partial | done`, called last in an answer and recorded when called (research R9); it changes no research data, and its outcome is replayed to the model in the next turns. Weights 15/10/15/10/10/25/10/5; percentage = Σ weight × (0, ½, 1), rounded, computed in `assistant/domain/guide-progress.ts`. The panel shows the latest report of the open conversation (its preview carries the computed items).
- Rationale: same split as the prototype (the model judges coverage, the app computes the number), no new table.
- Alternatives: computing completeness from a saved guide only — says nothing during the dialogue.

## R4. Question identity

- Decision: each main question has an app id (`newId()`), passed in by the command. When a new version is saved: a question that carries the id of a question of the previous version keeps it (hand edits send ids); otherwise a question whose normalised text (lower case, collapsed spaces) equals a previous question not yet matched takes its id; otherwise a new id. The model never sends ids.
- Rationale: later features (coverage per question, Interview Quality) need stable ids; the model cannot be trusted with ids.

## R5. Where the documents live

- Decision: in the app. Downloads (guide Markdown, best practices Markdown, schedule CSV) are generated in the browser from data already loaded, in the interface language. The Drive grant stays `drive.readonly`.
- Rationale: least privilege (constitution VII), app as source of truth (context map, PublishedDocument), no new endpoint.
- Alternatives: Google Docs / Sheets in the study folder (prototype) — needs `drive.file`, a publishing port and failure handling (documents deleted in Drive); left to a later spec.

## R6. Schedule

- Limit: the 300-row check and the insert run in one transaction that locks the study row, so concurrent additions cannot pass it.

- Decision: `PlannedInterview` rows in the research module (Preparation phase), one aggregate per row with its own version; free-text interviewers; date and time as an instant (browser `datetime-local` converted to ISO with the browser's offset); at most 300 rows per study. The assistant gets counts per status only.
- Rationale: simplest useful schedule; personal data kept away from the model.
- Alternatives: rows inside the study aggregate — every edit would conflict with every other; linking to sessions — Fieldwork, later.

## R7. Gate

- Decision: guide and schedule reads and writes require `canAct` (team, then folder access, spec 002 FR-010a); without it the API answers `FOLDER_ACCESS_REQUIRED` (or `STUDY_NOT_FOUND` outside the team), the tab shows the same notice as the Analysis tab, and the assistant context has no guide.
- Rationale: the study page already hides everything but name and type without folder access.

## R8. Fake runner (dev stack, e2e)

- Decision: "design the interview guide" → `load_skill`, then (next step) a question and a `report_guide_progress` call (objectives partial, others missing); "write the guide" → `check_guide_questions`, then `propose_interview_guide` with a fixed four-section guide for the `Study id:` of the context. Like the AI SDK, the fake runs the tools that have a `run` and feeds their output to the next step.

## R9. Tools the app runs during an answer

- Decision: a gateway `ToolSpec` may carry `run(input, call)`; the AI SDK adapter maps it to `execute` and lets the model take up to 6 steps (`stopWhen: stepCountIs(6)`, usage summed over steps). Tools without `run` still end the answer (proposals). `load_skill` and `check_guide_questions` run this way and are recorded (state `applied`, or `invalid` with the reason told to the model) so the history replays them. `report_guide_progress` has no `run`: the skill asks for it last, so it ends the answer and is recorded when called (running it would cost one more model step only to read "Recorded", PR #6 review). Texts of successive steps are separated by a blank line.
- Rationale: the model must read a skill or a check result before going on; letting the SDK loop keeps provider-specific details (for example the signatures some models attach to their tool calls) intact within the answer.
- Alternatives: our own loop re-calling the model with the tool results — loses those details; ending the answer after each check — the person would have to say "go on".

## R10. Writing checks

- Decision: `assistant/domain/question-checks.ts`, pure rules on the lower-cased, normalised wording, English and French: closed (auxiliary first, "est-ce que", inverted verb first), leading ("don't you…?", "n'est-ce pas", ", non ?"), hypothetical ("if you had", "imagine", "si vous aviez"), future ("would you use", conditional + "-vous"), solution ("what feature", "que faudrait-il"), double (two question marks or "and how/why…"), long (> 30 words). The same checks are attached to a proposed guide's card.
- Rationale: a deterministic, testable rule set the model cannot argue with (constitution IV); heuristics flag, the person decides. Word boundaries are Unicode-aware (JavaScript's `\b` ignores accented letters).


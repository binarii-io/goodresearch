---
description: "Task list for 006-study-preparation"
---

# Tasks: Study preparation — interview guide with the assistant, best practices, interview schedule

## Phase 1: Foundational

- [X] T001 Contracts `packages/contracts/src/preparation.ts` (GuideContent with limits of data-model.md, InterviewGuide, SaveInterviewGuide, PlannedInterview, PlannedInterviewInput, params) + error codes `PLANNED_INTERVIEW_NOT_FOUND`, `SCHEDULE_FULL`; assistant `ProposalKind` + `ProposalPreview` (`studyName`, `guide`, `progress`)
- [X] T002 [P] Test-first `apps/api/src/modules/research/domain/interview-guide.ts` (limits: 1..12 sections, ≤60 questions, ≤8 follow-ups, ≤15 hypotheses, texts trimmed 1..600 / framing ≤4000, minutes 1..180; question identity research R4) in `research/tests/interview-guide.test.ts`
- [X] T003 [P] Test-first `research/domain/planned-interview.ts` (interviewee 1..120, role ≤120, interviewers ≤200, notes ≤2000, status set, edit) in `research/tests/planned-interview.test.ts`
- [X] T004 Schema `research_interview_guides`, `research_planned_interviews`; migrations 0013 (tables) and 0014 (FKs to auth_users, checks, proposal kinds); repositories (drizzle + in-memory fake)

## Phase 2: US2 + US3 — guide on the Preparation tab (P1/P2)

- [X] T005 [US2] Commands `saveGuide` (gate `canAct`, version or null, origin) and query `getGuide` in `research/application/{commands,queries}/preparation-*.ts`; tests with fakes
- [X] T006 [US2] Routes GET/PUT `/api/studies/:studyId/guide`; component tests (gate, conflict, validation, cascade on study delete)
- [X] T007 [P] [US2] `SegmentedProgress` in `packages/ui` with story (light/dark, axe)
- [X] T008 [US2] Web `features/preparation/guide-view.tsx`, `guide-markdown.ts` (download), `preparation-tab.tsx` (empty state, meta, actions) in the study page
- [X] T009 [US3] Web `guide-editor.tsx` (framing, hypotheses, sections, questions, follow-ups: add, edit, remove, move; "Write it myself" from four phases; conflict and validation messages)

## Phase 3: US1 — design with the assistant (P1)

- [X] T010 [P] [US1] Test-first `assistant/domain/guide-progress.ts` (weights, percent, unknown keys)
- [X] T011 [US1] Skill `assistant/application/skills.ts` (loaded with `load_skill`, kept in the context once loaded); writing checks `assistant/domain/question-checks.ts` (test-first); gateway `ToolSpec.run` + multi-step stream; context guide mode (guide JSON, version, schedule counts; nothing without access; never schedule names) with tests
- [X] T012 [US1] Tools `load_skill`, `check_guide_questions`, `report_guide_progress` (run during the answer), `propose_interview_guide` (validation, flagged questions on the card, study in context), tools per page, apply through `ResearchActions.saveGuide`, compose wiring; fake runner scripts (research R8); tests
- [X] T013 [US1] Web: `ask()` in assistant state, "Design with the assistant", progress strip in the panel, guide proposal card (summary, expandable guide)

## Phase 4: US4 — best practices (P2)

- [X] T014 [US4] `best-practices.{en,fr}.ts` (generic, thresholds of Interview Quality), dialog, download

## Phase 5: US5 — schedule (P2)

- [X] T015 [US5] Commands (create ≤300, update with version, delete), query (sorted, counts), routes; tests
- [X] T016 [US5] Web `schedule.tsx` (table, add/edit dialog, delete confirmation, summary per status, CSV)

## Phase 6: Polish

- [X] T017 i18n FR (catalogs), docs (context map: InterviewGuide, PlannedInterview, guide design progress, glossary, open question closed; README; ADR-0005 update), OpenAPI + client generation
- [X] T018 E2E `apps/web/e2e/preparation.spec.ts` (design flow, apply, edit, download, best practices, schedule) + axe; `pnpm check`, all tests; rebuild the local stack for testing

## Dependencies

T001 → T002–T004 → T005–T006 → T008–T009; T010–T012 need T005; T013 needs T012 and T008; T015 needs T004; T016 needs T015; T017–T018 last.

# Tasks: Create a research project with the assistant

**Input**: Design documents from `specs/018-agent-create-project/`

**Tests**: domain rules test-first (constitution V); use-case tests with fakes; e2e with the test provider; manual scenarios with a real model (spec SC-002).

## Phase 1: Setup

- [x] T001 Add `report_project_progress` to `ProposalKind`, and `question`, `decision`, `team` to the `GuideProgress` item keys, in packages/contracts/src/assistant.ts
- [x] T002 Add a migration allowing `report_project_progress` in `assistant_proposals_kind_check` (same form as 0014) in apps/api/drizzle/0042_project_framing.sql, with its journal entry and snapshot in apps/api/drizzle/meta/

## Phase 2: Foundational

- [x] T003 Write failing tests for the framing in apps/api/src/modules/assistant/tests/project-framing-domain.test.ts: weights (question 30, audience 20, decision 25, hypotheses 15, team 10), percentage, latest report by `decidedAt` whatever the list order, no framing after a later applied `create_project`, a report made after the card but before Apply, complete only with every point `done`
- [x] T004 Write failing tests for `composeGoal` in the same file: headings in English and French, empty hypotheses read "None yet" / "Aucune pour l'instant"
- [x] T005 Implement the checklist, `framingCompleteness`, `currentFraming`, `composeGoal` in apps/api/src/modules/assistant/domain/project-framing.ts
- [x] T006 Add `report_project_progress` to `PROPOSAL_KINDS` and `isRecordedAtOnce`, and `create_project` to `isRunDuringAnswer`, in apps/api/src/modules/assistant/domain/proposal.ts; widen `ProposalPreview.progress` keys in apps/api/src/modules/assistant/application/ports.ts
- [x] T007 Add the `project-framing` skill in apps/api/src/modules/assistant/application/skills.ts: one or two questions at a time, the five points and when each is done, no asking for what is known, helping choose a decision, report at the end of each answer, summary and agreement before proposing, team rules, no team, similar project, "just create it" and the form, proposing a first study once told a project was applied
- [x] T008 Make `load_skill` and `report_project_progress` available on every page in apps/api/src/modules/assistant/application/tools.ts; list skills by page and limit the "guide tools" hint to the guide skill in apps/api/src/modules/assistant/application/context.ts; add one line to `INSTRUCTIONS` asking to load the skill before framing a project

## Phase 3: User Story 1 - Frame a project in a dialogue (P1)

**Goal**: the dialogue and its progress. **Independent test**: US1's in spec.md.

- [x] T009 [US1] Write failing use-case tests in apps/api/src/modules/assistant/tests/assistant-create-project.test.ts: skill and tools offered on the home page; guide skill still not offered there; report recorded with the app's percentage; malformed report refused with the previous one standing; a valid proposal shows a card with the composed goal
- [x] T010 [US1] Let `runFor` work without a guide study, and record `report_project_progress`, in apps/api/src/modules/assistant/application/commands/send-message.ts; add its outcome in `outcomeOf`
- [x] T011 [US1] Change the `create_project` input to `name` (1–120), `teamId`, `question`, `objectives`, `hypotheses`; add the check that returns a prepared proposal with the composed goal in apps/api/src/modules/assistant/application/tools.ts
- [x] T012 [US1] Add the journey to the test provider script (research R8) in apps/api/src/modules/ai-gateway/infrastructure/fake.model-runner.ts
- [x] T013 [US1] Generalise `GuideProgressBar` to `ProgressBar` (latest report of either kind, its title and points) in apps/web/src/features/assistant/panel.tsx; hide `report_project_progress` as a card and add its title in apps/web/src/features/assistant/proposal-card.tsx; add the framing point labels in apps/web/src/features/assistant/
- [x] T014 [US1] Run `pnpm generate` and `pnpm --filter @goodresearch/web i18n:extract`, and translate the new strings in apps/web/src/locales/ using the glossary

## Phase 4: User Story 2 - A project is never proposed unframed (P1)

**Goal**: the app's guarantee. **Independent test**: US2's in spec.md.

- [x] T015 [US2] Write failing use-case tests in apps/api/src/modules/assistant/tests/assistant-create-project.test.ts: refused with no report, with a point not done, with an empty question or objectives, over 10,000 characters, with a team out of reach; each gives its reason during the answer, shows no card, and repeats the reason in the next message's history, and names only points and fields (FR-016); a new card dismisses the open one; second project after an applied one is refused until a new report; a stored card with only `goal` still applies
- [x] T016 [US2] Run `create_project` during the answer with the outputs of contracts/assistant.md, reading the proposals again from the store, in apps/api/src/modules/assistant/application/commands/send-message.ts
- [x] T017 [US2] Store the refusal reason in `error` and return it from `outcomeOf`; replay the model's call without the composed `goal` in `callInput`, in apps/api/src/modules/assistant/application/commands/send-message.ts

## Phase 5: User Story 3 - Continue on the new project (P2)

**Goal**: the journey goes on after Apply. **Independent test**: US3's in spec.md.

- [x] T018 [US3] Write failing use-case tests in apps/api/src/modules/assistant/tests/assistant-create-project.test.ts: continue streams without a person's message and with the project's context; refused with `NOTHING_TO_CONTINUE` otherwise and on a second call; its call is in the ledger and the conversation's cost; a provider failure leaves the project in place
- [x] T019 [US3] Split `send` so the person's message is optional and add `continue` in apps/api/src/modules/assistant/application/commands/send-message.ts; add `NOTHING_TO_CONTINUE` to the HTTP error mapping
- [x] T020 [US3] Add `ContinueAssistantConversation` in packages/contracts/src/assistant.ts, and `POST /api/assistant/conversations/:conversationId/continue` sharing the streaming code in apps/api/src/modules/assistant/infrastructure/http.routes.ts; run `pnpm generate`
- [x] T021 [US3] Add the continue call in apps/web/src/features/assistant/stream.ts; in apps/web/src/features/assistant/panel.tsx, after Apply succeeds on `create_project`, navigate to the project and continue once the panel is not busy, with no person's bubble; keep Stop working; signal Apply from apps/web/src/features/assistant/proposal-card.tsx
- [x] T022 [US3] Hide the framing bar once its project is applied in apps/web/src/features/assistant/panel.tsx

## Phase 6: User Story 4 - Teams, duplicates and impatience (P2)

**Goal**: the cases around the dialogue. **Independent test**: US4's in spec.md, with a real model.

- [x] T023 [US4] Write a use-case test in apps/api/src/modules/assistant/tests/assistant-create-project.test.ts: with no team, the context says "none" and any proposal is refused
- [x] T024 [US4] (Nothing to change after the maintainer's test) After the maintainer's run of the manual scenarios (T030), refine the skill wording in apps/api/src/modules/assistant/application/skills.ts

## Phase 7: Polish

- [x] T025 Write the e2e journey in apps/web/e2e/assistant-create-project.spec.ts: progress, no early card, Apply opens the project, the study card follows, cost shown, axe in light and dark, English and French
- [x] T026 Update the journey in docs/agent-journeys/01-create-project.md ("Today" matches what is delivered, status, gaps) and docs/agent-journeys/README.md
- [x] T027 [P] Update docs/domain/context-map.md: project framing, skill list, tools run during the answer, continuing answer; check apps/api/README.md
- [x] T028 Update, as each change lands, the tests that fixed the former behaviour (guide tools by page, `create_project` input) in apps/api/src/modules/assistant/tests/
- [x] T029 Run `pnpm check`, `pnpm test`, `pnpm e2e` (quickstart.md)
- [x] T030 Restart the local stack; the maintainer runs the manual scenarios in English and French with a real model (SC-002), and checks the page opens under one second (SC-005), before any push

## Dependencies

- Phase 1 → Phase 2 → US1 → US2 → US3 → US4 → Polish. US2 and US3 change the same use case as US1, so they follow it.
- T003 and T004 before T005 (test-first). Each story's failing tests come first.

## Parallel

- T027 alongside T026. Other tasks share `send-message.ts`, `tools.ts` or `panel.tsx`, so they run in order.

## Implementation strategy

MVP: Phases 1 to 4 (dialogue plus guarantee), checkable with a real model. US3 and US4 complete the journey in the same pull request.

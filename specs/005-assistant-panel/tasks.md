---
description: "Task list for 005-assistant-panel"
---

# Tasks: Assistant chat in a side panel

## Phase 1: Foundational

- [X] T001 Gateway: tools (`name`, `description`, Zod input) and stream parts (`text`, `tool-call`) in `ai-gateway` ports, gateway and AI SDK runner (tools without `execute`, history with tool calls and results); fake runner scripts (research R7); tests
- [X] T002 Contracts `packages/contracts/src/assistant.ts` + error codes `CONVERSATION_NOT_FOUND`, `PROPOSAL_NOT_FOUND`, `PROPOSAL_DECIDED`
- [X] T003 Assistant module skeleton, schema + migration (FKs, checks), compose wiring (gateway, research and ingestion ports), account deletion hook

## Phase 2: US1 — chat (P1) 🎯 MVP

- [X] T004 [P] [US1] Test-first `domain/history.ts` (budget) and `domain/conversation.ts` (titles, statuses)
- [X] T005 [US1] Use case `send-message` (store person message, stream assistant message, save partial on abort, failure codes, ledger task `assistant`) with the fake runner
- [X] T006 [US1] SSE route, conversation routes; API component tests (stream, abort, privacy)
- [X] T007 [US1] `AppShell` right panel slot (animated width, phone full screen, reduced motion), assistant toggle button in the top bar, focus management, remembered state; stories
- [X] T008 [US1] Web conversation view: log, streaming reader hook, stop, Markdown subset renderer, failure notice

## Phase 3: US2 — context (P1)

- [X] T009 [P] [US2] Test-first context builder with fake research/ingestion ports (no folder name without access, nothing from inaccessible pages)
- [X] T010 [US2] Page reference from the router; "Looking at" line

## Phase 4: US3 — actions (P1)

- [X] T011 [P] [US3] Test-first proposal validation and state transitions (`domain/proposals.ts`)
- [X] T012 [US3] Tools in `send-message`; `apply` and `dismiss` through research commands (permissions, versions), outcome in the next turn; component tests
- [X] T013 [US3] Web proposal card (values, Apply, Dismiss, result link, final states), refresh of affected queries

## Phase 5: US4 — conversations (P2)

- [X] T014 [US4] List, new, rename, delete (API + web), titles from the first message

## Phase 5b: US5 — opening pages (P2)

- [X] T016 [US5] Tools `open_project` / `open_study` (validated with the person's access, applied at once, outcome told to the model), projects list in the context, migration 0009; browser navigates on the live event only; "Opened …" line with link; tests and e2e

## Phase 5c: US6 — cost (P2)

- [X] T017 [US6] Dated price catalog (`ai-gateway/domain/pricing.ts`, `AI_PRICES` overrides), `ref` on usage entries (migration 0010), costs per assistant message, conversation `cost` (total, last), cost circle with tooltip; tests and e2e

## Phase 6: Polish

- [X] T015 i18n FR; docs (context map: Assistant context and glossary, README, ADR-0006 note on the panel); e2e (panel, chat, apply/dismiss, list, phone) + axe; quickstart

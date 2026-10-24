# Implementation Plan: Assistant chat in a side panel

**Branch**: `005-assistant-panel` | **Date**: 2026-10-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-assistant-panel/spec.md`

## Summary

New **assistant** module: conversations, messages and action proposals per person; a streaming endpoint that builds the page context on the server, calls the AI Gateway (spec 004) with the conversation and a fixed set of **proposal tools without execution**, streams text and proposals to the browser (server-sent events), and stores everything. Applying a proposal runs the existing research commands through ports, with the person's permissions. The web app gets an animated right panel in the shell (pushes content, full screen on phones), a button next to the language switch, the conversation list, and proposal cards. Decisions in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 7 / Node 24 (unchanged)

**Primary Dependencies**: no new runtime dependency; the AI SDK tools are declared without `execute` (the model proposes, the app decides)

**Storage**: PostgreSQL: `assistant_conversations`, `assistant_messages`, `assistant_proposals`

**Testing**: Vitest (proposal validation, context building, history budget, use cases with a scripted fake runner), API component tests with Testcontainers (streaming, apply, permissions, privacy), Playwright (panel, animation state, chat, apply and dismiss with the dev test provider)

**Target Platform / Project Type**: unchanged

**Performance Goals**: first streamed bytes < 3 s (provider permitting); panel transition 200 ms

**Constraints**: context built server-side with the person's permissions; nothing applied without "Apply"; no HTML from the model; history budget 30 messages / 40 000 characters

**Scale/Scope**: 1 module, ~8 endpoints, 1 shell panel, 5 proposal kinds

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I. Spec-driven | Spec, plan, tasks in `specs/005-…` | ✅ |
| II. DDD pragmatic | Conversation aggregate (messages, proposals with state transitions); actions through other modules' commands via ports | ✅ |
| III. Provider-agnostic | Tools and stream parts are our own port types; AI SDK only in the runner adapter | ✅ |
| IV. AI proposes, humans decide | Proposal tools have no execution; apply only on explicit action, once; dismissed proposals told to the model | ✅ |
| V. Test-first | Proposal validation, state transitions, context building test-first | ✅ |
| VI. Contracts | Zod for HTTP, SSE events, tool inputs (model output) | ✅ |
| VII. Privacy | Conversations private per person, deleted with the account; context limited to what the person can see; no file names | ✅ |
| VIII. a11y & i18n | Panel focus management, log role, reduced motion, EN/FR | ✅ |
| IX. Simplicity | SSE over fetch, no websocket, no chat SDK on the client | ✅ |

## Project Structure

```text
specs/005-assistant-panel/  plan.md · research.md · data-model.md · contracts/http-api.md · quickstart.md · tasks.md
apps/api/src/modules/ai-gateway/   # + tools and stream parts in ModelRunner/Gateway (proposal tool calls)
apps/api/src/modules/assistant/
├── domain/        conversation.ts (proposal states), proposals.ts (kinds, validation), history.ts (budget), instructions.ts
├── application/   ports.ts (store, gateway, research actions, page context), commands (send, apply, dismiss, rename, delete), queries
├── infrastructure/ schema.ts, drizzle store, http.routes.ts (SSE), module.ts
└── tests/
apps/web/src/
├── features/assistant/  panel.tsx, conversation.tsx, proposal-card.tsx, use-assistant-stream.ts, page-context.ts, markdown.tsx
└── routes/_authenticated.tsx  # panel in the shell, button in the top bar
packages/ui/src/components/app-shell.tsx  # right panel slot, animated
```

## Implementation phases (input for `/speckit-tasks`)

1. **Foundational**: gateway tools and stream parts (runner + fake runner script), assistant schema + migration, contracts, module wiring, account deletion hook.
2. **US1 chat**: send + SSE stream + stop + persistence; shell panel (animation, focus, remembered state, phone), button.
3. **US2 context**: page reference from the route; server-side context builder through research/ingestion ports.
4. **US3 actions**: proposal tools, validation, cards, apply/dismiss through research commands, outcome told to the model.
5. **US4 conversations**: list, new, rename, delete; titles.
6. **Polish**: i18n FR, docs (context map: Assistant context, README), e2e + axe.

## Complexity Tracking

None.

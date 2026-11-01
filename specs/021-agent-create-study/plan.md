# Implementation Plan: Create a study with the assistant

**Branch**: `021-agent-create-study` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

## Summary

Reuse the mechanics of spec 018: a skill, a progress report, a tool run during the answer that refuses while a point is open, a card, then an answer that continues after Apply. Add a research command creating a study in no project, used by the card and by a dialog on the team's Studies page.

## Technical Context

TypeScript, Fastify, Zod, Drizzle/PostgreSQL, React, TanStack, Lingui, Vitest, Playwright. One migration, for the new proposal kind. No new AI step: the continuing answer is one more call of the assistant, already recorded and counted per answer.

## Constitution Check

- Domain imports nothing from frameworks: the framing is a pure module. Pass.
- Commands change one aggregate and return `Result`. Pass.
- The person decides (IV): a card, applied through the app's commands. Pass.
- AI cost shown: the continuing answer counts in the conversation's cost. Pass.
- UI through Lingui and `packages/ui`. Pass.

## Structure

- `apps/api/src/modules/assistant`: `domain/study-framing.ts`, `domain/proposal.ts`, `application/{tools,skills,context,ports}.ts`, `application/commands/{send-message,proposal-commands}.ts`.
- `apps/api/src/modules/research`: `domain/study.ts`, `application/commands/study-commands.ts`, `infrastructure/http.routes.ts`.
- `apps/web/src`: `features/assistant/{panel,proposal-card,state,labels}`, `features/research/create-team-study-dialog.tsx`, `routes/_authenticated/team-studies/$teamId.tsx`.
- `packages/contracts`, `apps/api/drizzle/0046_*`, the test script in `fake.model-runner.ts`.

See [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/api.md), [quickstart.md](quickstart.md).

# AGENTS.md

Guide for contributors and coding agents. Read before changing anything.

## Read first

1. [Constitution](.specify/memory/constitution.md) — rules that always apply.
2. [Engineering standards](docs/standards.md) — layout, patterns, naming, tests.
3. [Context map](docs/domain/context-map.md) — use its terms in code, API, UI and specs.
4. The spec of the feature you work on: `specs/NNN-slug/`.

## Workflow

- New feature → Spec Kit: `/speckit-specify`, `/speckit-clarify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`, `/speckit-implement`. No feature code without a spec.
- Bug fix / refactor / chore → branch `fix/…`, `chore/…`, `docs/…`; tests still required.
- Never commit to `main`. PR title in Conventional Commits; squash merge.
- Update docs in the same change: package README, ADR for structuring decisions, context map for language changes.

## Hard rules

- Domain layer imports nothing from frameworks, ORM, HTTP or SDKs.
- Commands change one aggregate and return `Result`; queries read SQL into DTOs and never touch aggregates.
- Modules import each other only through `index.ts`; never another module's tables.
- Validate every boundary input with Zod; never trust AI output (verify quotes and ids).
- Every AI call goes through the AI Gateway, is recorded in the usage ledger, and its cost is shown in the screen that uses it (not only in the assistant panel).
- No company or customer context and no real person's data in code, tests, fixtures, prompts or docs. Vendors appear only in adapters and docs, never in domain or application code.
- Every user-facing string goes through Lingui (long-form content documents: one typed module per language, ADR-0006); every UI piece comes from `packages/ui`.
- Domain rules are written test-first; prefer fakes over mocks.
- Code, comments, docs and commits in English. UI strings in English and French, using the [bilingual glossary](docs/domain/context-map.md#bilingual-glossary).
- License AGPL-3.0-only (`"license": "AGPL-3.0-only"` in every `package.json`).

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Install everything (pnpm 12, versions pinned in the `pnpm-workspace.yaml` catalog) |
| `pnpm check` | Biome (format + lint), `tsc` on every package, dependency-cruiser boundaries, knip |
| `pnpm test` | All Vitest projects: `api:unit`, `api:int` (Docker needed), `shared`, `config`, `contracts`, `ui` (browser + axe) |
| `pnpm exec vitest run --project api:unit` | Fast domain and use-case tests only |
| `pnpm e2e` | Playwright + axe; needs `docker compose -f compose.yaml -f compose.dev.yaml up --build` running (project `goodresearch-dev`, its own database; stop the `compose.yaml` stack first, both use port 3000) |
| `pnpm generate` | OpenAPI export and API client generation (CI fails if outdated) |
| `pnpm --filter @goodresearch/web i18n:extract` | Update translation catalogs after changing UI strings (CI fails if outdated) |
| `pnpm --filter @goodresearch/api db:generate` | New migration from the Drizzle schemas |
| `pnpm --filter @goodresearch/ui storybook` | Design system workbench |
| `pnpm build` | Build the web app |

With Colima, export `DOCKER_HOST=unix://$HOME/.colima/default/docker.sock` and `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock` before running integration tests.

Maintainers merge pull requests locally (squash, then fast-forward `main`) rather than with the GitHub merge button, so commit metadata stays under their control.

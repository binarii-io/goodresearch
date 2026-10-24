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
- No company or customer context and no real person's data in code, tests, fixtures, prompts or docs. Vendors appear only in adapters and docs, never in domain or application code.
- Every user-facing string goes through Lingui; every UI piece comes from `packages/ui`.
- Domain rules are written test-first; prefer fakes over mocks.
- Code, comments, docs and commits in English. UI strings in English and French, using the [bilingual glossary](docs/domain/context-map.md#bilingual-glossary).
- License AGPL-3.0-only (`"license": "AGPL-3.0-only"` in every `package.json`).

## Commands

To be filled when the monorepo is scaffolded (install, dev, test, lint, typecheck, build).

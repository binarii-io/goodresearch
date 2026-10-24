<!--
Sync Impact Report
- Version: 0.0.0 → 1.0.0 (initial ratification)
- Principles added: I–IX
- Templates: plan-template.md "Constitution Check" applies these principles as gates (no template change needed)
- License: AGPL-3.0-only + CLA (ADR-0007)
-->

# goodresearch Constitution

goodresearch is an open-source, self-hostable, provider-agnostic application for user research. This constitution holds the non-negotiable rules. How to apply them is in [docs/standards.md](../../docs/standards.md); why they were chosen is in [docs/adr/](../../docs/adr/).

## Core Principles

### I. Spec-Driven Development (NON-NEGOTIABLE)

Every feature goes through Spec Kit: `/speckit-specify` → (`/speckit-clarify`) → `/speckit-plan` → `/speckit-tasks` → (`/speckit-analyze`) → `/speckit-implement`.

- No feature code without a spec in `specs/NNN-slug/` merged in the same PR.
- Specs describe **what and why** in the ubiquitous language of [docs/domain/context-map.md](../../docs/domain/context-map.md); plans describe **how**.
- Bug fixes that restore specified behaviour, refactors and chores may skip Spec Kit but still need tests.

### II. Domain-Driven Design, pragmatic

- The code is a **modular monolith**: one module per bounded context (context map).
- Core contexts use a **domain model**: aggregates protect their invariants, are referenced by ID only, and one transaction changes one aggregate. Supporting and generic contexts may use plain handlers over the database.
- The **domain layer is pure**: no framework, ORM, HTTP, SDK or I/O import.
- **Commands and queries are separated**: commands go through aggregates and return `Result`; queries bypass the domain and read the database directly into DTOs.
- Modules talk through their public API (`index.ts`) or domain events. No module reads another module's tables or internals. Enforced in CI.
- No pattern without a need: no base-class hierarchies, no command bus, no DI container, no event sourcing, no value object for every primitive.

### III. Provider-Agnostic & Self-Hostable

- Nothing in the code ties the product to a cloud, a vendor or a company. External services sit behind **ports** with swappable **adapters**: LLM, file sources, object storage (S3 API), identity (OIDC), document publishing.
- The only hard runtime dependencies are **PostgreSQL** and an **S3-compatible store**. Everything runs with `docker compose up`, including login (built-in accounts; OIDC optional).
- Configuration is environment-only (12-factor), validated at boot with a readable error.
- No company or customer context and no real person's data in code, tests, fixtures, prompts or docs. Naming adapter targets, libraries and cited authors in docs is fine.

### IV. AI Proposes, Humans Decide

- AI output is a **proposal** (`proposed`) until a human validates or rejects it. A new AI pass never overwrites a human decision or an `edited` object, never re-adds a removed link, and never re-proposes a rejected item.
- Anything the AI quotes from a source is verified verbatim, otherwise discarded.
- Metrics and scores (confidence, polarity, shares, priority) are computed deterministically by the app, never by the model.
- Every AI call goes through the AI Gateway, uses schema-constrained output and is recorded in the usage ledger.

### V. Test-First on the Domain (NON-NEGOTIABLE)

- Domain rules and invariants are written test-first (red → green → refactor).
- Test pyramid: pure domain unit tests; use-case tests with **in-memory fakes, not mocks**; repository contract tests run against both fake and real adapters; integration tests on real PostgreSQL (Testcontainers); a few end-to-end tests (Playwright) per critical flow.
- No merge with a failing or skipped test. Coverage is not a goal; every business rule in a spec has at least one test.

### VI. Type Safety & Explicit Contracts

- TypeScript strict everywhere (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` unless opted out per package with a reason).
- Every input crossing a boundary (HTTP, job payload, env, AI output, external API) is validated with Zod.
- The API contract is OpenAPI, generated from the Zod schemas; the web client is generated from it. No hand-written duplicate types.
- Expected business failures are values (`Result`); exceptions are for bugs and infrastructure failures.

### VII. Privacy by Design

- Research data contains personal data. Exports and AI inputs for synthesis are **pseudonymised** (stable participant pseudonyms, no names).
- Least privilege on external sources (read-only unless writing is the feature). Nothing is ever deleted in an external source.
- Secrets and personal data never appear in logs (structured logging with redaction).

### VIII. Accessible & International UI

- The UI meets **WCAG 2.2 AA**, checked by axe in Storybook and in end-to-end tests.
- All UI text goes through i18n (French and English at minimum). No hard-coded user-facing strings.
- UI is built from the design system package; no one-off styling outside it.

### IX. Simplicity

- Start with the simplest thing that satisfies the spec (YAGNI). Any extra complexity (new service, new dependency, new pattern) is justified in the plan's *Complexity Tracking* table or an ADR.
- Prefer boring, maintained, widely used tools. A new runtime dependency needs a reason in the PR.

## Engineering Constraints

- Stack (see ADR-0002 to ADR-0006): TypeScript, pnpm + Turborepo monorepo, Fastify, Zod, PostgreSQL + Drizzle, pg-boss, Vercel AI SDK, Better Auth (OIDC), React + Vite + TanStack Router/Query, design system on shadcn/Base UI + Tailwind, Lingui, Biome, Vitest, Playwright, Testcontainers.
- Database changes only through versioned migrations, applied by the `migrate` entrypoint before the app starts.
- Documentation is part of the change: README of the touched package, ADR for structuring decisions, context map for any change of ubiquitous language.

## Development Workflow & Quality Gates

- Work on a branch, merge through a PR (squash). PR titles follow Conventional Commits. Feature branches come from Spec Kit (`NNN-slug`).
- CI must be green: format, lint, typecheck, unused code (knip), architecture boundaries, unit + integration tests, build. E2E and accessibility checks on critical flows.
- At least one review per PR. The reviewer checks the spec, the constitution gates and the docs.
- The project is licensed AGPL-3.0-only; external contributions are merged only once the contributor has signed the CLA (ADR-0007).
- Code, docs and commits are in English; UI terms follow the bilingual glossary of the context map.

## Governance

- This constitution supersedes any other practice. Plans run the *Constitution Check* gate before and after design.
- Amendments go through a PR that updates this file, bumps its version (MAJOR: principle removed or redefined; MINOR: principle added or materially extended; PATCH: wording), and updates impacted templates, standards and ADRs.
- Runtime guidance for contributors and coding agents lives in [AGENTS.md](../../AGENTS.md).

**Version**: 1.0.0 | **Ratified**: 2026-10-24 | **Last Amended**: 2026-10-24

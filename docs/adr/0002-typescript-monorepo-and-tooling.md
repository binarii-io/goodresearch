---
status: accepted
date: 2026-10-24
---

# ADR-0002 — TypeScript monorepo and tooling

## Context and problem statement

The product is an open-source web app (React front, API, background workers) maintained by a small team and outside contributors. We need one language, shared types between front and back, and a fast, low-maintenance toolchain.

## Decision drivers

- One language and shared contracts across front and back.
- Contributor-friendly: few tools, fast feedback.
- Current, maintained tools (checked 2026-10-24).

## Considered options

- **Language**: TypeScript end-to-end · Python backend + TS front. The AI SDK ecosystem in TS now covers our needs; a single language with shared Zod contracts outweighs Python's ML ecosystem for this app.
- **Monorepo**: pnpm workspaces + Turborepo · Nx · npm workspaces. Nx is heavier; npm lacks catalogs.
- **Lint/format**: Biome · oxlint + type-aware (tsgolint) + formatter · ESLint 10 + typescript-eslint + Prettier. typescript-eslint does not support TypeScript 7 yet; oxlint type-aware needs a second formatter tool.

## Decision outcome

- **TypeScript 7** (`tsc --noEmit` for type checking; TS 7 ships the native compiler as `tsc`), strict presets in `packages/tsconfig`.
- **pnpm workspaces + Turborepo**, shared versions in the pnpm **catalog**, `minimumReleaseAge: 4320` (minutes, i.e. 3 days).
- **Biome** for formatting and linting (single config). Revisit oxlint type-aware rules if floating-promise bugs show up.
- **Vitest** (projects), **Playwright** + axe, **Testcontainers** for PostgreSQL.
- **knip** (unused code/deps) and **dependency-cruiser** (module boundaries, ADR-0003) in CI.
- **lefthook** for git hooks; **Renovate** for updates; **release-please** for versions and changelog; PR-title check for Conventional Commits (no commitlint).
- GitHub Actions, actions pinned by SHA.

### Consequences

- Good: one toolchain, fast checks, types shared end-to-end.
- Bad: TS 7 is recent; some tools may lag. Mitigation: every tool's version is pinned in the catalog and upgraded by Renovate.

## Update 2026-10-24 — TypeScript 6 API alias and native type stripping (spec 001)

- **TS 6 API alias.** TypeScript 7.0 ships no stable programmatic API (expected in 7.1), and dependency-cruiser requires it. The pnpm catalog maps `@typescript/native` to `typescript@7` (provides `tsc`) and `typescript` to `@typescript/typescript6` (API for tools). Remove the alias once TS 7.1 and dependency-cruiser support it.
- **No build step for Node code.** The API runs on Node 24 LTS with native type stripping (`node src/server.ts`). TypeScript code therefore uses **erasable syntax only** (`erasableSyntaxOnly`): no enums, no parameter properties, no runtime namespaces; explicit `.ts` import extensions; `import type` for types. tsdown stays the fallback if a dependency ever requires transpilation.
- **Vitest 5** projects: one config per package; integration tests in a separate project with the Testcontainers global setup.
- **Biome**: `nursery.noFloatingPromises` set to `error` explicitly.

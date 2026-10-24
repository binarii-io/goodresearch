# Implementation Plan: Walking skeleton — sign-in, team access and research projects

**Branch**: `001-walking-skeleton` | **Date**: 2026-10-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-walking-skeleton/spec.md`

## Summary

First vertical slice of goodresearch: provider-only sign-in (OpenID Connect, Google documented), admin/member roles with team-based access, teams, research projects, access history, anonymised deletion, EN/FR and WCAG 2.2 AA. Technically it scaffolds the whole monorepo defined by the ADRs — Fastify API with two DDD modules (`workspace`, `research`), generated OpenAPI client, React SPA, design system package, Docker image and compose stack, CI — so every later feature only adds modules and screens. Details in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 7.0.2 (`tsc`), TS 6.0.2 API alias for tooling; Node 24 LTS running TS natively (erasable syntax only)

**Primary Dependencies**: Fastify 5.12, fastify-type-provider-zod 7, Zod 4.6, Better Auth 1.7 (genericOAuth), Drizzle 0.45, pg-boss 12 (worker skeleton only), React 19.3, Vite 8.3, TanStack Router 1.170 / Query 5.104, orval 8, Tailwind 4.3, shadcn 4.22 + Base UI 1.9, Lingui 6.10, Storybook 10.6

**Storage**: PostgreSQL 18 (Drizzle migrations via the `migrate` entrypoint); S3-compatible store (SeaweedFS 4.48 in compose) wired but unused by this feature

**Testing**: Vitest 5 (projects: domain/use-case unit, `api:int` with Testcontainers PostgreSQL, Storybook browser tests with axe), Playwright 1.64 + axe for e2e against compose with the mock OpenID Connect provider

**Target Platform**: Linux containers (one image, entrypoints `server`, `worker`, `migrate`); evergreen browsers

**Project Type**: web application (API + SPA) in a pnpm/Turborepo monorepo

**Performance Goals**: interactive lists and saves feel instant (p95 API < 300 ms at the spec's scale on a small VM)

**Constraints**: no passwords stored; no external service besides PostgreSQL, S3 and the deployer's identity provider; every UI string in EN and FR; WCAG 2.2 AA

**Scale/Scope**: 500 accounts, 100 teams, 2,000 projects per instance; ~12 screens

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| I. Spec-driven | Spec merged in the same PR; plan and tasks from Spec Kit | ✅ |
| II. DDD pragmatic | `workspace` (generic: aggregates only where invariants exist — Account last-admin rule, Team name uniqueness) and `research` (core: Project aggregate). Commands vs queries separated; cross-module via `index.ts` only; dependency-cruiser rules in CI | ✅ |
| III. Provider-agnostic & self-hostable | Generic OpenID Connect (Google is a preset, not a dependency in code); S3 API; env-only config validated at boot; `docker compose up`; no company data | ✅ (constitution amended to 1.1.0: provider-only sign-in) |
| IV. AI proposes, humans decide | No AI in this feature | N/A |
| V. Test-first on the domain | SignInPolicy, AccessPolicy, Account and Team invariants, Project rules written test-first; fakes for use cases; contract tests for repositories; Testcontainers integration | ✅ |
| VI. Type safety & contracts | TS strict + `exactOptionalPropertyTypes`; Zod at every boundary (HTTP, env, OIDC claims); OpenAPI generated, client generated, CI no-diff check; `Result` for business errors | ✅ |
| VII. Privacy by design | No passwords; anonymised deletion; access history; no secrets or emails in logs (pino redaction) | ✅ |
| VIII. Accessible & international | Lingui EN/FR with strict compile; axe in Storybook and Playwright; all UI from `packages/ui` | ✅ |
| IX. Simplicity | One workspace per instance; no admin plugin; no jobs yet (worker entrypoint only); token pipeline deferred | ✅ |

**Post-design re-check**: passed — the data model keeps one aggregate change per transaction (memberships inside Account; access events written in the same transaction), queries read SQL directly, no new pattern beyond the standards.

## Project Structure

### Documentation (this feature)

```text
specs/001-walking-skeleton/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   └── configuration.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
package.json · pnpm-workspace.yaml (catalog) · turbo.json · biome.json · .dependency-cruiser.cjs
knip.json · lefthook.yml · renovate.json · vitest.config.ts · .env.example
.github/workflows/ci.yml · .github/pull_request_template.md · .github/ISSUE_TEMPLATE/

apps/api/
├── src/
│   ├── server.ts · worker.ts · migrate.ts · compose.ts · export-openapi.ts
│   ├── platform/                # db, auth (Better Auth wiring), http (errors, session preHandler), logger, storage
│   └── modules/
│       ├── workspace/
│       │   ├── index.ts
│       │   ├── domain/          # account.ts, team.ts, access-policy.ts, sign-in-policy.ts, *.errors.ts, *.repository.ts
│       │   ├── application/
│       │   │   ├── commands/    # create-team, rename-team, delete-team, grant-team-access, remove-team-access,
│       │   │   │                # change-role, deactivate-account, reactivate-account, delete-account, set-language
│       │   │   └── queries/     # get-me, list-members, get-access-history, list-teams, get-access-context
│       │   ├── infrastructure/  # schema.ts (auth + workspace tables), drizzle repositories, http.routes.ts
│       │   └── tests/
│       └── research/
│           ├── index.ts
│           ├── domain/          # project.ts, project.errors.ts, project.repository.ts
│           ├── application/
│           │   ├── commands/    # create-project, rename-project, update-project-goal, move-project-to-team
│           │   └── queries/     # list-projects, get-project, count-projects-by-team
│           ├── infrastructure/  # schema.ts, drizzle repository, http.routes.ts
│           └── tests/
├── drizzle/                     # generated migrations
└── tests/                       # API component tests (inject + real DB)

apps/web/
├── src/
│   ├── app/                     # providers, router, i18n, query client
│   ├── routes/                  # sign-in, _authenticated/{index, projects/$id, teams, members, members/$id}
│   ├── features/{workspace,research}/
│   └── locales/{en,fr}/messages.po
├── e2e/                         # Playwright + axe
└── vite.config.ts · lingui.config.ts

packages/
├── contracts/   # Zod DTOs, commands, error codes (shared api/web)
├── api-client/  # openapi.json + orval output (generated)
├── ui/          # design system: tokens, components, Storybook
├── config/      # env schema + loader
├── shared/      # Result, branded ids, Clock, uuidv7
└── tsconfig/    # base.json, node.json, bundler.json

compose.yaml · compose.dev.yaml (test provider, sample access rules)
docker/
├── Dockerfile · entrypoint.sh · mock-oidc.json
```

**Structure Decision**: monorepo as defined in [docs/standards.md](../../docs/standards.md#1-repository-layout); this feature creates every app and package, and the first two API modules.

## Implementation phases (input for `/speckit-tasks`)

1. **Foundation** — workspace tooling (catalog, turbo, Biome, tsconfig presets, Vitest projects, dependency-cruiser, knip, lefthook), `packages/shared`, `packages/config`, CI workflow, Docker + compose skeleton with `/health` and `/ready`.
2. **Platform** — Fastify server, problem+json errors, pino with redaction, Drizzle + migrate entrypoint, Better Auth wiring with genericOAuth from config, session preHandler (active account, 30-day cap), OpenAPI export + orval client, SPA serving.
3. **Domain first (tests first)** — SignInPolicy, AccessPolicy, Account, Team, Project aggregates with their invariants.
4. **US1** sign-in + first team; **US2** projects; **US3** members, access, history, deletion; **US4** teams; **US5** i18n + a11y hardening — each: commands/queries → routes → screens → e2e.
5. **Docs** — README (deploy, Google setup), package READMEs, `AGENTS.md` commands section, ADR-0002 update (TS 6 alias, Node type stripping).

## Complexity Tracking

No constitution violation to justify.

| Deviation | Why | Simpler alternative rejected because |
|---|---|---|
| TS 6 API alias next to TS 7 | dependency-cruiser needs the TS API | dropping boundary checks breaks principle II enforcement |
| Custom 30-day absolute session cap | not supported by the auth library | spec FR-009 requires it |

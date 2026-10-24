---
description: "Task list for 001 walking skeleton"
---

# Tasks: Walking skeleton — sign-in, team access and research projects

**Input**: Design documents from `specs/001-walking-skeleton/` — [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Required. Constitution V makes domain rules test-first; SC-004/005/007/009/010 are verified by automated tests. Domain and use-case test tasks come **before** their implementation and must fail first.

**Organization**: by user story (spec priorities). Paths follow the plan's structure. Read [docs/standards.md](../../docs/standards.md) before any task.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an unfinished task)
- **[Story]**: US1…US5 from spec.md

---

## Phase 1: Setup (shared infrastructure)

**Purpose**: monorepo, tooling and CI, with no product code.

- [X] T001 Create root `package.json` (private, `"license": "AGPL-3.0-only"`, `"type": "module"`, `engines.node ">=24.22 <25"`, scripts `check`, `test`, `e2e`, `dev`, `build`), `pnpm-workspace.yaml` with `apps/*`, `packages/*`, `minimumReleaseAge: 4320` and a `catalog:` holding every version pinned in research.md (including `"@typescript/native": npm:typescript@7.0.2` and `typescript: npm:@typescript/typescript6@6.0.2`), and `.npmrc`
- [X] T002 Create `turbo.json` with tasks `lint`, `typecheck`, `test`, `test:int`, `build`, `generate` (cache outputs, `dependsOn: ["^build"]` where needed)
- [X] T003 [P] Create `packages/tsconfig/{package.json,base.json,node.json,bundler.json}` with the options listed in research.md R1 (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`, `erasableSyntaxOnly`, `allowImportingTsExtensions`, `noEmit`, explicit `types`)
- [X] T004 [P] Create root `biome.json` per research.md R6 (a11y error, `noDefaultExport` with override for configs/stories, `noEnum`, `noExplicitAny`, `noNonNullAssertion`, `nursery.noFloatingPromises: "error"`, generated files excluded)
- [X] T005 [P] Create root `vitest.config.ts` with `projects: ["apps/*/vitest.config.ts", "packages/*/vitest.config.ts"]`
- [X] T006 [P] Create `.dependency-cruiser.cjs` with rules `domain-pure`, `application-no-infra`, `modules-via-index`, `no-foreign-tables` (research.md R6) and root script `depcruise`
- [X] T007 [P] Create `knip.json` (workspaces, ignore generated files and `routeTree.gen.ts`) and `lefthook.yml` (pre-commit: `biome check --staged`)
- [X] T008 [P] Create `renovate.json` (`config:recommended`, group monorepos, `minimumReleaseAge: "3 days"`, automerge devDependency minor/patch, pin GitHub Actions digests)
- [X] T009 [P] Create `.github/workflows/ci.yml`: `permissions: read-all`, actions pinned by SHA, jobs `check` (install frozen, `pnpm check`), `test` (unit + int with Docker), `generated` (OpenAPI export + orval + `lingui extract` then `git diff --exit-code`), `e2e` (compose dev profile + Playwright), `docker` (build image)
- [X] T010 [P] Create `.github/pull_request_template.md` (spec link, constitution gates, tests, docs/ADR, screenshots) and `.github/ISSUE_TEMPLATE/{bug.yml,feature.yml,config.yml}` (blank issues disabled)
- [X] T011 Run `pnpm install` and verify `pnpm check` runs (empty workspace passes)

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: shared packages, platform, auth wiring, client generation, design system base, packaging. No user story can start before this phase ends.

### Shared packages

- [X] T012 [P] Create `packages/shared` (`Result`, `ok`, `err`; `Brand<T, B>`; `newId()` UUIDv7; `Clock` interface + `systemClock`) with unit tests in `packages/shared/src/*.test.ts`
- [X] T013 [P] Create `packages/config/src/env.ts`: Zod schema for every variable in [contracts/configuration.md](contracts/configuration.md), `*_FILE` resolution, provider parsing from `AUTH_PROVIDERS` + `AUTH_<KEY>_*`, `ADMIN_EMAILS` and `ACCESS_ALLOWLIST` parsed into normalised lists; readable error naming the variable; tests in `packages/config/src/env.test.ts`
- [X] T014 [P] Create `packages/contracts` skeleton: `src/errors.ts` (all error codes of contracts/http-api.md and the problem+json schema), `src/common.ts` (ids, ISO dates, `version`), `src/index.ts`; every schema carries `.meta({ id })`
- [X] T015 Create `.env.example` documenting every variable with production-safe defaults (`AUTH_PROVIDERS=` empty → "sign-in not configured" page); the `dev` compose profile injects `AUTH_PROVIDERS=mock`, `ADMIN_EMAILS=admin@example.org`, `ACCESS_ALLOWLIST=example.com`, `S3_CREATE_BUCKET=true`; `packages/config` refuses to start when a provider issuer points to the mock and `APP_URL` is https

### API platform

- [X] T016 Create `apps/api/package.json`, `tsconfig.json` (extends `node.json`), `vitest.config.ts` with projects `api:unit` and `api:int` (only `api:int` gets `globalSetup`)
- [X] T017 Create `apps/api/src/platform/logger.ts` (pino, JSON in production, redaction of `authorization`, `cookie`, `email`, `*.secret`, request id)
- [X] T018 Create `apps/api/src/platform/db.ts` (Drizzle + pg pool from config, `Tx` type, `UnitOfWork` helper wrapping `db.transaction`)
- [X] T019 Create `apps/api/src/platform/http/errors.ts`: map business error codes → HTTP status (contracts/http-api.md table), RFC 9457 responses, 422 with field paths for Zod errors, 500 with `requestId`
- [X] T020 Create `apps/api/src/server.ts` and `apps/api/src/app.ts` (`buildApp(deps)`): Fastify 5 with `fastify-type-provider-zod` 7, `@fastify/swagger` (OpenAPI 3.1, `jsonSchemaTransformObject`), routes under `/api`, `/health`, `/ready` (DB + S3 check), `@fastify/static` serving `apps/web/dist` with `index.html` fallback for non-API GETs (`immutable` for `/assets/*`)
- [X] T021 Create `apps/api/src/migrate.ts`: advisory lock, run Drizzle migrations from `apps/api/drizzle/`, install pg-boss schema, seed the singleton workspace idempotently, create the S3 bucket when `S3_CREATE_BUCKET=true`
- [X] T022 [P] Create `apps/api/src/worker.ts` skeleton (pg-boss start/stop, graceful shutdown, no job yet)
- [X] T023 Create `apps/api/src/compose.ts` (composition root: builds adapters and handlers; does not connect when given fake adapters) and `apps/api/src/export-openapi.ts` (build with fakes, `app.ready()`, write `packages/api-client/openapi.json`)
- [X] T024 Create `apps/api/tests/setup/global-setup.ts`: Testcontainers `postgres:18-alpine`, run migrate, `project.provide("databaseUrl")`, template database cloned per worker

### Auth wiring (shared by every story)

- [X] T025 Create `apps/api/src/modules/workspace/infrastructure/schema.ts`: Better Auth tables generated with `pnpm exec auth generate` (the `auth` CLI pinned to 1.7.12 in the catalog) (user with `additionalFields` `role` default `member` `input:false`, `status` (`active|deactivated|deleted`) `input:false`, `language` (`en|fr`), `lastSignInAt`) plus `workspace_workspaces`, `workspace_teams` (`name_key` unique), `workspace_team_memberships` (PK `team_id, account_id`), `workspace_access_events`; generate the first migration and add by hand: CHECK constraints on `role`/`status`, trigger rejecting UPDATE/DELETE on `workspace_access_events`
- [X] T026 Create `apps/api/src/platform/auth/auth.ts`: Better Auth 1.7 with Drizzle adapter (`transaction: true`), email+password disabled, `genericOAuth` built from config providers (`discoveryUrl`, scopes `openid email profile`, `requireIdTokenVerification: true`, `mapProfileToUser` normalising `email_verified`), `trustedProviders` = providers with `trusted=true`, `allowDifferentEmails: false`, session `expiresIn` 7 days / `updateAge` 1 hour, `cookieCache` off, `rateLimit` enabled with `storage: "database"`, `useSecureCookies` when `APP_URL` is https, `trustedProxies`
- [X] T027 Create `apps/api/src/platform/auth/routes.ts`: catch-all `/api/auth/*` converting to a Fetch `Request`, forwarding `getSetCookie()` headers; `GET /api/public-config` returning providers (`id`, `displayName`) and `signInConfigured`
- [X] T028 Create `apps/api/src/platform/auth/session-guard.ts`: Fastify `preHandler` resolving the session, rejecting with 401 when missing, when `now - createdAt > 30 days` (delete session) or when the account is not `active`; exposes `request.account` (`id`, `role`)

### Client and web foundation

- [X] T029 Create `packages/api-client` (`orval.config.ts` per research.md R3, `src/fetcher.ts` with `credentials: "include"` and `ApiError` from problem+json, scripts `generate`); commit the first generated output
- [X] T030 Create `packages/ui`: `pnpm dlx shadcn@4.22.1 init --monorepo` with Base UI style, `src/styles/globals.css` (`@import "tailwindcss"`, `@source "../../../apps/web/src"`, primitive + semantic tokens in `@theme inline`, light/dark), `exports` for `./globals.css`, `./components/*`, `./lib/*`; add components `button`, `input`, `textarea`, `label`, `dialog`, `alert-dialog`, `select`, `checkbox`, `badge`, `card`, `table`, `toast`/`sonner`, `dropdown-menu`, `skeleton`
- [X] T031 Create `packages/ui/.storybook/{main.ts,preview.ts}` (react-vite, `addon-a11y` with `parameters.a11y.test = "error"`, `addon-vitest`), `packages/ui/vitest.config.ts` (browser mode, Playwright chromium), and one story per component in `packages/ui/src/components/*.stories.tsx`
- [X] T032 Create `packages/ui/src/components/inline-edit.tsx` (+ story): text/multiline field editable in place, Enter/blur saves, Escape cancels, focus management, `aria-live` confirmation, error slot
- [X] T033 Create `apps/web` (`package.json`, `vite.config.ts` with `tanstackRouter()` before `react()`, `lingui({ macroTransform: true })`, `tailwindcss()`; `lingui.config.ts` with locales `en`, `fr`, `.po` format, catalogs including `../../packages/ui/src`; `src/app/{i18n.ts,query-client.ts,router.tsx,providers.tsx}`; `src/main.tsx` importing `@goodresearch/ui/globals.css`)
- [X] T034 Create `apps/web/src/app/i18n.ts`: detection `fromStorage → fromNavigator → en` normalised to `en|fr`, dynamic catalog load + `i18n.activate`, `document.documentElement.lang`, and `apps/web/src/features/workspace/language-switch.tsx` (persists via `PUT /api/me/language` when signed in; after sign-in, if the user picked a language before signing in that differs from the account's, the client sends it once)
- [X] T035 Create `apps/web/src/routes/__root.tsx` (layout shell: skip link, landmarks, language switch, toaster) and `apps/web/src/routes/_authenticated.tsx` (`beforeLoad` ensuring `GET /api/me`, redirect to `/sign-in?redirect=` restricted to same-origin paths)

### Packaging

- [X] T036 Create `docker/Dockerfile` (research.md R7: `node:24-bookworm-slim`, pnpm via `npm i -g`, `turbo prune --docker`, prod deps, web build, non-root `node`, `HEALTHCHECK` on `/health`) and `docker/entrypoint.sh` (`server|worker|migrate`)
- [X] T037 Create `docker/docker-compose.yml`: `postgres:18-alpine`, `seaweedfs 4.48` (`weed mini`), `migrate` (`restart: "no"`), `server` and `worker` depending on `migrate` completed, `init: true`; profile `dev` adding `ghcr.io/navikt/mock-oauth2-server:6.1.1` with `docker/mock-oidc.json` (subjects starting with `unverified` → `email_verified: false`, others `true`)
- [X] T038 Create `apps/web/playwright.config.ts` and `apps/web/e2e/fixtures.ts` (sign-in helper through the mock provider login form, axe helper failing on serious/critical violations)

**Checkpoint**: `docker compose --profile dev up` serves an empty app with `/health` green; `pnpm check` and `pnpm test` pass.

---

## Phase 3: User Story 1 — Set up an instance and sign in as its first admin (P1) 🎯 MVP

**Goal**: provider-only sign-in with initial admins, allow-list rules, first team, sign-out.

**Independent Test**: quickstart A.1–A.2, A.7, A.8 and B; sign out and back in.

### Tests first (must fail before implementation)

- [X] T039 [P] [US1] Write `apps/api/src/modules/workspace/tests/sign-in-policy.test.ts`: unverified email + untrusted provider → reject; unverified + trusted → allow; email in `ADMIN_EMAILS` → allow as `admin` (even if not allow-listed); exact email in allow-list → `member`; domain entry matches exact domain only (not subdomains), case-insensitive; no match → reject
- [X] T040 [P] [US1] Write `apps/api/src/modules/workspace/tests/team.test.ts` (creation part): name "1–80 chars after trim", `nameKey = lower(trim(name))`
- [X] T041 [P] [US1] Write `apps/api/src/modules/workspace/tests/create-team.test.ts` with in-memory fakes: admin creates team; duplicate `nameKey` → `TEAM_NAME_TAKEN`; member → `FORBIDDEN`
- [X] T042 [P] [US1] Write `apps/api/tests/auth.component.test.ts` (inject + real DB + mocked provider userinfo): sign-in matrix of SC-005 (initial admin, allow-listed email, allow-listed domain, non-listed, unverified untrusted, unverified trusted, deactivated, returning person whose provider email changed to an allowed / a non-allowed address) — refused cases create no `user` row; `account_created` access event written for created accounts; account `language` taken from `Accept-Language` (`en`/`fr`, else `en`); missing provider name falls back to the email local part, names truncated to 120 chars

### Implementation

- [X] T043 [US1] Implement `apps/api/src/modules/workspace/domain/sign-in-policy.ts` (pure; input: email, emailVerified, provider trusted, adminEmails, allowList; output `Result<{ role }, 'ACCESS_DENIED'>`)
- [X] T044 [US1] Wire the policy in `apps/api/src/platform/auth/auth.ts`: `user.validateUserInfo` (reject → `access_denied`, nothing created), `databaseHooks.user.create.before` (set `role`; `language` from `Accept-Language`, else `en`; name fallback to the email local part, truncated to 120 chars), returning sign-in with a changed provider email updates the stored email only if still allowed, otherwise rejects, `databaseHooks.user.create.after` (idempotent `account_created` access event), `databaseHooks.session.create.before` (refuse non-active accounts), `databaseHooks.session.create.after` (update `lastSignInAt`)
- [X] T045 [US1] Implement `apps/api/src/modules/workspace/domain/team.ts`, `team.errors.ts`, `team.repository.ts` (port) and `infrastructure/team.drizzle-repository.ts` (optimistic `version`)
- [X] T046 [US1] Implement `apps/api/src/modules/workspace/application/commands/create-team.ts` and `application/queries/get-me.ts` (`{ id, name, email, role, language, teams }`) and `application/queries/get-access-context.ts` (`{ role, teamIds }`), exported from `apps/api/src/modules/workspace/index.ts`
- [X] T047 [US1] Implement routes in `apps/api/src/modules/workspace/infrastructure/http.routes.ts`: `GET /api/me`, `PUT /api/me/language`, `POST /api/teams`; schemas in `packages/contracts/src/workspace.ts`; regenerate `packages/api-client`
- [X] T048 [P] [US1] Create `apps/web/src/routes/sign-in.tsx`: one button per provider from `/api/public-config`, "sign-in not configured" state linking to the docs, generic error banner for any `?error=` code, language switch
- [X] T049 [P] [US1] Create `apps/web/src/features/workspace/first-team.tsx` and route `apps/web/src/routes/_authenticated/welcome.tsx`: shown to an admin when no team exists; creates the team then goes home
- [X] T050 [US1] Create `apps/web/src/features/workspace/account-menu.tsx` (name, role, sign-out) in the shell
- [X] T051 [US1] Write `apps/web/e2e/us1-sign-in.spec.ts`: first admin → first team → home; sign-out redirects; refused and unverified emails show the generic message; axe on sign-in and welcome screens

**Checkpoint**: an admin can sign in, create the first team and sign out.

---

## Phase 4: User Story 2 — Create and browse research projects (P1)

**Goal**: projects in teams, home list with team filter, overview with in-place edits and conflict detection.

**Independent Test**: quickstart A.3; reload keeps changes; stale edit refused.

### Tests first

- [X] T052 [P] [US2] Write `apps/api/src/modules/research/tests/project.test.ts`: name "1–120 characters after trimming", goal "up to 10,000 characters", line breaks preserved, `updatedAt` changes only on name/goal/team, version increments
- [X] T053 [P] [US2] Write `apps/api/src/modules/workspace/tests/access-policy.test.ts`: `canAccessTeam` (admin any team; member only own teams; non-active never)
- [X] T054 [P] [US2] Write use-case tests with fakes in `apps/api/src/modules/research/tests/{create-project,rename-project,update-project-goal,move-project-to-team}.test.ts`: access refused → `PROJECT_NOT_FOUND`/`TEAM_NOT_FOUND`; stale `version` → `VERSION_CONFLICT`; move only to an accessible team
- [X] T055 [P] [US2] Write `apps/api/src/modules/research/tests/project.repository.contract.ts` run against the fake and the Drizzle adapter (`*.int.test.ts`)

### Implementation

- [X] T056 [US2] Implement `apps/api/src/modules/workspace/domain/access-policy.ts`
- [X] T057 [US2] Implement `apps/api/src/modules/research/domain/{project.ts,project.errors.ts,project.repository.ts}`
- [X] T058 [US2] Implement `apps/api/src/modules/research/infrastructure/schema.ts` (`research_projects`: `team_id` FK `ON DELETE RESTRICT`, `goal` text, `version`) + migration, and `project.drizzle-repository.ts`
- [X] T059 [US2] Implement commands `apps/api/src/modules/research/application/commands/{create-project,rename-project,update-project-goal,move-project-to-team}.ts`
- [X] T060 [US2] Implement queries `apps/api/src/modules/research/application/queries/{list-projects,get-project,count-projects-by-team}.ts` (`list-projects` sorted `updatedAt desc`, optional `team` filter, restricted to `accessContext.teamIds` for members) and export them from `apps/api/src/modules/research/index.ts`
- [X] T061 [US2] Implement routes in `apps/api/src/modules/research/infrastructure/http.routes.ts` (contracts/http-api.md "Projects"), schemas in `packages/contracts/src/research.ts`; regenerate the client
- [X] T062 [P] [US2] Create `apps/web/src/routes/_authenticated/index.tsx` (home): project list, team filter in search params (`z.object({ team: z.uuid().optional().catch(undefined) })`), empty state, "no access yet" state for members without team
- [X] T063 [P] [US2] Create `apps/web/src/features/research/create-project-dialog.tsx` (name, goal, team select pre-selected when only one; field errors)
- [X] T064 [US2] Create `apps/web/src/routes/_authenticated/projects/$projectId.tsx` (overview with `inline-edit` for name and goal, team select, dates; `VERSION_CONFLICT` → reload message; 404 page that does not reveal existence)
- [X] T065 [US2] Write `apps/web/e2e/us2-projects.spec.ts`: create, list order, filter in URL, in-place edit + Escape cancel, conflict between two tabs, axe on home and overview

**Checkpoint**: US1 + US2 deliver a usable single-team product.

---

## Phase 5: User Story 3 — Give colleagues access through teams (P1)

**Goal**: members screen, team access, roles, deactivation, anonymised deletion, access history.

**Independent Test**: quickstart A.4–A.6.

### Tests first

- [X] T066 [P] [US3] Write `apps/api/src/modules/workspace/tests/account.test.ts`: last active admin cannot be demoted, deactivated or deleted (`LAST_ADMIN`); `deleted` is terminal (`ACCOUNT_DELETED`); delete erases name/email and removes role and memberships; every change records one access event
- [X] T067 [P] [US3] Write use-case tests with fakes `apps/api/src/modules/workspace/tests/{grant-team-access,remove-team-access,change-role,deactivate-account,reactivate-account,delete-account}.test.ts` (admin only — members get `MEMBER_NOT_FOUND`; grant/remove idempotent; delete requires `confirmation` equal to the current email → else `CONFIRMATION_MISMATCH`)
- [X] T068 [P] [US3] Write `apps/api/tests/access-matrix.int.test.ts` (SC-004): admin, member without team, member of one team, member of several teams × list projects and get each project by id → exactly the allowed set, others 404
- [X] T069 [P] [US3] Write `apps/api/tests/sessions.int.test.ts`: deactivation and deletion delete sessions in the same transaction (next request 401); 30-day absolute cap enforced; 7-day inactivity expiry with a fake clock; a deleted account's person signing in again gets a new, unrelated account (subject to the allow-list); `UPDATE`/`DELETE` on access events rejected by the trigger

### Implementation

- [X] T070 [US3] Implement `apps/api/src/modules/workspace/domain/{account.ts,account.errors.ts,account.repository.ts}` (memberships inside the aggregate, access events pulled with `pullEvents()`) and `infrastructure/account.drizzle-repository.ts` (writes account fields, memberships and access events in the same transaction; deletes `session` and provider `account` rows on deactivate/delete; anonymised email `deleted-<id>@deleted.invalid`)
- [X] T071 [US3] Implement commands `apps/api/src/modules/workspace/application/commands/{grant-team-access,remove-team-access,change-role,deactivate-account,reactivate-account,delete-account}.ts`
- [X] T072 [US3] Implement queries `apps/api/src/modules/workspace/application/queries/{list-members,get-access-history}.ts` (provider from the auth `account` table; history newest first with actor name or "Deleted account")
- [X] T073 [US3] Add routes (contracts/http-api.md "Members") in `apps/api/src/modules/workspace/infrastructure/http.routes.ts`; schemas in `packages/contracts/src/workspace.ts`; regenerate the client
- [X] T074 [P] [US3] Create `apps/web/src/routes/_authenticated/members/index.tsx` (table: name, email, role, teams, provider, last sign-in, status; members without team highlighted; search) — admin only, others get the 404 page
- [X] T075 [P] [US3] Create `apps/web/src/routes/_authenticated/members/$memberId.tsx`: team access checkboxes, role select, deactivate/reactivate, delete with typed-email confirmation (`alert-dialog`), access history list
- [X] T076 [US3] Write `apps/web/e2e/us3-access.spec.ts`: allow-listed colleague sees "no access yet" → admin grants team → colleague sees projects; removal hides them; deactivation signs out; deletion leaves no trace of name/email on any screen (SC-010); history entries (SC-009); axe on members screens

**Checkpoint**: multi-user instance with team-based access.

---

## Phase 6: User Story 4 — Manage teams (P2)

**Goal**: rename and delete teams; members see their teams.

**Independent Test**: spec US4 scenarios 1–6.

### Tests first

- [X] T077 [P] [US4] Extend `apps/api/src/modules/workspace/tests/team.test.ts` and add `{rename-team,delete-team}.test.ts`: rename to a taken `nameKey` → `TEAM_NAME_TAKEN`; delete with projects → `TEAM_HAS_PROJECTS` with `projectCount`; delete removes memberships and records `membership_removed` events (team name copied in `details`)

### Implementation

- [X] T078 [US4] Implement commands `apps/api/src/modules/workspace/application/commands/{rename-team,delete-team}.ts` (`delete-team` calls research `countProjectsByTeam` through `apps/api/src/modules/research/index.ts`)
- [X] T079 [US4] Implement query `apps/api/src/modules/workspace/application/queries/list-teams.ts` (admin: all; member: own teams with their members; `projectCount`) and routes `GET /api/teams`, `PUT /api/teams/{id}/name`, `DELETE /api/teams/{id}`; regenerate the client
- [X] T080 [US4] Create `apps/web/src/routes/_authenticated/teams.tsx`: list, create, rename in place, delete with confirmation and "move N projects first" message; read-only for members
- [X] T081 [US4] Write `apps/web/e2e/us4-teams.spec.ts` (duplicate name refused, delete refused then allowed after moving projects, member read-only view, axe)

---

## Phase 7: User Story 5 — Language and accessibility (P2)

**Goal**: EN/FR everywhere and WCAG 2.2 AA verified on every screen.

**Independent Test**: spec US5 scenarios 1–5.

- [X] T082 [US5] Extract and translate every message to French in `apps/web/src/locales/fr/messages.po` (use the [bilingual glossary](../../docs/domain/context-map.md#bilingual-glossary)); `lingui compile --strict` passes
- [X] T083 [US5] Write `apps/web/e2e/us5-i18n.spec.ts`: browser `fr-FR` → French; switch keeps typed input; language persists after sign-out/sign-in; user content never translated; no English string left on French screens (SC-006)
- [X] T084 [US5] Write `apps/web/e2e/us5-keyboard.spec.ts`: full US1–US4 flows keyboard only (focus visible, dialogs trap and restore focus) and axe zero serious/critical on every route (SC-007)

---

## Phase 8: Polish & cross-cutting

- [X] T085 [P] Write `README.md` sections "Deploy" (compose, configuration table link, Google client setup with redirect URI `<APP_URL>/api/auth/callback/google`) and "Develop" (prerequisites, `pnpm dev`, tests)
- [X] T086 [P] Write READMEs for `apps/api`, `apps/web`, `packages/{contracts,api-client,ui,config,shared,tsconfig}`
- [X] T087 [P] Fill the "Commands" section of `AGENTS.md` (install, dev, check, test, e2e, generate, build)
- [X] T088 Verify ADR-0002, ADR-0005 and the context map still match the implementation; add an update section where they diverge
- [X] T089 Run [quickstart.md](quickstart.md) A, B and C end to end; fix any gap — *A and C: automated e2e on fresh and existing databases, all checks green. B: real Google OAuth client, fresh instance, maintainer signed in as initial admin, created a team and a project (2026-10-24)*
- [X] T090 Measure SC-001 (deploy to first team < 15 min) and SC-002/SC-003 timings during the quickstart run and note results in the PR — *stack ready 15 s after `docker compose up` on a fresh database; Google sign-in, first team and first project done by the maintainer without documentation (SC-001, SC-002 met)*

---

## Dependencies & execution order

- **Setup (T001–T011)** → **Foundational (T012–T038)** → user stories.
- **US1** (T039–T051) first: it creates the Team aggregate, sign-in and the shell every other story uses.
- **US2** (T052–T065) needs US1 (a team and a signed-in user).
- **US3** (T066–T076) needs US1; its access-matrix test (T068) needs US2's projects.
- **US4** (T077–T081) needs US1 (Team) and US2 (`countProjectsByTeam`).
- **US5** (T082–T084) runs last over all screens; translations can progress alongside each story.
- Within a story: tests → domain → infrastructure → commands/queries → routes + client generation → screens → e2e.

### Parallel opportunities

- Setup: T003–T010 in parallel after T001–T002.
- Foundational: T012–T014 in parallel; T030–T032 (ui) in parallel with T016–T028 (api); T036–T037 in parallel with the web foundation.
- US1: T039–T042 in parallel; T048–T049 in parallel once T047 is done.
- US2: T052–T055 in parallel; T062–T063 in parallel.
- US3: T066–T069 in parallel; T074–T075 in parallel.

### Parallel example (US2)

```text
T052 project.test.ts | T053 access-policy.test.ts | T054 use-case tests | T055 repository contract
then T056 → T057 → T058 → T059/T060 → T061 → (T062 | T063) → T064 → T065
```

## Implementation strategy

1. **MVP = Setup + Foundational + US1 + US2**: a single admin deploys, signs in with Google, creates a team and projects. Demo-able and releasable.
2. **Increment 2 = US3**: colleagues and team access (the real multi-user product).
3. **Increment 3 = US4 + US5**: team management and full EN/FR + accessibility verification.
4. Each increment ends with its e2e spec green and docs updated before the PR.

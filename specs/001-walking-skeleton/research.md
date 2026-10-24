# Research — 001 walking skeleton

Versions checked on the npm registry on 2026-10-24. "Pin" respects the 3-day `minimumReleaseAge`; Renovate moves pins forward.

## R1. TypeScript 7 and tools that need the TypeScript API

- **Decision**: `tsc` from **TypeScript 7.0.2** type-checks everything. Tools that `require('typescript')` get the **TypeScript 6 API** through the official dual alias in the pnpm catalog:
  ```yaml
  "@typescript/native": npm:typescript@7.0.2      # provides `tsc` (7)
  typescript: npm:@typescript/typescript6@6.0.2   # TS 6 API for tools
  ```
  Remove the alias when TS 7.1 ships a stable API and dependency-cruiser supports it.
- **Rationale**: TS 7 exports no stable programmatic API before 7.1. dependency-cruiser 18.7 hard-codes `typescript <7`. Everything else (Vite 8, Vitest, knip, drizzle-kit, orval, Lingui, shadcn, Biome) does not need the TS API.
- **Base tsconfig**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`, **`erasableSyntaxOnly`**, `allowImportingTsExtensions`, `noEmit`, explicit `types`. Presets: `node.json` (`nodenext`) and `bundler.json` (`bundler`, `react-jsx`, DOM libs). TS 7 makes `baseUrl`, `moduleResolution: node` and `esModuleInterop: false` hard errors.
- **Alternatives**: stay on TS 6 (rejected: we would migrate again in weeks); drop dependency-cruiser (rejected: module boundaries are a constitution rule).

## R2. Authentication

- **Decision**: **Better Auth 1.7.12**, mounted in Fastify through a catch-all `/api/auth/*` route converting to a Fetch `Request` (no official Fastify plugin; forward cookies with `getSetCookie()`). **Email + password disabled.** Providers come from configuration through the `genericOAuth` plugin (one entry per provider: `providerId`, display name, `discoveryUrl`, client id/secret, scopes `openid email profile`, `requireIdTokenVerification: true`; PKCE and nonce on by default). Redirect URI: `/api/auth/callback/<providerId>`.
- **Sign-in policy**: the `user.validateUserInfo` hook (runs before create-user, link-account and sign-in; fails closed; rejection creates nothing) calls the pure domain `SignInPolicy`:
  1. email not verified and provider not `trusted` → reject (normalise `email_verified: "true"` strings in `mapProfileToUser`);
  2. on create-user: email in `ADMIN_EMAILS` → allowed as admin; matches `ACCESS_ALLOWLIST` (exact email or exact domain, case-insensitive) → allowed as member; else reject.
  Role is set in `databaseHooks.user.create.before` from the same policy. `role` and status fields are `additionalFields` with `input: false` (users cannot set them).
- **Account linking**: default linking on verified email, `allowDifferentEmails: false`. Untrusted providers are **not** listed in `trustedProviders` (that would bypass the verified-email rule); providers marked `trusted` by the deployer are.
- **Sessions**: `expiresIn: 7 days`, `updateAge: 1 hour` (sliding inactivity); the **30-day absolute cap** and the **active-account check** run in our Fastify `preHandler` (`now - session.createdAt > 30 days` → delete session, 401). `cookieCache` stays disabled so revocation is immediate. `databaseHooks.session.create.before` refuses deactivated/deleted accounts.
- **Revocation**: deactivate/delete commands delete the account's `session` rows in the same transaction as the status change.
- **No admin plugin**: it brings bans and impersonation we do not want; roles live in our domain.
- **CSRF / cookies**: built-in origin + Fetch Metadata checks; explicit `baseURL`, `secret` ≥ 32 chars, `useSecureCookies` in production, `trustedProxies` behind a proxy. Same-origin SPA → no CORS.
- **Rate limiting**: built-in, `enabled: true` explicitly, `storage: "database"` (multi-instance safe), keyed by the client IP that our Fastify adapter passes in a header it always overwrites (Fastify's `request.ip`, honouring `TRUSTED_PROXIES`). Without it every client would share one bucket. Sign-in start limited to `AUTH_SIGN_IN_RATE_LIMIT` per minute (default 20).
- **Errors**: the OIDC callback returns error codes (`access_denied`, `account_not_linked`, …); the SPA maps all of them to one generic message (FR-008).
- **Test provider**: `ghcr.io/navikt/mock-oauth2-server:6.1.1` in `compose.dev.yaml`, in e2e and in integration tests (Testcontainers). Its login form takes a user name and a claims JSON (`{"email": …}`); a token callback adds `email_verified: true` by default. Issuer URL must be identical for browser and backend.
- **Alternatives**: Auth.js (weaker non-Next support), Lucia (archived), custom OIDC client (security-sensitive, no reason to own it).

## R3. API runtime and HTTP contract

- **Decision**: **Node 24 LTS** running TypeScript **without a build step** (native type stripping: `node apps/api/src/server.ts`). Consequence: erasable syntax only — no enums, no parameter properties, no runtime namespaces; explicit `.ts` import extensions; `import type`.
- **Fastify 5.12** + **fastify-type-provider-zod 7.0** + **Zod 4.6** + **@fastify/swagger 9.9** (OpenAPI 3.1; schemas registered with `.meta({ id })` and `jsonSchemaTransformObject` so the client gets named types). API under `/api`; the built SPA served by **@fastify/static** with an `index.html` fallback for non-API GETs; `immutable` cache for `/assets/*`.
- **OpenAPI export without a database**: a script builds the app with fake adapters, `await app.ready()`, writes `app.swagger()` to `packages/api-client/openapi.json`. The composition root therefore must not connect at build time.
- **Client**: **orval 8.43** → TanStack Query hooks with a `fetch` mutator (`credentials: "include"`, problem+json → `ApiError`). CI regenerates and fails on diff.
- **Alternatives**: tsx/tsdown build (kept as fallback if a non-erasable dependency appears); hey-api (pre-1.0).

## R4. Persistence and jobs

- **Decision**: **PostgreSQL 18**, **Drizzle 0.45.4** + **drizzle-kit 0.31.11**. Better Auth tables generated with `npx auth@latest generate` into the workspace module's `infrastructure/schema.ts`; Drizzle adapter with `transaction: true`. Migrations applied by the `migrate` entrypoint (advisory lock), which also installs the pg-boss schema and seeds the singleton workspace.
- **pg-boss 12.38** is installed in this feature only for the `worker` entrypoint skeleton; no job is needed yet (`fromDrizzle(tx, sql)` confirmed).
- **Access events**: append-only table protected by a trigger that rejects `UPDATE`/`DELETE`.
- **Alternatives**: none reconsidered (ADR-0004).

## R5. Frontend

- **Decision**: **React 19.3**, **Vite 8.3**, **@vitejs/plugin-react 6**, **TanStack Router 1.170** (file-based, Vite plugin before `react()`; protected layout `_authenticated` with `beforeLoad` + `redirect`; search params validated with Zod 4 directly, `.catch()` for bad URLs; `redirect` param restricted to same-origin paths), **TanStack Query 5.104**.
- **i18n**: **Lingui 6.10** with its native macro transform (`lingui({ macroTransform: true })`), `.po` catalogs (`@lingui/format-po`, no line numbers), dynamic `import()` + `i18n.activate()` for switching without reload, detection `fromStorage → fromNavigator → en`, `document.documentElement.lang` updated. CI: `lingui extract --clean` + no diff, `lingui compile --strict` (fails on missing French).
- **Design system**: `packages/ui` initialised with **shadcn 4.22** (`--monorepo`, Base UI style), **@base-ui/react 1.9**, **Tailwind 4.3**. `globals.css` owns `@import "tailwindcss"`, `@source` for `apps/web/src`, semantic tokens in `@theme inline`, dark mode via `prefers-color-scheme` + class. **Storybook 10.6** (`react-vite`, `addon-a11y` with `parameters.a11y.test = "error"`, `addon-vitest` in browser mode with Playwright).
- **Alternatives**: none reconsidered (ADR-0006).

## R6. Quality tooling

- **Biome 2.6.2**: root config, `a11y` rules, `noDefaultExport` (except configs/stories), `noEnum`, `noExplicitAny`, `noNonNullAssertion`, `nursery.noFloatingPromises: "error"`, `useImportExtensions` on Node packages; generated files excluded.
- **Vitest 5.0.5** projects; every package has its own config (no parent lookup). API projects `api:unit` and `api:int`; only `api:int` has the Testcontainers `globalSetup` (one PostgreSQL 18 container per run, migrations applied, per-worker database cloned from a template). Vitest 5: mocks cleared per test, unawaited async assertions fail.
- **Playwright 1.64** + **@axe-core/playwright 4.14** against the compose stack with the mock provider.
- **dependency-cruiser 18.7** rules: domain pure; application without infrastructure/frameworks; cross-module imports only through `index.ts`; no foreign `schema.ts` imports.
- **knip 6.42**, **lefthook 2.2**, **Renovate**, GitHub Actions pinned by SHA.

## R7. Packaging and local stack

- **Decision**: one multi-stage Dockerfile (`node:24-bookworm-slim`, pnpm 12.14 installed with `npm i -g` — no corepack in Node ≥ 25, `turbo prune --docker`), non-root `node` user, `HEALTHCHECK` on `/health`, entrypoint `server | worker | migrate`. `compose.yaml` at the repo root: `migrate` (`restart: "no"`), `server` and `worker` depending on `migrate` completing, PostgreSQL 18, **SeaweedFS 4.48** (`weed mini`, S3 on 8333, `forcePathStyle`); `init: true` on Node services. `compose.dev.yaml` overlay adds the mock OpenID Connect provider and sample access rules. Browser and server must reach the provider at the same issuer URL: `oidc.localtest.me` (resolves to 127.0.0.1) mapped to the host gateway inside containers.
- **Rationale**: one image, self-host friendly, matches ADR-0005.

## Resolved unknowns

All Technical Context items are resolved; no `NEEDS CLARIFICATION` remains.

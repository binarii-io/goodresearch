# Engineering standards

How we apply the [constitution](../.specify/memory/constitution.md). Each rule links to the ADR that justifies it. Sources reviewed are listed at the end.

## 1. Repository layout

```
apps/
  api/                  # Fastify server + pg-boss workers (one image, entrypoints `server`, `worker`, `migrate`)
  web/                  # React + Vite SPA
packages/
  contracts/            # Zod schemas shared by api and web (DTOs, commands, errors)
  api-client/           # generated from OpenAPI (orval) — never edited by hand
  ui/                   # design system: tokens, components, Storybook
  config/               # env schema (Zod) + loader, shared by apps
  shared/               # tiny, dependency-free helpers (Result, ids, clock)
  tsconfig/             # base tsconfig presets
docs/
  adr/                  # MADR 4 decision records
  domain/               # context map, ubiquitous language
  standards.md
specs/                  # Spec Kit features (NNN-slug/)
docker/                 # Dockerfile, compose files, entrypoint
```

Rules:

- A package exposes only what its `package.json` `exports` declares. No deep imports.
- Shared versions are pinned once in the pnpm **catalog** (`pnpm-workspace.yaml`).
- `packages/shared` stays dependency-free. If it needs a dependency, it is not shared.

## 2. Backend architecture (ADR-0003)

### Module layout (one bounded context)

```
apps/api/src/
  compose.ts                       # composition root: builds adapters, handlers, routes
  server.ts / worker.ts / migrate.ts  # entrypoints
  platform/                        # cross-cutting infra: db, jobs, logger, auth, ai-gateway, storage
  modules/<context>/
    index.ts                       # PUBLIC API: command/query factories, event types
    domain/
      <aggregate>.ts               # aggregate: private state, methods enforce invariants, records events
      <aggregate>.errors.ts        # union of business error codes
      <aggregate>.repository.ts    # port (interface)
      <policy>.ts                  # pure domain services/policies (e.g. confidence-policy.ts)
    application/
      commands/<verb-noun>.ts      # one file per command handler
      queries/<get-noun>.ts        # one file per query handler (SQL → DTO)
      ports.ts                     # other outbound ports (LLM tasks, source connectors…)
    infrastructure/
      schema.ts                    # Drizzle tables owned by this module
      <aggregate>.drizzle-repository.ts
      http.routes.ts               # Fastify routes (thin)
      jobs.ts                      # pg-boss workers (thin)
    tests/
```

### Dependency rules (enforced by dependency-cruiser in CI)

| From ↓ may import → | domain | application | infrastructure | other module | platform |
|---|---|---|---|---|---|
| domain | ✅ | ❌ | ❌ | ❌ | ❌ (only `@goodresearch/shared`) |
| application | ✅ | ✅ | ❌ | `index.ts` only | ports only |
| infrastructure | ✅ | ✅ | ✅ | `index.ts` only | ✅ |

### Aggregates

- Plain classes, private state, no public setters. `create(...)` validates invariants and returns `Result`; `fromPersistence(...)` rehydrates without checks.
- Behaviour methods return `Result<void, ErrorCode>` and record domain events; `pullEvents()` drains them.
- Small aggregates. Reference other aggregates by **branded ID** (`type FactId = Brand<string, 'FactId'>`).
- Optimistic concurrency: `version` column, `UPDATE … WHERE id = ? AND version = ?`; 0 rows → throws `ConcurrencyError` (infrastructure failure, mapped to HTTP 409; the client retries).
- Value objects only where there are rules (e.g. `QuoteAnchor`, `TermSurface`). Otherwise branded primitives.

### Commands (mutations)

```ts
export const makeValidateFact = (uow: UnitOfWork) =>
  (cmd: ValidateFactCommand) =>
    uow(async ({ facts, publish }) => {
      const fact = await facts.findById(cmd.factId);
      if (!fact) return err('FACT_NOT_FOUND');
      const r = fact.validate(cmd.by);
      if (!r.ok) return r;
      await facts.save(fact);
      await publish(fact.pullEvents());
      return ok({ id: fact.id });
    });
```

- Naming: imperative `verb-noun` (`validate-fact`, `publish-transcript-version`).
- One aggregate changed per transaction. Cross-aggregate effects go through events.
- Input already validated by Zod at the edge; the handler only enforces business rules.
- Returns `Result`. Never returns the aggregate; returns an id or a small acknowledgement. The UI refetches through queries.

### Queries (reads)

- Direct Drizzle/SQL select → DTO typed by the `packages/contracts` schema. No repository, no aggregate, no mapper.
- Queries may join tables **of their own module only**. Cross-module views (deck, graph) live in the Reporting module and read through other modules' query APIs, or through dedicated SQL views owned by the module that owns the tables.
- Review policy (`auto | manual`) is applied in queries.

### Unit of work, events and jobs (ADR-0004)

- `UnitOfWork` = `db.transaction(tx => …)`; repositories are built on `tx`.
- Domain events are published with `boss.send(..., { db: fromDrizzle(tx, sql) })` in the **same transaction** (transactional outbox without an outbox table).
- Consumers are idempotent (`singletonKey` or dedupe on event id). Long AI tasks are jobs with per-item progress; *stop* is a flag checked between items.

### Errors

- Business errors: string-literal unions per aggregate, mapped once to HTTP status in the route layer (`NOT_FOUND → 404`, `CONFLICT/FROZEN → 409`, validation → 422).
- Infrastructure errors throw; Fastify's error handler logs them and returns 500 with a request id.
- Error responses follow RFC 9457 (`application/problem+json`) with a stable `code`.

### HTTP

- Fastify 5 + `fastify-type-provider-zod`; route schemas come from `packages/contracts`.
- REST resources, plural nouns, kebab-case paths. Commands that are not CRUD are sub-resources: `POST /facts/{id}/validation`.
- Long operations: `202 Accepted` + job resource (`GET /jobs/{id}`).
- OpenAPI 3.1 served at `/openapi.json`; `packages/api-client` is regenerated in CI and must have no diff.

### AI Gateway

- One port per AI task (`ExtractFacts`, `ClassifyInterventions`, …) with Zod input/output; adapters use the Vercel AI SDK `generateText` with `output: Output.object({ schema })`.
- Prompts are versioned files next to the adapter, with no examples that the model could copy and no company context (organisation context comes from the workspace).
- Post-validation in the domain (verbatim checks, known ids) — never trust the model.
- Usage recorded in the ledger by the gateway, not by callers.

## 3. Frontend (ADR-0006)

```
apps/web/src/
  routes/               # TanStack Router file-based routes (thin: load + compose)
  features/<context>/   # mirrors backend contexts: components, hooks, view models
  app/                  # providers, router, i18n, query client
```

- Server state with TanStack Query through the generated client only. No hand-written `fetch`.
- Client state: URL first (search params), then component state. No global store until needed.
- Components from `@goodresearch/ui`. Feature components compose them; they do not restyle them.
- Every string through Lingui (`t` macro / `<Trans>`); messages in `.po` files.
- Forms: Zod schema from `packages/contracts` + a form library chosen in the first form feature's plan.

### Design system (`packages/ui`)

- Components generated with the shadcn CLI on **Base UI** primitives, then owned and adapted.
- Tokens: primitive → semantic (`--color-surface`, `--color-text-muted`…) as CSS variables, exposed to Tailwind v4 via `@theme`. Light and dark themes. Token files follow the W3C DTCG shape so a build pipeline can be added later.
- Every component has a Storybook story with the a11y addon; stories run as Vitest browser tests.
- No component without keyboard support and visible focus.

## 4. Testing

| Level | Tool | Scope | Location |
|---|---|---|---|
| Domain unit | Vitest | aggregates, policies, invariants — pure | `modules/*/tests/*.test.ts` |
| Use case | Vitest + in-memory fakes | command/query handlers, events published | `modules/*/tests/*.test.ts` |
| Contract | Vitest | one suite per port, run on fake and real adapter | `*.contract.ts` |
| Integration | Vitest + Testcontainers (PostgreSQL) | Drizzle adapters, queries, jobs, migrations | `*.int.test.ts` |
| API component | Fastify `inject()` + real DB | routes, auth, error mapping | `apps/api/tests/` |
| UI component | Storybook + Vitest browser + axe | design system and feature components | `*.stories.tsx` |
| End-to-end | Playwright + axe | critical user flows from specs | `apps/web/e2e/` |

- Fakes over mocks. Mock only at the process boundary (LLM provider, external HTTP) with recorded fixtures.
- Test data via small builders (`aFact().validated().build()`), never real personal data.
- LLM adapters get an opt-in eval suite (real provider, not in CI by default).

## 5. Code style

- **Biome** formats and lints everything (one config at the root). **`tsc --noEmit`** (TypeScript 7) type-checks (ADR-0002).
- Files and folders `kebab-case`; types and classes `PascalCase`; functions and variables `camelCase`; constants `SCREAMING_SNAKE_CASE` only for true constants.
- Named exports only. No default exports (except where a tool requires them).
- No `any`, no non-null `!` without a comment, no `enum` (use string-literal unions + `as const`).
- Comments explain **why**, not what. Public module APIs get a short TSDoc.
- Dates are ISO 8601 UTC in APIs and the database (`timestamptz`); time comes from an injected `Clock`.
- IDs are UUIDv7 generated by the app.

## 6. Data & migrations

- Each module owns its tables (prefix = module name, e.g. `evidence_facts`). Foreign keys across modules are allowed for integrity but never used for joins outside the owning module.
- Migrations generated by drizzle-kit, reviewed, committed, applied by the `migrate` entrypoint (run before `server` and `worker`, under an advisory lock). Never edit a released migration.
- Soft deletion only when the domain needs it (e.g. rejected facts stay to avoid re-proposal).

## 7. Git, PRs, releases

- Branches: Spec Kit feature branches `NNN-slug`; others `fix/…`, `chore/…`, `docs/…`.
- PR title = Conventional Commit (`feat(evidence): validate facts in bulk`); squash merge. Scopes = module or package names.
- PR template checklist: spec link, constitution gates, tests, docs/ADR updated, screenshots for UI.
- Releases with release-please: SemVer, generated CHANGELOG, Docker image `ghcr.io/<org>/goodresearch:{x.y.z,x.y,latest}`.
- Git hooks with lefthook (format + lint staged files, fast). CI is the source of truth.
- License AGPL-3.0-only; every `package.json` declares `"license": "AGPL-3.0-only"`. External contributors sign the [CLA](../CLA.md) once (CLA Assistant app on pull requests). See ADR-0007.
- Code, comments, docs, commits and PRs are written in English. UI ships in English and French using the [bilingual glossary](domain/context-map.md#bilingual-glossary).

## 8. CI (GitHub Actions)

`pnpm install --frozen-lockfile` → `turbo run format:check lint typecheck knip depcruise test build --affected` → integration tests (Testcontainers) → e2e (on critical paths) → Docker build. Actions pinned by SHA, `permissions: read-all` by default, Renovate for updates with a 3-day minimum release age (pnpm `minimumReleaseAge: 4320`, in minutes).

## 9. Configuration, security, observability

- All config from env, validated by `packages/config` at boot; `.env.example` documents each variable. `*_FILE` variants for secrets.
- Secrets never in the repo, logs or client bundle. Supply chain: lockfile, pnpm `minimumReleaseAge`, Renovate, CodeQL.
- Logs: pino JSON, request id correlation, redaction of tokens and personal fields. `/health` (liveness) and `/ready` (DB + storage) endpoints.
- OpenTelemetry deferred; added behind an env flag when needed.

## 10. Documentation

- `README.md` per app/package: what it is, how to run, how to test.
- ADRs in MADR 4 (`docs/adr/NNNN-title.md`). Superseding an ADR = new ADR with a link both ways.
- The context map is updated in the same PR as any change to the ubiquitous language.

## Deferred on purpose

Changesets (no published npm package yet), OpenTelemetry tracing, Helm charts, token build pipeline (Style Dictionary/Terrazzo), visual regression testing, SSO/SAML, open-core split, Pact contract tests. Revisit when a concrete need appears.

## Sources reviewed (2026-10-24)

- Architecture: *Architecture Patterns with Python* (cosmicpython.com) — core reference for repository, unit of work, light CQRS; Vaughn Vernon, *Effective Aggregate Design*; Vlad Khononov, *Learning Domain-Driven Design*; Matthias Noback, *Advanced Web Application Architecture*; [Sairyss/domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon) (catalog, not a template); [CodelyTV/typescript-ddd-example](https://github.com/CodelyTV/typescript-ddd-example); [kgrzybek/modular-monolith-with-ddd](https://github.com/kgrzybek/modular-monolith-with-ddd); [goldbergyoni/nodejs-testing-best-practices](https://github.com/goldbergyoni/nodejs-testing-best-practices).
- Monorepo & self-hosting: [trigger.dev](https://github.com/triggerdotdev/trigger.dev) (tooling, catalogs, supply-chain settings), [documenso](https://github.com/documenso/documenso) (governance docs, Lingui, Docker), [formbricks](https://github.com/formbricks/formbricks), [openstatus](https://github.com/openstatusHQ/openstatus).
- Design system: [shadcn/ui](https://github.com/shadcn-ui/ui), [Base UI](https://github.com/mui/base-ui), [primer/primitives](https://github.com/primer/primitives) (DTCG tokens), [W3C DTCG format](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/).
- Conventions: [MADR](https://adr.github.io/madr/), [Conventional Commits](https://www.conventionalcommits.org/), [12-factor](https://12factor.net/), [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457), [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [GitHub Spec Kit](https://github.com/github/spec-kit).

# Implementation Plan: A shared AI provider for the instance

**Branch**: `035-shared-ai-provider` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/035-shared-ai-provider/spec.md`

## Summary

New optional settings describe one shared AI provider (`AI_SHARED_*`). The AI Gateway resolves a person's credential in this order: their own connection (as today, even when it needs attention), else the shared provider when it is open to them (no team list, or a member of a listed team), else "provider required". The provider gate no longer requires a provider from people the shared provider serves; `providerOf` returns the shared kind for them (consents stay per provider kind). Each usage entry records `shared`. A failure of the shared provider never touches the person's connection: it is logged for the deployer and reaches the person as `SHARED_PROVIDER_UNAVAILABLE`. The AI provider page says which provider serves the person. ADR-0005 gets an update.

## Technical Context

**Language/Version**: TypeScript strict, Node (repo versions)

**Primary Dependencies**: none new: `@ai-sdk/google-vertex` with `googleAuthOptions` (service account `credentials`, or Application Default Credentials when no key is given), `@ai-sdk/anthropic`, `@ai-sdk/openai`.

**Storage**: PostgreSQL: migration adding `shared boolean not null default false` to `ai_usage_entries`. Shared credentials only in configuration (env / secret), never in the database.

**Testing**: Vitest test-first: config parsing (valid, missing project, unreadable key, unknown kind, teams list); gateway with fakes (precedence own > shared > required, team restriction, shared failure logged and not stored on the person, `shared` on usage entries); gate and page queries; web: provider page states; e2e on the dev stack with the fake shared provider.

**Target Platform**: the self-hosted API and web app.

**Project Type**: web service + web app in a modular monolith (AI Gateway, Workspace for team membership, Web).

**Performance Goals**: one membership read per resolution only when a team list is set (cached per call path, not stored).

**Constraints**: credentials never leave the server (FR-007); without shared settings, behaviour unchanged (FR-010).

**Scale/Scope**: config, one module (AI Gateway), one port to Workspace (team ids of an account), one page, one migration, ADR update.

## Constitution Check

| Principle | Status |
|---|---|
| I. Spec-driven | Spec 035 in the PR. |
| II. DDD, modules | AI Gateway asks Workspace for an account's team ids through a port wired in `compose.ts`; never reads its tables. |
| III/VII. Privacy | Same data sent to the provider as today; consents per provider kind unchanged; shared secrets only in config, redacted from logs. |
| IV. AI through the gateway | Every call still goes through the gateway and records one usage entry, now with `shared`. |
| V. Test-first | Config and gateway tests first. |
| VI. Contracts | `AiProviderPage.shared` (kind, model, open to the person) and `SHARED_PROVIDER_UNAVAILABLE` in Zod contracts; client regenerated. |
| VIII. UI | Provider page from `packages/ui`; strings EN/FR. |
| IX. Simplicity | One shared provider per instance, configured by environment; no admin screen, no caps. |

Gate: pass; the spec 004 "no shared instance key" decision changes → ADR-0005 update in the same PR.

## Project Structure

### Documentation (this feature)

```text
specs/035-shared-ai-provider/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/config/src/env.ts (+ env.test.ts)                  # AI_SHARED_* settings
apps/api/src/modules/ai-gateway/domain/provider.ts          # shared credential kinds
apps/api/src/modules/ai-gateway/domain/failure.ts           # SHARED_PROVIDER_UNAVAILABLE
apps/api/src/modules/ai-gateway/application/gateway.ts      # resolution order, failures, shared flag
apps/api/src/modules/ai-gateway/application/ports.ts        # teamIdsOf port, log, usage.shared
apps/api/src/modules/ai-gateway/application/queries/provider-queries.ts  # gate, page
apps/api/src/modules/ai-gateway/infrastructure/ai-sdk.model-runner.ts    # service account / ADC
apps/api/src/modules/ai-gateway/infrastructure/schema.ts, ai.drizzle-store.ts, module.ts
apps/api/drizzle/0059_*                                     # usage.shared
apps/api/src/compose.ts                                     # teamIdsOf from Workspace
packages/contracts/src/ai-provider.ts, errors.ts
apps/web/src/routes/setup.ai-provider.tsx, settings page    # shared state shown
apps/web/src/features/... messages for SHARED_PROVIDER_UNAVAILABLE
docs/adr/0005-provider-agnostic-infrastructure.md, README.md, .env.example
```

**Structure Decision**: existing modules only.

## Documentation

- ADR-0005: "Update — a shared AI provider for the instance (spec 035)". README configuration table and `.env.example`. Context map: "shared AI provider" in the AI Gateway language and the glossary (FR: « fournisseur IA partagé »).

## Complexity Tracking

None.

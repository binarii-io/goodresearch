# @goodresearch/api

Fastify API and background worker of goodresearch: a modular monolith with one module per bounded context ([context map](../../docs/domain/context-map.md), [standards](../../docs/standards.md)).

## Layout

| Path | Content |
|---|---|
| `src/server.ts`, `src/worker.ts`, `src/migrate.ts` | Entrypoints (one image, three commands) |
| `src/compose.ts` | Composition root: builds adapters, modules and routes |
| `src/platform/` | Cross-cutting infrastructure: database, auth library wiring, HTTP errors, logger, storage |
| `src/modules/<context>/` | `domain/`, `application/{commands,queries}/`, `infrastructure/`, `tests/`, public `index.ts` |
| `src/modules/ingestion/` | Sources of studies (spec 002): Drive connection, folder access, inventories (jobs run by `worker`); the sessions (interviews) found in each inventory, matched to recordings and to the schedule (spec 008); their analysis: the app's rules on the beginning of each transcript, then the AI for what is missing, proposals, renaming in Drive, pseudonyms (spec 009, runs of the `ingestion.analysis` queue in `worker`); what Enrichment reads of the validated interviews (`enrichment`: sessions, full text, known names, the people of an interview with their `P..`/`I..` codes for Cleaning) and the study folder's files for writing (`studyFiles`, with folder creation for the clean transcripts) |
| `src/modules/ai-gateway/` | Every AI call (spec 004): each person's own provider, the usage ledger with a `ref` per call, costs read from a dated price catalog, for one person or a whole study's work (spec 009) |
| `src/modules/transcripts/` | The Enrichment phase (spec 010): the imported text of validated interviews (raw version, speaker turns with stable ids) and the team lexicon: candidates by the app's rules, the AI for grouping and naming them, decisions, occurrences (runs of the `transcripts.lexicon` queue in `worker`); Cleaning (spec 011): corrections from the lexicon, the names and the AI, reviewed clean versions, published to a Drive subfolder (runs of the `transcripts.cleaning` queue). See its [README](src/modules/transcripts/README.md) |
| `src/modules/evidence/` | The Analysis phase (spec 012): verbatims and facts per validated interview, from the text analysed that `transcripts` computes (`analysedText`), checked word for word; decisions, speaker attribution, translations (queues `evidence.facts`, `evidence.translate`). See its [README](src/modules/evidence/README.md) |
| `src/modules/synthesis/` | Project insights (spec 013): insights proposed from the accepted facts of the project's studies (read through Evidence's `reads`), confidence and polarity computed by the app, decisions and links by a person (queues `synthesis.insights`, `synthesis.translate`). See its [README](src/modules/synthesis/README.md) |
| `src/platform/jobs.ts` | Queues (pg-boss), created by `migrate`; the server enqueues, the worker runs: `ingestion.inventory`, `ingestion.analysis`, `transcripts.lexicon`, `transcripts.cleaning`, `evidence.facts` (one per study), `evidence.translate`, `synthesis.insights` (one per project), `synthesis.translate` |
| `drizzle/` | Versioned SQL migrations (generated, plus hand-written constraints and cross-module foreign keys in `0001_access_rules.sql`, `0003_sources_rules.sql`) |
| `tests/` | API component and integration tests (real PostgreSQL) |

## Run

Node 24+ runs the TypeScript sources directly (no build step, erasable syntax only).

```bash
pnpm --filter @goodresearch/api dev        # needs a .env at the repo root and a running PostgreSQL
node apps/api/src/migrate.ts               # apply migrations
```

## Test

```bash
pnpm exec vitest run --project api:unit    # domain and use cases, no I/O
pnpm exec vitest run --project api:int     # PostgreSQL and a test identity provider via Testcontainers
```

Integration tests need Docker. With Colima, point Testcontainers to its socket:

```bash
export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
```

## Generate

| Command | Output |
|---|---|
| `pnpm --filter @goodresearch/api generate` | `packages/api-client/openapi.json` (no database needed) |
| `pnpm --filter @goodresearch/api db:generate` | a new migration from the Drizzle schemas |
| `pnpm --filter @goodresearch/api auth:schema` | `src/platform/auth/auth-schema.ts` from the auth library configuration |

Generated files are never edited by hand; CI fails if they are out of date.

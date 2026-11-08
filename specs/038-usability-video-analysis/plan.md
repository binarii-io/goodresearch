# Implementation Plan: Usability test analysis

**Branch**: `038-usability-video-analysis` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/038-usability-video-analysis/spec.md`

## Summary

A new **Usability analysis** module reads each ready test session's video against the tasks of its protocol version, with the trial's pipeline (transcript, screen log, task map, task readings, judge, arbiter), through a multimodal extension of the AI Gateway on Vertex AI. The video is copied from Drive to a staging bucket for the analysis only; screenshots are kept in the app's storage. People review observations by task; decided ones give task results, the study's results and SUS, and Facts of a new `usability` source that the project's synthesis reads. Usability test studies are offered only with Vertex AI.

## Technical Context

**Language/Version**: TypeScript strict, Node (repo versions)

**Primary Dependencies**: Fastify, Zod, Drizzle, pg-boss, AI SDK with its Vertex provider (already used), `@aws-sdk/client-s3` (already used), Google Cloud Storage JSON API over the provider's Google credentials, `ffmpeg` in the worker image (new system dependency, ADR-0013). React, TanStack, Lingui, `packages/ui`.

**Storage**: PostgreSQL migration `0062_usability_analysis.sql`: `usability_analyses`, `usability_transcripts`, `usability_task_results`, `usability_observations`, `usability_analysis_runs`, Evidence's `evidence_usability_supports` and `source = 'usability'`. S3-compatible object storage for screenshots. A staging bucket in the Vertex project for the temporary copies.

**Testing**: Vitest: pure domain first (SUS scoring, chunks and overlaps, deduplication, quote anchoring, verdict rules, decisions, results); use cases with fakes (fake gateway answering the stages, fake Drive bytes, fake media tools, fake storage); Testcontainers component test (run, decisions, facts, deletion); Playwright + axe on the Analysis tab with the dev fakes.

**Target Platform**: The self-hosted web app and its worker.

**Performance Goals**: A 30-minute session analysed in under 20 minutes of worker time; the review screen loads one session's observations and screenshots only (no study-wide load).

**Constraints**: No video kept by the app; temporary copies deleted at the end and within 24 h at the latest; every call in the ledger with its cost shown in the Analysis tab; names never added to prompts on an anonymised study; quality first, the cost is not the limit.

**Scale/Scope**: Up to 500 sessions per study, videos up to 3 hours.

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I Spec-driven | Spec 038 in the PR, Spec Kit steps run | Pass |
| II DDD | New module owns its aggregates; Ingestion, Research, Evidence reached through `index.ts`; domain pure (no SDK, no ffmpeg) | Pass |
| III Provider-agnostic | Vertex and GCS only in adapters; the domain sees `tier`, parts and a `MediaTools` port; the "Vertex only" rule is a product rule read from the provider kind | Pass, with the rule documented in ADR-0013 |
| IV AI proposes | Observations proposed, decided by a person; judge never rejects without contrary evidence; quotes verified; facts only from decided observations | Pass |
| V Test-first | Domain rules listed first in tasks | Pass |
| VI Contracts | Zod contracts, OpenAPI and client regenerated | Pass |
| VII Privacy | Temporary copies only, folder consent, pseudonyms, screenshots reserved to the team and deleted with the study | Pass |
| VIII Accessible, international | Lingui EN/FR, colours always with text, player with keyboard controls, axe | Pass |
| IX Simplicity | One new module because the concepts are new; stages are plain functions; no queue per stage | Pass |

Re-checked after design: pass.

## Project Structure

### Documentation

```text
specs/038-usability-video-analysis/{plan,research,data-model,quickstart}.md, contracts/api.md
docs/adr/0013-video-analysis-pipeline.md (new)
docs/domain/context-map.md: Usability analysis context, Observation, Task result, Session transcript, Fact source usability
docs/agent-journeys/14-usability-analysis.md (new) and README row
apps/api/src/modules/usability/README.md (new); apps/api/README.md row
```

### Source Code

```text
apps/api/src/modules/usability/
  domain/            sus.ts, chunks.ts, observation.ts, task-result.ts, verdict.ts, quotes.ts,
                     results.ts, analysis.ts, pipeline-plan.ts, estimate.ts
  application/       ports.ts, commands/{analysis-run,observation-commands}.ts,
                     queries/{analysis-queries,results-queries}.ts, pipeline/{stages,run-session}.ts
  infrastructure/    schema.ts, drizzle store, http.routes.ts, module.ts, media-tools.ts (ffmpeg),
                     staging.gcs.ts, prompts/{layout,transcript,screen-log,task-map,task,judge,arbiter}.ts
  tests/             fakes and tests
apps/api/src/modules/ai-gateway/  ports.ts (parts, tier), ai-sdk.model-runner.ts, fake runner, default prices
apps/api/src/modules/ingestion/   drive-gateway downloadFile/videoRange, proposePeopleFromText, index
apps/api/src/modules/evidence/    usability fact source, supports table, upsert/withdraw, synthesis reads
apps/api/src/modules/research/    createStudy gate (USABILITY_NEEDS_VERTEX)
apps/api/src/modules/assistant/   usability analysis counts, start card, next step
apps/api/src/platform/{storage.ts,jobs.ts}   put/get/delete; queue usability.analysis
apps/api/src/compose.ts, apps/api/drizzle/0062_usability_analysis.sql, Dockerfile (ffmpeg in worker)
packages/contracts/src/usability.ts (new), workspace.ts (aiProvider.kind)
apps/web/src/features/usability/  analysis-tab.tsx, session-review.tsx, task-shortcuts.tsx,
                                  observation-card.tsx, video-player.tsx, transcript-tab.tsx, results.tsx
apps/web/src/features/research/   create dialog and study list gated on Vertex
packages/ui: an amber "warning" tone for partial outcomes
apps/web/e2e/usability-analysis.spec.ts
```

**Structure Decision**: One new module for the analysis; the other modules gain narrow entry points only.

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
|---|---|---|
| ffmpeg in the worker | Frames, crops, audio chunks and screenshots made the trial reliable | Asking the model for screenshots: it cannot return images; sending only the whole video: the judge missed one-second errors |
| Staging bucket | Vertex reads large videos only from a bucket | Inline data is limited to 20 MB |
| A third fact source | Facts must point at their evidence; a test's is a moment and a screenshot, not transcript segments | Fake transcript segments would mislead Synthesis and the deck |

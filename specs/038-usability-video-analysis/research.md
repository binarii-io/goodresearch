# Research: Usability test analysis

Facts from the current code (code map of 2026-11-08) and from the trial on six real sessions (2026-11-07, scripts kept outside the repo).

## R1. A new bounded context: Usability analysis

**Decision**: New module `apps/api/src/modules/usability` owning the session analysis, its transcript, task results, observations, screenshots and the study results. It reads sessions (Ingestion), protocol versions (Research) and writes facts (Evidence) only through their `index.ts`, wired in `compose.ts`.

**Rationale**: Ingestion's analysis reads a transcript's beginning to name people; this one reads a whole video against a protocol and has its own aggregates. Putting it in Ingestion or Evidence would make either one own concepts it does not need.

**Alternatives**: Extend Evidence's interview analysis (spec 012). Rejected: its unit is a transcript segment, and its pipeline is text only.

## R2. Multimodal calls through the AI Gateway

**Decision**: Extend `ModelRequest` with ordered `parts`: text, a **file by URI** (`gs://…`, mime type, optional start and end offsets) and an **inline image** (JPEG bytes). Add a request option `tier: 'standard' | 'strong'`. Each provider kind maps the tiers to models in config (`AI_MODEL_<KIND>` stays the standard tier; new `AI_MODEL_<KIND>_STRONG`). Vertex defaults: standard `gemini-3.8-flash`, strong `gemini-4-argon`, with high media resolution set in the Vertex adapter. Other kinds refuse file parts with `MEDIA_NOT_SUPPORTED`.

**Rationale**: Every AI call stays in the gateway and its ledger (constitution); the arbiter needs "another model" than the judge (FR-007). Video tokens are reported by the provider as input tokens, so `costOf` stays right. A default price for `gemini-4-argon` (2.0 / 10.0 USD per million tokens, the trial's) joins `default-prices.ts`.

**Alternatives**: Calling Vertex directly from the module. Rejected: it would bypass the ledger and the provider rules.

## R3. Pipeline (from the trial)

| Stage | Input | Tier (Vertex model) |
|---|---|---|
| 0 Layout | 6 frames | standard (Flash): screen-share box to crop |
| 1 Transcript | audio by 18-min chunks, 1-min overlap | strong (Argon): speakers, times, language |
| 2 Screen log | cropped keyframes (1 every 3 s, near-duplicates dropped), by batches | standard: what is on screen |
| 3 Task map | transcript + screen log + protocol tasks | strong: start and end of each task, or not found |
| 4 Task reading | the task's part of the video (offsets) + its transcript + log | strong: outcome, time, path, observations |
| 5 Judge | dense frames ±6 s around the moment, context ±20 s, transcript | standard: kept / not confirmed / rejected with contrary evidence |
| 6 Arbiter | the same evidence | strong: settles every disagreement |

Overlaps are cut at their middle so each moment belongs to one chunk; observations are deduplicated by kind, task and moment within 10 s. Each stage records its tokens with the session's ref (`usability-analysis:<sessionId>`). The trial costs about 0.10 USD per video minute.

## R4. The video's temporary copy

**Decision**: The worker streams the video from Drive (`alt=media`, the person's own token, by ranges) to a temporary file, uploads it and its audio chunks to a **staging bucket** of the Vertex provider's project and region, and deletes both at the end in a `finally`. The bucket is `AI_VIDEO_STAGING_BUCKET` when set, else `<project>-goodresearch-video-staging`, created on first use with a lifecycle rule deleting objects after one day (FR-003's 24 hours). It is written with the same Google credentials as the Vertex provider serving the person (the shared service account or the person's own grant).

**Rationale**: Gemini on Vertex reads large videos only from a bucket URI; inline data is limited to 20 MB. Same project and region keep processing where the deployer set it (EU).

## R5. Media processing in the worker

**Decision**: `ffmpeg` in the worker image (keyframes, cropped frames, audio chunks, screenshots at a moment), driven by an infrastructure adapter `media-tools.ts`; work files in a per-session temp directory removed in a `finally`. No image library: ffmpeg writes the JPEG screenshots (640 px wide, quality 5).

**Rationale**: The trial's frames and crops are what made the judge reliable; ffmpeg is the standard tool, run as a child process with fixed arguments (no shell). It is a new system dependency of the worker image: ADR-0013.

## R6. Drive download

**Decision**: `DriveGateway.downloadFile(token, fileId, to)` streams the bytes to a path (ranged requests, resumable after a network error); `videoRange(token, fileId, range)` returns a byte range for the player.

## R7. The player

**Decision**: An authenticated route `GET /api/usability/sessions/:id/video` forwards `Range` requests to Drive with the person's own token and streams the bytes back; the web plays it in a `<video>` element seeking to a moment minus 3 s. Nothing is stored.

**Rationale**: Drive's embedded preview cannot seek to a time reliably; a range proxy plays from Drive with the person's access (FR-011). It goes through the same study and folder access checks as the Fieldwork.

## R8. Screenshots

**Decision**: Platform `storage.ts` (S3-compatible, already deployed) gains `put`, `get` and `deleteByPrefix`. Keys `usability/<studyId>/<sessionId>/<analysisId>/<observationId>.jpg`. Served by `GET /api/usability/observations/:id/screenshot` with the session's access rules; deleted with a new analysis of the session, the session or the study.

## R9. Facts from observations

**Decision**: Evidence gains a third fact source `usability` (beside `interview` and `survey`): `evidence_facts.source = 'usability'`, with `session_id`, and a support row `evidence_usability_supports` (fact id, observation id, quote, moment, screenshot key, participant code), following the survey-fact precedent (spec 029) instead of transcript verbatims. Evidence exposes `upsertObservationFact` and `withdrawObservationFact` in its `index.ts`; Usability calls them when an observation is accepted, edited, rejected or reopened. The statement is written in the study's language and translated by the existing `evidence.translate` job. Synthesis reads them through `FactForSynthesis` with `source: 'usability'` and the participant code.

**Rationale**: Synthesis already reads facts by study and theme; a new source keeps Evidence the owner of facts without inventing transcript segments.

## R10. Run

**Decision**: Table `usability_analysis_runs` and queue `usability.analysis` (one run per study, `singletonKey` = study, expire 6 h), sessions one after another, segments and tasks of a session in parallel (3 at a time); heartbeat after each stage and every minute during long calls, stop checked between stages. Each session's analysis records its stage and failure.

## R11. Frozen protocol version and out-of-date analyses

**Decision**: The analysis stores the protocol version and the video's Drive `modifiedTime` and size it read. The view marks it out of date when the session's current version (spec 037) or the video differs. Ingestion is not changed for this.

## R12. People from the transcript

**Decision**: Ingestion gains `proposePeopleFromText(sessionId, text, actor)`: the rules and the AI of spec 009 on a text given by the caller instead of a transcript file. Usability calls it with the beginning of its transcript when the session has no accepted participant or facilitator.

## R13. Usability studies need Vertex AI

**Decision**: The gateway's `providerOf` already returns the kind. `Me.aiProvider` gains `kind`; the create dialog, the Studies page and the assistant's `create_study` offer "Usability test" only for `vertex`; Research's `createStudy` refuses it otherwise (`USABILITY_NEEDS_VERTEX`) through a port wired in `compose.ts`. The analysis checks it again at start.

## R14. Estimate

**Decision**: Estimate = video minutes × tokens per minute per stage (calibrated from the trial: transcript, log, map, tasks, checks) × the current prices of each tier, shown as "at most". The real cost is the sum of the session's ledger entries.

## R15. Study results and SUS

**Decision**: Computed in a query from decided task results and observations: outcome counts, median time on task, difficulties grouped by the person's wording and counted by session, ease answers; SUS per session by the standard scoring (pure domain function), the mean for the study. Tasks matched by id across protocol versions (spec 036).

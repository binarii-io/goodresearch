---
status: accepted
date: 2026-11-08
---

# ADR-0013 — Usability test videos are read by a staged pipeline, from temporary copies

Related: [spec 038](../../specs/038-usability-video-analysis/spec.md), [ADR-0003](0003-modular-monolith-ddd-light-cqrs.md), [ADR-0005](0005-provider-agnostic-infrastructure.md).

## Context and problem statement

Spec 038 reads each usability test session's video task by task against its test protocol, and turns it into observations a person reviews. The videos stay in Drive; the AI Gateway sent only text; the worker had no tool to read video frames; no feature used the object storage. A trial on six real sessions (2026-11-07) showed what gives reliable observations: a transcript of the sound, a log of the screen from sharp frames, a map of the tasks, a reading of each task on its part of the video, a judge that looks at frames around each moment, and an arbiter on every doubt.

## Decision drivers

- Quality first: the cost (about 0.10 USD per video minute) is not the limit.
- No video kept by the app; temporary copies only, deleted at the end.
- Every AI call through the AI Gateway and its ledger, its cost shown where it is spent.
- Providers and clouds stay in adapters (ADR-0005).

## Considered options

1. Send the whole video to one model call and trust its answer.
2. **A staged pipeline, the trial's**: ffmpeg in the worker for frames, crops, sound and screenshots; a temporary copy in a bucket of the Vertex AI project; multimodal gateway calls by stage, a standard and a strong tier.
3. A video intelligence service of a cloud vendor for the frames and the sound.

## Decision outcome

Option 2.

- **New module `usability`** (ADR-0003): the analysis, its transcript, task results, observations, screenshots and study results. It reaches Ingestion (sessions, video bytes, consent, people), Research (protocol versions) and Evidence (facts) through their entry points, wired in `compose.ts`.
- **AI Gateway**: requests carry ordered `parts` (text, a file by URI with optional offsets, inline JPEG images) and a `tier` (`standard`, `strong`; `AI_MODEL_<KIND>_STRONG`). On Vertex AI the strong tier is `gemini-4-argon` and images and video are read in high resolution; other providers refuse file parts (`MEDIA_NOT_SUPPORTED`).
- **Vertex AI only, for now**: usability test studies are offered, and analysed, only when the provider in use is Vertex AI, the only one tested for video (the dev and test fake stands for it). This is a product rule read from the provider kind, not a dependency of the domain.
- **Temporary copies**: the worker copies the video from Drive with the person's own access (as a stream since the update below), uploads it and its audio chunks to a staging bucket of the Vertex project and region (`AI_VIDEO_STAGING_BUCKET`, or `<project>-goodresearch-video-staging` created on first use), and deletes them in a `finally`. The bucket deletes every object after one day, so a copy left by a crash goes within 24 hours.
- **ffmpeg in the worker image**: run as a child process with fixed arguments, never a shell; it reads the staged copy (update below), and its small work files live in a per-session temporary directory removed at the end.
- **Screenshots** go to the S3-compatible object storage, keyed by study, session and analysis; an hourly sweep deletes those no observation refers to after 12 hours (an analysis still running stores its screenshots before its observations) (a deleted session, study or replaced analysis).
- **The player** streams the video from Drive through an authenticated range proxy with the person's own access: nothing is stored.

### Consequences

- Good: the trial's quality; one ledger and cost display; videos never kept.
- Bad: a heavier worker image (ffmpeg) and temporary disk space for one video at a time per run; a bucket to allow in the deployer's project.
- Neutral: the arbiter, the judge and each stage can change model with the tiers, without code.

## Update: no copy of the video in the worker (deployment on Cloud Run)

On Cloud Run the worker's temporary directory is held in memory, and the worker is small: a local copy of an hour of video does not fit. So:

- **Drive to the staging bucket as a stream**: the video is read from Drive range after range and written to the bucket by parts of a resumable upload (8 MiB): never whole in memory or on disk.
- **ffmpeg reads the staged copy over https**, by ranges, with a short-lived access as a header (`-headers`), reconnecting on a network error. A frame or a span of sound seeks before the input, so only the bytes around it are read; the screen log reads the video once, as it streams. Decoding uses 2 threads.
- **Only small files stay local**: keyframes (JPEG, 960 wide) in the work directory, read by batches of 40 and removed once read; the sound of a span goes from ffmpeg's output straight to the bucket.
- **Memory**: measured on a real 31-minute session (2026-11-08), the whole worker peaked at 520 MiB (165 MiB idle), during the transcript stage (sound of two spans extracted at once) and the copy; it does not grow with the video's length, only with the spans read at once (three at most). 1 GiB for the worker, 2 GiB to be safe.
- **Long answers**: Vertex AI calls no longer use Node's default 300-second HTTP timeout, which a long transcript can pass before its first byte; the gateway's own timeout of each call applies.
- **Reads**: an analysis reads about two to three times the video's size from the bucket; keep the worker in the bucket's region.
- **Screenshots on Google Cloud Storage**: `STORAGE_PROVIDER=gcs` stores them in a bucket with the service's own identity, no key. The S3 mode of Google Cloud Storage with an HMAC key is not enough (no multi-object delete, which the sweep uses).

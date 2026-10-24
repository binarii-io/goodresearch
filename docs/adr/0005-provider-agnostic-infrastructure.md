---
status: accepted
date: 2026-10-24
---

# ADR-0005 — Provider-agnostic infrastructure and self-hosting

## Context and problem statement

goodresearch is open source; each organisation deploys it where it wants and plugs in its own identity provider, LLM and file sources. The prototype was tied to one cloud (one LLM, one file source, one identity provider, company context in prompts).

## Decision drivers

- Deployable on any host with Docker.
- No vendor in the domain or application layers.
- Data residency choice left to the deployer (personal data).

## Decision outcome

| Concern | Port | Default implementation |
|---|---|---|
| Identity | Login | **Better Auth**, sessions in PostgreSQL. Built-in email + password accounts by default (works with no external service; first account becomes workspace owner). Any OIDC provider via the `generic-oauth` plugin, enabled by env |
| LLM | One port per AI task, behind the AI Gateway | **Vercel AI SDK** (`ai` 7): any supported provider, including local models; provider, model and credentials configured per workspace |
| Object storage | `BlobStore` | **S3 API** (AWS, GCS interoperability, R2, Scaleway, Garage, SeaweedFS…); **SeaweedFS** in the dev/compose stack (MinIO community edition is archived) |
| File sources | `SourceConnector` | Upload first; Google Drive, SharePoint, S3 folders… as adapters |
| Transcript formats | `TranscriptParser` | VTT, SRT, plain `Speaker: text`; meeting-notes formats as adapters |
| Publishing | `DocumentPublisher` | Markdown/DOCX download first; external tools as adapters |

- Packaging: one multi-stage Dockerfile (`turbo prune --docker`), non-root, healthcheck; entrypoints `server`, `worker`, `migrate` (compose runs `migrate` to completion before the others start). `docker-compose.yml` with app, worker, PostgreSQL and SeaweedFS. Images on GHCR, tagged on release.
- Configuration: env only, validated at boot by `packages/config` (Zod), documented in `.env.example`, `*_FILE` variants for secrets.
- Organisation context given to the AI (industry, vocabulary hints) is workspace data, never code.

### Consequences

- Good: runs anywhere; no lock-in; data stays where the deployer decides.
- Bad: we test against S3-compatible and OIDC-compatible defaults, not every provider. Adapter contract tests mitigate this.

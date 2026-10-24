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
| Identity | Login | **Better Auth**, sessions in PostgreSQL, any OpenID Connect provider via the `generic-oauth` plugin (see update below) |
| LLM | One port per AI task, behind the AI Gateway | **Vercel AI SDK** (`ai` 7): any supported provider, including local models; provider, model and credentials configured per workspace |
| Object storage | `BlobStore` | **S3 API** (AWS, GCS interoperability, R2, Scaleway, Garage, SeaweedFS…); **SeaweedFS** in the dev/compose stack (MinIO community edition is archived) |
| File sources | `SourceConnector` | Upload first; Google Drive, SharePoint, S3 folders… as adapters |
| Transcript formats | `TranscriptParser` | VTT, SRT, plain `Speaker: text`; meeting-notes formats as adapters |
| Publishing | `DocumentPublisher` | Markdown/DOCX download first; external tools as adapters |

- Packaging: one multi-stage Dockerfile (`turbo prune --docker`), non-root, healthcheck; entrypoints `server`, `worker`, `migrate` (compose runs `migrate` to completion before the others start). `compose.yaml` with migrate, server, worker, PostgreSQL and SeaweedFS; `compose.dev.yaml` overlay for local evaluation. Images on GHCR, tagged on release.
- Configuration: env only, validated at boot by `packages/config` (Zod), documented in `.env.example`, `*_FILE` variants for secrets.
- Organisation context given to the AI (industry, vocabulary hints) is workspace data, never code.

### Consequences

- Good: runs anywhere; no lock-in; data stays where the deployer decides.
- Bad: we test against S3-compatible and OIDC-compatible defaults, not every provider. Adapter contract tests mitigate this.

## Update 2026-10-24 — sign-in only through external OpenID Connect providers (spec 001)

### Context

The first version of this ADR planned built-in email + password accounts so an instance could run without any external service. During the specification of the first feature, the maintainer decided that goodresearch must never manage credentials itself.

### Decision

- **No passwords, ever.** Better Auth runs with email + password disabled; sign-in goes only through OpenID Connect providers configured by the deployer (`generic-oauth`, one entry per provider: display name, issuer discovery URL, client id/secret, `trusted` flag).
- **Presets.** The first release documents and tests **Google**. Other providers work through the same generic mechanism; documented presets (e.g. Proton through SimpleLogin, since Proton itself offers no OpenID Connect provider as of 2026-10-24) come later.
- **Bootstrap.** The first admins are designated by `ADMIN_EMAILS` in the configuration; access for others is granted by an email/domain allow-list (`ACCESS_ALLOWLIST`) and then by team membership in the app.
- **Verified emails.** Accounts are created or linked only on a verified email, unless the provider is marked `trusted` by the deployer.
- **Development and tests** use a local mock OpenID Connect provider (`ghcr.io/navikt/mock-oauth2-server`) through the `compose.dev.yaml` overlay; it is never enabled in production configuration (startup refuses it with an https `APP_URL`).

### Consequences

- Good: no password storage, reset flow, breached-password checks or credential stuffing to handle.
- Bad: a deployer must register a client at an identity provider before the first sign-in; the README documents it for Google.

## Update 2026-10-24 — sign-in identity and source access are separate grants

### Context

Studies read their files from an external source chosen by each user, Google Drive first. It is tempting to request Drive scopes at Google sign-in and reuse the sign-in token, but that would make sources depend on the identity provider (a user signed in through another provider could never use Drive) and widen what sign-in asks for.

### Decision

- **Sign-in only asks `openid email profile`.** Its provider tokens are encrypted at rest (`encryptOAuthTokens`) and never used to access data.
- **Sources are "connected sources" per user**, behind connector ports (`DriveGateway` and `DriveAuthorization` for Google Drive, spec 002): each connector has its own OAuth consent, requested only when the user picks a folder, with its own encrypted, revocable tokens. Google Drive is the first adapter; others (upload, SharePoint, Dropbox, S3 folders) follow the same contract.
- **Google scopes** (decided in spec 002): **`drive.readonly`**, requested once by the Drive connector, and a folder is attached by **pasting its Drive link**.
  - `drive.file` with the Google Picker was rejected: picking a folder grants access to the folder item only, not to its files (verified 2026-10-24), so no inventory is possible. The Picker also fails in Safari and private windows.
  - `drive.metadata.readonly` would be enough for the inventory but is restricted too; importing transcripts (next feature) needs content, and two consents for the same verification class would be worse.
  - What the app reads is limited by the app itself (attached folder only, metadata only until transcripts are imported), not by Google.
  - Deployers: no Google verification for an *Internal* app (Google Workspace organisation); an *External* app shows a warning and is capped at 100 users until Google verifies it (restricted-scope verification and yearly security assessment).

### Consequences

- Good: any identity provider can be combined with any source; least privilege at sign-in.
- Bad: users go through a second consent screen the first time they connect a source.

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
| LLM | One port per AI task, behind the AI Gateway | **Vercel AI SDK** (`ai` 7): any supported provider, including local models; credentials per person, offered providers and models per instance (update below, spec 004) |
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

## Update 2026-10-24 — AI providers are per person (spec 004)

### Context

The interview guide assistant (spec 005) is the first AI feature. Organisations already pay for an AI provider, and the people using goodresearch often have their own access (a Google Cloud project with Vertex AI, an Anthropic or OpenAI key). A single key per instance would make the deployer pay for everyone and hide who uses what.

### Decision

- **Each person connects their own AI provider** at their first sign-in (mandatory when the instance offers at least one): Vertex AI through their own Google account (a separate, revocable consent with the `cloud-platform` scope, plus their Google Cloud project and region), or an Anthropic or OpenAI API key. Credentials are checked by a real minimal call before being saved, encrypted at rest (own key purpose, account id as AAD) and used only for that person's own actions.
- **The deployer chooses** which providers are offered (`AI_PROVIDERS`) and the model of each (`AI_MODEL_*`); there is no shared instance key.
- **Every call goes through the AI Gateway**, which resolves the caller's connection, classifies failures into a closed set and appends one usage entry per call (no prompt or answer text).
- Google OAuth and the token cipher move to `platform/`: Drive (spec 002) and Vertex AI share one Google client (`GOOGLE_CLIENT_ID`, `GOOGLE_DRIVE_*` still read) with separate tokens. Google revokes per app and person, so revoking one token withdraws both: the AI provider is removed from goodresearch without revoking at Google (the page links to the person's Google account permissions). Disconnecting Drive still revokes; the Vertex AI connection then needs attention and asks for a new consent.
- `GOOGLE_VERTEX_API_KEY` must not be set: the Vertex AI library would use it instead of each person's account.

### Consequences

- Good: costs and data processing stay with each person's own provider account; providers can be added as adapters.
- Bad: every person has to set up a provider before using the app; `cloud-platform` is a broad, sensitive Google scope (an External consent screen needs Google verification).

## Update 2026-10-25 — tools the app runs, skills, preparation kept in the app (spec 006)

### Context

Designing an interview guide needs a long method the assistant should only read when it is relevant, and wording rules that must be applied the same way every time. The prototype also wrote the guide and a schedule as documents in the study's Drive folder.

### Decision

- **Tools the app runs during an answer**: a gateway tool may carry `run`; the adapter lets the model take several steps (at most 6) and feeds each result back. Tools without `run` still end the answer as proposals the person decides.
- **Skills**: task instructions (interview guide design) are listed by name in the context and loaded by the assistant with a tool; once loaded they stay in the conversation's context. Writing rules for questions are an app-run tool with deterministic rules, not model judgement.
- **Preparation stays in the app**: the guide, the best practices and the schedule are app data, downloadable as Markdown or CSV; Drive keeps its read-only grant. Publishing to documents or spreadsheets will be a `PublishedDocument` adapter behind a port, with its own write grant.

### Consequences

- Good: the context stays small until a task needs a skill; the rules are testable and the same for every provider; no write access to people's drives.
- Bad: an answer may take several model calls (each recorded in the usage ledger as one streamed call with the summed usage); teams that want the guide in their drive download it until a publishing adapter exists.

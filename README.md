# goodresearch

> Better-designed studies, answers you can trust.

goodresearch is an open-source, self-hostable app for user research teams. It helps you prepare interview guides, collect and clean transcripts, check interview conduct, extract evidence and turn it into insights and recommendations — with AI proposing and humans deciding at every step.

**Status:** early. Sign-in through your identity provider, team-based access, teams and research projects work ([spec 001](specs/001-walking-skeleton/spec.md)); studies, transcripts and AI features come next.

## Principles

- **AI proposes, humans decide.** Every AI output is a proposal until validated; human decisions are never overwritten.
- **Provider-agnostic.** Bring your own identity provider (OIDC), LLM provider and S3-compatible storage. Runs anywhere with Docker.
- **Privacy by design.** Pseudonymised exports and AI synthesis inputs.

## Try it locally

Requirements: Docker with Compose v2.

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

Open <http://localhost:3000> and click **Sign in with Test provider**. On the test provider's page, type any user name and, in *claims*, `{"email": "admin@example.org"}`: you become the admin. Other `@example.com` emails get member accounts. The test provider accepts anything: never use `compose.dev.yaml` in production. If you are offline, add `127.0.0.1 oidc.localtest.me` to `/etc/hosts`.

## Deploy

goodresearch ships as one image with three commands (`server`, `worker`, `migrate`) and needs PostgreSQL, an S3-compatible store and an OpenID Connect identity provider. `compose.yaml` runs all of it except the identity provider.

1. **Create a sign-in client at your provider.** For Google: Google Cloud console → *APIs & Services* → *Credentials* → *Create credentials* → *OAuth client ID* → type *Web application*, authorised redirect URI `https://<your host>/api/auth/callback/google`. goodresearch only asks for `openid email profile`.
2. **Configure.** Copy `.env.example` to `.env` and fill it: `APP_URL`, `AUTH_SECRET` (`openssl rand -base64 48`), S3 credentials, `AUTH_PROVIDERS=google` with `AUTH_GOOGLE_*`, your email in `ADMIN_EMAILS`, and the emails or domains of your colleagues in `ACCESS_ALLOWLIST`. Every variable is described in [the configuration contract](specs/001-walking-skeleton/contracts/configuration.md); invalid values stop the app at start with the variable's name.
3. **Start.** `docker compose up -d --build`. `migrate` applies the database migrations, then `server` (port 3000) and `worker` start. Put a TLS reverse proxy in front and set `TRUSTED_PROXIES` to its address.
4. **Sign in** with the admin email, create a first team, and give colleagues access to teams from **Members** once they have signed in.

goodresearch never stores passwords. Any other OpenID Connect provider works the same way (`AUTH_<KEY>_*` variables); set `AUTH_<KEY>_TRUSTED=true` only for a provider you trust to send verified emails without the `email_verified` claim.

Health endpoints: `/health` (process up), `/ready` (database and storage reachable).

### Google Drive (optional)

Interview studies read their recordings and transcripts from a Google Drive folder that people attach by pasting its link. Each person connects their own Drive (read-only, separate from sign-in) and only sees folders that Drive shares with them.

1. In the Google Cloud project of your OAuth client, enable the **Google Drive API**.
2. On the OAuth consent screen, add the scope `https://www.googleapis.com/auth/drive.readonly`.
3. On the OAuth client, add the redirect URI `https://<your host>/api/sources/google-drive/callback`.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (the sign-in client's values work; the former names `GOOGLE_DRIVE_CLIENT_ID` / `_SECRET` are still read) and restart.

Google classifies `drive.readonly` as a *restricted* scope:

- with an **Internal** consent screen (Google Workspace organisation), no verification is needed and there is no user limit;
- with an **External** consent screen, people see an "unverified app" warning and at most 100 people can connect until Google verifies your app (restricted-scope verification and a yearly security assessment).

goodresearch only reads the attached folders and, for now, only file metadata; it never writes to Drive. Disconnecting Drive (Connected sources) revokes the permission at Google. If sign-in and Drive use the same Google Cloud project, the revocation also removes the sign-in consent: the next Google sign-in shows the consent screen again (sessions are not affected). Stored Drive permissions are encrypted with a key derived from `AUTH_SECRET`; changing it means everyone reconnects Drive.

### AI providers

Every person connects their own AI provider at their first sign-in: the costs and the processing of what they send to the AI stay with their own account. goodresearch stores the credential encrypted and uses it only for that person's actions.

- `AI_PROVIDERS`: providers offered, among `vertex`, `anthropic`, `openai` (default: all three; empty disables AI).
- `AI_MODEL_VERTEX`, `AI_MODEL_ANTHROPIC`, `AI_MODEL_OPENAI`: model used for each provider (defaults in `packages/config/src/env.ts`).
- **Anthropic, OpenAI**: nothing to set up; people paste their own API key, checked by a real call.
- **Google Vertex AI** (offered only with a Google client, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, which Drive uses too): people grant access to Google Cloud with their own Google account, then give their project ID and region; goodresearch checks that the Vertex AI API is enabled, that they may call models, and makes a real call.
  1. On the OAuth consent screen, add the scope `https://www.googleapis.com/auth/cloud-platform` (a *sensitive* scope: an External consent screen needs Google verification; an Internal one does not).
  2. On the OAuth client, add the redirect URI `https://<your host>/api/ai-provider/google/callback`.
  3. Each person's own Google Cloud project needs the Vertex AI API enabled and billing.
  4. Do not set `GOOGLE_VERTEX_API_KEY` (refused at start): it would bill every call to the deployer.

  Google withdraws access per app and person: disconnecting Google Drive also withdraws Vertex AI access (the AI provider then asks for a new consent). Removing the AI provider only deletes it from goodresearch; people withdraw Google access from their Google account permissions.

## Develop

Requirements: Node 24+, pnpm 12 (`npm i -g pnpm@12`), Docker.

```bash
pnpm install
pnpm check     # format, lint, typecheck, dependency boundaries, unused code
pnpm test      # unit, use-case, integration (Testcontainers) and Storybook accessibility tests
pnpm e2e       # Playwright + axe against the dev stack started with compose.dev.yaml
                # (its own project, goodresearch-dev, with its own database; both stacks use port 3000)
```

See [AGENTS.md](AGENTS.md) for all commands and the rules every change follows.

## Documentation

| Document | Content |
|---|---|
| [Constitution](.specify/memory/constitution.md) | Non-negotiable project principles |
| [Engineering standards](docs/standards.md) | How we structure, write, test and ship code |
| [Context map](docs/domain/context-map.md) | Bounded contexts and ubiquitous language |
| [Prototype reference](docs/domain/prototype-reference.md) | Validated flows and rules used as input for specs |
| [ADRs](docs/adr/) | Architecture decisions |
| [AGENTS.md](AGENTS.md) | Guide for contributors and coding agents |

## How features are built

Every feature follows [Spec Kit](https://github.com/github/spec-kit): `/speckit-specify` → (`/speckit-clarify`) → `/speckit-plan` → `/speckit-tasks` → (`/speckit-analyze`) → `/speckit-implement` (steps in parentheses are optional). Specs live in `specs/NNN-slug/`.

## Stack

TypeScript monorepo (pnpm + Turborepo) · Fastify + Zod · PostgreSQL + Drizzle · pg-boss · Vercel AI SDK · Better Auth · React + Vite + TanStack · design system on shadcn/Base UI + Tailwind · Lingui · Biome · Vitest · Playwright · Testcontainers. See [ADR-0002](docs/adr/0002-typescript-monorepo-and-tooling.md) to [ADR-0006](docs/adr/0006-frontend-and-design-system.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). First-time contributors sign the [CLA](CLA.md) once, through a comment on their pull request. Security issues: see [SECURITY.md](SECURITY.md).

## License

Copyright © 2026 Andrea Delre ([binarii](https://github.com/binarii-io)).

goodresearch is licensed under the [GNU Affero General Public License v3.0 only](LICENSE) (AGPL-3.0-only). See [ADR-0007](docs/adr/0007-license.md) for the rationale.

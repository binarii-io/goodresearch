# goodresearch

> Better-designed studies, answers you can trust.

goodresearch is an open-source, self-hostable app for user research teams. It helps you prepare interview guides, collect and clean transcripts, check interview conduct, extract evidence and turn it into insights and recommendations — with AI proposing and humans deciding at every step.

**Status:** bootstrapping. Standards and domain model are defined; no feature is implemented yet.

## Principles

- **AI proposes, humans decide.** Every AI output is a proposal until validated; human decisions are never overwritten.
- **Provider-agnostic.** Bring your own identity provider (OIDC), LLM provider and S3-compatible storage. Runs anywhere with Docker.
- **Privacy by design.** Pseudonymised exports and AI synthesis inputs.

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

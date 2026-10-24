# HTTP API contract — 001 walking skeleton

Source of truth at implementation time: the Zod schemas in `packages/contracts`, exported as OpenAPI 3.1 at `/api/openapi.json`. This document fixes the resources, rules and error codes the schemas must implement.

Conventions (from [standards](../../../docs/standards.md#http)): JSON, `/api` prefix, same-origin cookie session, ISO 8601 UTC dates, UUIDv7 ids. Errors are `application/problem+json` with a stable `code`. Every route except `/api/public-config`, `/api/auth/*`, `/health` and `/ready` requires an active session (401 `UNAUTHENTICATED` otherwise). Writes on versioned resources send the `version` they were based on.

## Public

| Method & path | Purpose | Response |
|---|---|---|
| `GET /api/public-config` | What the sign-in screen needs | `{ providers: [{ id, displayName }], signInConfigured: boolean }` |
| `GET\|POST /api/auth/*` | Auth library (OIDC redirect, callback, sign-out, session) | managed by the library |
| `GET /health` | Liveness | `200` |
| `GET /ready` | Readiness (database, storage) | `200` / `503` |

## Me

| Method & path | Purpose | Body / response |
|---|---|---|
| `GET /api/me` | Current account and access | `{ id, name, email, role, language, teams: [{ id, name }] }` |
| `PUT /api/me/language` | Store interface language | `{ language: 'en' \| 'fr' }` → `204` |

## Projects

| Method & path | Purpose | Body / response | Errors |
|---|---|---|---|
| `GET /api/projects?team=<teamId>` | Accessible projects, `updatedAt desc` | `[{ id, name, team: { id, name }, updatedAt }]` | — |
| `POST /api/projects` | Create | `{ name, goal?, teamId }` → `201 { id }` | `VALIDATION`, `TEAM_NOT_FOUND` |
| `GET /api/projects/{id}` | Overview | `{ id, name, goal, team, createdAt, updatedAt, version }` | `PROJECT_NOT_FOUND` |
| `PUT /api/projects/{id}/name` | Rename | `{ name, version }` → `200 { version }` | `PROJECT_NOT_FOUND`, `VERSION_CONFLICT`, `VALIDATION` |
| `PUT /api/projects/{id}/goal` | Edit goal | `{ goal, version }` → `200 { version }` | same |
| `PUT /api/projects/{id}/team` | Move to a team | `{ teamId, version }` → `200 { version }` | same + `TEAM_NOT_FOUND` |

A project or team outside the caller's access is always reported as `*_NOT_FOUND` (404), never 403 (FR-012).

## Teams

| Method & path | Who | Purpose | Body / response | Errors |
|---|---|---|---|---|
| `GET /api/teams` | all | Admin: all teams; member: own teams | `[{ id, name, members: [{ id, name }], projectCount }]` | — |
| `POST /api/teams` | admin | Create | `{ name }` → `201 { id }` | `FORBIDDEN`, `TEAM_NAME_TAKEN`, `VALIDATION` |
| `PUT /api/teams/{id}/name` | admin | Rename | `{ name, version }` → `200 { version }` | `TEAM_NOT_FOUND`, `TEAM_NAME_TAKEN`, `VERSION_CONFLICT` |
| `DELETE /api/teams/{id}` | admin | Delete an empty team | `204` | `TEAM_NOT_FOUND`, `TEAM_HAS_PROJECTS` (`detail.projectCount`) |

## Members (admin only; members get `404` on all of them)

| Method & path | Purpose | Body / response | Errors |
|---|---|---|---|
| `GET /api/members` | All accounts | `[{ id, name, email, role, status, teams, provider, lastSignInAt }]` | — |
| `GET /api/members/{id}/access-history` | Access events, newest first | `[{ occurredAt, actor: { id, name } \| null, type, details }]` | `MEMBER_NOT_FOUND` |
| `PUT /api/members/{id}/teams/{teamId}` | Grant team access | `204` (idempotent) | `MEMBER_NOT_FOUND`, `TEAM_NOT_FOUND`, `ACCOUNT_DELETED` |
| `DELETE /api/members/{id}/teams/{teamId}` | Remove team access | `204` (idempotent) | same |
| `PUT /api/members/{id}/role` | Promote / demote | `{ role: 'admin' \| 'member' }` → `204` | `LAST_ADMIN`, `ACCOUNT_DELETED` |
| `POST /api/members/{id}/deactivation` | Deactivate (ends sessions) | `204` | `LAST_ADMIN`, `ACCOUNT_DELETED` |
| `DELETE /api/members/{id}/deactivation` | Reactivate | `204` | `ACCOUNT_DELETED` |
| `DELETE /api/members/{id}` | Delete by anonymisation | `{ confirmation: '<current email>' }` → `204` | `LAST_ADMIN`, `CONFIRMATION_MISMATCH`, `ACCOUNT_DELETED` |

## Error codes → HTTP status

| Code | Status |
|---|---|
| `UNAUTHENTICATED` | 401 |
| `FORBIDDEN` | 403 — admin-only action on a collection (e.g. `POST /api/teams`) where nothing is disclosed |
| `VALIDATION` | 422 (`errors[]` with field paths) |
| `PROJECT_NOT_FOUND`, `TEAM_NOT_FOUND`, `MEMBER_NOT_FOUND` | 404 |
| `VERSION_CONFLICT`, `TEAM_NAME_TAKEN`, `TEAM_HAS_PROJECTS`, `LAST_ADMIN`, `ACCOUNT_DELETED`, `CONFIRMATION_MISMATCH` | 409 |
| unexpected | 500 with `requestId` |

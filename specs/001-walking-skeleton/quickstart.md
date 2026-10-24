# Quickstart — validate 001 walking skeleton

Run guide proving the feature end to end. Configuration: [contracts/configuration.md](contracts/configuration.md). API: [contracts/http-api.md](contracts/http-api.md).

## Prerequisites

- Docker with Compose v2.
- For development: Node 24 LTS and pnpm 12 (`npm i -g pnpm@12`).

## A. Local evaluation with the test identity provider

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build   # test provider, sample access rules
```

Open `http://localhost:3000`.

1. Sign-in screen shows **"Sign in with Test provider"** and a language switch; no email/password field.
2. On the test provider's page, type any user name and, in *claims*, `{"email": "admin@example.org"}` (listed in `ADMIN_EMAILS` by `compose.dev.yaml`) → asked to create a first team → create "Research" → empty home page.
3. Create a project "Onboarding study" with a goal and team "Research" → overview page; edit the name in place, press Enter; reload: change kept.
4. In another browser profile, sign in with `{"email": "sam@example.com"}` (domain allow-listed) → "no access yet" state.
5. As admin, open **Members**: Sam is highlighted without team → grant "Research" → Sam reloads and sees the project.
6. Open Sam's **access history**: account creation and team grant are listed with actor and time.
7. Sign in as `kim@not-allowed.example` → generic refusal, and Members shows no new account.
8. Sign in with `{"email": "lee@example.com", "email_verified": false}` → generic refusal (also covered by integration tests).
9. Switch to Français on any screen: all labels change, content stays as typed; sign out and back in: still French.
10. Repeat steps 2–5 keyboard only.

## B. With Google

1. In the Google Cloud console, create an OAuth client of type *Web application* with redirect URI `<APP_URL>/api/auth/callback/google`.
2. Set `AUTH_PROVIDERS=google`, `AUTH_GOOGLE_DISPLAY_NAME=Google`, `AUTH_GOOGLE_ISSUER=https://accounts.google.com`, client id/secret, your email in `ADMIN_EMAILS`.
3. Copy `.env.example` to `.env`, fill it, run `docker compose up -d --build` (without `compose.dev.yaml`) and repeat A.1–A.3 with your Google account (SC-001: under 15 minutes).

## C. Automated checks

```bash
pnpm install
pnpm check          # format, lint, typecheck, knip, dependency boundaries
pnpm test           # unit + use-case + integration (Testcontainers) + Storybook a11y
pnpm e2e            # Playwright + axe against the stack started with compose.dev.yaml
```

Expected: all green; e2e covers SC-004 (access matrix), SC-005 (sign-in matrix), SC-006 (no missing French string), SC-007 (axe: zero serious/critical), SC-009, SC-010.

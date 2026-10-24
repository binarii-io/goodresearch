# Configuration contract — 001 walking skeleton

All configuration comes from environment variables, validated at boot by `packages/config` (Zod). An invalid value stops the process with a message naming the variable. Every variable accepts a `<NAME>_FILE` variant (path to a file holding the value) for secrets. `.env.example` documents each one.

| Variable | Required | Example | Rules |
|---|---|---|---|
| `APP_URL` | yes | `https://research.example.org` | public base URL; `https` in production |
| `AUTH_SECRET` | yes | (32+ random chars) | signs sessions |
| `DATABASE_URL` | yes | `postgres://…` | |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | yes | | S3-compatible store; `S3_FORCE_PATH_STYLE` (default `false`) |
| `AUTH_PROVIDERS` | yes (empty = "sign-in not configured" page) | `google` | comma-separated provider keys |
| `AUTH_<KEY>_DISPLAY_NAME` | per provider | `Google` | shown on the button |
| `AUTH_<KEY>_ISSUER` | per provider | `https://accounts.google.com` | discovery at `<issuer>/.well-known/openid-configuration` |
| `AUTH_<KEY>_CLIENT_ID`, `AUTH_<KEY>_CLIENT_SECRET` | per provider | | redirect URI to register: `<APP_URL>/api/auth/callback/<key>` |
| `AUTH_<KEY>_TRUSTED` | no (default `false`) | `false` | `true` = accept emails without `email_verified` |
| `ADMIN_EMAILS` | yes | `alex@example.org` | comma-separated; become admin at first sign-in; implicitly allowed |
| `ACCESS_ALLOWLIST` | no | `sam@example.org,research.example.com` | comma-separated emails and domains (an entry without `@` is a domain); exact match, case-insensitive |
| `S3_CREATE_BUCKET` | no (default `false`) | `true` | `migrate` creates the bucket if missing (dev) |
| `AUTH_SIGN_IN_RATE_LIMIT` | no (default `20`) | `60` | sign-in attempts per client IP and minute (raise it when many people share one IP) |
| `TRUSTED_PROXIES` | no | `10.0.0.0/8` | client IP resolution behind a proxy |
| `LOG_LEVEL` | no (default `info`) | | pino levels |

Preset documented in this feature: **Google** (`AUTH_PROVIDERS=google`, issuer `https://accounts.google.com`). `.env.example` ships production-safe defaults (no provider). The `dev` compose profile injects `AUTH_PROVIDERS=mock` (local test provider), sample admin/allow-list values and `S3_CREATE_BUCKET=true`; startup refuses the mock provider when `APP_URL` is https.

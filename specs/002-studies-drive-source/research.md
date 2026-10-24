# Research — 002 studies with a Google Drive source

Checked on 2026-10-24 (Google Drive API v3, Google OAuth 2.0, Picker docs).

## R1. Drive permission and folder selection

- **Decision**: scope **`https://www.googleapis.com/auth/drive.readonly`**, requested once; folders attached by **pasting a Drive link** (`/drive/folders/<id>`, `/drive/u/<n>/folders/<id>`, `?id=<id>`, or the bare id).
- **Rationale**: with `drive.file` + Google Picker, picking a folder grants access to the folder item only, not its children (`files.list q='<id>' in parents` returns 0 files) — no inventory possible. `drive.metadata.readonly` is restricted too and transcript import (next feature) needs content. Pasted links match the prototype's UX and work in every browser (the Picker iframe fails in Safari and private windows).
- **Consequences**: restricted scope → deployers use an *Internal* consent screen (Workspace, no verification) or get Google verification for *External* use (otherwise 100-user cap). The app limits itself to the attached folder tree and to metadata in this feature (FR-008); this is enforced by our code, not by Google.
- **Alternatives**: `drive.file` + Picker (rejected: no folder contents); `drive.metadata.readonly` (rejected: same verification class, second consent later).

## R2. OAuth flow for the Drive connection

- **Decision**: server-side authorization code flow with PKCE and `state`, separate from sign-in:
  `GET /api/sources/google-drive/connect?returnTo=…` → redirect to `https://accounts.google.com/o/oauth2/v2/auth` with `scope=drive.readonly`, `access_type=offline`, `prompt=consent`, `login_hint` = account email → `GET /api/sources/google-drive/callback` exchanges the code at `https://oauth2.googleapis.com/token`, checks the granted `scope` contains `drive.readonly`, stores the **refresh token encrypted**, fetches the Google account email (`/drive/v3/about?fields=user`).
- **Client**: configured with `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` (may be the same values as the Google sign-in client). Redirect URI to register: `<APP_URL>/api/sources/google-drive/callback`. Without them, the Drive connector is disabled and studies explain it.
- **Disconnect**: `POST https://oauth2.googleapis.com/revoke` with the refresh token, then delete it. Revocation removes every scope granted to the Google Cloud project; if the deployer uses the same project for sign-in, the next Google sign-in shows the consent screen again (app sessions are not affected). Documented.
- **Errors**: `invalid_grant` on refresh (revoked, expired in "Testing" status after 7 days) → connection marked lost; the person is asked to reconnect (SC-007).
- **No library**: plain `fetch` (no `googleapis`, very large).

## R3. Token encryption at rest

- **Decision**: AES-256-GCM (`node:crypto`), key derived with HKDF-SHA256 from `AUTH_SECRET` (info `goodresearch/source-connections/v1`); stored as `v1:<iv>:<tag>:<ciphertext>` (base64url). Rotating `AUTH_SECRET` invalidates stored connections (people reconnect) — documented.
- **Alternatives**: separate `ENCRYPTION_KEY` (rejected for now: one more secret to manage; can be added later via the version prefix).

## R4. Inventory

- **Calls**: `files.get` on the root (`fields=id,name,mimeType,trashed,driveId,owners(displayName,emailAddress),webViewLink`, `supportsAllDrives=true`), then a breadth-first walk with `files.list` (`q='<id1>' in parents or '<id2>' in parents … and trashed=false`, up to 20 parents per query, `pageSize=1000`, `supportsAllDrives=true`, `includeItemsFromAllDrives=true`, `corpora=drive&driveId=…` for shared drives else `corpora=user`, `fields=nextPageToken,incompleteSearch,files(id,name,mimeType,size,modifiedTime,webViewLink,parents,shortcutDetails(targetId,targetMimeType))`). `incompleteSearch=true` → failed inventory.
- **Shortcuts**: resolved with `files.get(targetId)`; listed once per target id; shortcut to a folder inside the tree is not followed (no cycles, visited set); unresolvable target → skipped and counted.
- **Kinds** (FR-013): transcript = `application/vnd.google-apps.document`, Word (`.doc`, `.docx`, `application/msword`, `…wordprocessingml.document`), `text/plain`, `.txt`, `.vtt`, `.srt`, `text/vtt`, `application/x-subrip`; media = `audio/*`, `video/*`; other = everything else. Folders are walked, not listed.
- **Group** (FR-014): name of the first-level sub-folder on the path, `Root` for direct children.
- **Execution**: pg-boss job `ingestion.inventory` (singleton per study), run by the `worker` with the requesting person's connection; progress (`folders`, `files`) written every page; new inventory replaces the previous one only on success (in one transaction); failure keeps the previous files and records the reason. Backoff on `403 userRateLimitExceeded` / `429` (exponential with jitter, max 5 tries).
- **Volume**: 10,000 files ≈ 10–100 list calls, well below Drive quotas (325,000 units/min per user).

## R5. Folder access checks (FR-010a)

- **Decision**: `files.get(folderId)` with the person's own token: 200 and not trashed → granted; 404 → denied (no access or deleted); `invalid_grant` → connection lost. Results stored per (person, study) with `checkedAt`; reused for 5 minutes. Admin exception (detach, delete) bypasses the check.

## R6. Module placement

- **Study** aggregate in **research** (with Project). **Source connection**, **study source**, **inventory** and **folder access** in a new **ingestion** module. Research and ingestion talk through ports wired in `compose.ts` (no cross-module imports): research asks ingestion whether a person may act on a study; ingestion asks research whether a person can access a study's project.
- Deleting a study cascades to its ingestion rows (cross-module foreign key `ON DELETE CASCADE` in SQL, integrity only).

## R7. Testing Drive without Google

- **Decision**: a `DriveGateway` port. Use cases and API component tests use an in-memory fake Drive (tree of folders/files, access lists per Google account, revocation). The `fetch`-based adapter is unit-tested with a fake `fetch` (requests asserted: only `GET` to Drive, `POST` only to the token and revoke endpoints — SC-005). End-to-end tests cover studies; the Drive flow is verified manually against real Google (quickstart B).

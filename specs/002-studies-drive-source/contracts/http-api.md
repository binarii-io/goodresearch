# HTTP API contract — 002 (additions)

Conventions of [spec 001](../../001-walking-skeleton/contracts/http-api.md) apply (problem+json, versioned writes, 404 outside access).

## Studies (research)

| Method & path | Purpose | Body / response | Errors |
|---|---|---|---|
| `GET /api/projects/{projectId}/studies` | Studies of a project | `[{ id, name, type, hasFolder, folderName \| null, updatedAt }]` — `folderName` only with confirmed folder access | `PROJECT_NOT_FOUND` |
| `POST /api/projects/{projectId}/studies` | Create | `{ name, type: 'interviews' }` → `201 { id }` | `PROJECT_NOT_FOUND`, `VALIDATION` |
| `GET /api/studies/{studyId}` | Study | `{ id, name, type, project: { id, name }, createdAt, updatedAt, version }` | `STUDY_NOT_FOUND` |
| `GET /api/studies/{studyId}/source` | Folder and inventory | `{ access: 'full' \| 'no-folder-access' \| 'drive-not-connected' \| 'drive-unavailable', driveConfigured, folderOwner, source: StudySource \| null }` — `source` only when `access = 'full'` | `STUDY_NOT_FOUND` |
| `PUT /api/studies/{studyId}/name` | Rename | `{ name, version }` → `{ version }` | `STUDY_NOT_FOUND`, `VERSION_CONFLICT`, `FOLDER_ACCESS_REQUIRED` |
| `DELETE /api/studies/{studyId}` | Delete | `204` | `STUDY_NOT_FOUND`, `FOLDER_ACCESS_REQUIRED` (non-admins) |

## Study source and inventory (ingestion)

| Method & path | Purpose | Body / response | Errors |
|---|---|---|---|
| `PUT /api/studies/{studyId}/source` | Attach or replace the folder | `{ link }` → `202` (inventory started) | `NOT_A_DRIVE_FOLDER_LINK`, `FOLDER_NOT_FOUND`, `DRIVE_NOT_CONNECTED`, `DRIVE_NOT_CONFIGURED`, `INVENTORY_RUNNING` |
| `DELETE /api/studies/{studyId}/source` | Detach (admins even without folder access) | `204` | `FOLDER_ACCESS_REQUIRED` |
| `POST /api/studies/{studyId}/source/inventory` | Refresh | `202` | `INVENTORY_RUNNING`, `FOLDER_ACCESS_REQUIRED`, `DRIVE_NOT_CONNECTED` |
| `GET /api/studies/{studyId}/source/files?kind=&group=` | Inventory files | `[{ id, name, kind, group, size, modifiedAt, webViewLink }]` | `FOLDER_ACCESS_REQUIRED` |

`StudySource` = `{ folderId, folderName, ownerName, webViewLink, attachedBy: { id, name }, attachedAt, inventory: { status, startedAt, finishedAt, runBy, progress: { folders, files }, failure, lastSuccessAt, outdated, totals: { byKind: { transcript, media, other }, byGroup: [{ group, count }] } } }`.

## Connected sources (ingestion)

| Method & path | Purpose | Response | Errors |
|---|---|---|---|
| `GET /api/me/sources` | Own connections | `[{ connector: 'google-drive', configured, status: 'connected' \| 'lost' \| 'none', externalAccount?, connectedAt? }]` | — |
| `GET /api/sources/google-drive/connect?returnTo=/studies/…` | Start consent (browser navigation) | `302` to Google | `DRIVE_NOT_CONFIGURED` |
| `GET /api/sources/google-drive/callback` | OAuth callback (browser) | `302` to `returnTo` with `?drive=connected` or `?drive=error` | — |
| `DELETE /api/me/sources/google-drive` | Disconnect (revokes at Google) | `204` | — |

New error codes: `STUDY_NOT_FOUND` (404), `FOLDER_ACCESS_REQUIRED` (403), `NOT_A_DRIVE_FOLDER_LINK` (422), `FOLDER_NOT_FOUND` (422), `DRIVE_NOT_CONNECTED` (409), `DRIVE_NOT_CONFIGURED` (409), `INVENTORY_RUNNING` (409), `DRIVE_UNAVAILABLE` (503).

The post-consent `returnTo` is reduced to a same-origin path after URL normalisation (no open redirect).

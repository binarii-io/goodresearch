# Data model — 002 studies with a Google Drive source

## research module

### Study (aggregate root)

| Field | Type | Rules |
|---|---|---|
| id | StudyId | UUIDv7 |
| projectId | ProjectId | required, same module |
| name | string | 1–120 chars after trim |
| type | `'interviews'` | `survey` and `usability-test` are known but not creatable (FR-002) |
| createdBy | AccountId? | |
| createdAt, updatedAt | timestamp | `updatedAt` changes with name only |
| version | integer | optimistic concurrency |

Commands: `create-study`, `rename-study`, `delete-study`. Access: project access (team) **and** `StudyActionGate.canAct(account, study)` from ingestion (folder access, FR-010a); `delete-study` for admins bypasses the folder check (FR-010b).
Queries: `list-studies(projectId)` (most recently updated first, with source status from ingestion), `get-study`.
Table `research_studies`, FK `project_id → research_projects(id) ON DELETE CASCADE`.

## ingestion module

### SourceConnection (aggregate root, one per account and connector)

| Field | Type | Rules |
|---|---|---|
| accountId | AccountId | PK with `connector` |
| connector | `'google-drive'` | |
| externalAccount | string | Google account email |
| encryptedRefreshToken | string | AES-256-GCM (research R3); never returned by the API |
| status | `'connected' \| 'lost'` | `lost` after `invalid_grant` |
| connectedAt | timestamp | |

Disconnect = revoke at Google + delete row (FR-009). Deleting an account (spec 001) cascades.

### StudySource (aggregate root, one per study)

| Field | Type | Rules |
|---|---|---|
| studyId | StudyId | PK, FK `research_studies(id) ON DELETE CASCADE` |
| folderId | string | Drive folder id |
| folderName, ownerName, webViewLink | string | refreshed with each inventory |
| attachedBy, attachedAt | | |
| inventory | Inventory | see below |

Invariants: one folder per study; replacing the folder discards the inventory (FR-011); only one inventory runs at a time (`INVENTORY_RUNNING`).

**Runs** (PR #2 review): a job carries `{ studyId, folderId, runId }`; progress, completion and failure apply only while the study still points to that folder, on that run, still `running` — an old run never writes over a replaced or detached folder. A run older than 35 minutes (job expiry 30 min) is stale and can be replaced. Every exit of a job records a final state; a refused enqueue ends the run as `NOT_STARTED`. A stale run still marked `running` is shown as `failed` with reason `INTERRUPTED` (computed on read, not stored).

### Inventory (part of StudySource)

| Field | Type | Rules |
|---|---|---|
| status | `'never' \| 'running' \| 'done' \| 'failed'` | |
| startedAt, finishedAt, runBy | | |
| progress | `{ folders, files }` | updated during the run |
| failure | string? | reason code: `FOLDER_NOT_FOUND`, `ACCESS_LOST`, `INCOMPLETE`, `DRIVE_ERROR`, `NOT_STARTED`; `INTERRUPTED` is only shown, never stored |
| runId | text | `inventory_run_id`: a new unique id for each started run, cleared by each attach (migration 0004) |
| lastSuccessAt | timestamp? | files shown belong to this run; `outdated` when the latest run failed |

### InventoryFile (table `ingestion_inventory_files`, replaced atomically on success)

| Field | Type |
|---|---|
| studyId, fileId | PK |
| name | string |
| kind | `'transcript' \| 'media' \| 'other'` |
| group | string (`Root` or first-level sub-folder name) |
| mimeType | string |
| size | bigint? |
| modifiedAt | timestamp |
| webViewLink | string |

### FolderAccess (table `ingestion_folder_access`)

| Field | Type | Rules |
|---|---|---|
| studyId, accountId | PK | |
| result | `'granted' \| 'denied'` | |
| checkedAt | timestamp | reused for 5 minutes (FR-010a) |

## Pure domain functions (test-first)

- `parseDriveFolderLink(input) → Result<folderId, 'NOT_A_DRIVE_FOLDER_LINK'>`
- `classifyFile({ name, mimeType }) → kind`
- `groupOf(pathFromRoot) → group`
- `inventoryWalk` dedupe rules for shortcuts (visited ids)
- `folderAccessDecision({ role, cached, now, action })` (5-minute reuse, admin exception)

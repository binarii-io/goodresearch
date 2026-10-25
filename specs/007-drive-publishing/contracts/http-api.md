# HTTP API: Drive publishing

Session required; gate: project team, interview study, folder access (spec 002/006). Writing endpoints also need a write Drive connection (`409 DRIVE_WRITE_REQUIRED`).

| Method | Path | Body | Answer |
|---|---|---|---|
| GET | `/api/studies/:studyId/publications` | — | `200 Publication[]` (runs a check for files not checked in 5 min) |
| POST | `/api/studies/:studyId/publications` | `{ kinds: ('guide' \| 'best-practices' \| 'schedule')[], language }` | `201 Publication[]`; `409 DRIVE_WRITE_REQUIRED`, `409 ALREADY_PUBLISHED`, `422 NO_SOURCE_FOLDER` |
| POST | `/api/publications/:publicationId/check` | — | `200 Publication` |
| GET | `/api/publications/:publicationId/changes` | — | `200 DriveChange[]` |
| POST | `/api/publications/:publicationId/decisions` | `{ decisions: [{ changeId, decision: 'accept' \| 'reject', final? }] }` | `200 { applied, rejected, alreadyDecided }`; `409 VERSION_CONFLICT` (Drive or app changed: check again) |
| POST | `/api/publications/:publicationId/update` | `{ replaceDriveChanges: boolean }` | `200 Publication`; `409 DRIVE_CHANGES_PENDING`, `409 DRIVE_CHANGED_MEANWHILE`, `403 DRIVE_CANNOT_EDIT` (detail: owner) |
| DELETE | `/api/publications/:publicationId` | — | `204` (forgets it; nothing changes in Drive) |
| GET | `/api/sources/google-drive/connect?access=write&returnTo=` | — | redirect to Google consent (`drive`, incremental) |

- `Publication`: `{ id, kind, fileName, webLink, language, state, unavailableReason, counts: { outOfDate, fromDrive, conflicts, notUnderstood }, canEdit, owner, lastEditor, publishedBy, publishedAt, updatedBy, updatedAt, lastCheckedAt }`.
- `DriveChange`: `{ id, itemKey, kind, label (section and question for the guide, person for the schedule), base, drive, app, decision, decidedBy }`.

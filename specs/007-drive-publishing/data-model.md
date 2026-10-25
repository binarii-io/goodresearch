# Data model: Publish the study preparation to Drive

## publishing_documents (PublishedDocument aggregate)

| Column | Type | Rules |
|---|---|---|
| id | text PK | |
| study_id | text | FK → research_studies ON DELETE CASCADE (files stay in Drive) |
| kind | text | `guide` \| `best-practices` \| `schedule`; unique (study_id, kind) |
| file_id, file_name, web_link | text | at the source; name refreshed on rename |
| language | text | `en` \| `fr`, fixed at first publication |
| time_zone | text null | the schedule's time zone (the publisher's), for its dates |
| base | jsonb | items (`[key, value]` pairs) read back after the last write |
| base_version | integer | Drive `version` of that read |
| base_revision | text null | Docs revision id (precondition of the next rewrite) |
| published_by, updated_by | text null | FK → auth_users ON DELETE SET NULL |
| published_at, updated_at | timestamptz | |
| state | text | `in-sync` \| `out-of-date` \| `changed-in-drive` \| `conflict` \| `unavailable` |
| unavailable_reason | text null | `missing` (deleted or no access) \| `trashed` \| `moved` |
| last_checked_at | timestamptz null | |
| drive | jsonb null | items of the file at the last check (reused while its version does not move) |
| checked_version, checked_revision | integer null, text null | Drive `version` and Docs revision of that read |
| app_version | integer null | the app guide's version at the last check (accepting refuses when it moved) |
| last_editor | text null | last Drive editor's name (display only) |

## publishing_changes (DriveChange)

| Column | Type | Rules |
|---|---|---|
| id | text PK | |
| publication_id | text | FK → publishing_documents ON DELETE CASCADE |
| item_key | text | e.g. `question:<id>`, `section:<id>`, `row:<plannedInterviewId>`, `added:<n>` |
| kind | text | `changed` \| `added` \| `removed` \| `reordered` \| `conflict` \| `not-understood` \| `invalid` |
| base, drive, app | jsonb null | values of the item |
| decision | text | `pending` \| `accepted` \| `rejected` (`not-understood` and `invalid` stay `pending`, not decidable) |
| decided_by | text null | FK → auth_users ON DELETE SET NULL |
| decided_at | timestamptz null | |

Pending changes of a document are replaced at each check; decided ones are kept (a Drive value already decided on is not proposed again) and deleted at the next write. A conflict settled with a final text is applied as an accepted change with that value.

## ingestion_source_connections (changed)

- `access`: `read` \| `write` (default `read`); `write` once the person granted `drive`.

## research_interview_guides (changed)

- `origin` adds `drive` (accepted Drive changes).

## Neutral models (domain, not stored as such)

```text
Document = { blocks: [{ kind: 'heading', level: 1..3 | 'paragraph' | 'listItem', level: 0..1, text, anchor? }] }
Table    = { columns: [{ key, title, type: 'text' | 'status' | 'datetime', options? }], rows: [{ id, cells: Record<key, string | null> }] }
```

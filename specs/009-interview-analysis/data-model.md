# Data model: Analyze the interviews

## Session (ingestion, spec 008) — new fields

| Field | Type | Rules |
|---|---|---|
| interviewDate | date null | set only by a person (accepting or editing); `YYYY-MM-DD` |
| language | `en \| fr \| other` null | set only by a person |
| attachments | jsonb `{ fileId }[]` | ≤ 20; each file in at most one session of the study (with media and transcripts) |
| analysis | jsonb null | the last analysis, below; written by the analysis, never by reconcile except to drop it with the session |

Edits of `interviewDate`, `language` and `attachments` follow the rules of the other edits (FR-008 of spec 008): not on a session a person decided.

### Analysis (value inside Session)

| Field | Type | Rules |
|---|---|---|
| state | `waiting \| analyzing \| done \| failed` | |
| failure | `UNREADABLE_FORMAT \| FILE_NOT_FOUND \| DRIVE_NOT_CONNECTED \| DRIVE_UNAVAILABLE \| AI_PROVIDER_REQUIRED \| AI_FAILED \| INVALID_ANSWER` null | only when failed |
| runId | text null | the run that analyzes it, null for a single row |
| by / at | text / timestamptz | who analyzed, when it ended |
| filesRead | `{ fileId, name, modifiedAt }[]` | to tell "files changed since" (another name, date or set of files) |
| usedAi | boolean | |
| proposals | `Proposal[]` | at most one per field, attachments one per file |

### Proposal (value)

| Field | Type | Rules |
|---|---|---|
| field | `interviewees \| interviewers \| date \| language \| name \| attachment` | |
| value | interviewees/interviewers: `{ name, memberId? }[]` (1–10, name 1–120); date: `YYYY-MM-DD`; language: `en \| fr \| other`; name: the normalised name without the kind (the title), ≤ 120 (FR-007); the kind is added per file when renaming; attachment: `{ fileId, reason }` | |
| origin | `file-name \| header \| speakers \| planned \| ai \| file-date \| rule` | |
| otherDate | `YYYY-MM-DD` null | date proposals only: a different date found elsewhere, shown |
| quote | string ≤ 300 null | required when origin is `ai`, checked in the text sent |
| status | `proposed \| accepted \| edited \| rejected \| already-set` | accepted/edited/rejected only by a person |

### Transitions

- Analyze (row or run): `analysis.state` waiting → analyzing → done | failed. A new analysis replaces the proposals still `proposed`; it keeps the decided ones (constitution IV: a rejected proposal with the same value is not proposed again).
- Accept `name`: the name is built again from the values accepted in the same decision (pseudonyms when anonymised). Accept/edit `interviewees`/`interviewers`: replaces the roster entries of that role (ids kept for the same names). Accept/edit `date`, `language`: sets the field. Accept/edit `name`: sets `title` to the name without its kind. Accept `attachment`: adds the file.
- Reopen (spec 008) keeps the analysis.

## Analysis run (new table `ingestion_analysis_runs`)

| Field | Type | Rules |
|---|---|---|
| id | text | |
| studyId | text | FK `research_studies` on delete cascade |
| startedBy | text | |
| sessionIds | jsonb `string[]` | ≤ 500 |
| state | `running \| stopped \| done` | one `running` per study (partial unique index) |
| stopRequested | boolean | |
| startedAt / heartbeatAt / finishedAt | timestamptz | stale when `heartbeatAt` older than 10 min |

## Pseudonyms (new table `ingestion_pseudonyms`)

| Field | Type | Rules |
|---|---|---|
| studyId | text | FK on delete cascade |
| nameKey | text | normalised interviewee name; unique per study |
| code | text | `P01`…`P999`; unique per study; never reused |
| createdAt | timestamptz | |

## Analysis consent (new table `ingestion_analysis_consents`)

| Field | Type | Rules |
|---|---|---|
| accountId, studyId, provider | text | primary key of the three; FK study on delete cascade, account on delete cascade |
| givenAt | timestamptz | |

## Study (research) — new field

| Field | Type | Rules |
|---|---|---|
| anonymised | boolean | default false; changed with the study version check |

## Migrations

- `0022_interview_analysis.sql`:
  - `ingestion_sessions` gets `interview_date date`, `language text`, `attachments jsonb not null default '[]'` and `analysis jsonb`;
  - new tables `ingestion_analysis_runs` (partial unique `(study_id) where state = 'running'`), `ingestion_pseudonyms` and `ingestion_analysis_consents`;
  - `research_studies` gets `anonymised boolean not null default false`.

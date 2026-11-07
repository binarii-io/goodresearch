# Data model: Usability test preparation

## TestProtocol (Research, aggregate)

`research_test_protocols`: `study_id` (PK, FK to studies, cascade), `content` jsonb, `origin` (`assistant | person | drive`), `updated_by`, `created_at`, `updated_at`, `version`.

```text
content
  framing: objective, hypotheses[] (≤15), participants, format (moderated-remote | moderated-in-person),
           sessionMinutes (10..240), language (en | fr), consent,
           interface: { url (http/https), kind (prototype | live-application | other), description | null }
  script:  introduction, thinkAloud, warmUp[] (≤10), debrief[] (≤10), closing
  scenario
  tasks[] (1..15): id, instruction, criterion, startUrl | null, minutes (1..60) | null
  questionnaire: none | sus-v1
  easeQuestion:  none | seq-v1
  retiredTaskIds[]
```

Rules:

- Limits: instruction and criterion ≤ 600 characters; framing, script and scenario texts ≤ 4,000; warm-up and debrief questions ≤ 600 each; texts trimmed and non-empty, except `description` and `startUrl`.
- `consent` non-empty (FR-002, US3 scenario 4). `thinkAloud` may be empty (flagged, not refused).
- Identity: `identify` (id sent and known, else same normalised instruction, else new); a new id never equals one in `retiredTaskIds`; removed ids are appended there.
- Version check at save: stale gives `CHANGED_MEANWHILE`.
- Exists only on a `usability-test` study: `NOT_A_USABILITY_TEST_STUDY`.
- Default content for "Write it myself": consent and think-aloud from `standard-questions.<language>`, one empty task, `questionnaire: none`, `easeQuestion: none`.

## Checks (Research, computed, never stored)

`checkTask` → flags per task id; `checkProtocol` → whole flags; `plannedMinutes` → number. Closed flag codes in [research.md](research.md) R3, mirrored in `packages/contracts/src/test-protocol.ts`.

## ProtocolReadiness (Research)

`research_protocol_checks`: `study_id`, `kind` (`pilot | interface | review`) (PK both, FK cascade), `protocol_version`, `marked_by`, `marked_at`. "Protocol changed since" is computed from `protocol_version`. Computed checks are never stored.

## Study (Research, changed)

`type` check widened to `interviews | survey | usability-test`; `CREATABLE` includes `usability-test`. No new column.

## Standard questions (shared content)

`packages/shared/src/content/standard-questions.<lang>.ts`:

```text
sus-v1: { title, scale: { points: 5, low, high }, items[10], instructions (to the participant), facilitatorNote }
seq-v1: { question, scale: { points: 7, low, high } }
defaults: { consent, thinkAloud }
```

## PublishedDocument (Publishing, extended)

`publishing_documents.kind` also takes `protocol` and `participant-sheet` (check constraint widened). No new column: `base`, `drive`, `state` and `publishing_changes` serve as for the guide.

| Kind | Sync | Items |
|---|---|---|
| `protocol` | three-way | `framing:*`, `script:*`, `scenario`, `task:<id>:{instruction,criterion,start,minutes}`, `order:tasks`, `standard:questionnaire`, `standard:ease`; SUS/SEQ text unanchored |
| `participant-sheet` | one way | one `unread` item; Drive edits reported, acceptance refused, overwritten on update; holds the SUS to fill in when on |
| `best-practices` | one way (existing) | content chosen by study type |

## Assistant

- `assistant_proposals.kind` also takes `propose_protocol`, `report_protocol_progress`, `check_protocol_tasks`; the publish card's documents also take `protocol`.
- **Protocol design progress**: keys `objectiveHypotheses 15, interface 10, participants 10, formatConsent 10, scenario 10, tasks 25, criteria 10, questionnaireDebrief 5, biasReview 5`.

## Migration `0060_test_protocols.sql`

Creates both Research tables; widens `research_studies_type_check`, `publishing_documents_kind_check`, `assistant_proposals_kind_check` (hand-written, as in 0055 and 0057).

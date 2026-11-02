# Data model: Survey preparation

## Questionnaire (Research, aggregate)

`research_questionnaires`: `study_id` (PK, FK to studies, cascade), `content` jsonb, `origin` (`assistant | person | drive`), `updated_by`, `created_at`, `updated_at`, `version`.

```text
content
  framing: objective, hypotheses[], audience, recruitment (targeted | wide-then-filter),
           administration, targetResponses (number | null), targetReason, language (en | fr),
           consent, thanks, shuffle (boolean, default true)
  sections[]: id, kind (introduction | profiling | theme | closing), title, items[]
  items[]:  id, text, measure (factual | subjective), required, subTheme (string | null),
            contact (boolean), and by kind:
            likert: points (5 | 7), lowLabel, highLabel
            single-choice | multiple-choice: options[] (2..20), ordered (boolean)
            open: nothing more
```

Rules:

- FR-004 limits: at most 12 sections, 80 items, 15 hypotheses; 600 characters per item or option, 4,000 per framing text, 120 per title. Consent and thanks non-empty; at least one `theme` section with an item.
- `subTheme` only in a `theme` section. At most one `contact` item: `open`, not required, in `closing`, and it is the only item there that may ask for an address.
- Identity: `identify` as in the guide (id sent, else same normalised text, else new). Same for sections, by title.
- Version check at save: stale gives `CHANGED_MEANWHILE`.
- The questionnaire exists only on a `survey` study: `NOT_A_SURVEY_STUDY`.

## ReadinessCheck (Research)

`research_questionnaire_checks`: `study_id`, `kind` (`review | pre-test`) (PK both, FK cascade), `people` (integer, null for `review`), `questionnaire_version`, `marked_by`, `marked_at`.

A separate table, so a mark does not raise the questionnaire's version. "Changed since" is computed: `questionnaire_version` differs from the current one. Computed checks are never stored.

## PublishedDocument (Publishing, extended)

`publishing_documents`: `kind` also takes `questionnaire`; new columns:

| Column | Meaning |
|---|---|
| `item_map` jsonb (null for other kinds) | app item id → `{ formItemId, questionId }`; section id → page break id; `consent` → ids |
| `linked_sheet_link` text | the results spreadsheet, at the last check |
| `accepting_responses` boolean | at the last check |
| `collects_identity` boolean | at the last check; warning when true, outside the sync states |

`base` and `drive` hold the comparable items of research R8. `baseRevision` and `checkedRevision` hold the form's revision id, as read. A form is read at every check, since its spreadsheet, opening and identity setting may not move the file's version; a write uses a revision read just before.

`StudyFiles` adds:

```text
createForm(name, title, operations) → { id, webViewLink }
readForm(id) → { blocks, revision, linkedSheetLink, acceptingResponses, collectsIdentity }
updateForm(id, operations, revision)
```

`FormModel` is neutral: title, consent, ordered blocks (section, scale, grid, choice, text), identity setting. Parsing and validation of the service's replies stay in the adapter.

## Assistant

- `assistant_proposals.kind` also takes `propose_questionnaire`, `report_questionnaire_progress`, `check_questionnaire_items`; the publish card's documents also take `questionnaire`.
- **Questionnaire design progress**: as guide progress; points and weights in FR/US2.
- `surveyNextStep`: `write-questionnaire → add-folder → publish-questionnaire → readiness → fieldwork-later`, from the same kind of state as `nextStep`, which stays for interviews. `readiness` advises; a person can go on.

## Migration `0055_questionnaires.sql`

New tables; `publishing_documents_kind_check` and `assistant_proposals_kind_check` widened; check constraints on `origin` and `kind`. No change to existing rows.

## Reading rights

Questionnaire and marks read like the guide (spec 026): any member, subject to folder access. Publications as today. Costs: the total only.

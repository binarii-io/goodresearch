# API contract: Survey preparation

Schemas in `packages/contracts/src/questionnaire.ts`; OpenAPI and client generated. Refusals use the existing codes, plus `NOT_A_SURVEY_STUDY`.

## Studies

`POST` study creation (existing routes): `type` also accepts `survey`.

## Questionnaire

| Route | Result | Refusals |
|---|---|---|
| `GET /api/studies/:id/questionnaire` | `null`, or `{ content, version, origin, updatedBy, updatedAt, checks, estimatedMinutes, randomisation, readiness }` | `STUDY_NOT_FOUND`, `FOLDER_ACCESS_REQUIRED`, `NOT_A_SURVEY_STUDY` |
| `PUT /api/studies/:id/questionnaire` body `{ content, version? }` | same | plus `VALIDATION`, `VERSION_CONFLICT`, `READ_ONLY` |
| `PUT /api/studies/:id/questionnaire/readiness/:kind` body `{ people }` | 204 | as above, `QUESTIONNAIRE_NOT_FOUND` |
| `DELETE /api/studies/:id/questionnaire/readiness/:kind` | 204 | as above |
| `GET /api/studies/:id/questionnaire/design-cost` | `{ currency, total }`, `total` null when a call has no price | `STUDY_NOT_FOUND` |

`checks`: `{ items: { [itemId]: Flag[] }, whole: Flag[] }`, with `Flag` a code from a closed list, translated by the web app.

## Publications

Existing routes (publish, check, update, decide, forget) accept `kind: 'questionnaire'`, plus these fields in its view:

```text
form: { acceptingResponses, collectsIdentity, linkedSheetLink } | null
```

A disabled form service answers `FORMS_DISABLED`.

## Assistant tools

| Tool | Runs | Effect |
|---|---|---|
| `load_skill` `questionnaire-design` | during the answer | keeps the skill in the context |
| `check_questionnaire_items` | during the answer | gives back flags |
| `report_questionnaire_progress` | ends the answer | records states |
| `propose_questionnaire` | card | saved on Apply, with the version seen |
| `publish_preparation` | card | `documents` also takes `questionnaire` |
| `create_study` (existing card) | card | takes `type` |

These tools are offered only on the page of a survey study a person can change, as the guide's only on an interview study.

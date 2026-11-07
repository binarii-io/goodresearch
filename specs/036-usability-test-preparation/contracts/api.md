# API contract: Usability test preparation

Schemas in `packages/contracts/src/test-protocol.ts`; OpenAPI and client generated. Refusals use the existing codes, plus `NOT_A_USABILITY_TEST_STUDY` (422) and `PROTOCOL_NOT_FOUND` (404), both new. Every new read route is added to the allow-list of `platform/http/change-guard.ts`.

## Studies

Study creation routes (project and team): `type` also accepts `usability-test`.

`PUT /api/studies/:studyId/settings`: accepted for a usability test study (anonymise only; `textAnalysed` ignored).

## Test protocol

| Route | Result | Refusals |
|---|---|---|
| `GET /api/studies/:id/protocol` | `null`, or `{ content, version, origin, updatedBy, updatedAt, checks, plannedMinutes, standard, readiness }` | `STUDY_NOT_FOUND`, `FOLDER_ACCESS_REQUIRED`, `NOT_A_USABILITY_TEST_STUDY` |
| `PUT /api/studies/:id/protocol` body `{ content, version? }` | same | plus `VALIDATION`, `VERSION_CONFLICT`, `READ_ONLY` |
| `PUT /api/studies/:id/protocol/readiness/:kind` | 204 | as above, `PROTOCOL_NOT_FOUND` |
| `DELETE /api/studies/:id/protocol/readiness/:kind` | 204 | as above |
| `GET /api/studies/:id/protocol/design-cost` | `{ currency, total }`, `total` null when a call has no price | `STUDY_NOT_FOUND` |

- `checks`: `{ tasks: { [taskId]: TaskFlag[] }, whole: ProtocolFlag[] }`, closed codes translated by the web app.
- `standard`: the fixed SUS and SEQ texts of the protocol's language when on, so the web shows them without its own copy.
- `readiness`: `{ kind, markedBy, markedAt, changedSince }[]`.
- `content` on input: `tasks[].id` optional (new task), links validated as `http(s)` URLs.

## Publications

Existing routes (publish, check, update, decide, forget) accept `kind: 'protocol'` and `'participant-sheet'`. Publishing `protocol` also publishes `participant-sheet`; the result lists both. `decide` on `participant-sheet` refuses acceptance with `VALIDATION`, as it does for best practices today.

## Assistant tools

| Tool | Runs | Effect |
|---|---|---|
| `load_skill` `test-protocol-design` | during the answer | keeps the skill in the context |
| `check_protocol_tasks` | during the answer | gives back flags and planned minutes |
| `report_protocol_progress` | ends the answer | records states of the nine points |
| `propose_protocol` | card | saved on Apply, with the version seen |
| `publish_preparation` | card | `documents` also takes `protocol` |
| `create_study` (existing card) | card | `type` also takes `usability-test` |

Offered only on the page of a usability test study a person can change.

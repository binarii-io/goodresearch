# API contract: Survey fieldwork

Schemas in `packages/contracts/src/surveys.ts`. All routes are reserved to the owning team and admins (spec 026) and refused otherwise.

| Route | Result | Refusals |
|---|---|---|
| `GET /api/studies/:id/responses/summary` | `{ form, reading, counts: { total, counted, outOfTarget, profileNotAnswered, refusedConsent }, target, rule }` | `NOT_A_SURVEY_STUDY`, `FOLDER_ACCESS_REQUIRED` |
| `POST /api/studies/:id/responses/read` body `{ force }` | same | plus `DRIVE_*`, `FORM_NOT_PUBLISHED` |
| `GET /api/studies/:id/responses?state=&page=` | one page: `{ id, submittedAt, state }` | as above |
| `GET /api/studies/:id/responses/:responseId` | answers item by item, with former wordings | `RESPONSE_NOT_FOUND` |
| `PUT /api/studies/:id/target-rule` body `{ accepted, version }` | rule | `VALIDATION`, `VERSION_CONFLICT` |
| `POST /api/publications/:id/open`, `/close` | publication | `FORM_COLLECTS_IDENTITY`, `FORM_CONSENT_BROKEN`, `FORM_NOT_IN_SYNC`, `DRIVE_*` |

`POST /api/publications/:id/update` takes `confirmRewording`; new refusals `RESPONSES_BLOCK_UPDATE` (detail: items) and `REWORDING_TO_CONFIRM` (detail: items, responses).

## Assistant tools

| Tool | Runs | Effect |
|---|---|---|
| `count_responses` | during the answer | counts only |
| `propose_opening_form`, `propose_closing_form` | card | same refusals on Apply |
| `propose_target_rule` | card | checked against items; preview gives what would be set aside |

Offered only on a survey study the person can change.

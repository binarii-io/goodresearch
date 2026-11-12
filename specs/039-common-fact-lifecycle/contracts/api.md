# API: One fact lifecycle for every type of study

All routes are authenticated; rights are those of the fact's study (team members who can change it decide; readers read).

## New

- `GET /api/studies/:studyId/fact-board?status=to-decide|accepted|rejected|all&q=&page=` → `FactBoardPage { items: FactRow[], total, counts: { toDecide, accepted, edited, rejected }, page }`. Every source of the study, 25 per page, SQL paged. `accepted` filter includes edited facts.
- `GET /api/studies/:studyId/fact-board/counts` → `FactCounts { toDecide, accepted, edited, rejected }`: the counts alone (the usability Analysis tab's tiles and Facts tab).
- `POST /api/facts/:factId/decision` `{ decision: 'accept'|'edit'|'reject'|'reopen', version, statement?: { en?, fr? } }` → `FactRow`. Refusals: `FACT_NOT_FOUND`, `VERSION_CONFLICT`, `NAME_IN_STATEMENT`, `FACT_NEEDS_VERBATIM`, `SPEAKER_TO_ATTRIBUTE`, `VALIDATION`, `FORBIDDEN` (reader).
- `POST /api/facts/accept` `{ items: [{ id, version }] (1–500) }` → `{ done, changed }`: accepts facts still to decide, skips changed or decided ones.

## Changed

- `GET /api/projects/:projectId/insight-facts` (`ProjectFact`): adds `version`, `canDecide`, `evidence` (as FactRow); `status` becomes `to-decide | accepted | edited | rejected` (rejected still filtered out by default).
- `DecideFact` (interviews) and `DecideSurveyFact` accept `decision: 'reopen'`.
- `POST /api/usability/observations/:observationId/decision`: a rejection keeps the fact as rejected; a reopen makes it to decide (no longer deleted).
- `InsightRunEstimate.studies[]`: unchanged fields (`facts` = decided, `toDecide`); the dialog uses them per R7.

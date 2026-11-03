# API contract: Survey analysis

Schemas in `packages/contracts/src/survey-analysis.ts` (figures, themes, survey facts). Every route is under `/api/studies/:id` so that spec 026's guard knows the owning team. Every route is reserved to the owning team and admins (spec 026); a survey study is required (`NOT_A_SURVEY_STUDY`) and folder access (`FOLDER_ACCESS_REQUIRED`).

## Figures

| Route | Result | Refusals |
|---|---|---|
| `GET /api/studies/:id/survey-analysis?crossBy=` | `{ counts: { counted, setAside }, crossBy, sections: [{ id, title, items: [Figure] }], openItems: [{ id, text, answers, themed, themes, cost }], cost }` | `VALIDATION` (crossBy not a profiling choice item) |

`Figure`: `{ itemId, text, kind, multiple, total: Column, columns?: [{ option, ...Column }] }`, `Column`: `{ base, smallBase, options?, points?, mean?, median?, agree?, disagree? }`.

## Open answers and themes

| Route | Result | Refusals |
|---|---|---|
| `GET /api/studies/:id/open-items/:itemId/answers?theme=&page=` | one page of masked answers `{ responseId, text, themeId }`, 50 per page | `ITEM_NOT_FOUND` |
| `GET /api/studies/:id/open-items/:itemId/themes` | themes with counts, quotes, status, version | |
| `GET /api/studies/:id/open-items/:itemId/themes/estimate?onlyNew=` | `{ answers, parts, cost, aiConnected, consentNeeded }` | `TOO_FEW_ANSWERS` |
| `POST /api/studies/:id/open-items/:itemId/themes/runs` body `{ onlyNew, consent }` | 202 `{ runId }` | `AI_PROVIDER_REQUIRED`, `RUN_IN_PROGRESS`, `TOO_FEW_ANSWERS` |
| `POST /api/studies/:id/survey-themes/:themeId/decide` body `{ decision: 'accept' \| 'reject' \| 'edit', label?, description?, version }` | 204 | `VERSION_CONFLICT`, `THEME_NOT_FOUND` |
| `POST /api/studies/:id/survey-themes/:themeId/merge` body `{ from: themeId[], version }` | 204 | `VERSION_CONFLICT`, `NOT_SAME_ITEM` |
| `POST /api/studies/:id/open-items/:itemId/move` body `{ responseId, to: themeId \| null }` | 204 | `RESPONSE_NOT_FOUND` (not a counted answer of this item), `THEME_NOT_FOUND`, `NOT_SAME_ITEM` |

## Survey facts

| Route | Result | Refusals |
|---|---|---|
| `GET /api/studies/:id/survey-facts?status=&page=` | page of facts with `support`, `figureChanged?: Figure-value`, `itemRemoved` | |
| `POST /api/studies/:id/survey-facts` body `{ from: { figure: { itemId, measure, option?, cross? } } \| { theme: { themeId } }, polarity? }` | fact (proposed) | `FIGURE_NOT_FOUND`, `THEME_NOT_ACCEPTED`, `FACT_EXISTS` (the figure or theme already has a fact not rejected) |
| `GET /api/studies/:id/survey-facts/find/estimate` | `{ figures, themes, cost, aiConnected }` | |
| `POST /api/studies/:id/survey-facts/find` | `{ created, leftOut }`: the facts the AI pointed at, checked and proposed (FR-010a) | `AI_PROVIDER_REQUIRED`, `NO_COUNTED_RESPONSE`, `AI_FAILED`, `RUN_IN_PROGRESS` |
| `PATCH /api/studies/:id/survey-facts/:factId` body `{ decision: 'accept' \| 'reject' \| 'edit', statement?, polarity?, version }` | fact | `VERSION_CONFLICT`, `FACT_NOT_FOUND` |
| `POST /api/studies/:id/survey-facts/:factId/figure` body `{ action: 'update' \| 'keep', version }` | fact | `FIGURE_UNCHANGED`, `ITEM_REMOVED` |

Insights' `ProjectFact` and `InsightLink` gain `source` and `respondents`; `ProjectFact.sessionId` becomes nullable. Overview `studies[].counts.facts` counts survey facts.

## Assistant tools

| Tool | Runs | Effect |
|---|---|---|
| `survey_analysis_state` | during the answer | counts: items, open items themed or not, facts by status |
| `read_figures` | during the answer | figures computed by the app, optional `crossBy`; no answer text |
| `propose_survey_facts` | card | figure references; each re-checked against today's figure on Apply |
| `propose_theme_analysis` | card, run after Apply | estimate and provider in the preview; Apply starts the run |

Offered only on a survey study the person can change; a reader gets `survey_analysis_state` only.

# HTTP API: Project insights

The routes are under `/api/projects/:projectId`. They take Zod schemas in `packages/contracts/src/insights.ts`, and the client is generated from OpenAPI. Errors use the shared codes (`packages/contracts/src/errors.ts`).

| Method | Path | operationId | Body / query | Returns |
|---|---|---|---|---|
| GET | `/insights` | `getInsights` | `?theme&status&confidence&polarity` | `{ themes, insights: InsightCard[], counts, costs: { lastRun, total }, run: InsightRunView \| null }` |
| GET | `/insights/:insightId` | `getInsight` | — | `InsightDetail` (texts, links grouped by participant, confidence explanation) |
| POST | `/insights` | `createInsight` | `{ themeKey, statement, description?, counterEvidence?, minorityView?, support: factId[], counter?: factId[] }` | `{ id, version }` |
| PATCH | `/insights/:insightId` | `editInsight` | `{ version, themeKey?, statement?, description?, counterEvidence?, minorityView? }` (each `{ en?, fr? }`) | `{ version }` |
| POST | `/insights/:insightId/decision` | `decideInsight` | `{ version, decision: 'validate' \| 'reject' }` | `{ version }` |
| POST | `/insights/decisions` | `validateInsights` | `{ insights: [{ id, version }] }` (max 200) | `{ done, changed }` |
| PUT | `/insights/:insightId/facts/:factId` | `linkFact` | `{ version, role: 'support' \| 'counter' }` (also accepts a suggested link) | `{ version }` |
| DELETE | `/insights/:insightId/facts/:factId` | `unlinkFact` | `?version` (also dismisses a suggested link) | `{ version }` |
| POST | `/insights/:insightId/reviewed` | `markInsightReviewed` | `{ version }` | `{ version }` |
| POST | `/insights/:insightId/translation` | `retryInsightTranslation` | `{ version }` | `{ version }` |
| GET | `/insight-facts` | `listInsightFacts` | `?page&q&polarity&theme&study&unlinked` | `{ items: ProjectFact[], total, page, pageSize: 25, studies }` |
| POST | `/insight-runs/estimate` | `estimateInsightRun` | `{ studyIds (may be empty), scope: 'all' \| 'unlinked' }` | `{ facts, calls, cost, consentNeeded, aiConnected, studies: [{ id, name, facts }] }` (the studies the person can open) |
| POST | `/insight-runs` | `startInsightRun` | `{ studyIds (≥ 1), scope, consent }` | `{ runId }` |
| POST | `/insight-runs/:runId/stop` | `stopInsightRun` | — | `204` |

## Shapes

- **InsightCard**: `{ id, version, theme: { key, title }, statement: { en, fr }, status, origin, translation, confidence: { level, support, counter, panel, highAt, missingForHigh, lowered }, polarity, evidenceChanged: number, suggested: number }`. The web shows the viewer's language, or the other one while it is translated.
- **ProjectFact**: `{ id, version, studyId, studyName, sessionId, participant, statement: { en, fr } | null, polarity, theme, insights: number }`. `statement` is null when the viewer cannot open the study.
- **InsightRunView**: `{ id, calls, callsDone, leftOut, failure, stopping, startedBy: { id, name }, finished }`; the overview gives `lastRunCost` and `cost` (the project's total, translations included).

## Errors

- `PROJECT_NOT_FOUND`, `INSIGHT_NOT_FOUND`, `FACT_NOT_FOUND`
- `VERSION_CONFLICT`
- `INSIGHT_NEEDS_SUPPORT`: a validated insight without a counted support link to an accepted fact
- `NAME_IN_STATEMENT`
- `FACT_NOT_ACCEPTED`: linking a fact that is not accepted, or outside the project
- `INSIGHTS_RUNNING`
- `NO_FACTS`
- `STUDY_ACCESS_REQUIRED`: a study the person cannot open
- `INSIGHTS_CONSENT_REQUIRED`
- `AI_PROVIDER_REQUIRED`
- `VALIDATION`

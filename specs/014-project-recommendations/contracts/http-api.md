# HTTP API: Project recommendations and key takeaways

The routes are under `/api/projects/:projectId`. They take Zod schemas in `packages/contracts/src/recommendations.ts`.

| Method | Path | operationId | Body / query | Returns |
|---|---|---|---|---|
| GET | `/recommendations` | `getRecommendations` | `?status&kind&priority` | `RecommendationsOverview` (cards, counts, run, costs, consentNeeded, insights counts, takeaways) |
| GET | `/recommendations/:recommendationId` | `getRecommendation` | — | `RecommendationDetail` (fields, computed priority and kind, links with the insight now) |
| POST | `/recommendations` | `createRecommendation` | `{ action, rationale?, successMeasure?, kind, impact, effort, owner?, insights: id[] }` | `{ id }` |
| PATCH | `/recommendations/:recommendationId` | `editRecommendation` | `{ version, action?, rationale?, successMeasure?, kind?, impact?, effort?, owner? }` | `{ version }` |
| POST | `/recommendations/:recommendationId/decision` | `decideRecommendation` | `{ version, decision }` | `{ version }` |
| POST | `/recommendations/decisions` | `validateRecommendations` | `{ recommendations: [{ id, version }] }` | `{ done, changed }` |
| PUT | `/recommendations/:recommendationId/insights/:insightId` | `linkInsight` | `{ version }` | `{ version }` |
| DELETE | `/recommendations/:recommendationId/insights/:insightId` | `unlinkInsight` | `?version` | `{ version }` |
| POST | `/recommendations/:recommendationId/reviewed` | `markRecommendationReviewed` | `{ version }` | `{ version }` |
| POST | `/recommendations/:recommendationId/translation` | `retryRecommendationTranslation` | `{ version }` | `{ version }` |
| POST | `/recommendation-runs/estimate` | `estimateRecommendationRun` | `{ withProposed }` | `{ insights, cost, consentNeeded, aiConnected }` |
| POST | `/recommendation-runs` | `startRecommendationRun` | `{ withProposed, consent }` | `{ runId }` |
| POST | `/recommendation-runs/:runId/stop` | `stopRecommendationRun` | — | `204` |
| PATCH | `/takeaways` | `saveTakeaways` | `{ version, text: { en?, fr? } }` | `{ version }` |
| POST | `/takeaways/draft` | `draftTakeaways` | `{ consent }` | `202` |
| POST | `/takeaways/translation` | `retryTakeawaysTranslation` | `{ version }` | `{ version }` |

## Errors

The errors of spec 013, plus:
- `RECOMMENDATION_NOT_FOUND`;
- `RECOMMENDATION_NEEDS_INSIGHT`: validating without a counted validated insight;
- `INSIGHT_NOT_VALIDATED`: linking a rejected insight, or one outside the project;
- `RECOMMENDATIONS_RUNNING`;
- `NO_INSIGHTS`;
- `TAKEAWAYS_DRAFTING`.

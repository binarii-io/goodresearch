# Contract: project overview

`GET /api/projects/{projectId}/overview`, operation `getProjectOverview`, tag `projects`. Signed-in account with access to the project's team. Reads only.

- `200`: `ProjectOverview` ([data model](../data-model.md))
- `404` `PROJECT_NOT_FOUND`: no such project or no access

```jsonc
{
  "steps": [
    { "key": "interviews", "state": "done", "total": 24, "validated": 21, "toDecide": 3, "participants": 22 },
    { "key": "facts", "state": "to-decide", "total": 612, "validated": 148, "toDecide": 464 },
    { "key": "insights", "state": "empty", "total": 0, "validated": 0, "toDecide": 0 },
    { "key": "recommendations", "state": "empty", "total": 0, "validated": 0, "toDecide": 0 },
    { "key": "debrief", "state": "empty" }
  ],
  "nextStep": "facts",
  "takeaways": null,
  "hiddenStudies": 0,
  "studies": [
    {
      "id": "…",
      "access": true,
      "counts": { "validated": 21, "toValidate": 3, "excluded": 2, "facts": 612, "factsToDecide": 464 }
    }
  ]
}
```

`GET /api/projects/{projectId}/overview/costs`, operation `getProjectOverviewCosts`; same access and `404`.

```jsonc
{
  "cost": { "total": 3.18, "studies": 3.18, "insights": 0, "recommendations": 0, "takeaways": 0 },
  "studies": [
    { "id": "…", "cost": { "total": 3.18, "analysis": 0.62, "lexicon": 0.21, "cleaning": 0.94, "quality": 0.33, "facts": 1.08 } }
  ]
}
```

`GET /api/projects/{projectId}/takeaways/freshness`, operation `getTakeawaysFreshness`; same access and `404`. The page asks it only once key takeaways exist.

```jsonc
{ "outOfDate": false }
```

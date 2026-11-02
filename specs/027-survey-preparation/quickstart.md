# Quickstart: validate survey preparation

Prerequisites: `docker compose -f compose.yaml -f compose.dev.yaml up --build`. Automated: `pnpm check`, `pnpm test`, `pnpm e2e`.

1. **Create**: create a Survey study by the form and through the assistant. The Preparation tab offers the questionnaire; other phases say they come later. Expected: spec US1.
2. **Design**: "Design with the assistant", progress moves, card with item counts, estimate and flags; Apply. The tab shows the design's cost. Expected: US2.
3. **By hand**: "Write it myself" with all four kinds; break each rule and see each flag; save twice from two tabs for "changed meanwhile"; download the Markdown; open as a member outside the team. Expected: US3, US4.
4. **Interviews unchanged**: run the existing `preparation.spec.ts` and the assistant guide tests.

## 5. Real form service (by hand, before merge)

No automated test reaches it. Use a real account, once with a personal account and once with an organisation account if available. With the Forms API enabled:

| Check | Expected | If not |
|---|---|---|
| Publish | Form in the study's folder, unpublished | Report; research R4, R5 |
| Create with Drive's form mime type | Tells which path R5 keeps | Keep `forms.create` then move |
| `batchUpdate` and `get` with the `drive` scope | Accepted | New scope and consent: back to the spec |
| Identity on an organisation account | "Do not collect" holds | Warning shown; report |
| Refuse consent (open the form temporarily) | Form ends, no item seen | Back to the spec: FR-006 fails |
| Scale 1–7 and 1–5 | Accepted | Adjust the render |
| Grid with labels; order differs between two runs | Rows shuffled | Back to the spec: FR-015 |
| Change an item in the app, update; ids in the item map unchanged | Same question ids | Fix the update plan |
| Change an item in the form; add an upload question | Drive change; not understood | Fix read-back |
| Link a spreadsheet, check | Link shown | Fix read-back |
| Forms API disabled | Clear message for the deployer | Fix the mapping |

Close the form again after the test, and delete test responses.

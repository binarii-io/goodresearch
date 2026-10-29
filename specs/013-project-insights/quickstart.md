# Quickstart: Project insights

## Commands

- Domain and use cases: `pnpm exec vitest run --project api:unit apps/api/src/modules/synthesis`
- PostgreSQL component tests: `pnpm exec vitest run --project api:int apps/api/tests/synthesis.int.test.ts`. They need Docker; with Colima, export `DOCKER_HOST` and `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE` first.
- End-to-end: `pnpm e2e -- insights` on the dev stack (`compose.dev.yaml`). The fake AI runner answers `insights` and `insight-translation`.

## Scenarios

1. **Find insights** (US1).
   - Setup: a project with one study, 6 accepted facts from P01–P05 (negative, "cannot find the data") and P06 (positive), and 2 proposed facts.
   - Action: "Find insights", then confirm.
   - Expected: one insight with 5 supporting facts and 1 counter fact. Its confidence is **high**: the panel is 6, the threshold max(5, ceil(30% × 6)) = 5, and support 5 meets it; counter 1 < ceil(5/2) = 3, so it is not lowered. Its polarity is negative. The 2 proposed facts are never sent, and the cost is shown.
2. **Decide** (US2).
   - Action: reject an insight, edit a second and move one of its facts to counter, validate a third, then create one by hand.
   - Expected: a new run does not propose the rejected one again and does not touch the edited one; the confidence is recomputed.
3. **Facts panel** (US3).
   - Setup: 60 accepted facts.
   - Expected: page 1 shows 25; "not in any insight" with "negative" filters the list; linking a fact removes it from that filter.
4. **Evidence changed** (US4).
   - Action: reject one linked fact in the study and change another's polarity.
   - Expected: the insight shows "Evidence changed (2)" and its confidence counts 4 facts. "Reviewed" clears the changed fact; the rejected one stays shown as "no longer accepted".
5. **Privacy**: the fake AI records its requests. They hold no name, verbatim, interview title or study name.
6. **Accessibility**: axe on the Insights tab, the insight view, the run dialog and the facts panel, in the light and dark themes.

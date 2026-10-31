# Quickstart: Interview quality

Validation guide. Details: [data-model.md](data-model.md), [contracts/http-api.md](contracts/http-api.md).

## Prerequisites

`docker compose -f compose.yaml -f compose.dev.yaml up --build`, an interview study with validated interviews, and the test AI provider (or a real one for scenario 3).

## Scenarios

1. **Figures without AI**: open the Quality tab. Shares are shown with no ledger entry and no score, colour or ranking. Each indicator's tooltip opens by keyboard and gives the reference value.
2. **Review**: activate "Review the interviews". The dialog gives interviews, estimate and consent; progress and stop work; the tab's cost equals the ledger's sum; counts read "3 leading out of 20 questions: 1 agreed, 2 no opinion".
3. **Reformulations**: on the reference set, run the runner on a real provider; at most 1 of 30 simple reformulations is flagged and at least 80% of those with opinion are, with the element named (SC-001, SC-002).
4. **Opinion**: disagree with a remark. The count drops by one, "1 disagreed, not counted" appears, and transcript and facts are unchanged. Withdraw: it returns. Two sessions at once: the second is told it changed meanwhile.
5. **Requalify**: filter on simple reformulations, requalify one with a reason, with no new ledger entry. It counts as agreed; withdrawing makes it simple again.
6. **Views**: with two interviewers and one shared interview, rows add up to the overall figures, are in name or date order, and show labels under anonymisation. A generic label with two interviewers goes to "Interviewer not identified".
7. **Re-review**: review again. Opinions stay, a disagreed sentence is not flagged, those without opinion are replaced. Correct a word: figures follow with no "To review again". Remove a flagged sentence's text: "text changed", never deleted.
8. **Exclusive runs**: during a facts reading, the review is refused, and the reverse.

## Commands

| Command | Covers |
|---|---|
| `pnpm exec vitest run --project api:unit` | Domain and use cases, guards on reference fixtures |
| `pnpm exec vitest run --project api:int` | Store, routes, migration (Docker) |
| `pnpm generate`, `pnpm --filter @goodresearch/web i18n:extract` | Contract and catalogs |
| `pnpm check`, `pnpm e2e` | Boundaries; scenarios 1, 2, 4, 6 with axe |
| `pnpm --filter @goodresearch/api quality:reference` | Scenario 3, by hand, real provider, costs money |

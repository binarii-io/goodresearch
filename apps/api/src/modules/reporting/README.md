# reporting

Read models across the other modules (context map #8 Reporting): no table, no aggregate, no write, no AI call, no Drive connection. Each screen-shaped read goes through the ports of `application/ports.ts`, wired in `compose.ts`; each module keeps the knowledge of its own tables and ledger refs.

## Project overview (spec 017)

- `GET /api/projects/{projectId}/overview`: the journey, the next step (`domain/journey.ts`), the key takeaways' text and the studies' counts. SQL counts only; a study without folder access is not read.
- `GET /api/projects/{projectId}/overview/costs`: what the project cost, per study and per use; apart so the numbers never wait for the ledger. A study without folder access counts in the total and shows no cost of its own; the page says the total includes it.
- A cost is `null` when a call has no known price (`sumCosts`, `@goodresearch/shared`).

"May be out of date" is Synthesis's own read (`GET /api/projects/{projectId}/takeaways/freshness`), the only one needing every insight and fact; the page asks it only once key takeaways exist.

The debrief deck is a read model built by Synthesis, because its publication writes; it stays there.

## Known limit

Costs are found from refs rebuilt from sessions and runs. Replacing or detaching a study's folder deletes both, so what they cost leaves these totals, though the ledger keeps the calls.

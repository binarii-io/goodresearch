# reporting

Read models across the other modules (context map #8 Reporting): no table, no aggregate, no write, no AI call, no Drive connection. Each screen-shaped read goes through the ports of `application/ports.ts`, wired in `compose.ts`; each module keeps the knowledge of its own tables and ledger refs.

## Project overview (spec 017)

- `GET /api/projects/{projectId}/overview`: the journey, the next step (`domain/journey.ts`), the key takeaways' text and the studies' counts. SQL counts only; a study without folder access is not read.
- `GET /api/projects/{projectId}/overview/costs`: what the project cost, per study and per use; apart so the numbers never wait for the ledger. A study without folder access counts in the total and shows no cost of its own; the page says the total includes it.
- A cost is `null` when a call has no known price (`sumCosts`, `@goodresearch/shared`).
- Spec 028: the first step also counts the responses counted by survey studies (`responseCounts`, as the study's target rule counts them), and says which kinds of study the project holds, so the screen names it Interviews, Responses or Fieldwork. Interviews to validate keep the step open; otherwise one counted response is enough, and responses received but all set aside by the target rule wait for a person. Each survey study's counts carry its responses received and counted, or null when they could not be read.
- Spec 036: a usability test study counts as neither interviews nor a survey until its Fieldwork exists: it adds no interview, no response, and does not change the kinds the first step is named after.

"May be out of date" is Synthesis's own read (`GET /api/projects/{projectId}/takeaways/freshness`), the only one needing every insight and fact; the page asks it only once key takeaways exist.

The debrief deck is a read model built by Synthesis, because its publication writes; it stays there.

## Known limit

Costs are found from refs rebuilt from sessions and runs. Replacing or detaching a study's folder deletes both, so what they cost leaves these totals, though the ledger keeps the calls.

# Quickstart: One fact lifecycle for every type of study

Run on the dev stack (`docker compose -f compose.yaml -f compose.dev.yaml up --build`), signed in as the dev admin.

1. **Same decisions everywhere** — create an interview study, a survey and a usability test study in one project (demo folder), find their facts; on each Analysis tab the Facts list shows the same statuses and actions; accept, edit, reject and reopen one fact in each.
2. **Usability facts to decide** — analyse a usability session (dev fake provider): its observations kept or doubted appear as facts to decide; accept one in the Facts list and see the observation accepted in the session; reject an observation in the session and see its fact rejected.
3. **Task facts** — confirm the outcome of a task in two sessions: the task fact appears ("Task 1 — …: 2 successes out of 2 sessions"); accept it; correct one outcome to failure: the fact is to decide again, marked "figures changed".
4. **Project panel** — on the project's Facts panel, accept two facts of two studies and "Accept all" the facts to decide shown; a reader sees no actions.
5. **Insights** — in a project whose studies have only facts to decide, open "Find insights": no study greyed, reading facts to decide on and said; the run works and its insights are "to validate".

Automated: `pnpm exec vitest run --project api:unit` (domain: reopen, task fact counts and polarity, observation ↔ fact status), component tests on PostgreSQL (fact board, decideAny, acceptAny, usability sync), `pnpm e2e` (`common-facts.spec.ts`).

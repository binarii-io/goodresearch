# Quickstart: validate read access

## Prerequisites

`docker compose -f compose.yaml -f compose.dev.yaml up --build`, with the simulated Drive and the test provider. Two teams, A and B; a member of A only (`reader`); a member of B (`team`); an admin. Team B owns a project with one anonymised study and one not anonymised, both analysed, one with a folder the reader cannot access.

## Automated

```sh
pnpm exec vitest run --project api:unit
pnpm exec vitest run --project api:int
pnpm e2e
```

The inventory test must list no unclassified route.

## By hand

| # | As | Do | Expected |
|---|---|---|---|
| 1 | reader | Projects, filter "All teams" | Team B's project listed with its team |
| 2 | reader | Open it | "Read only" badge naming B; no control; insights and costs readable |
| 3 | reader | Anonymised study, Analysis | Facts with "Interview N", verbatims with pseudonyms |
| 4 | reader | Other study, Analysis | Facts; verbatims hidden, with the reason |
| 5 | reader | Direct link to the schedule or a transcript | "Reserved to the team" |
| 6 | reader | Study without folder access | Name, type, team, message on the folder |
| 7 | reader | `curl` a change and an AI run | `403 READ_ONLY`; nothing changes; ledger unchanged |
| 8 | reader | Assistant: rename the project | No card; says team B decides |
| 9 | team | Same pages | No badge; everything as before |
| 10 | admin | Remove `team` from B, then `team` retries | Refused without signing in again |

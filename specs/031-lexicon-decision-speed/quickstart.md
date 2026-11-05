# Quickstart: Fast decisions on lexicon terms in large studies

## Automated

```sh
pnpm exec vitest run --project api:unit apps/api/src/modules/transcripts
pnpm exec vitest run --project api:int apps/api/tests/lexicon.component.test.ts   # Docker
```

Expected: the volume test passes (one term counted alone equals its rows in a full count; one term under the time bound); the command tests show other terms' rows untouched by an edit or a merge.

## On the deployed instance

On the large study, edit a term and merge two terms from Enrichment → Lexicon; the server log shows `decideTerm` / the merge under 1 s (before: 11–12 s), and the occurrences shown match those after a new reading.

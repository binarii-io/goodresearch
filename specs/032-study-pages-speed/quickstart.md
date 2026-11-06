# Quickstart: Fast study pages on large studies

```sh
pnpm exec vitest run --project api:unit apps/api/src/modules/transcripts apps/api/src/modules/evidence apps/api/src/modules/interview-quality
pnpm exec vitest run --project api:int apps/api/tests/study-pages-volume.component.test.ts   # Docker
```

Expected: the volume test prints queries, time and size per page; the queries stay under their bounds (constant in the number of interviews); batch and per-interview analysed texts are equal. Before the change: Quality 1 138 queries, Analysis 1 050, Cleaning 207, lexicon list 2.6–3 MB.

By hand on the dev stack: open a study's Analysis, Quality, Cleaning tabs and the lexicon; open a term: its quotes appear in the dialog as before.

On the deployed instance: the four pages under 3 s on the large study (logs `facts-analysis`, `quality`, `cleaning`, `lexicon`).

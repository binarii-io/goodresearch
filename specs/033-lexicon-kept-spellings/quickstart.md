# Quickstart: Lexicon decisions reflect what is kept

1. `pnpm exec vitest run --project api:unit apps/api/src/modules/transcripts/tests/enrichment-queries.test.ts` — spellings per place and per interview.
2. `pnpm exec vitest run --project shared` — the dialog filter.
3. Manual, local stack (`docker compose -p goodresearch up -d --build`): open a term with two spellings found; switch one off: its excerpts go and counts drop; switch it on: back as before. A spelling already rejected shows its places once saved.
4. Manual: open the lexicon in two tabs, change a term in one, accept it in the other: message "Someone changed this…", row refreshed, second click accepts.

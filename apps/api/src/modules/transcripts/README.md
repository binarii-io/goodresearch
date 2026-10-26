# transcripts module

Context #4 of the [context map](../../../../../docs/domain/context-map.md#4-transcripts). Spec 010 ([specs/010-enrichment-vocabulary](../../../../../specs/010-enrichment-vocabulary/)): the **Enrichment** phase of interview studies.

- **Transcript**: the raw version of each validated interview, imported through ingestion's public API (`enrichment.readTranscript`) and parsed into speaker turns whose ids stay the same across imports (`domain/segments.ts`). Deleted with its session (foreign key in migration `0024`).
- **LexiconTerm**: the team's lexicon, per language (`domain/lexicon-term.ts`): decisions, merge, what a new reading may change.
- **Lexicon reading**: `application/commands/lexicon-commands.ts`, run by the `transcripts.lexicon` queue in the worker: import, candidates (`domain/candidates.ts`), excerpts with placeholders (`domain/excerpts.ts`), AI batches checked by `domain/answer-check.ts`, occurrences (`domain/occurrences.ts`).
- Ledger: task `lexicon`, ref `lexicon-reading:<runId>`; costs shown on the Enrichment tab.

## Common words

The rules need the common words of each language (research R2). They ship as folded word lists, one per line, gzipped, in `infrastructure/words/`:

| File | Source | Licence |
|---|---|---|
| `en.txt.gz` | SCOWL up to size 60 (English, American, British), from the npm package `wordlist-english@1.2.1`, plus common contractions and capitalised words (weekdays, months, nationalities) | SCOWL licence, permissive: [`SCOWL-COPYRIGHT.txt`](infrastructure/words/SCOWL-COPYRIGHT.txt) |
| `fr.txt.gz` | The Hunspell French dictionary of Grammalecte (Dicollecte 7.5), from the npm package `dictionary-fr@3.0.0`, with its suffixes applied | MPL-2.0: [`DICOLLECTE-LICENSE.txt`](infrastructure/words/DICOLLECTE-LICENSE.txt) |

Proper nouns are left out, so place and product names stay candidates. The files are built by hand with `infrastructure/words/build-words.ts` (instructions at its top), never in CI, and committed.

## Tests

- `tests/*.test.ts`: domain rules and use cases with in-memory fakes (`tests/fakes/`).
- `apps/api/tests/lexicon.component.test.ts`: PostgreSQL, the HTTP API, the fake AI runner recording what is sent.

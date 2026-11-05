# Data model: Fast decisions on lexicon terms in large studies

No new entity, no migration.

## Occurrence (`transcripts_occurrences`, unchanged)

Key `(term_id, spelling, session_id)`, with `study_id`, `count` and up to 50 places.

| Operation | Rows replaced |
|---|---|
| Lexicon reading run (full recount) | every row of the study |
| Edit of a term | the rows of that term in the study |
| Merge | the rows of the merged term (none left) and of the target in the study |

Rule: the rows of a term depend only on its counted spellings and on the study's validated interviews, so a targeted replacement leaves the table as a full recount would.

# Data Model: Lexicon decisions reflect what is kept

No stored change. Read model only:

- **TermQuote** gains `spelling: string` — the spelling this place is counted for (the count gives each place to its longest spelling).
- **TermOccurrence** gains `spellings?: { spelling, count, yes, no, unsure }[]` — per spelling, the occurrences and verdicts in the interview; `count`, `yes`, `no`, `unsure` stay their sums. Given with the term's quotes and every occurrence, not in the lexicon list (it would triple its size: 0.42 → 1.31 MB in the spec 032 volume test).
- The term's quotes give up to three excerpts **per spelling** and interview (every occurrence: up to 500 per spelling); the dialog shows the first three of those kept.

Kept in the dialog: the term's form, plus each variant switched on, compared as written (the match rule tells an acronym by its case).

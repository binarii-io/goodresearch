# Contracts: Lexicon decisions reflect what is kept

Responses using `TermOccurrence` (`listTermQuotes`, `listTermOccurrences`; `listLexicon` carries no quotes and no `spellings`):

```text
TermOccurrence { sessionId, title, count, yes, no, unsure, quotes: TermQuote[],
                 spellings?: { spelling, count, yes, no, unsure }[] }
TermQuote      { before, match, after, segmentId, offset, verdict, spelling }
```

`listTermQuotes`: up to three quotes per spelling and interview (before: three per interview).

Additive otherwise; no route changes. `decideTerm` / `mergeTerms` keep answering 409 `VERSION_CONFLICT` when a term changed.

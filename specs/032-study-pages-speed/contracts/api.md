# API contract: Fast study pages on large studies

## Changed

| Route | Change |
|---|---|
| `GET /api/studies/:studyId/lexicon` | Each term's `occurrences[]` keeps `sessionId`, `title`, `count`, `yes`, `no`, `unsure`; `quotes` is now always `[]`. |

## New

| Route | Result | Refusals |
|---|---|---|
| `GET /api/studies/:studyId/lexicon/terms/:termId/quotes` (`listTermQuotes`) | `TermOccurrences` (existing schema): the term's stored occurrences per interview with up to 3 quotes each, as the list carried before | `STUDY_NOT_FOUND`, `FOLDER_ACCESS_REQUIRED`, `TERM_NOT_FOUND` |

Unchanged: `GET …/terms/:termId/occurrences` (every occurrence, counted now), `/quality`, `/facts-analysis`, `/cleaning` (same bodies).

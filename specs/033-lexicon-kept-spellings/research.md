# Research: Lexicon decisions reflect what is kept

## R1 — Where to filter

- **Decision**: in the dialog, from spellings carried by the occurrences already read.
- **Rationale**: the switches change at each click; a read per click would be slow and the stored rows are already per spelling (`transcripts_occurrences` has `spelling`).
- **Alternatives**: a query parameter `spellings=` on the quotes route (a read per switch, rejected).

## R2 — Overlapping places

- **Decision**: a place carries the one spelling it is counted for (`spelling`); it is hidden when that spelling is switched off.
- **Finding**: the count already gives each place to its longest spelling. Switching a phrase off hides its places until saved, when its word is counted there (spec edge case).

## R3 — Counts

- **Decision**: each interview of the term's quotes carries `spellings: [{ spelling, count }]` (not the lexicon list: measured 0.42 → 1.31 MB); verdicts too; the dialog sums the kept ones; the form is always kept; spellings compare as written (review: `fold` would merge an acronym and a word the match rule tells apart).
- **Note**: a spelling already rejected is not counted, so switching it back on shows its places only once saved (it is counted then). Stated in the quickstart.

## R4 — Refused decisions

- **Decision**: on an `ApiError` with code `VERSION_CONFLICT`, invalidate the lexicon list (and the term's quotes) after showing the existing message.
- **Rationale**: the stuck state came from the list keeping the old version; the server check stays as it is.

## R5 — Excerpts per spelling (review)

- **Decision**: the term's quotes give up to three per spelling and interview; the dialog keeps those of the spellings switched on and shows the first three.
- **Rationale**: three per interview, cut before the filter, could leave an interview with kept occurrences and no excerpt.

## R6 — Dialog after a refusal (review)

- **Decision**: the dialog stays open and takes the term's new version from the list read again; the person's changes stay in the fields.

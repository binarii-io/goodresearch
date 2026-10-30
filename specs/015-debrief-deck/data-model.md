# Data model: Debrief deck

Migration `0038_debrief_deck.sql` (the next free number). The table cascades with the project. The limits and next steps are computed (no table; update 2026-10-29).

## synthesis_published_decks

| Column | Notes |
|---|---|
| `project_id` | Primary key |
| `file_id`, `folder_id`, `study_id`, `link` | |
| `language` | `en \| fr` |
| `with_proposed` | |
| `fingerprint` | Of the deck published (empty when the file could not be written) |
| `study_ids` | The studies the deck was built from (its publisher's access) |
| `revision` | The presentation's content revision just after the app wrote it (Slides `revisionId`) |
| `published_by`, `published_at` | |
| `version` | Of the record: the second of two updates at once is refused |

## Derived (never stored)

- **The deck**: `buildDeck` gives typed slides.
- **"Out of date"**: the fingerprint of the deck now differs from the published one.
- **"Changed in Google Slides"**: the presentation's content revision differs from the one kept, checked in the write itself (`writeControl.requiredRevisionId`); sharing or renaming the file does not count (review of PR #15).

# HTTP API: Debrief deck

All routes are under `/api/projects/:projectId`.

| Method | Path | operationId | Body / query | Returns |
|---|---|---|---|---|
| GET | `/debrief` | `getDebrief` | `?withProposed` | `{ language, slides: DeckSlide[], published: PublishedDeck \| null, outOfDate, otherAccess, folders: [{ studyId, name }], counts, takeawaysDraft }` |
| POST | `/debrief/publication` | `publishDebrief` | `{ studyId, language, withProposed }` | `PublishedDeck` |
| PUT | `/debrief/publication` | `updateDebrief` | `{ replace: boolean }` | `PublishedDeck`, or `409 DECK_CHANGED_IN_SLIDES` when the file was edited there and `replace` is false |

`DeckSlide` is typed by `kind` (`title`, `takeaways`, `context`, `method`, `numbers`, `insightsTable`, `insight`, `nuances`, `recommendations`, `matrix`, `nextSteps`, `thanks`); the project's own texts come in the deck's language, the app words the rest.

Errors: `DRIVE_WRITE_REQUIRED` (spec 007 consent), `DRIVE_CANNOT_EDIT` (with the owner's name), `DECK_CHANGED_IN_SLIDES`, `DECK_FILE_GONE`, `DECK_NOT_PUBLISHED`, `DECK_NOT_WRITTEN` (created but left empty: update it), `DECK_ACCESS_DIFFERS` (published from other studies than the person can open), `NO_SOURCE_FOLDER`, `VERSION_CONFLICT`.

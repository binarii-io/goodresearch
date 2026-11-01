# Contracts

## Tool `attach_folder`

Input: `{ studyId, link: at most 2,000 characters }`. Run during the answer; returns the card's confirmation or the reason.

## `POST /api/assistant/conversations/:id/continue`

Unchanged shape. Also accepted after an applied `attach_folder` or `create_study`, and on an open `connect_source` card with Drive connected; otherwise `NOTHING_TO_CONTINUE`.

## `POST /api/assistant/proposals/:id/apply`

`connect_source` is refused with `PROPOSAL_NOT_FOUND`: only the consent decides it.

## Errors

`FOLDER_ALREADY_ATTACHED`, 409.

## Proposal preview

Adds `folderName` and `folderOwner`, both optional.

## Tool `offer_choices`

Input: `{ question: 1..300, choices: 2 to 6 labels of 1..120, multiple: boolean }`. Recorded, ends the answer. Invalid: nothing shown, told to the model. Preview adds `question`, `choices`, `multiple`, `opensOn`. `continue`'s page may hold `phase`.

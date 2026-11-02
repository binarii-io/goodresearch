# Contracts

## Tools

- `browse_folder { studyId, folderId? }`: everything in the folder, all levels, at most 500 items; `folderId` only after a cut list.
- `find_files { studyId, query?, kind? }`: what matches anywhere in the folder, at most 50 items.
- `read_file { studyId, fileId, part? }`: one extract of 8,000 characters; says whether the file goes on.
- `propose_folder_changes { studyId, lines }`: a card, or the reason. There is no delete, trash or sharing line.

Each returns a consent card's confirmation until consent is given. An anonymised study is refused.

## `POST /api/assistant/proposals/:id/apply-folder-changes`

Body: `{ excluded: line indexes }`. 200: the proposal with its lines' outcomes. Generic Apply on this kind: `FOLDER_CHANGES_REQUIRED`, 409.

## Errors

`FOLDER_CHANGES_REQUIRED`, 409.

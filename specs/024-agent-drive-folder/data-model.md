# Data model: The assistant works in the study's folder

## FolderConsent (assistant, new table)

`account_id`, `study_id`, `provider`, `given_at`; primary key on the first three; deleted with the study.

## Lines of a batch (`values.lines`)

| Kind | Fields | Before / after shown |
|---|---|---|
| `new-folder` | `key`, `name`, `parent` (folder id or a `key`) | path of the new folder |
| `rename` | `fileId`, `name` | old name, new name |
| `move` | `fileId`, `to` (folder id or a `key`) | old folder, new folder |

Rules, pure: 1 to 200 lines; keys unique; a `to` or `parent` naming a key must name an earlier `new-folder`; names 1 to 200 characters, without `/`; no two lines giving one name in one place; no line moving the study's folder itself. Excluding a `new-folder` excludes what depends on it.

## Proposal kinds (migration 0050)

`browse_folder`, `read_file` (recorded, panel line), `propose_folder_changes` (card), `folder_consent` (card).

`propose_folder_changes.preview`: `studyId`, `studyName`, `lines` (`index`, `kind`, `before`, `after`, `dependsOn`), and once applied each line's `outcome`: `done`, `skipped`, or an error code.

## Continuation

| Card | Told to the model | Tools |
|---|---|---|
| `folder_consent` applied | go on with what was asked | folder tools |
| `propose_folder_changes` applied | outcomes; where things stand | choices only |

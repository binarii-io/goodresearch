# Data model: Attach a study's Drive folder with the assistant

## Proposal kinds (migration 0047)

| Kind | targetId | values | preview | Decided by |
|---|---|---|---|---|
| `attach_folder` | study | link | studyName, folderName, ownerName | Apply or Dismiss |
| `connect_source` | study | link | studyName | The consent (`applied`), or Dismiss; Apply is refused |

An open card of either kind is replaced by the next call, in the same conversation.

| `offer_choices` | none | question, choices, multiple | same | Recorded at once |

`attach_folder`'s preview also holds `opensOn`: `preparation` or `fieldwork`.

## Continuation

Allowed right after the last answer when it holds:

| Card | State | Extra check | Told to the model | Tools withheld |
|---|---|---|---|---|
| `create_project` | applied | | ask about a first study | creating, framing, skills, `attach_folder` |
| `create_study` | applied | | offer the folder and the guide, as choices | same |
| `attach_folder` | applied | | give the counts, offer what is left to prepare, as choices | same |
| `connect_source` | proposed | person's Drive connected | call `attach_folder` with the link | creating, framing, skills |

## Refusals of `attach_folder`

| Code | Result |
|---|---|
| `DRIVE_NOT_CONNECTED` | `connect_source` card |
| `NOT_A_DRIVE_FOLDER_LINK`, `FOLDER_NOT_FOUND` | Reason: not a folder, or not opened by this person |
| `FOLDER_ALREADY_ATTACHED` | Reason: replacing happens in Fieldwork |
| `FOLDER_ACCESS_REQUIRED` | Reason: no access to this study's folder |
| `DRIVE_NOT_CONFIGURED`, `DRIVE_UNAVAILABLE` | Reason: not available here, or try again |
| `STUDY_NOT_FOUND` | Reason: use a study id of the context |
| `INVENTORY_RUNNING` | Reason: wait for the inventory |

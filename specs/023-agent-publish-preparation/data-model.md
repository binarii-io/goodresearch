# Data model: Publish the preparation with the assistant

## Proposal

| Kind | targetId | values | preview |
|---|---|---|---|
| `publish_preparation` | study | kinds, language | studyName, documents, folderName |
| `connect_source` (extended) | study | link, or kinds | studyName, access |

## Next step

`nextStep({ hasGuide, hasFolder, published, planned })`:

| Condition, in order | Result |
|---|---|
| no guide | `write-guide` |
| no folder | `add-folder` |
| guide or best practices not published | `publish` |
| nothing planned | `plan-interviews` |
| otherwise | `fieldwork` |

## Continuation

| Card | State | Told to the model | Tools |
|---|---|---|---|
| `propose_interview_guide` | applied | guide saved; say what comes next, as choices | no card but the choices |
| `publish_preparation` | applied | files created; say what comes next, as choices | same |
| `connect_source` | proposed, source connected | call again the tool that led to it | adds `attach_folder`, `publish_preparation` |

## Refusals of `publish_preparation`

| Code | Result |
|---|---|
| `DRIVE_WRITE_REQUIRED`, `DRIVE_NOT_CONNECTED` | Connection card |
| `NO_SOURCE_FOLDER` | Reason: add the folder first |
| `GUIDE_MISSING` (asked for the guide, none exists) | Reason: write it first |
| `NOTHING_TO_PUBLISH` | Reason: already published, updates happen in Preparation |
| `FOLDER_ACCESS_REQUIRED`, `DRIVE_NOT_CONFIGURED`, `DRIVE_UNAVAILABLE`, `STUDY_NOT_FOUND` | Reason, as in spec 022 |

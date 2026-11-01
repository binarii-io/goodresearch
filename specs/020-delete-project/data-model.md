# Data model: Delete a research project

No new table or column. One allowed value is added to `assistant_proposals.kind`: `delete_project`.

## Project aggregate

- `canBeDeletedBy({ id, role })`: true for an admin, or when `createdBy` equals `id`. A project with no creator: admins only.
- `confirms(typed)`: the typed name, without spaces at both ends, equals the name exactly, capitals and accents included.

## Command rules, in order

1. No access to the team: `PROJECT_NOT_FOUND`.
2. Neither admin nor creator: `FORBIDDEN`.
3. A live run: `SYNTHESIS_RUNNING`.
4. Wrong name: `NAME_MISMATCH`.
5. Delete in one transaction.

## Proposal `delete_project`

| Field | Value |
|---|---|
| `targetId` | The project |
| `values` | Empty: never the typed name |
| `preview` | `projectName`, `deletion` (volumes at proposal time) |
| `resultKind`, `resultId` | Null once applied |

States are the usual ones. A wrong name changes nothing.

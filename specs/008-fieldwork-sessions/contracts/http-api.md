# HTTP API: Fieldwork sessions

A session is required. The gate is the same as the inventory: project team, interview study, own folder access (spec 002 FR-010a). Otherwise the answer is `404` or `403 FOLDER_ACCESS_REQUIRED`.

| Method | Path | Body | Answer |
|---|---|---|---|
| GET | `/api/studies/:studyId/sessions` | — | `200 Fieldwork` |
| POST | `/api/sessions/:sessionId/link` | `{ plannedInterviewId: string \| null, version, move?: boolean, confirmSuggestion?: boolean }` | `200 Session`; `409 PLANNED_INTERVIEW_LINKED` (detail: `{ sessionId, title }`), `409 VERSION_CONFLICT`, `409 SESSION_DECIDED`, `404 SESSION_NOT_FOUND`, `404 PLANNED_INTERVIEW_NOT_FOUND` |
| PATCH | `/api/sessions/:sessionId` | `{ version, title?: string \| null, media?: string[], roster?: RosterEntryInput[] }` | `200 Session`; `409 VERSION_CONFLICT`, `409 SESSION_DECIDED`, `422 MEDIA_UNAVAILABLE`, `404 MEMBER_NOT_FOUND` |
| POST | `/api/sessions/:sessionId/decision` | `{ decision: 'validate' \| 'exclude' \| 'reopen', reason?: string, version }` | `200 Session`; `409 VERSION_CONFLICT`, `409 INVALID_TRANSITION` |

## Types

- **`Fieldwork`**:

  ```text
  {
    sessions: Session[],
    unmatchedMedia: MediaFile[],
    plannedWithoutSession: { id, interviewee, scheduledAt, status }[],
    totals: { proposed, validated, excluded },
    skipped: number
  }
  ```

  `skipped` counts the transcripts beyond the limit of 500.
- **`Session`**:

  ```text
  {
    id, state, title, defaultTitle,
    transcript: { fileId, name, group, modifiedAt, webLink } | null,
    fileMissing,
    media: { fileId, name, webLink, confidence, reason }[],
    mediaEdited,
    link: { plannedInterviewId, interviewee, scheduledAt, status, linkedBy } | null,
    suggestion: { plannedInterviewId, interviewee, scheduledAt, rule: 'name' | 'date' } | null,
    roster: RosterEntry[],
    excludedReason, decidedBy, decidedAt, version
  }
  ```

  `transcript` is `null` only when `fileMissing` is true.
- **`RosterEntry`**: `{ id, name, role: 'interviewer' | 'interviewee', memberId: string | null }`.
- **`RosterEntryInput`**: the same, with an optional `id`. Entries without an id get a new one.

Confirming a suggestion is `POST link` with the suggested id. When the roster is empty, confirming prefills it from the planned interview (research R8).

# HTTP API: Study preparation

All routes need a session; errors use the common error body. Gate: project team (`STUDY_NOT_FOUND` otherwise), an interview study (`NOT_AN_INTERVIEW_STUDY`, 422), then folder access (`FOLDER_ACCESS_REQUIRED`).

| Method | Path | Body | Answer |
|---|---|---|---|
| GET | `/api/studies/:studyId/guide` | — | `200 InterviewGuide \| null` |
| PUT | `/api/studies/:studyId/guide` | `SaveInterviewGuide { content: GuideContentInput, version: number \| null }` | `200 VersionAck`; `422 VALIDATION`, `409 VERSION_CONFLICT` |
| GET | `/api/studies/:studyId/planned-interviews` | — | `200 PlannedInterview[]` (sorted by date, undated last) |
| POST | `/api/studies/:studyId/planned-interviews` | `PlannedInterviewInput` | `201 Created`; `422 VALIDATION`, `409 SCHEDULE_FULL` |
| PUT | `/api/planned-interviews/:plannedInterviewId` | `UpdatePlannedInterview` (input + `version`) | `200 VersionAck`; `404 PLANNED_INTERVIEW_NOT_FOUND`, `409 VERSION_CONFLICT` |
| DELETE | `/api/planned-interviews/:plannedInterviewId` | — | `204` |

- `InterviewGuide`: `{ studyId, content: GuideContent (with ids), origin: 'assistant' | 'person', updatedBy: { name } | null, updatedAt, version }`.
- `GuideContentInput`: the same content where section and question ids are optional (kept when known, research R4).
- `PlannedInterviewInput`: `{ interviewee, role, interviewers, scheduledAt: ISO datetime | null, status, notes }`.
- `PlannedInterview`: the input plus `id`, `version`, `updatedAt`.
- `GuideDraft`: the content without ids, as the assistant writes it (tool input).

Assistant (spec 005 contracts, extended): `ProposalKind` adds `propose_interview_guide`, `report_guide_progress`, `load_skill` and `check_guide_questions`; `ProposalPreview` adds `studyName`, `guide`, `replacesGuide`, `progress`, `checks` and `skill`; `QuestionIssue` lists the writing rules.

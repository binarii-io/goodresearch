# Data model: Study preparation

## research_interview_guides

One row per study with a guide (InterviewGuide aggregate).

| Column | Type | Rules |
|---|---|---|
| study_id | text PK | FK → research_studies ON DELETE CASCADE |
| content | jsonb | `GuideContent` below, validated by the domain |
| origin | text | `assistant` \| `person` (check) |
| updated_by | text null | FK → auth_users ON DELETE SET NULL |
| created_at, updated_at | timestamptz | |
| version | integer | optimistic locking, 0 on creation, +1 per save |

`GuideContent`:

```text
framing:  { objectives: string ≤4000, hypotheses: string[] ≤15 (each ≤600), audience: string ≤4000, format: string ≤4000 }
sections: [1..12] { id, kind: introduction|warm-up|theme|wrap-up, title 1..120, minutes 1..180,
                    questions: [0..] { id, text 1..600, followUps: string[] ≤8 (each 1..600) } }
total questions ≤ 60
```

Section ids and question ids are assigned by the app (research R4).

## research_planned_interviews

PlannedInterview aggregate (one row of the schedule).

| Column | Type | Rules |
|---|---|---|
| id | text PK | |
| study_id | text | FK → research_studies ON DELETE CASCADE; index (study_id, scheduled_at) |
| interviewee | text | 1..120 |
| role | text | ≤120, default '' |
| interviewers | text | ≤200, default '' |
| scheduled_at | timestamptz null | |
| status | text | `to-contact` \| `invited` \| `scheduled` \| `done` \| `postponed` \| `cancelled` (check) |
| notes | text | ≤2000, default '' |
| created_by | text null | FK → auth_users ON DELETE SET NULL |
| created_at, updated_at | timestamptz | |
| version | integer | optimistic locking |

At most 300 rows per study (checked by the command).

## assistant_proposals (changed)

- `kind` adds `propose_interview_guide` (Apply → research `saveGuide`, `target_id` = study id, `target_version` = guide version seen or null, `values.guide`), and three kinds recorded `applied` (or `invalid`) without a card: `report_guide_progress` (`values` = the eight states, recorded when called, ends the answer), `load_skill` (`values.name`) and `check_guide_questions` (`values.questions`), both run during the answer.
- `preview` adds `studyName`, `guide` (the proposed content, for the card), `replacesGuide`, `progress` (`{ percent, items: [{ key, weight, status }] }`), `checks` (`[{ question, issues }]`) and `skill`.

## Guide design progress (computed)

| Key | Weight |
|---|---|
| objectives | 15 |
| hypotheses | 10 |
| audience | 15 |
| format | 10 |
| intro | 10 |
| themes | 25 |
| followUps | 10 |
| biasReview | 5 |

`percent = round(Σ weight × {missing: 0, partial: 0.5, done: 1})`.

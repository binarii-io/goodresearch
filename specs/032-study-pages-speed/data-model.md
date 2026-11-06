# Data model: Fast study pages on large studies

No new table, no migration. New reads only:

| Read | Rows | Index used |
|---|---|---|
| AI suggestions of a study's interviews | `transcripts_ai_suggestions where session_id in (…)` | `transcripts_ai_suggestions_session_idx` |
| Stored corrections of a study's interviews | `transcripts_corrections where session_id in (…)` | `transcripts_corrections_session_idx` |
| Name decisions of a study's interviews | `transcripts_correction_decisions where session_id in (…)` | primary key `(session_id, key)` |
| Latest clean versions of a study, with their text | `transcripts_clean_versions` of the study's sessions, latest number each | existing session index |
| Speaker attributions of a study (Evidence) | per study instead of per interview | existing |
| A term's stored occurrences with quotes | `transcripts_occurrences where study_id = ? and term_id = ?` | `transcripts_occurrences_study_idx` |

**Analysed text** (spec 012, never stored): the same function of the same data; only how the data is read changes.

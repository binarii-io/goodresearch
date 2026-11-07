# Agent journeys

How the assistant accompanies a person through the research, step by step, from the first project to the debrief. Each journey describes what the assistant must find out, what it may do, and how the person stays in control.

A journey is defined and delivered on its own: one journey, one pull request, one validation.

## Journeys

| # | Journey | Status |
|---|---|---|
| 1 | [Create a research project](01-create-project.md) | Built by [spec 018](../../specs/018-agent-create-project/spec.md) |
| 2 | [Reuse a study in another project](02-attach-study.md) | Built by [spec 019](../../specs/019-attach-study/spec.md) |
| 3 | [Delete a research project](03-delete-project.md) | Built by [spec 020](../../specs/020-delete-project/spec.md) |
| 4 | [Create a study](04-create-study.md) | Built by [spec 021](../../specs/021-agent-create-study/spec.md) |
| 5 | [Attach a study's Drive folder](05-study-folder.md) | Built by [spec 022](../../specs/022-agent-study-folder/spec.md) |
| 6 | [Publish the preparation](06-publish-preparation.md) | Built by [spec 023](../../specs/023-agent-publish-preparation/spec.md) |
| 7 | [Work in the study's folder](07-study-folder-work.md) | Built by [spec 024](../../specs/024-agent-drive-folder/spec.md) |
| 8 | [Interviews](08-interviews.md) | Built by [spec 025](../../specs/025-agent-interviews/spec.md) |
| 9 | [Questionnaire](09-questionnaire.md) | Built by [spec 027](../../specs/027-survey-preparation/spec.md) |
| 10 | [Survey fieldwork](10-survey-fieldwork.md) | Built by [spec 028](../../specs/028-survey-fieldwork/spec.md) |
| 11 | [Survey analysis](11-survey-analysis.md) | Built by [spec 029](../../specs/029-survey-analysis/spec.md) |
| 12 | [Usability test preparation](12-usability-preparation.md) | Built by [spec 036](../../specs/036-usability-test-preparation/spec.md) |

## How a journey is written

Each journey has the same sections:

1. **Goal**: what the person has at the end.
2. **Before** (or **Today**, until built): what the code did, with its gaps; as a Mermaid diagram while the journey is not built.
3. **What the assistant must find out**: each piece of information, why the app needs it, and where it is stored.
4. **Journey**: the expected behaviour, as a Mermaid diagram.
5. **Guarantees**: what the app enforces in code, as opposed to what is left to the model.
6. **How we verify it**: the tests, and the scenarios to try with a real model.

## Rules for every journey

- The app guarantees what must always be true. Instructions to the model guide the conversation but do not prove anything: anything that must hold is checked in code, when the tool is called.
- The assistant proposes and the person decides (constitution IV). Only opening a page or reading happens without confirmation.
- The assistant does not ask for what it already knows from the page context or the conversation.
- It asks one or two short questions at a time, never a block of questions.
- When a few clear options exist, the assistant offers a list the person can select from (`offer_choices`).

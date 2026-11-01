---
status: accepted
date: 2026-11-01
---

# ADR-0008 — Studies are owned by teams and linked to projects

## Context and problem statement

A study belonged to one project and was deleted with it. An older study's interviews and facts could not feed a new research question without doing the fieldwork again.

## Decision drivers

- Reuse past research without new AI costs.
- A study shared between projects needs one stable research goal and one owner.
- Deleting a project should not have to delete studies that matter elsewhere.

## Considered options

1. **Copy the study into the new project**: simple isolation, but decisions and costs split, and transcripts are duplicated.
2. **Keep one project, with a "main project" rule**: smaller change, but the goal and the owner would depend on which project came first.
3. **Team-owned studies, linked to zero or more projects**: most of the app already reads a project's studies through one query.

## Decision outcome

Option 3. A study has a required team, its own goal, and a link table to the projects of that team. Access follows the study's team, then its folder. AI steps inside the study read its goal; AI steps over a project read the project's. A decision on a fact applies in every linked project.

A study can have no project: its team's Studies page lists it. Deleting a project removes its links, not its studies.

## Consequences

- A team with studies cannot be deleted.
- Moving a project moves its studies in the same transaction, and is refused if one of them is shared. This is the one command that changes more than one aggregate, as a study's team must stay equal to its projects'.
- A study's cost appears in each project that uses it, so project totals must not be added together.
- Sharing between teams would need its own access rules.

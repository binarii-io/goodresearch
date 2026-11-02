---
status: accepted
date: 2026-11-02
---

# ADR-0009 — Every member reads, the owning team changes

## Context and problem statement

A team was the unit of both reading and changing: a member saw and edited exactly the projects and studies of their teams, and anything else answered "not found". Research stayed locked inside the team that ran it, while what people need to protect is the team's work and the identity of the people interviewed, not the findings.

## Decision drivers

- Findings should reach people outside the team that ran the study.
- Nobody outside the team changes its work or spends on its AI steps.
- The people interviewed agreed to talk to a research team, not to the whole organisation.
- A source's own permissions are never bypassed.
- A route forgotten by a future spec must not open anything.

## Considered options

1. **Widen the existing gates, and add a write check to each command**: small diff, but those gates serve queries and commands in seven modules, so one missed call opens a change or a reserved read.
2. **A role or per-project sharing model**: flexible, but it adds tables and decisions no one has asked for.
3. **Keep the gates for the team, and open a listed set of reads through new ones**: more read paths, but it fails closed.

## Decision outcome

Option 3. Existing gates keep meaning "the owning team or an admin". A person's relation to a resource is computed, `team` or `reader`, from their role and memberships. Nothing is stored.

- **Open reads** are listed once in the platform's access guard, and a test classifies every route against the list.
- **Everything else** on what a team owns answers `403 READ_ONLY` with the team's name, before input validation, for changes, AI runs and reserved reads alike. Use-case gates remain as the second barrier.
- **Reserved to the team**: the schedule, interviews and their file names, participants' identities, transcripts in any version, Enrichment and interview quality. A reader's facts carry an interview number instead of a title, and every name the app knows is masked in their statements; verbatims come only on an anonymised study, with pseudonyms and the same masking. The same masking covers insights, recommendations and saved takeaways, and a search looks at the masked text. Recommendation owners, unsaved drafts and the names of who ran, decided, saved or wrote something are hidden. All of this is decided on the server.
- **The folder barrier stays** for everyone: without confirmed access, a study shows its name, type and team, and says why. Lists use the recorded access and never call the source, so they say "not confirmed"; what a reader gets of a study's facts at project level rests on their access now. Masking takes the names of every study of the project, whatever the reader can open.
- **The assistant** reads what the person may read. On another team's page it keeps a short allowlist of tools that change nothing: opening pages and offering choices. Creating is for a page of the person's own teams.

This replaces the "access follows the study's team" sentence of ADR-0008 for reading; for changes it still holds.

## Consequences

- A new read route is closed until added to the list, and a new tool is off on read-only pages until allowed.
- A member of no team can read, and create nothing.
- A reader's debrief holds no quote in this first version, even on an anonymised study, and they do not get the published copy's link: it holds quotes.
- Masking covers the names the app knows. A name it has never seen, written in free text, stays visible to readers.
- A study's content needs folder access even to read, so a reader without it sees insights but not the study's detail.
- A run stops for interviews not yet processed when the person who started it leaves the team.
- Showing names outside the team, or read-only members, would need their own decision and a consent model.

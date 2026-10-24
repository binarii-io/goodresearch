---
status: accepted
date: 2026-10-24
---

# ADR-0001 — Spec-driven development with Spec Kit, decisions in ADRs

## Context and problem statement

The project restarts from scratch after a prototype that grew without specs: rules lived in code and in a long README, and decisions were hard to trace. Contributors (humans and coding agents) need a shared, reviewable way to define features before building them.

## Decision drivers

- Every behaviour traceable to a written requirement.
- Works well with coding agents.
- Lightweight enough for a small team.

## Considered options

1. GitHub Spec Kit (constitution + spec → plan → tasks per feature)
2. Free-form issues and PR descriptions
3. RFC process in `docs/rfcs/`

## Decision outcome

Chosen: **Spec Kit** (Claude integration, git extension). Installed from the main branch (`1.2.4.dev0`, see `.specify/init-options.json`); upgrade to tagged releases with `specify self`.

- `.specify/memory/constitution.md` holds the non-negotiable principles.
- Each feature lives in `specs/NNN-slug/` (spec, plan, tasks, checklists) on a branch `NNN-slug`.
- Structuring technical decisions are recorded as **MADR 4** ADRs in `docs/adr/`. The constitution says *what must hold*; ADRs say *why we chose X*.
- Spec Kit commit messages use Conventional Commits (`commit_style: conventional`).

### Consequences

- Good: specs are reviewed in the same PR as the code; agents get stable context.
- Good: plans run a *Constitution Check* gate.
- Bad: overhead for small changes — mitigated by allowing fixes/chores without a spec.

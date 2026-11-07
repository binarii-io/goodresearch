---
status: accepted
date: 2026-10-24
---

# ADR-0003 — Modular monolith, DDD, hexagonal layers and light CQRS

## Context and problem statement

The domain is rich (projects, studies, sessions, transcripts, lexicon, corrections, evaluations, facts, insights, recommendations) and full of invariants ("AI proposes, humans decide", frozen sessions, verbatim checks, deterministic confidence). The prototype mixed HTTP, SQL and business rules in a few very large files. We want domain objects clearly separated from mutations and reads, without over-engineering.

## Decision drivers

- Business rules testable without a database or network.
- Clear ownership per area; changes stay local.
- Small team: one deployable unit, no distributed system.

## Considered options

1. Layered app (controllers/services/repositories) without modules
2. **Modular monolith with bounded contexts, hexagonal layers, light CQRS**
3. Microservices / event sourcing
4. NestJS with its CQRS module

## Decision outcome

Chosen: **option 2**.

- One module per bounded context of [the context map](../domain/context-map.md). Each module has `domain/`, `application/` (`commands/`, `queries/`), `infrastructure/` and a public `index.ts`.
- **Domain model for core contexts and rule-heavy supporting contexts** (Research, Interview Quality, Evidence, Synthesis; Ingestion and Transcripts). Generic contexts (Workspace, AI Gateway) use plain handlers.
- **Commands** load one aggregate through a repository port, call a behaviour method, save, publish events, return `Result`.
- **Queries** bypass the domain and read the module's tables directly into contract DTOs.
- **No** command/query bus, mediator, DI container, base-class hierarchy, or mapper per entity. A manual composition root (`compose.ts`) wires everything; tests compose fakes.
- Boundaries enforced by dependency-cruiser in CI (domain imports nothing from infrastructure or frameworks; modules import each other only via `index.ts`).

Patterns are taken from *Architecture Patterns with Python* (repository, unit of work, light CQRS), Vernon's aggregate rules (small, by-ID references, one aggregate per transaction) and Khononov's subdomain-based choice of modelling style. TypeScript repos (domain-driven-hexagon, CodelyTV) are used as catalogs only; they are stale and framework-bound.

### Consequences

- Good: domain and use cases tested with fakes in milliseconds; reads stay simple SQL.
- Good: a context can be extracted later if ever needed.
- Bad: some duplication between write model and read DTOs — accepted, it keeps each side simple.

## Update (spec 017): the Reporting module

The project's Overview reads six modules, so it opens `modules/reporting`, the place `docs/standards.md` gives cross-module views. It acts as the backend for that screen: read models only, no table, no aggregate, no write, each other module reached through ports wired in `compose.ts`. A screen may use several endpoints when parts differ in cost, so numbers do not wait for the ledger; a rule owned by a module stays there, as "may be out of date" stays in Synthesis. The debrief deck stays in Synthesis because its publication writes.

## Update (spec 037): test sessions and protocol versions

A test session of a usability test study is the Ingestion **Session** aggregate, not a new one: it gains a main video (`video_file_id`, unique per study) and a protocol version chosen by a person, and its reconciliation starts from videos instead of transcripts (`reconcileStudy` by study type). Files, matching, people, analysis, renaming and the assistant's cards stay one code path for interviews and tests.

The saved versions of a test protocol belong to Research (`research_test_protocol_versions`, written in the same transaction as each save, never changed). Ingestion reads them through its `ProtocolVersions` port, wired in `compose.ts`; it never reads Research's tables. The version a session was run against is proposed at read time from the session's date; only a person's choice is stored.

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

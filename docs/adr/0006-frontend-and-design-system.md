---
status: accepted
date: 2026-10-24
---

# ADR-0006 — Frontend stack and design system

## Context and problem statement

The UI is rich (review screens, inline transcript editing, graphs, a presentation deck, a chat assistant) and must be accessible and bilingual. The prototype used hand-written vanilla JS with a runtime string-replacement translation layer.

## Decision drivers

- Typed end-to-end with the API.
- Accessibility (WCAG 2.2 AA) and i18n built in.
- A design system that the team owns and can evolve.

## Considered options

- **Framework**: React + Vite · Next.js · HTMX/server templates. The app is an authenticated SPA behind an API; SSR adds no value and complicates self-hosting.
- **Primitives**: Base UI · Radix · React Aria Components. Base UI is shadcn's default since 2026-07 and actively maintained; React Aria is the most accessible but heavier to style.
- **i18n**: Lingui · Paraglide · i18next.

## Decision outcome

- **React + Vite + TypeScript**, **TanStack Router** (file-based, typed search params) and **TanStack Query** with an **orval**-generated client from the API's OpenAPI.
- **`packages/ui`**: components generated with the shadcn CLI on **Base UI**, owned in the repo; **Tailwind v4** with tokens as CSS variables (`@theme`), primitive → semantic layers, light/dark; token files in W3C DTCG shape (build pipeline deferred).
- **Storybook 10** (`react-vite`, a11y addon, stories run as Vitest browser tests).
- **Lingui** (ICU, compile-time, `.po` files usable with community translation tools). French and English from day one.
- Accessibility checked with axe in Storybook and Playwright.

### Consequences

- Good: consistent UI, accessible primitives, translations as a contributor-friendly workflow.
- Bad: owned shadcn components must be updated by hand — accepted, it is the point of owning them.

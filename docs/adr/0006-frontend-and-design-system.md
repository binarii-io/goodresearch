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

## Update 2026-10-24 — product identity and app shell (spec 003)

### Context

Specs 001 and 002 used the neutral shadcn look. The product already had an identity, validated on the prototype: an ink, a highlighter and paper colours, the Schibsted Grotesk typeface, a wordmark and an icon, a sidebar shell and folder- and card-based home.

### Decision

- The identity becomes the design system's tokens (light and dark): see [specs/003-brand-and-app-shell/contracts/ui-tokens.md](../../specs/003-brand-and-app-shell/contracts/ui-tokens.md).
- **The highlighter is a fill only** (active marks, highlights, soft tags), never a text colour and never the only focus indicator: it is 1.8:1 on white. Focus is a 2 px ink outline (paper in dark mode) with a highlighter halo.
- The typeface is bundled (`@fontsource-variable/schibsted-grotesk`, SIL OFL); brand marks are inline SVG components (`Wordmark`, `BrandIcon`) that follow the theme. No third-party asset or font service.
- The signed-in shell is an `AppShell` component in `packages/ui`: sidebar (collapsible to an icon rail, remembered in `localStorage`), drawer below 768 px, sticky top bar. Apps pass links through `render` props, so the design system stays free of the router.
- Page patterns from the prototype: `PageBar` for detail pages (back button, breadcrumb title, controls on the right), `PageTitle` for list pages, team folders, project cards and study rows with a generated visual.
- The account shows the provider's profile photo when it is an https address (`Me.picture`): the only image loaded from a third party, the person's own.
- Icons come from `@goodresearch/ui/components/icons` (lucide re-exports), so apps take every UI piece from the design system.
- Stories run in both themes (two Vitest browser instances, `colorScheme` light and dark).

### Consequences

- Good: one recognisable identity, AA contrast verified per token pair, no external requests.
- Bad: shell parts of features not built yet (search, recent projects…) are left out and must be added with their features.

## Update 2026-10-24 — assistant panel (spec 005)

- `AppShell` takes a `panel` on the right: on ≥ 768 px its width animates from 0 to 400 px and pushes the page; below, it covers the screen and slides in. Visibility is animated only when closing, so focus can move into the panel as soon as it opens; it is `inert` while closed; Escape closes it; reduced motion disables the animation.
- The answer streams as server-sent events over `fetch`; events are validated with the shared Zod contract (`@goodresearch/contracts`, now a dependency of the web app). Model text is rendered from a Markdown subset as React elements, never as HTML.

## Update 2026-10-25 — long-form content documents (spec 006)

### Context

The interview best practices are a document of about 160 lines per language. As Lingui messages they would become dozens of catalog entries split mid-paragraph, hard to translate and review.

### Decision

- Interface strings still go through Lingui, without exception.
- **Long-form content documents** (today only the interview best practices) are written as one typed content module per language (`best-practices.en.ts`, `best-practices.fr.ts`), chosen with the active Lingui locale. A new language adds a module; reviewers read each language as a whole document.

### Consequences

- Good: documents read and translate as documents; the same content can be published as files (spec 007).
- Bad: `i18n:extract` does not see these texts; a missing language must be caught in review (typed modules make a missing key a type error).


# Implementation Plan: Product identity, design system and app shell

**Branch**: `003-brand-and-app-shell` | **Date**: 2026-10-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-brand-and-app-shell/spec.md`

## Summary

Front-end only. The design system (`packages/ui`) takes the product identity of the prototype: ink / paper / highlighter tokens (light and dark), the Schibsted Grotesk typeface bundled with the app, brand assets (wordmark, icon, favicons) and restyled components. New components: sidebar shell parts, tabs and segmented control, page header, team folder, project card, count, tag. The web app gets a sidebar shell (collapsible, drawer on small screens), a home with team folders and project cards, shared page headers, study phases as tabs and danger zones. No API, data or behaviour change. Decisions in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 7 (unchanged)

**Primary Dependencies**: + `@fontsource-variable/schibsted-grotesk` (OFL, replaces `@fontsource-variable/geist`); shadcn components added from the registry (tabs, sheet, tooltip) on Base UI, already installed

**Storage**: none (sidebar collapsed flag in `localStorage`)

**Testing**: Storybook stories + Vitest browser + axe in light and dark; Playwright e2e updated (selectors) + axe on every page; a 360 px viewport check

**Target Platform**: browsers (unchanged)

**Project Type**: web application (unchanged)

**Performance Goals**: one font file (variable, latin + latin-ext subsets), SVG brand assets; no new request to third parties

**Constraints**: WCAG 2.2 AA in both themes; tokens only (no raw colours in `apps/web`); every string through Lingui

**Scale/Scope**: ~10 components restyled, ~8 new, 9 pages re-laid out

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I. Spec-driven | Spec, plan, tasks in `specs/003-…` | ✅ |
| II. DDD pragmatic | No domain change | N/A |
| III. Provider-agnostic | Font and assets self-hosted; no CDN | ✅ |
| IV. AI proposes | No AI | N/A |
| V. Test-first | Component stories with axe written with each component; e2e updated before layout changes land | ✅ |
| VI. Contracts | No contract change | N/A |
| VII. Privacy | No third-party request (fonts, images) | ✅ |
| VIII. a11y & i18n | AA contrast verified per token pair (research R2), focus 3:1, tabs pattern, skip link, EN/FR | ✅ |
| IX. Simplicity | Tailwind tokens + shadcn components; generated card visual is a CSS gradient, no image pipeline | ✅ |

**Post-design re-check**: passed.

## Project Structure

### Documentation (this feature)

```text
specs/003-brand-and-app-shell/
├── plan.md · research.md · quickstart.md
├── contracts/ui-tokens.md
├── checklists/requirements.md
└── tasks.md
```

No `data-model.md`: no data.

### Source Code

```text
packages/ui/
├── src/styles/globals.css            # tokens (light/dark), base, focus, reduced motion
├── src/brand/                        # wordmark.svg, icon.svg (sources; components/brand.tsx inlines them)
├── src/components/                   # restyled: button, badge, card, dialog, alert-dialog, input, select,
│                                     #   textarea, dropdown-menu, radio-group, checkbox, inline-edit
│                                     # new: tabs, sheet, tooltip, icons, brand, page-header, count,
│                                     #   team-folder, project-card, danger-zone, app-shell
└── src/lib/sky.ts                    # stable generated visual from an id
apps/web/
├── index.html                        # favicons, theme-color
├── public/                           # favicons, apple-touch-icon
└── src/
    ├── routes/_authenticated.tsx     # AppShell (sidebar, top bar)
    ├── routes/sign-in.tsx            # brand sign-in
    ├── routes/_authenticated/index.tsx   # team folders + project cards
    ├── routes/_authenticated/**      # page headers, danger zones, study phases
    └── features/workspace/{app-sidebar,account-menu}.tsx
```

## Implementation phases (input for `/speckit-tasks`)

1. **Foundational**: tokens, font, brand assets, base styles (focus, reduced motion), component restyle, Storybook stories in both themes.
2. **US1 identity**: sign-in page, favicons, theme colour, dark wordmark.
3. **US2 shell**: AppShell with sidebar (nav, new-project shortcut, account), collapse with memory, mobile drawer, top bar, skip link.
4. **US3 home**: team folders (filter in URL), project cards with generated visual, "New project" card.
5. **US4 page headers**: page header on every secondary page, study phases as tabs in the URL, danger zones.
6. **Polish**: e2e + axe + 360 px check, raw colour search, README of `packages/ui`, standards, prototype reference, translations.

## Complexity Tracking

None.

---
description: "Task list for 003-brand-and-app-shell"
---

# Tasks: Product identity, design system and app shell

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [contracts/ui-tokens.md](contracts/ui-tokens.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency)

## Phase 1: Foundational (design system)

- [X] T001 Replace `@fontsource-variable/geist` with `@fontsource-variable/schibsted-grotesk` in the catalog (`pnpm-workspace.yaml`) and `packages/ui/package.json`
- [X] T002 Rewrite tokens in `packages/ui/src/styles/globals.css` per [contracts/ui-tokens.md](contracts/ui-tokens.md): light and dark values, `--highlight`, `--highlight-soft(-foreground)`, `--primary-hover`, radius 14 px, font; base styles: headings 700 with tight tracking, focus outline ink/paper 2 px + soft-highlighter halo (research R2), `prefers-reduced-motion` disables transitions
- [X] T003 [P] Add brand assets in `packages/ui/src/brand/` (wordmark, wordmark on ink, icon, favicon SVG + 32 px and Apple touch PNGs) and a `Brand` component (`packages/ui/src/components/brand.tsx`: inline SVG, the word takes the text colour; soft tags use the `highlight` badge variant)
- [X] T004 Restyle existing components to the identity in `packages/ui/src/components/`: button (primary ink, secondary bordered surface, ghost, link, destructive; 10 px radius), badge (pill), card (14 px, border), dialog and alert-dialog (18 px), input, textarea, select (10 px, ink border + halo on focus), dropdown-menu, radio-group, checkbox, table, sonner
- [X] T005 [P] Add shadcn components from the registry (Base UI): `tabs`, `sheet`, `tooltip` (avatar dropped: initials are a styled span); style tabs as underline and as a segmented control variant
- [X] T006 [P] New presentational components with stories (light + dark, axe): `count.tsx`, `page-header.tsx` (back link, overline, title, pills, actions), `danger-zone.tsx`, `team-folder.tsx` (tab shape, four tints, selected state as toggle button), `project-card.tsx` (generated visual, meta, title, whole card is the link, arrow tab), `new-card.tsx`
- [X] T007 [P] `packages/ui/src/lib/sky.ts`: FNV-1a hash and `sky(id)` gradient from six palettes (research R6), with a unit test (stable output for an id, different for two ids)
- [X] T008 Storybook: preview background follows the theme; stories for every restyled component in both themes; `pnpm test --project ui` green

**Checkpoint**: Storybook shows the identity; app pages already pick up the new tokens.

## Phase 2: User Story 1 — Identity everywhere (P1)

- [X] T009 [US1] `apps/web/index.html` and `apps/web/public/`: favicons, Apple touch icon, `theme-color` (light ink / dark ink)
- [X] T010 [US1] Sign-in page `apps/web/src/routes/sign-in.tsx`: centred card on paper with wordmark, product line, provider buttons
- [X] T011 [US1] Search `apps/web/src` for raw colours (`#`, `rgb(`, `oklch(` outside tokens) and replace with tokens (SC-003)

## Phase 3: User Story 2 — App shell (P1)

- [X] T012 [US2] `packages/ui/src/components/app-shell.tsx`: grid layout (sidebar 264 px / rail 64 px, main column), sticky top bar slot, skip link, mobile top bar with menu button opening a `Sheet` below 768 px; collapsed flag in `localStorage` read in `try`
- [X] T013 [US2] `apps/web/src/features/workspace/app-sidebar.tsx`: Brand, navigation (Research projects with "+" opening `CreateProjectDialog`, Teams, Members for admins) with `aria-current`, tooltips in rail mode, account at the foot (avatar initials, name, email) opening the account menu (connected sources, language, sign out)
- [X] T014 [US2] `apps/web/src/routes/_authenticated.tsx`: use `AppShell` + `AppSidebar`; language switch in the top bar; `CreateProjectDialog` controllable (open state) so the sidebar shortcut can open it
- [X] T015 [US2] Update e2e selectors for navigation and account menu in `apps/web/e2e/*.spec.ts`; add a sidebar collapse + reload test and a 360 px test (no horizontal scroll, menu opens navigation)

## Phase 4: User Story 3 — Home (P2)

- [X] T016 [US3] `apps/web/src/routes/_authenticated/index.tsx`: page head "Research projects"; Teams section (`Count`, `TeamFolder` per team with project count from the unfiltered list, toggles `?team=`); Projects section (`Count`, `ProjectCard` per project with relative last update and team, `NewCard` opening the create dialog); empty and no-team states in the new layout
- [X] T017 [US3] e2e: filter by folder and clear it, open a project from its card

## Phase 5: User Story 4 — Page headers, phases, danger zones (P2)

- [X] T018 [P] [US4] Project page `projects/$projectId.tsx`: `PageHeader` (back to projects, overline "Project", editable title, team pill), danger zone for deletion
- [X] T019 [US4] Study page `studies/$studyId.tsx`: `PageHeader` (back to project, overline "Interview study", editable title, type and folder pills), phases as segmented `Tabs` with `phase` search param (default `analysis`, Zod, history replace), danger zone with delete study (and detach folder from the source panel)
- [X] T020 [P] [US4] Teams, members, member detail, connected sources, welcome pages: `PageHeader` and identity components
- [X] T021 [US4] e2e: study phases (switch, reload keeps it, keyboard arrows), back links

## Phase 5b: Prototype review (2026-10-24)

- [X] T025 [US4] `PageBar` (square back button, breadcrumb title, right slot) replaces the page header; project page: "Research goal" card with team pill and goal, studies as rows with thumbnail (`packages/ui/src/components/page-header.tsx`, `routes/_authenticated/projects/$projectId.tsx`, `features/research/study-list.tsx`)
- [X] T026 [US4] Study page: phases and folder pill in the bar; delete study in a disclosure (`routes/_authenticated/studies/$studyId.tsx`)
- [X] T027 [US4] List head `PageTitle` on home, teams, members, connected sources; teams as static `Folder`s (`team-folder.tsx`, `routes/_authenticated/teams.tsx`)
- [X] T028 [US2] Account foot: profile photo (`Me.picture`, https only, API test in `apps/api/tests/auth.component.test.ts`) over initials, sign-out button; FR / EN `Segmented` language switch; "Research projects" current on project and study pages

## Phase 6: Polish

- [X] T022 i18n: extract, translate FR for every new string with the bilingual glossary
- [X] T023 [P] Docs: `packages/ui/README.md` (tokens, brand, components), `docs/standards.md` design-system section (identity, focus rule, highlighter rule), `docs/domain/prototype-reference.md` (shell parts now built)
- [X] T024 `pnpm check`, `pnpm test`, `pnpm e2e` (axe on every page), quickstart walk-through; network panel shows no third-party request

## Dependencies & execution order

Phase 1 blocks all. US1 and US2 after Phase 1; US3 and US4 after US2 (they live in the shell). Polish last.

## Implementation strategy

Phase 1 + US1 + US2 make the change visible everywhere; US3 and US4 finish the page patterns. One PR.

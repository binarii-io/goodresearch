# Research: Product identity, design system and app shell

## R1. Identity source

- **Decision**: reuse the prototype's identity ("highlighted bounce"): ink `#1c2230`, ink hover `#2e3647`, highlighter `#f5b82e`, soft highlighter `#fdf0cf`, paper `#f3f4f6`, surface `#ffffff`, border `#e3e5ea`, muted text `#5f6675`, error `#b3261e`; radius 14 px for cards, 10 px for controls, 18 px for dialogs, 22 px for project cards; Schibsted Grotesk 400–700, titles 700 with tight tracking; the wordmark and icon SVGs.
- **Rationale**: it is the product's own identity, already validated with users of the prototype.
- **Alternatives considered**: keep the neutral shadcn look (rejected by the product owner); a new identity (no reason to change).

## R2. Accessibility of the identity

Contrast ratios (WCAG 2.x relative luminance):

| Pair | Ratio | Use |
|---|---|---|
| ink on surface | 15.9:1 | text, primary button background with white text |
| muted `#5f6675` on surface | 5.8:1 | secondary text |
| muted on paper | 5.3:1 | secondary text on paper and on second surfaces |
| ink on soft highlighter | 14.0:1 | tags, active entries |
| ink on highlighter | 8.9:1 | text over highlighter fills |
| error `#b3261e` on surface | 6.5:1 | errors, destructive button background with white text |
| highlighter on surface | 1.8:1 | **not enough** for a focus indicator or a state mark alone |

- **Decision**: focus indicator = 2 px ink outline with 2 px offset plus a 4 px soft-highlighter halo (the ink outline carries the 3:1, the halo carries the identity). Active navigation entry = second-surface background, medium weight and `aria-current`; the highlighter bar is decorative. Selected folder = 2 px ink outline. In dark mode the outline is paper.
- **Rationale**: the prototype's yellow outline alone fails WCAG 2.2 non-text contrast (1.4.11) and focus appearance.
- **Alternatives considered**: darker yellow (`#8a5c00` reaches 5:1 but loses the identity).

## R3. Dark theme

- **Decision**: background `#151a25`, surface `#1c2230`, second surface `#232b3d`, border `#2e3647`, text paper `#f3f4f6`, muted `#a3a9b6` (6.7:1 on surface, 6.0:1 on second surface), primary = paper with ink text, highlighter unchanged (fills), soft highlighter `#3b3420` with paper text, error `#f2b8b5`. The wordmark is an inline SVG whose word takes the text colour, so one component serves both themes.
- **Rationale**: spec 001 follows the system theme; the identity works on ink (the icon is already ink).

## R4. Typeface delivery

- **Decision**: `@fontsource-variable/schibsted-grotesk` imported by `globals.css`; Vite bundles the `woff2` files; no Google Fonts link.
- **Rationale**: hosting-agnostic and no third-party request (privacy, constitution VII); same approach as Geist in spec 001.

## R5. Shell layout

- **Decision**: CSS grid `264px | 1fr`, sidebar sticky full height; collapsed rail 64 px with icons and tooltips; flag in `localStorage` (`goodresearch.sidebar`), read in a `try` (private mode). Below 768 px: top bar with menu button opening a `Sheet` (Base UI dialog) holding the same navigation. Top bar sticky with blur, language switch on the right; left slot empty (search comes later).
- **Alternatives considered**: shadcn `sidebar` block (much larger than needed: cookie state, many sub-components); a hand-made drawer (focus trap and escape handling already in the dialog primitive).

## R6. Generated project visual

- **Decision**: `sky(id)` returns a CSS background made of two radial gradients and one linear gradient from six ink/highlighter palettes, chosen and positioned from a hash of the id (FNV-1a), as in the prototype. Rendered as a decorative `div` (`aria-hidden`).
- **Rationale**: stable, zero assets, works offline.

## R7. Study phases

- **Decision**: Base UI `Tabs` styled as a segmented control; the phase is a search parameter `phase` (`preparation | fieldwork | analysis`, default `analysis`), validated with Zod and replaced in history when changed.
- **Alternatives considered**: three routes (heavier for placeholder phases); local state only (lost on reload, spec FR-013).

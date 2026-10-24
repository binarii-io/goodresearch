# @goodresearch/ui

goodresearch design system: [shadcn](https://ui.shadcn.com) components on [Base UI](https://base-ui.com), owned in this package, styled with Tailwind v4 tokens.

- `src/styles/globals.css`: the only `@import "tailwindcss"`, primitive and semantic tokens (CSS variables exposed with `@theme inline`), light and dark (dark follows the operating system).
- `src/components/`: components imported as `@goodresearch/ui/components/<name>`. Add new ones with `pnpm dlx shadcn@4.22.1 add <name>` from this folder, then adapt them (no hard-coded text: labels come from the app through props).
- Identity (spec 003): ink `#1c2230`, paper `#f3f4f6`, highlighter `#f5b82e` (a fill only, never text or the only focus mark), Schibsted Grotesk (bundled). Token table: [specs/003-brand-and-app-shell/contracts/ui-tokens.md](../../specs/003-brand-and-app-shell/contracts/ui-tokens.md). Brand marks: `brand.tsx` (`Wordmark`, `BrandIcon`, theme-aware), source SVGs in `src/brand/`; favicons live in `apps/web/public/`.
- Shell and page pieces: `app-shell.tsx` (sidebar, rail, drawer, top bar), `page-header.tsx` (`PageBar` for detail pages, `PageTitle` for list pages, `Pill`), `segmented.tsx` (FR / EN), `team-folder.tsx` (`TeamFolder` toggle, static `Folder`), `project-card.tsx` (visual from `lib/sky.ts`), `count.tsx`, `danger-zone.tsx`, `tabs.tsx` (`segmented` and `line`). Links are passed by the app through `render` props, so the package does not depend on the router.
- Icons: import them from `icons.tsx` (lucide re-exports); add a name there when an app needs a new one.
- Every component has a story; stories run as Vitest browser tests with axe (`parameters.a11y.test = 'error'`), so an accessibility violation fails CI.

```bash
pnpm --filter @goodresearch/ui storybook
pnpm exec vitest run --project ui        # stories + axe, light and dark
pnpm exec vitest run --project ui:unit   # plain functions
```

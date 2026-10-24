# @goodresearch/ui

goodresearch design system: [shadcn](https://ui.shadcn.com) components on [Base UI](https://base-ui.com), owned in this package, styled with Tailwind v4 tokens.

- `src/styles/globals.css`: the only `@import "tailwindcss"`, primitive and semantic tokens (CSS variables exposed with `@theme inline`), light and dark (dark follows the operating system).
- `src/components/`: components imported as `@goodresearch/ui/components/<name>`. Add new ones with `pnpm dlx shadcn@4.22.1 add <name>` from this folder, then adapt them (no hard-coded text: labels come from the app through props).
- Every component has a story; stories run as Vitest browser tests with axe (`parameters.a11y.test = 'error'`), so an accessibility violation fails CI.

```bash
pnpm --filter @goodresearch/ui storybook
pnpm exec vitest run --project ui
```

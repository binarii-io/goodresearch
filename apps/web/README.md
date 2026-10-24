# @goodresearch/web

React single-page app of goodresearch, served by the API from the same origin in production.

- **Routing**: TanStack Router, file-based (`src/routes/`, generated `src/routeTree.gen.ts`). `_authenticated.tsx` guards every page and loads the signed-in account.
- **Data**: TanStack Query hooks generated in `@goodresearch/api-client`; no hand-written `fetch` except the sign-in redirect (`src/features/workspace/auth.ts`).
- **UI**: components from `@goodresearch/ui` only.
- **i18n**: Lingui, catalogs in `src/locales/{en,fr}/messages.po`; use the [bilingual glossary](../../docs/domain/context-map.md#bilingual-glossary). `pnpm --filter @goodresearch/web i18n:extract` after changing strings; the build fails on any missing French translation.

```bash
pnpm --filter @goodresearch/web dev     # http://localhost:5173, /api proxied to the API on :3000
pnpm --filter @goodresearch/web build
pnpm --filter @goodresearch/web e2e     # needs the compose dev stack (see the root README)
```

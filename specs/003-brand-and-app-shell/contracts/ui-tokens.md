# UI contract: design tokens

Semantic tokens exposed by `packages/ui/src/styles/globals.css` (CSS variables, mapped to Tailwind colours by `@theme`). Apps use only these.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#f3f4f6` (paper) | `#151a25` | page background, sign-in |
| `--card`, `--popover`, `--surface` | `#ffffff` | `#1c2230` | cards, main column, menus, dialogs |
| `--muted`, `--secondary`, `--accent` | `#f3f4f6` | `#232b3d` | second surface, hover, pills |
| `--foreground` | `#1c2230` (ink) | `#f3f4f6` | text |
| `--muted-foreground` | `#5f6675` | `#a3a9b6` | secondary text |
| `--primary` / `--primary-foreground` | ink / `#ffffff` | paper / ink | primary actions |
| `--primary-hover` | `#2e3647` | `#d9dde5` | primary hover |
| `--highlight` | `#f5b82e` | `#f5b82e` | fills only: active marks, highlights |
| `--highlight-soft` / `--highlight-soft-foreground` | `#fdf0cf` / ink | `#3b3420` / paper | tags, selected chips, input halo |
| `--border`, `--input` | `#e3e5ea` | `#2e3647` | borders |
| `--ring` | ink | paper | focus outline (3:1) |
| `--destructive` | `#b3261e` | `#f2b8b5` | errors, destructive actions |
| `--sidebar*` | surface / ink / paper… | surface / paper… | sidebar |
| `--radius` | `0.875rem` (14 px) | | cards; controls use `rounded-[10px]` via `--radius-md` |

Typography: `--font-sans` = Schibsted Grotesk Variable; headings 700, letter-spacing −0.03em (h1) / −0.015em (h2–h3); overline 600, 0.72 rem, uppercase, letter-spacing 0.14em.

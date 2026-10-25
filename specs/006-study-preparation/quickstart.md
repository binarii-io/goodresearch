# Quickstart: Study preparation

1. `docker compose -f compose.yaml -f compose.dev.yaml up --build` (test provider and mock sign-in), sign in, create a project and an interview study.
2. Study → **1 · Preparation** → **Design with the assistant**: the panel opens, the request is sent, the progress bar shows 8 points (objectives partial → 8 %).
3. Send "write the guide": a card "Interview guide" with four sections appears → **Apply** → the guide shows on the tab, origin "assistant", version 1.
4. **Edit** → change a question, add a follow-up → **Save** → version 2, "edited by hand". **Download (Markdown)**.
5. **Read the best practices** → dialog in the interface language → **Download (Markdown)**.
6. Schedule: add three interviews (statuses and dates), change one, delete one, **Download (CSV)**.
7. Automated: `pnpm exec vitest run --project api:unit`, `pnpm exec vitest run --project api:int`, `pnpm e2e -- preparation`.

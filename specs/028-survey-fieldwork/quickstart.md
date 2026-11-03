# Quickstart: validate survey fieldwork

Prerequisites: `docker compose -f compose.yaml -f compose.dev.yaml down -v`, then `up -d --build`. Automated: `pnpm check`, `pnpm test`, `pnpm e2e`.

1. **Open**: on a published study, open the form, see the link; a form collecting identities is refused.
2. **Read**: simulated responses appear when the tab opens; Refresh adds and removes; the contact item is nowhere.
3. **Target**: tick answers, counts move; remove the rule, everything counts again. Remove an item with responses, update: refused. Reword: confirmed.

## 4. Real form service (by hand, before merge)

| Check | Expected | If not |
|---|---|---|
| Open from the app | The link accepts a response | Report: R5 |
| Refuse consent | Form ends, no item seen; counted apart | Back to spec 027 FR-006 |
| Grid rows, two runs | Order differs; each answer on the right item | Fix R2, or spec 027 FR-015 |
| Scale, choice, multiple, open, contact | Each attached, contact absent | Fix R2 |
| Unanswered optional item | Shown without answer | Fix R2 |
| Delete a response in the form, refresh | Gone | R1 |
| Close, then reopen | Closed page, then accepts | R5 |
| As an editor who is not the owner | Opens, reads; or a clear refusal | R5, R8 |
| As a viewer | Last reading and why | R8 |

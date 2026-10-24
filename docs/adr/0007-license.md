---
status: accepted
date: 2026-10-24
---

# ADR-0007 — License: AGPL-3.0 with a Contributor License Agreement

## Context and problem statement

goodresearch is published as open source and meant to be self-hosted. The license defines whether third parties may offer it as a hosted service without sharing changes, how easily companies can contribute, and whether the maintainer can change the license later.

## Decision drivers

- Prevent closed hosted forks (a third party selling the product as a SaaS without contributing back).
- Keep the option to relicense later (more permissive license, or dual licensing with a commercial offer).
- Low friction for contributors.

## Considered options

1. **AGPL-3.0** — modifications must be shared even when the app is only offered over a network. Used by documenso, plane, openstatus. Some corporate policies discourage AGPL contributions.
2. **Apache-2.0** — permissive with an explicit patent grant. Maximises adoption; anyone may run a closed hosted fork.
3. **MIT** — permissive, minimal, no explicit patent grant. Same openness as Apache with weaker legal protection; better suited to small libraries.

Contribution terms:

- **DCO** (sign-off only) — lightest, but each contributor keeps sole control of their copyright: relicensing would require every contributor's consent.
- **CLA** — contributors keep their copyright but grant the maintainer the right to license their contributions under any terms.

## Decision outcome

Chosen: **AGPL-3.0-only** for the whole repository, with a **CLA** granting relicensing rights to the copyright holder.

- Copyright holder: **Andrea Delre** (individual). `binarii` is the organisation name under which the project is published (`github.com/binarii-io`), not a legal entity. Copyright notice: `Copyright © 2026 Andrea Delre (binarii)`. Rights can be assigned to a company later.
- `LICENSE` contains the AGPL-3.0 text; `CLA.md` contains the agreement.
- The CLA is signed once per contributor through the **CLA Assistant** GitHub App ([cla-assistant.io](https://cla-assistant.io), maintained by SAP): it comments on pull requests, records signatures and sets a status check. No workflow to maintain in the repo. The `contributor-assistant/github-action` alternative was rejected because it is archived. The CLA text shown by the app is a gist copy of `CLA.md`; both must stay identical (a CLA change = new version, re-signed).
- `package.json` files declare `"license": "AGPL-3.0-only"`.

### Consequences

- Good: no closed SaaS fork is possible; the maintainer keeps the ability to relicense or dual-license future versions.
- Good: patent protection through the AGPL and the CLA patent clause.
- Bad: some companies forbid AGPL use or contributions; the CLA adds one step for first-time contributors.
- Released versions stay available under AGPL-3.0 forever, whatever later license is chosen.
- The CLA text is not legal advice; have it reviewed by a lawyer before a commercial offer.

# Quickstart: validate the usability test analysis

Prerequisites: `docker compose -f compose.yaml -f compose.dev.yaml up --build` (dev Drive and dev AI fakes answer every stage with fixed outputs; a small test video ships with the dev Drive). Automated: `pnpm check`, `pnpm test`, `pnpm e2e`.

1. **Gate**: with a non-Vertex provider the "Usability test" type is not offered; with the dev Vertex fake it is.
2. **Run** (US1): two ready sessions; the estimate shows before; start; each session shows its stages; stop then start again; a session whose video was removed fails with its reason.
3. **Review** (US2): open a session: task shortcuts with coloured outcomes and text; an observation's screenshot and moment; play it (the video seeks); accept, edit, reject with a reason, add one; the Transcript tab plays from a time.
4. **Facts**: accept an observation, see the fact on the project's facts; reject it, the fact goes.
5. **Results** (US3): outcome counts, median time, SUS equal to a hand calculation.
6. **Assistant** (US4): "where is the analysis?" gives counts; the start card shows the estimate.
7. **Cleanup**: no temporary copy left in the staging fake after success, failure and stop.

## 8. Real Vertex and Drive (by hand, before merge)

On a GCP project the maintainer names, one real 30-minute session: staging bucket created with its 1-day rule, copy deleted after, outcomes compared with the trial, cost per minute close to 0.10 USD, player seeking in Drive.

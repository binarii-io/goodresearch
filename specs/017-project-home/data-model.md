# Data model: Project home

No table and no migration. Read model only.

## Project overview

| Field | Meaning |
|---|---|
| `steps` | the five steps, in order |
| `nextStep` | a step key, or `null` when all are done |
| `takeaways` | `null`, or the text per language |
| `studies` | see below |
| `hiddenStudies` | studies left out of the counts for lack of folder access |

## Journey step

| Key | Counts | State |
|---|---|---|
| `interviews` | `total` (validated + proposed), `validated`, `toDecide`, `participants` | `empty` at 0; `to-decide` with none validated; else `done` |
| `facts`, `insights`, `recommendations` | `total` (rejected left out), `validated` (edited included), `toDecide` | `empty` at 0; `to-decide` with `toDecide` > 0; else `done` |
| `debrief` | none | `done` with takeaways written; else `empty` |

The next step is the first step not `done`.

## Study in the overview

`id` (name, type and folder stay in the list of studies) and `access`; with access, `counts` (`validated`, `toValidate`, `excluded`, `facts`, `factsToDecide`), `null` without.

## Project costs

Read apart (`/overview/costs`). `cost`: `total` and `{ studies, insights, recommendations, takeaways }`; `studies`: for each study the person can open, `id` and `cost` (`total` and `{ analysis, lexicon, cleaning, quality, facts }`). Each amount is a number, or `null` when unknown.

## Takeaways freshness

Read apart (`/takeaways/freshness`), only once takeaways exist: `outOfDate`.

Interviews to validate never block the next step once one is validated (spec clarification).

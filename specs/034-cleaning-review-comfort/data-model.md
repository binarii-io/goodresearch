# Data Model: Cleaning review without duplicates, with steady buttons and context

No stored change.

- **Resolved correction** gains `duplicate: boolean` (domain only): the same change at the same place as the correction standing for it (the one a person decided, else the highest priority). A duplicate is overridden: never applied, never listed, never counted.
- **Turn context** (read model): a turn and up to two on each side, with every correction not rejected.

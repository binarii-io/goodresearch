# Quickstart: Project recommendations and key takeaways

## Commands

The same as spec 013. The fake AI runner answers `recommendations`, `takeaways` and `recommendation-translation`.

## Scenarios

1. **Find recommendations** (US1).
   - Setup: three validated insights, one of them low confidence.
   - Action: "Find recommendations".
   - Expected: recommendations that each cite an insight; the one proposed as "build" on the low insight only is shown as "test" with its reason; the priority is shown; the cost is shown.
2. **Decide** (US2).
   - Actions: reject one; edit the action, the owner and the effort of another; validate it; write one by hand.
   - Expected: a new run leaves the decided ones alone; the order never moves.
3. **Key takeaways** (US3).
   - Action: "Draft with the AI".
   - Expected: a draft is shown and nothing is saved; "Use this draft" saves it; validating another recommendation shows "May be out of date".
4. **Insights changed** (US4).
   - Action: reject a linked insight in the Insights tab.
   - Expected: the recommendation shows "Insights changed".
5. **Privacy and accessibility**: the fake AI's requests hold no fact, name or study name; axe passes in the light and dark themes.

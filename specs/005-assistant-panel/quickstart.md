# Quickstart: Assistant chat in a side panel

Dev stack (test AI provider). Sign in, pass the provider step.
1. Click the assistant button next to EN/FR: the panel slides in, the page narrows; Escape closes it.
2. Type "hello": "You said: hello" streams in. Stop a long answer: the partial text stays.
3. Open a project, type "propose goal": a card shows the new goal; Apply → the project goal changes; Dismiss on a second one → nothing changes.
4. "propose study": a card shows the study; Apply → the study appears in the project.
5. Conversation list: new, rename, delete; reload: the panel is still open with the last conversation.
6. Phone width: the panel covers the screen.
7. `pnpm test`, `pnpm e2e` green.

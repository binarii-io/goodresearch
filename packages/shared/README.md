# @goodresearch/shared

Tiny, dependency-light helpers used across packages: `Result` (`ok`, `err`), branded types, UUIDv7 ids (`newId`), `Clock` (and `fixedClock` for tests), `ConcurrencyError`. Anything needing more dependencies does not belong here.

Also shared text helpers (`words`, `fold`, `sharedWords`, `holdsName`, placeholders, chunks) and content used across modules: the best-practices document, and `WRITING_STYLE` with `REGISTERS`, the style guide every AI prompt that writes prose a person reads must include (facts, insights, recommendations, key takeaways, their translations). It asks for a human voice, plain words and native English and French, and lists what to avoid without giving model sentences, which models copy. Exact quotes (verbatims) never get it.

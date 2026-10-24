# Contributing to goodresearch

Thanks for your interest! This guide explains how to propose a change.

## Before you start

- Read the [constitution](.specify/memory/constitution.md), the [engineering standards](docs/standards.md) and the [context map](docs/domain/context-map.md). [AGENTS.md](AGENTS.md) summarises the hard rules.
- For anything bigger than a small fix, open an issue first to discuss it.
- Never include real personal data, company names or secrets in code, tests, fixtures or screenshots.

## Contributor License Agreement

Before your first pull request can be merged, you sign the [CLA](CLA.md) once: the CLA bot comments on your pull request and you reply with the sentence it gives you. You keep the copyright on your work; the CLA lets the maintainer license the project, including your contributions, under other terms in the future (see [ADR-0007](docs/adr/0007-license.md)).

## Workflow

1. Fork and create a branch:
   - new feature: run `/speckit-specify` (Spec Kit creates the `NNN-slug` branch and spec), then follow `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`;
   - fix, refactor, docs: `fix/…`, `chore/…`, `docs/…`.
2. Write tests first for domain rules. Keep the change focused.
3. Update the docs touched by the change (package README, ADR, context map).
4. Open a pull request:
   - title in [Conventional Commits](https://www.conventionalcommits.org/) form, e.g. `feat(evidence): validate facts in bulk`;
   - link the spec, fill the checklist, add screenshots for UI changes.
5. CI must be green and one maintainer review is required. Pull requests are squash-merged.

## Translations

The UI ships in English and French. Use the glossary in the [context map](docs/domain/context-map.md#bilingual-glossary) so the same terms are always translated the same way.

## License

By contributing, you agree that your contributions are licensed under [AGPL-3.0-only](LICENSE) and under the terms of the [CLA](CLA.md).

# Contributing

[Português brasileiro](pt-BR/CONTRIBUICAO.md) · [Back to README](../README.md)

The repository is currently private. Contributions require access and should follow the active story and its GitHub issue.

## Before changing behavior

1. Read the matching story, acceptance criteria, architecture constraints, and issue.
2. Follow test-first **Red → Green → Refactor** for every behavior change, bug fix, and requirement change. Record the actual Red command/result and Green/refactor evidence in the English and pt-BR story records.
3. Use real PostgreSQL integration tests for database guarantees. Use fakes at external Twitch boundaries; never claim live Twitch behavior from a fake.
4. Keep product code JavaScript ESM with JSDoc. Do not introduce TypeScript, a transpiler, or a frontend bundler.
5. Update each affected English document and its equivalent pt-BR document in the same change. Keep commands, paths, IDs, dates, evidence, and meaning equivalent. Update user-facing and internal changelogs when applicable.
6. Update the story checklist and file list. Report checks that could not run; do not claim unobserved validation.

## Documentation and README standard

- English is the primary project documentation; maintain an equivalent pt-BR version for every user-facing or contributor guide.
- Keep `README.md` and `README.pt-BR.md` as concise landing pages, at **120 lines or fewer** each. They contain a short product/status summary, a small quick start, a documentation index, project status, contribution entry point, and license.
- Put detailed instructions in focused guides: installation, user operation, development, contribution, roadmap, integrations, versioning, and stories.
- Do not duplicate a long procedure across the README and a guide. Link to the guide that owns the procedure.
- Keep both README language versions structurally parallel, with reciprocal language links and equivalent commands/links.
- Prefer short sections, descriptive headings, concise lists, and tables only for direct comparisons or status summaries. Keep the first screen useful without requiring a reader to scan a long table of contents.

## Development checks

Use Node.js `24.20.0` and install locked dependencies with `npm ci`. Before requesting review, run the checks listed in the [development guide](DEVELOPMENT.md) and any story-specific gates. Do not remove the active Compose volumes during tests.

## Commits and pull requests

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>(<optional scope>): <imperative summary>
```

Examples: `feat(queue): add atomic manual ordering`, `fix(outbox): retry uncertain updates safely`, `docs(readme): clarify first-run links`.

Work from a branch derived from `main`, open a pull request, and merge through the repository workflow. Releases, tags, and stage promotion follow [VERSIONING](VERSIONING.md); stage promotion requires owner approval.

## Safe handling

Never commit `.env`, Docker volumes, database dumps, Twitch credentials/tokens, authorization codes, database passwords, or raw chat/redemption payloads. See [installation and local data guidance](INSTALLATION.md) and the [user guide](USER_GUIDE-en_US.md).

## Product translation catalogs

See the [translation contribution guide](TRANSLATION_GUIDE.md) for catalog format, locale/module paths, completeness rules, plural forms, and validation. Run `npm run validate:localization` after catalog edits.

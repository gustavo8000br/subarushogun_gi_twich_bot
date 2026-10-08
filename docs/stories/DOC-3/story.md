# DOC-3 — Full documentation consistency audit and cleanup

[Português brasileiro](../../pt-BR/stories/DOC-3/story.md)

**Status:** Planned; issue [#48](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/48). Work starts only after FND-9 and DOC-2 are complete.  
**Capability:** Product and contributor documentation quality

## Story

As a streamer or project contributor,
I want the maintained documentation to be accurate, concise, coherent, and equivalent in English and pt-BR,
so that installation, operation, development, and product behavior are understandable and trustworthy.

## Scope and order

- Start this story only after FND-9 and DOC-2 are complete.
- Audit all maintained product documentation, including root READMEs, focused guides, stories, integrations, roadmaps, release/change records, contributor guidance, and repository-level agent instructions. Exclude dependencies, generated artifacts, and the AIOX framework source tree.
- Use `$aiox-ux-design-expert` to review user documentation structure, readability, navigation, and visual hierarchy; use `$aiox-dev` with `$aiox-architect` to resolve technical wording and consistency; use `$aiox-qa` to verify claims and links against implementation and evidence.
- Preserve the meaning of approved product/security/points policies and recorded TDD evidence. Do not rewrite historical commands or test results as if they were different. Do not change code, release stage, or version as part of the documentation audit.

## Acceptance criteria

1. Inventory the complete in-scope documentation set and record the reviewed paths and findings in a bilingual audit report.
2. Verify installation, operation, commands, permissions, health states, queue/reward behavior, recovery, security, runtime versions, release distribution, and troubleshooting instructions against current source, tests, CI, and actual verified evidence.
3. Correct contradictions, stale paths/commands, dead links, duplicated or obsolete guidance, unclear terminology, and unsupported claims. Where evidence is missing, label the claim unverified or keep the item open instead of inferring behavior.
4. Review user documentation for clear task-oriented navigation, concise sections, readable visual hierarchy, useful examples, and consistent terminology. Keep technical depth in focused developer references.
5. Keep every affected English document and pt-BR counterpart equivalent, with reciprocal language links and matching commands, paths, story IDs, dates, examples, and evidence.
6. Keep public changelogs readable for non-technical users and operational changelogs precise for maintainers; do not use the audit to rewrite product version or promote the release stage.
7. Run documentation/link/localization contracts and applicable project quality gates. Record actual commands and outcomes in the story and both audit reports; do not claim completion while any required validation is blocked.
8. Complete an independent `$aiox-qa` review with no unresolved critical/high documentation defects. The story is done only when all accepted corrections are reflected in both languages and the report lists any explicitly deferred items.

## Deliverables

- `docs/audits/documentation-consistency.md` and `docs/pt-BR/audits/documentation-consistency.md`
- Corrected source documents and language counterparts
- Updated bilingual story index and roadmap
- Relevant changelog entries and validation evidence

## Non-goals

- Product implementation, screenshot/GIF production, translation into additional locales, release creation, tag creation, stage promotion, or changes to approved product behavior.

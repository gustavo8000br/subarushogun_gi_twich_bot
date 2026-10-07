# FND-8 — Product-wide internationalization

[Português brasileiro](../../pt-BR/stories/FND-8/story.md)

**Status:** Locale/catalog foundations, PostgreSQL persistence, chat roots/replies, OBS-generated copy, and POSIX lifecycle localization are implemented. The Windows PowerShell runner has static contract coverage only. Remaining panel/API localization, native Windows validation, and independent final QA keep this story in progress. Spec v3 QA re-review: CONCERNS, no new score.
**Complexity:** COMPLEX (22/25).
**GitHub issue:** [#18](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/18)

## Story

As a streamer, I want to select the product language during installation and change it later in the panel, so the panel, chat bot, OBS widgets, and local operation tools use one consistent language.

## Approved planning decisions

- Initial locales: Brazilian Portuguese (`pt-BR`), English (`en`), and Spanish (`es`); `pt-BR` is the safe default.
- The language selected during installation seeds the installation-wide locale. The streamer can change the persisted locale in the panel.
- Community resources are split into one catalog file per product module and locale. New canonical locales are discovered from complete catalog files and do not require adding a locale to a JavaScript registry.
- Global command roots are `!fila` (`pt-BR`), `!queue` (`en`), and `!cola` (`es`). No legacy root aliases are retained. Reserve all three roots from queue slugs in every locale.
- Stable internal command IDs, API contract fields, database identifiers, and technical logs remain language-neutral/English.
- Local lifecycle tools use the approved generic names `subarushogun_twich_bot_setup`, `subarushogun_twich_bot_update`, and `subarushogun_twich_bot_uninstall`; platform-specific entry points may vary.
- Existing queue-key collisions with `fila`, `queue`, or `cola` block only the conflicting root until explicit panel rename; automatic rename is forbidden.
- Target product surfaces: panel and setup/callback; chat command syntax/help/replies; OBS widget editor and product-generated labels/fallbacks; start/install, update, and uninstall tools.
- The implementation stays local-first, vanilla JavaScript ESM, with no runtime translation service, frontend framework, TypeScript, or bundler.
- PostgreSQL is the selected locale authority; `.local/product-locale.state` is a revisioned, atomic host-readable projection with last-valid offline fallback. This architecture still needs contract tests.
- Shared catalogs use UTF-8 no-BOM TSV with literal text and allowlisted placeholders. A shared ESM byte decoder now rejects BOM/malformed UTF-8 under Node tests; browser ESM and POSIX/PowerShell host parity still need contract tests.

## Owner-approved policies

- Streamer-authored text remains exactly as entered across locale changes; localize only product-owned copy.
- Generic lifecycle tool names are `subarushogun_twich_bot_setup`, `subarushogun_twich_bot_update`, and `subarushogun_twich_bot_uninstall`; entry points vary by platform.
- Existing slug/alias collisions with `fila`, `queue`, or `cola` block only the conflicting root until an explicit panel rename; never rename automatically.


## Acceptance criteria for implementation

1. A first-run locale choice seeds one durable installation locale; restart/update preserves it and a protected panel setting can change it without restarting the bot.
2. `pt-BR`, `en`, and `es` have complete first-party catalogs for every supported module. Unsupported/missing values fall back to `pt-BR` without showing raw keys, enum values, provider errors, or technical details.
3. Catalogs are organized by module and locale and have a documented contributor template, source locale, review flow, and automated validation for schema, key parity, placeholder parity, plural forms, invalid locale IDs, and unsafe markup.
4. Product-generated copy across the listed surfaces follows the persisted locale. Preserve streamer-authored values verbatim and localize product-owned copy only; do not automatically translate or rewrite stored values.
5. Chat uses the locale-specific global roots above, translates supported subcommands/help/replies, and does not accept the roots of other locales as aliases. Queue slug/alias behavior and permissions bind to stable command IDs rather than translated labels.
6. API responses expose stable public status/error codes and only allowlisted presentation data; frontend messages map those codes to local catalog entries. Raw backend/provider messages and secrets never reach the UI or chat.
7. Panel and OBS use safe text rendering; interpolation cannot inject HTML, executable code, or command syntax. Chat output still meets the existing 500-character cap.
8. Locale-aware plurals, dates, times, and numbers use supported ECMAScript `Intl` APIs; formatting is explicit about locale and does not change persisted UTC timestamps.
9. Local install/update/uninstall helpers use the selected locale, detect required host dependencies, offer supported installation/help paths, preserve the default `main` image flow, and retain the existing explicit data-preservation/deletion choice.
10. TDD covers catalog loading/fallback, locale persistence and change, all three command roots and aliases, scripts, XSS/placeholder safety, module/key parity, and no leakage of backend internals. Persistence behavior uses real PostgreSQL migrations.
11. English and pt-BR requirements, stories, contributor instructions, changelogs, and validation evidence stay equivalent.

## Spec Pipeline artifacts

- Requirements: `spec/requirements.json`
- Research: `spec/research.json`
- Complexity: `spec/complexity.json`
- Specification: `spec/spec.md`
- Critique: `spec/critique.json`
- Implementation plan: `spec/plan.json`

## TDD progress

### Increment 1 — Localized Twitch eligibility status

- **Behavior:** `twitchStatusLabel` accepts a locale for the ineligible state; English and Spanish use their localized label, and pt-BR remains the default/fallback.
- **Red:** `npm exec vitest run tests/unit/setup-messages.test.js` — failed 2 assertions because both requested locales returned `Afiliado ou Parceiro necessário`.
- **Green:** same command — passed, 9/9 tests after adding the two localized labels and optional locale parameter.
- **Refactor:** no additional structural change was needed in this narrow increment; the focused suite passed after implementation.
- **Scope:** helper-level behavior only. The saved installation locale is not yet wired to the panel, and the full status catalog remains future work.


### Increment 2 — Complete Twitch status-label locale map

- **Behavior:** localize every known Twitch setup/integration status for `en` and `es`; preserve the existing pt-BR default and unknown-status fallback.
- **Red:** `npm exec vitest run tests/unit/setup-messages.test.js` — 15 assertions failed because non-ineligible statuses still displayed pt-BR.
- **Green:** same command — passed, 27/27 tests after adding the English and Spanish status labels.
- **Refactor:** kept state selection independent from presentation and grouped labels by locale; the focused suite passed after the change.
- **Scope:** status labels only. Setup explanation paragraphs and persisted installation locale are not connected yet.

### Increment 3 — Twitch eligibility guidance

- **Behavior:** localize the ineligible-channel and unavailable-Channel-Points explanations in English and Spanish; unknown/default locale remains pt-BR.
- **Red:** `npm exec vitest run tests/unit/setup-messages.test.js` — 4 cases failed because the function ignored locale and returned Portuguese.
- **Green:** same command — passed, 31/31 tests with reason-specific localized messages.
- **Refactor:** kept internal reason codes separate from display text; the focused suite passed after the change.
- **Scope:** two setup explanations only; other messages and saved-locale integration remain pending.

### Increment 4 — Eligible-channel summary

- **Behavior:** localize the eligible-channel summary, Channel Points availability label, reward count and near-limit warning for English and Spanish while preserving pt-BR output and fallback.
- **Red:** `npm exec vitest run tests/unit/setup-messages.test.js` — 2 assertions failed because eligible-channel summaries ignored the requested locale and remained in Portuguese.
- **Green:** same command — passed, 33/33 tests after adding localized summary labels.
- **Refactor:** consolidated locale selection and summary interpolation through one locale map, retaining pt-BR as fallback; the focused suite passed again.
- **Scope:** the helper now localizes supported setup status/eligibility summaries when a locale is explicitly passed. The persisted locale is still not wired into the panel.

### Increment 5 — Incomplete setup guidance

- **Behavior:** localize the connected-but-checking, application-validated, and connect-channel prompts for `en` and `es`; retain pt-BR and unknown-locale fallback.
- **Red:** `npm exec vitest run tests/unit/setup-messages.test.js` — 6 assertions failed because these incomplete setup states returned pt-BR for every locale.
- **Green:** same command — passed, 39/39 tests after adding the localized prompts.
- **Refactor:** moved all three fallback prompts into the same locale map and resolved unknown locales to pt-BR; the focused suite passed again.
- **Scope:** setup-message helpers only. No saved locale, user selection, or whole-panel localization is claimed.

### Increment 6 — Literal TSV catalog parser foundation

- **Behavior:** parse non-empty stable dotted keys and literal values from UTF-8 text supplied to the parser; support LF/CRLF and reject BOM, duplicate/invalid keys, malformed rows, empty values, extra tabs, and control characters.
- **Red:** `npm exec vitest run tests/unit/localization-catalog.test.js` — the suite could not import `apps/shared/localization/tsv-catalog.mjs` because the parser behavior/module was absent.
- **Green:** same command — passed, 9/9 contract cases after implementing the parser.
- **Refactor:** isolated parsing in a dependency-free shared ESM module, returns a frozen null-prototype record, and keeps source-byte decoding explicitly at the caller boundary; the focused suite passed again.
- **Scope:** Node/Vitest parser contract only. UTF-8 byte decoding, browser integration, catalog parity/placeholders, shell/PowerShell parity, and loading catalogs into product surfaces remain unimplemented.

### Increment 7 — Safe catalog lookup and interpolation

- **Behavior:** resolve the requested locale, fall back to pt-BR for unsupported locales or missing keys, use a safe localized unavailable message rather than exposing a key, and interpolate only declared scalar placeholders as literal text.
- **Red:** `npm exec -- vitest run tests/unit/localization-translation.test.js` — import failed because the translation resolver module/behavior did not exist.
- **Green:** same command — passed, 7/7 tests for locale selection/fallback, missing keys, literal user values, and rejected unapproved/object values.
- **Refactor:** centralized localized unavailable-copy selection while keeping the resolver dependency-free; the focused suite passed again.
- **Scope:** pure shared ESM lookup only. Callers must render returned copy as text; catalogs are not yet loaded in the browser or connected to product state.

### Increment 8 — Strict UTF-8 byte decoding

- **Behavior:** decode catalog bytes as UTF-8 without altering localized text; reject a leading UTF-8 BOM, malformed byte sequences, and non-byte input.
- **Red:** `npm exec vitest run tests/unit/localization-decoding.test.js` — the suite could not import `apps/shared/localization/decode-catalog-bytes.mjs` because the behavior/module was absent.
- **Green:** the same command passed 4/4 after adding a shared decoder using fatal `TextDecoder` mode and an explicit BOM check.
- **Refactor:** `npm exec vitest run tests/unit/localization-decoding.test.js tests/unit/localization-catalog.test.js tests/unit/localization-translation.test.js` passed 20/20, confirming the decoder composes with the parser and translator contracts.
- **Scope:** Node/Vitest verifies bytes including Portuguese accents, BOM rejection, malformed UTF-8 rejection without replacement characters, and argument type. Browser loading, shell/PowerShell parity, and product catalog loading remain pending.

### Increment 9 — Decode and parse catalog bytes as one contract

- **Behavior:** provide one shared entry point that strictly decodes UTF-8 bytes and then validates the TSV catalog, so callers cannot accidentally skip or reorder either contract.
- **Red:** `npm exec vitest run tests/unit/localization-byte-catalog.test.js` — import failed because `apps/shared/localization/parse-catalog-bytes.mjs` and its behavior did not exist.
- **Green:** the focused suite passed 3/3 after composing the strict decoder with `parseTsvCatalog`.
- **Refactor:** `npm exec vitest run tests/unit/localization-byte-catalog.test.js tests/unit/localization-decoding.test.js tests/unit/localization-catalog.test.js tests/unit/localization-translation.test.js` passed 23/23; ESLint passed for the shared localization modules and both new test files.
- **Scope:** composition is verified in Node/Vitest only. Browser resource loading, catalog-module parity/placeholders, host scripts, and persisted locale remain unimplemented.

### Increment 11 — Discover translation files per module

- **Behavior:** scan a module's catalog directory for canonical `*.tsv` locale filenames, require valid catalogs for `pt-BR`, `en`, and `es`, and expose an additional locale only if it parses and matches the base key/placeholder contract. Reject unsafe module names and avoid returning filesystem paths or translation contents in rejection metadata.
- **Red:** `npm exec vitest run tests/integration/localization-catalog-discovery.test.js` — import failed because the filesystem discovery module did not exist.
- **Green/Refactor:** the first implementation exposed an incomplete `de` catalog because parity validation skipped optional locales; the integration test caught it. After validating every discovered locale, `npm exec vitest run tests/integration/localization-catalog-discovery.test.js tests/unit/localization-parity.test.js tests/unit/localization-byte-catalog.test.js` passed 15/15; focused ESLint passed.
- **Scope:** real temporary filesystem fixtures prove new complete locale files are found without a code registry and incomplete catalogs are excluded per module. Global cross-module completeness, browser/panel exposure, and host-script discovery remain pending.

### Increment 12 — Serve dynamically discovered catalogs to the local panel

- **Behavior:** expose only complete module catalogs through a local-session-protected API route; rescan files on every request so a newly added complete community locale is interpreted without restarting the process. Disable caching and return a generic safe error when required catalogs are invalid.
- **Red:** `npm exec vitest run tests/integration/localization-catalog-route.test.js` — the suite could not import `localization-routes.mjs` because the route and behavior did not exist.
- **Green:** the focused route suite passed 3/3, covering unauthenticated denial, safe catalog projection, live discovery of new `de` files across modules, and sanitized invalid-catalog errors.
- **Refactor:** `npm exec vitest run tests/integration/localization-catalog-route.test.js tests/integration/localization-catalog-bundle.test.js tests/integration/localization-catalog-discovery.test.js tests/unit/localization-parity.test.js tests/unit/localization-byte-catalog.test.js` passed 21/21; `npm run typecheck` and `npm run lint` passed. The route was registered in production Fastify composition.
- **Scope:** files are dynamically discovered and served to authenticated local API clients. Browser refresh/rendering, persisted locale, other product surfaces, and host-script parity remain pending.

### Increment 13 — Validate translation catalogs from the CLI

- **Behavior:** provide `npm run validate:localization [-- <catalog-root>]` to validate the catalog tree and print only valid status, module names, and available locales; failures return exit code 1 without printing catalog text or local paths.
- **Red:** `npm exec vitest run tests/integration/localization-validator-cli.test.js` — both CLI contract tests failed because `apps/infra/scripts/validate-localization.mjs` did not exist; the child process reported `MODULE_NOT_FOUND` instead of the expected validation contract.
- **Green:** the focused suite passed 2/2 after adding the executable validator and package script. The default repository catalogs returned valid `setup` coverage for `en`, `es`, and `pt-BR`.
- **Refactor:** the validator resolves optional caller paths portably and emits only a stable summary; combined catalog suites passed 44/44, followed by `npm run validate:localization`, `npm run typecheck`, and `npm run lint`, all passing.
- **Scope:** CLI validation and safe summaries are available. Community contribution templates/review docs, browser consumption, persisted locale, host-platform parity, and broader product localization remain pending.

### Increment 14 — Mount translation files for live community discovery

- **Behavior:** mount the project catalog directory into the bot container read-only, so adding a validated locale on the host is visible without rebuilding the image or restarting the process.
- **Red:** `npm exec vitest run tests/integration/compose-contract.test.js -t 'mounts product translation catalogs'` — Compose lacked the required host-to-container catalog bind mount.
- **Green/Refactor:** after adding the read-only mount to the `bot` service and normalizing the Compose source path in the assertion, `npm exec -- vitest run tests/integration/compose-contract.test.js tests/integration/localization-catalog-route.test.js` passed 14/14; `npm run validate:localization`, typecheck, lint, and `git diff --check` passed.
- **Scope:** Docker Compose exposes repository catalog files to the runtime. Host edits are read-only from inside the container; community instructions and native Windows/macOS acceptance remain pending.

### Increment 15 — Persist and audit the installation locale in PostgreSQL

- **Behavior:** default a new installation to `pt-BR` revision 1; persist canonical locale changes in the existing `settings` table with optimistic revision control and a `product.locale_changed` audit record.
- **Red:** `npm exec -- vitest run tests/integration/queue-repository.test.js -t 'installation locale|invalid locale identifiers|concurrent locale changes'` — all three real-PostgreSQL cases failed because the repository exposed neither locale read nor write behavior.
- **Green/Refactor:** after implementing a transaction-scoped advisory lock and revision check, two assertions initially counted historical audit rows from other tests; isolating audit assertions by generated actor corrected the fixture. The same command passed 3/3 (70 skipped). The test used the suite's isolated PostgreSQL container and real migrations; no schema migration was needed because `settings` already stores JSON values.
- **Scope:** repository persistence, concurrency, and audit are covered against PostgreSQL. Locale selection routes and host-readable offline projection were not part of this increment.

### Increment 16 — Select locale in the protected panel and use discovered setup copy

- **Behavior:** expose locale and revision in protected `/api/state`; accept a CSRF-protected, idempotent locale update only when a complete catalog exists; populate a settings picker from dynamic catalogs; refresh catalogs while the panel is open; use the saved locale for Twitch setup labels and explanations.
- **Red:** route tests returned 404 for locale mutation, state projection lacked `product_locale`, the browser had no locale picker, and setup messages ignored supplied community catalogs.
- **Green/Refactor:** `npm exec -- vitest run tests/unit/web-route.test.js tests/unit/setup-messages.test.js tests/integration/localization-catalog-route.test.js tests/unit/queue-routes.test.js tests/integration/queue-repository.test.js` passed 161/161; `npm run validate:localization` passed for setup in `en`, `es`, and `pt-BR`. JSDoc/body narrowing fixes then made `npm run typecheck`, `npm run lint`, and `git diff --check` pass.
- **Scope:** the saved locale survives restarts and the panel discovers added locales on a 30-second refresh; only Twitch setup copy is catalog-driven so far. The rest of the panel, chat, OBS, installer tools, and offline host projection remain pending.

### Increment 17 — Preserve an unsaved locale choice during catalog refresh

- **Behavior:** a background catalog refresh must keep a valid pending locale selection while the operator is deciding whether to save it; otherwise display the persisted locale, or temporarily fall back to `pt-BR` when its catalog is missing.
- **Red:** `npm exec -- vitest run tests/unit/locale-picker-state.test.js` — import failed because the selection-resolution behavior did not exist.
- **Green/Refactor:** the focused test passed 3/3 after adding a pure selector helper and using it in the picker. Browser refresh still reads catalog files every 30 seconds and uses text-only rendering.
- **Regression check:** `npm test` passed 79 files / 566 tests; `git diff --check` passed. `npm run validate:localization`, `npm run typecheck`, and `npm run lint` also passed in the focused validation run for this slice.
- **Scope:** selection preservation only; this does not claim full panel localization.

### Increment 10 — Discoverable locale validation and translation

- **Behavior:** keep `pt-BR`, `en`, and `es` required while accepting additional canonical locale IDs supplied by catalogs; validate key parity and exact declared placeholder parity across every discovered locale; translation uses an available locale without a hard-coded supported-locale list.
- **Red:** `npm exec vitest run tests/unit/localization-parity.test.js tests/unit/localization-translation.test.js` — 3 tests failed: complete `de` catalogs were rejected, the translator returned pt-BR instead of the supplied German text, and an invalid locale ID was not identified before the missing-required-locale error.
- **Green:** the same command passed 16/16 after validating canonical locale identifiers, requiring the initial locales while permitting complete additions, and selecting any own locale catalog in the translator.
- **Refactor:** the combined catalog/decoder/translation/parity suites passed 32/32; ESLint passed for all shared localization modules and their focused tests.
- **Scope:** dynamic catalogs are accepted when provided to the validator/translator. Scanning locale files from disk, exposing only complete locales to the panel, and wiring setup/chat/widget/host consumers remain pending.

### Increment 18 — Atomic host locale projection and Compose access

- **Behavior:** mirror the PostgreSQL product locale into an atomically replaced host-readable state file; retain a last-valid copy, reject malformed locale/revision values, and grant the non-root bot access to the mounted host directory.
- **Red:** `npm exec vitest run tests/integration/product-locale-projection.test.js` could not import the projection module because it did not exist. Compose contract coverage also showed the `.local` mount/group was absent, and the bootstrap permission assertion showed the export directory was not group writable.
- **Green/Refactor:** the projection integration suite passed 3/3 with valid, malformed, and fallback states; the targeted Compose/bootstrap checks passed after adding the writable host mount, group membership, and setgid directory permissions. `npm run validate:localization`, `npm run typecheck`, `npm run lint`, and `git diff --check` passed in the associated focused run.
- **Scope:** Linux host projection behavior and Compose permission contracts are covered. Windows/macOS native filesystem behavior remains a platform acceptance item.

### Increment 19 — Localize shell lifecycle tools from the saved catalog

- **Behavior:** POSIX updater and uninstaller read the selected locale from `.local/product-locale.state`, render lifecycle catalog copy with safe fallbacks, use the locale-specific deletion confirmation word, and keep data preservation as the default.
- **Red:** `npm exec vitest run tests/unit/host-lifecycle-localization.test.js` failed 2/2: an English installation printed the Portuguese non-main-branch warning and uninstall prompt/result.
- **Green/Refactor:** the same test passed 2/2 after connecting the shared host lookup; combined lifecycle/start/maintenance tests passed 10/10, and `sh -n` passed for the POSIX tools and helper. The Windows entrypoints now route through a PowerShell lifecycle executor, but PowerShell is not installed in this Linux environment and native Windows execution has not been observed.
- **Scope:** POSIX lifecycle localization is behavior-tested. The Windows executor has static contract coverage only; do not treat it as runtime-validated.

### Increment 20 — Map panel failures to localized safe copy

- **Behavior:** the panel maps known stable API error codes to catalog messages and uses localized generic copy for unknown/network failures; it never renders a backend-provided message, including Twitch/provider details.
- **Red:** `npm exec vitest run tests/unit/web-application-setup.test.js -t 'renders a localized safe error'` failed on the assertion because the credentials form displayed `provider body contains token=secret` verbatim.
- **Green/Refactor:** `npm exec vitest run tests/unit/web-application-setup.test.js tests/unit/panel-error-presentation.test.js` passed 4/4 after injecting the catalog-backed error presenter and using it across panel catches. `npm run lint` and `npm run typecheck` passed.
- **Scope:** backend text no longer reaches panel notices/toasts through the app's request helper or Twitch-application form. Localized validation copy across every dynamic panel action remains part of the broader panel work.

### Increment 21 — Localize key queue and widget form controls

- **Behavior:** mark queue creation, widget appearance/save, and manual-entry action copy as catalog-owned strings so locale selection also updates these controls.
- **Red:** `npm exec vitest run tests/integration/panel-localization-contract.test.js -t 'marks queue'` failed because the five required panel keys were not present in the static HTML.
- **Green/Refactor:** `npm exec -- vitest run tests/integration/panel-localization-contract.test.js` passed 2/2 after adding the keys to all first-party catalogs and applying them to the controls. The catalog validator, lint, and typecheck passed.
- **Scope:** only these queue/widget/manual-entry labels are covered here; remaining panel forms and dynamic labels remain pending.

## Open planning and implementation gates

- Independent QA reviewed spec v1 as CONCERNS, 8.1/10. Spec v3 re-review returned CONCERNS without assigning a new score; corrected editorial findings should be included in the next independent review.
- The host locale bridge and TSV catalog contracts are selected; runtime validation is proceeding test-first. QA approved starting isolated technical increments.
- The owner approved collision handling: block only the conflicting root until explicit panel rename, never rename automatically. Tool names and authored-text presentation are also approved; tests and dependent behavior remain pending.

## Incremental completion checklist

- [x] TDD localized Twitch setup statuses and guidance helpers.
- [x] TDD literal TSV parsing, strict UTF-8 decoding, byte-to-catalog composition, safe lookup/interpolation, and validation of extra locales/key/placeholder parity.
- [x] Automatically discover module-level locale files and exclude invalid additions; test with real temporary filesystem fixtures.
- [x] Aggregate module catalogs, expose only product-complete locales through a protected API, and discover newly added files without restarting the server.
- [x] Provide a CLI catalog validator with safe output and a nonzero failure result.
- [x] Connect discovered catalogs to the settings picker and Twitch setup copy; persist locale changes in PostgreSQL and expose them through the protected state projection.
- [x] Create the atomic offline host locale projection; add runtime locale support to chat, OBS, and lifecycle tools; test approved key-collision/authored-text policies where implemented.
- [ ] Localize all remaining panel views and dynamic UI messages; extend code-specific API error presentation beyond the currently mapped locale conflict; prove browser and PowerShell parity with native execution.
- [ ] Finish bilingual contributor docs, quality gates, native platform acceptance, and independent QA.

## Files changed in current implementation slice

- Runtime: Compose catalog mount; `apps/api/src/http/localization-routes.mjs`, `apps/api/src/http/queue-routes.mjs`, `apps/api/src/persistence/queue-repository.mjs`, `apps/api/src/server.mjs`, `apps/api/src/web-route.mjs`; setup catalogs and locale picker in `apps/web/`; shared browser/server localization modules.
- Tests: catalog parser/discovery/CLI/API tests, real PostgreSQL locale persistence/concurrency tests, protected state/API route tests, web module/picker tests, and setup localization tests.
- Evidence/spec/docs: this story and its pt-BR pair, FND-8 Spec Pipeline artifacts, OPS-5 planning artifacts, bilingual stories indexes, and internal changelogs.





## Planning boundary

Implementation remains in progress: locale persistence, catalog discovery, core chat/OBS copy, and POSIX lifecycle localization are implemented; full panel/API coverage, native Windows validation, and final independent QA remain open. This PR advances the alpha MINOR to `0.6.0` but does not promote the stage, create a release, or create a tag. The intended first FND-8 beta MINOR remains `v1.1.0-HHHHHHH-beta`; stage promotion is owner-controlled.

## Change Log

| Date | Version | Change | Agent |
| --- | --- | --- | --- |
| 2026-10-06 | 0.6.0 | Implement product locale foundations and supported chat/OBS/host localization; panel coverage and platform QA remain open | @aiox-master |
| 2026-10-06 | 0.5.2 | Spec v3 records contracts and approved product decisions; TDD implementation has started; runtime contract validation and final QA remain pending | @aiox-master |

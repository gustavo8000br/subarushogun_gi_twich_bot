# FND-8 Spec — Product-wide localization

[Português brasileiro](../../../pt-BR/stories/FND-8/spec/spec.md)

**Story:** FND-8 / GitHub issue #18
**Planning status:** Spec v3 planning baseline; the independent re-review returned CONCERNS without a new score. Owner-resolved decisions and editorial corrections are recorded below; scoped TDD implementation is in progress. Independent QA follow-up remains required for full story acceptance.
**Research checked:** 2026-10-06.

## 1. Product outcome

One local installation has one effective product locale. The first-run installer selects it; the selection seeds persisted application settings; the streamer can later change it in the panel. The locale controls product-authored text across the panel, OAuth setup/callback screens, bot help and chat replies, OBS widget product copy, and local start/install/update/uninstall helpers.

Supported first-party locales are `pt-BR` (default/source), `en`, and `es`. Additional community locales are contribution resources and become selectable only after passing catalog validation and review.

## 2. Requirements

- **FR-1 — Locale lifecycle:** Select a locale during first installation, initialize it only when no persisted setting exists, preserve it through restart/update, and change it through a protected panel setting.
- **FR-2 — Product coverage:** Localize user-facing product strings in setup, callback, panel, chat, OBS product-generated labels, and local lifecycle tools. Preserve streamer-authored names, descriptions, templates, and fixed widget text exactly as entered; localize only product-owned copy. The owner approved this on 2026-10-06.
- **FR-3 — Modular catalogs:** Maintain one community-contributable catalog per module and locale. Use the shared UTF-8 TSV catalog contract described in the architecture, readable by browser ESM, Node ESM, POSIX shell, and PowerShell without adding host prerequisites.
- **FR-4 — Command locale:** Stable command IDs drive parser authorization/catalog policy. The selected locale provides the only active global root (`fila`, `queue`, `cola`) and translated subcommand labels/help. Other locale roots are rejected as aliases. Reserve all three roots globally from queue slug/alias keys. Detect existing collisions; block only the conflicting root and require an explicit panel rename. Never rename automatically. Owner approved on 2026-10-06.
- **FR-5 — Safe API boundary:** Backend returns stable allowlisted public status/error codes, never raw exception text, SDK payloads, technical enums, or secrets. UI maps public codes to a localized catalog message. Chat adapters do not forward technical errors.
- **FR-6 — Fallback:** Unknown install locale and missing optional community translation resolve to `pt-BR`; no user-visible raw key or untranslated internal value. First-party `pt-BR`, `en`, and `es` ship only with complete required catalogs.
- **FR-7 — Contribution:** Provide module/locale template, source-language guidance, naming/placeholders/plural rules, local validation command, review expectations, and steps to test a contribution without a translation service.
- **FR-8 — Local tools:** Provide international platform-native entry points/actions for install/start/update/uninstall. The approved generic names are `subarushogun_twich_bot_setup`, `subarushogun_twich_bot_update`, and `subarushogun_twich_bot_uninstall`; extensions and entry points vary by platform. Detect Docker/Compose; use supported platform installation paths only with explicit operator approval, otherwise show official manual setup instructions. Never run an unreviewed downloaded shell script as root.
- **FR-9 — Data-safe uninstall:** Keep the existing preserve-vs-delete data choice. Deleting data/volumes must be explicit, identify its effect on queue history and credentials, and require typed confirmation.
- **FR-10 — Formatting/security:** Use explicit-locale `Intl` for numbers/dates/plurals. Render translations as text; catalog placeholders cannot contain markup/evaluation. Preserve the 500-character chat limit after interpolation.
- **FR-11 — Tests/docs:** TDD for every behavior; real PostgreSQL migrations for locale persistence; locale/catalog matrix and leak tests; bilingual story/docs/changelogs.

## 3. Proposed architecture

1. Store product_locale as the authoritative non-secret setting in PostgreSQL. A validated install selection is a bootstrap seed only; an existing database value always wins on restart/update. Panel mutations require the existing local session, CSRF, idempotency, schema validation, and transaction/audit rules.
2. Project the saved locale and its monotonic revision to .local/product-locale.state, a bounded non-secret host-readable file mounted for the bot. A locale change commits the database setting, audit record, and durable projection intent in one transaction. A projection worker reads the latest database value and revision, writes a temporary file in the same directory, then atomically replaces the projection. Out-of-order work cannot lower the revision. After a database commit but before projection, product surfaces use the new saved locale while the panel reports that local tools may still use the previous locale. Startup/retry reconciles the projection from PostgreSQL. When PostgreSQL is unavailable, host tools use the last valid projection; missing or malformed state falls back to pt-BR. This stale last-known behavior is intentional and must be disclosed. Environment variables never override a saved locale.
3. Keep catalogs local and versioned, with one UTF-8, no-BOM TSV file per module and locale: one stable dotted key, one literal tab, and one translated value per line. LF and CRLF are accepted. Empty/duplicate keys, malformed rows, tabs/newlines/control characters in values, invalid UTF-8, unknown placeholders, and unbalanced braces fail validation. No catalog content is sourced, evaluated, treated as HTML, or interpreted as shell syntax. Placeholder names are allowlisted per key and replacement values are rendered as plain text. Use separate keys instead of multiline values. Browser ESM, Node ESM, POSIX shell, and PowerShell can read this bounded format without a pre-install runtime or parser dependency.
4. Use module keys and stable machine codes; have one locale resolver and a narrow translation helper. Pass the effective locale explicitly to chat, panel projections, and OBS product copy. Use native ECMAScript Intl for number/date/time formatting and plural selection in the app. Shared catalogs contain literal strings, not executable plural expressions; host-tool copy avoids dynamic plural sentences. Where app copy needs grammatical plurals, select allowlisted plural-category keys with Intl.PluralRules. No i18next dependency is selected for this no-bundler stack.
5. Treat command IDs separately from localized presentation. Authorization remains attached to stable IDs/role policies. The parser recognizes only the active locale's root and catalog-defined subcommands; user queue slugs remain ASCII operator configuration.
6. Host tools use native POSIX shell and PowerShell entry points and read the `.local/product-locale.state` projection plus the same module/locale TSV catalogs. The approved convention is `subarushogun_twich_bot_setup`, `subarushogun_twich_bot_update`, and `subarushogun_twich_bot_uninstall`, with platform-specific extensions/entry points. First install defaults safely to `pt-BR` if no valid locale is selected; host tools never require the app or database merely to display a prompt.
7. Add CI/catalog validation: locale/module validity, key parity for first-party catalogs, placeholder and app plural-key parity, safe literal-text restrictions, and tests proving community locale fallback.

## 4. Error and fallback contract

- Stable examples: `channel_ineligible`, `reconnect_required`, `reward_sync_pending`, and `invalid_command`; these are identifiers, never displayed directly.
- Unknown public code maps to a generic localized message, with safe action guidance where possible.
- Missing module/key uses `pt-BR` fallback; missing first-party strings are CI failures, not runtime acceptance.
- Internal exception message, stack, provider response, access/refresh tokens, client secret, authorization code, database URL, and credentials are forbidden in catalog interpolation, API responses, chat text, browser console, and logs.

## 5. Compatibility and migration

- Existing databases without product_locale start from a valid install seed or pt-BR; no queue/reward/entry/history data is rewritten. The database remains the sole authority after initialization; the host-readable state file is a recoverable projection.
- Existing `!queue` global command becomes `!fila` in pt-BR after switching to the localized command contract; no legacy alias remains by explicit owner decision. Existing queue slug/aliases are not renamed automatically. If an existing key collides with a reserved root, block only the conflicting root until the operator explicitly renames it in the panel; never rename automatically. This approved behavior still requires an upgrade test.
- The product version remains on the current alpha line during planning. The owner intends the completed FND-8 to be the first beta MINOR `v1.1.0-HHHHHHH-beta`; this spec performs no version promotion or release.
- Locale changes and upgrades never rewrite persisted operator-authored text. Per owner decision, keep the text exactly as entered without automatic translation; localize only product-owned copy. Migration/upgrade must not rename existing configured queues or aliases.

## 6. Acceptance/test matrix

| Given | When | Then |
| --- | --- | --- |
| Fresh installation | Installer selects `en` | First startup uses English product copy and persists `en` as the locale setting. |
| Existing install with no locale key | App starts after upgrade | No data is lost; locale defaults to `pt-BR` once. |
| Saved locale `es` | App restarts or image updates | Chat, panel, callback, OBS product labels and lifecycle tools resolve Spanish. |
| Streamer changes locale | Protected panel mutation succeeds | Setting is audited and projected without restarting API; streamer-authored values remain exactly as entered, per the approved owner decision. |
| `es` locale active | User sends `!cola comandos` | Spanish help is returned; `!fila` and `!queue` are not accepted as aliases. |
| Viewer text contains HTML or command-like placeholders | It is interpolated/rendered | It remains text and cannot execute markup or expand into a command. |
| Provider returns an unknown error/state | API/UI/chat renders it | Only a generic localized public message appears; raw code/message is absent. |
| Community catalog omits a key | Locale loads | `pt-BR` fallback is shown; raw key is not shown; validation identifies the omission. |
| Locale changes with active OBS source | Renderer polls next projection | Product labels use new locale. Persisted widget content is unchanged; it remains displayed without automatic translation. |
| Update/uninstall helper sees saved locale | Tool runs | It uses the saved language; uninstall asks preserve/delete and never removes data without explicit confirmation. |

## 7. Risks and gates

- **Host helper locale bridge:** architecture selected for spec v3: PostgreSQL authority plus an atomic, revisioned .local/product-locale.state projection and last-valid/offline fallback. Implementation tests must cover commit-before-projection crash, write failure, corruption, stale/offline reads, restart recovery, permissions, and Compose persistence before this gate closes.
- **Catalog format:** architecture selected for spec v3: UTF-8 no-BOM TSV with literal text and allowlisted placeholders, parsed without evaluation in browser ESM, Node ESM, POSIX shell, and PowerShell. Cross-runtime parser/encoding behavior remains to be proven by contract tests before this gate closes.
- **Command parsing (medium):** reserve `fila`, `queue`, and `cola` across languages. The owner approved blocking only a conflicting root until the streamer explicitly renames the key in the panel; never rename automatically. The upgrade test remains required.
- **Operator-authored values (medium):** preservation of streamer-authored names/descriptions/templates/widget copy is approved; tests must verify locale changes never rewrite those fields.
- **Lifecycle tools (medium):** generic action names are approved. Cross-platform entrypoint consolidation and Actions artifact packaging are separately planned in OPS-5; coordinate scope so FND-8 localizes tool copy without duplicating installer architecture.
- **Community catalog safety:** translate text only; do not allow HTML, code, command tokens, or URLs that become executable instructions.
- **Chat limits:** count expanded Unicode text according to the existing API limit and never split/multiply messages to fit.
- **OBS offline behavior:** preserve last known product projection semantics without exposing full catalogs or internal state to capability URLs.
- **Credential install:** do not silently install Docker as administrator; dependency installation must be explicit, supported and reversible.

## 8. Specialist review decisions

- **PM review:** inventory all product-authored surfaces and split the broad feature into independently testable increments; planning artifacts alone do not mean catalogs/tools are implemented.
- **Architect review for spec v3:** selects PostgreSQL as locale authority and a revisioned atomic host projection with offline last-known fallback; selects a shared literal UTF-8 TSV catalog readable by target runtimes without a pre-install parser. Implementation tests still gate closure. No i18next package is selected for the vanilla/no-bundler stack. Stable command IDs and API codes remain separate from display labels.
- **Independent AIOX QA review (2026-10-06): CONCERNS, 8.1/10 for spec v1.** A read-only re-review of spec v2 returned CONCERNS without assigning a new score. Spec v3 resolves the technical contracts and bilingual parity findings; its independent re-review still returned CONCERNS without a new score, but permits isolated TDD increments. The three editorial findings were corrected and owner decisions OQ-4/OQ-6 were subsequently resolved. Independent QA follow-up remains required before full story acceptance; no score is claimed for v3.
- **Owner-approved product policy:** preserve streamer-authored queue, reward, chat-template, and widget text exactly as entered; locale changes affect only product-owned strings and labels.

## 9. Out of scope

Automatic translation of streamer-authored text; multi-locale-per-viewer chat; per-queue locale; localization of database IDs/logs/API contract versions; external translation service; overlay redesign; new payment integrations; release/stage promotion; and implementation of FND-8 in this planning change.

## 10. Research references

See `research.json` for the dated source matrix. The i18next namespaces/interpolation documentation demonstrates module catalogs and warns against disabling escaping; ECMA-402 supplies explicit locale/plural/number/date APIs. Docker Compose interpolation rules show why environment variables must be bootstrap hints and not override persisted settings.

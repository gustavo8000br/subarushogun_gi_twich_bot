# Internal Changelog

[Português brasileiro](docs/pt-BR/CHANGELOG_INTERNAL.md)

## v0.6.0-alpha

- Persist installation locale in PostgreSQL with optimistic revision/audit, expose a session-protected catalog API, discover complete module/locale TSV files dynamically, and write an atomic host-readable locale projection.
- Add locale-aware chat roots and supported command/help/reply text, OBS-generated labels, setup/status labels, and host lifecycle copy. Streamer-authored queue/widget content remains unchanged.
- Prevent backend/provider error strings from reaching panel notices and toasts; map the locale revision conflict to catalog-owned copy and use localized generic copy otherwise. Regression tests cover a provider message containing a secret-like value.
- Add generic `subarushogun_twich_bot_{setup,update,uninstall}` entrypoints. POSIX tools use the saved locale; Windows `.bat` entrypoints delegate to the PowerShell lifecycle runner. The runner has contract coverage but was not executed natively because PowerShell/Windows is unavailable in this environment.
- Update bilingual contributor and operations docs and validate catalog, locale API/persistence/projection, shell lifecycle, wrapper, and Compose contracts.
- Quality gates on 2026-10-06: `npm run lint`, `npm run typecheck`, `npm test` (86 files / 615 tests), `npm run validate:port-denylist` (1,024 files, 0 findings), `npm run validate:version`, `npm run review:static` (0 findings / 70 application JS files), `npm run validate:localization` (5 modules; en/es/pt-BR), `git diff --check`, and `docker compose config --quiet` passed. Whole-panel localization, PowerShell runtime validation, and final independent QA remain open.

## v0.5.2-alpha

- Validate the current FND-8 implementation slice with the full suite: `npm test` passed 79 files / 566 tests; localization catalog validation, typecheck, lint, and `git diff --check` passed. FND-8 remains in progress; broader product localization and independent QA are still pending.
- Add a panel locale picker backed by discovered complete catalogs, save locale/revision in PostgreSQL settings with transactional audit and conflict checks, and use catalogs for Twitch setup labels. New community catalog files are mounted read-only by Compose and discovered during panel refresh. Real PostgreSQL tests cover default, audit, invalid IDs, and concurrent changes; focused panel/API/repository checks passed 161/161. Full interface/chat/OBS/host localization remains pending.
- Preserve pending locale selection across background catalog refreshes with a pure tested selector (3/3). Add bilingual contributor instructions for catalog paths, validation, and live discovery.
- Add `npm run validate:localization` for safe CLI validation of module/locale catalog coverage. Red reproduced a missing validator script; Green passed 2/2 CLI tests, and the real catalog tree validates for setup in en/es/pt-BR. Combined localization suites passed 44/44; typecheck and lint passed.
- Add a session-protected local catalog API that rescans module TSV files on every request; TDD proved it discovers a newly added complete community locale while the server stays running. Production Fastify registers the route, and initial Twitch setup catalogs now have pt-BR, English, and Spanish files. Focused integration passed 21/21; typecheck and lint passed. Browser rendering and persisted locale remain pending.
- Add a shared catalog resolver by TDD. Red showed the missing module; Green passed 7/7 tests for locale/key fallback and allowlisted scalar interpolation. The resolver is not yet wired to browser catalogs or product locale state.
- Add shared ESM catalog contracts by TDD: literal TSV parser, safe translator, strict UTF-8 decoder, byte-to-catalog parser, dynamic locale/key/placeholder validation, and per-module filesystem discovery. A real filesystem integration test found and fixed a defect that admitted incomplete extra-locale catalogs; discovery/parity integration passed 15/15, and combined catalog suites passed 32/32. Global module completeness, browser, and host-script parity remain pending.
- Plan OPS-5 as a cross-platform lifecycle entrypoint story. Research GitHub Actions matrix tests and per-platform artifacts; distinguish its MIT open-source runner from the hosted GitHub service, and clarify that artifacts come from reviewed sources, CI does not auto-commit changes, and Docker host updates remain outside the workflow. Published planning issue #30; implementation has not started.
- Localize Twitch setup's incomplete-state prompts for English and Spanish with TDD. Red reproduced 6 missing translations; Green passed 39/39 focused tests, and a refactor centralized the pt-BR fallback.
- Localize the eligible Twitch channel summary for English and Spanish with TDD. Red reproduced 2 untranslated assertions; Green passed 33/33 focused tests, and the refactored locale-map implementation passed the same suite.
- Localize the Twitch eligibility guidance for English and Spanish with TDD; 4 Red cases reproduced the missing behavior and the focused setup-message suite passed 31/31 after Green.

- Record owner-approved collision behavior: preserve keys, block only the conflicting global command root, and require an explicit panel rename without automatic changes.

- The owner approved preserving streamer-authored names, descriptions, templates, and fixed widget text exactly as entered when locale changes; only product-owned text is localized.

- Localize all Twitch integration status labels for English and Spanish with TDD; 15 Red assertions reproduced missing translations, then the focused setup-message suite passed 27/27 after Green.

- Fix two Twitch setup status-precedence defects with regression tests first: connected-but-ineligible showed a misleading connected label, and stale eligibility could hide a required reconnect. Independent QA re-review passed OPS-2 at 9.3/10; no live Twitch account was used.
- Record independent QA PASS 9.3/10 for OPS-1, OPS-2 and OPS-4 in bilingual story and gate records. OPS-1/2 source completion and issue synchronization await this branch review/PR merge; OPS-4 is already merged.
- Start independent FND-8 P0 TDD increments. The first localizes the Twitch eligibility label for en/es; Red failed 2 assertions and Green passed 9/9 in the focused test. The persisted locale is not wired to the panel yet.
- Record the owner-approved generic lifecycle tool names `subarushogun_twich_bot_setup`, `subarushogun_twich_bot_update`, and `subarushogun_twich_bot_uninstall`.
- Update the bilingual FND-8 Spec Pipeline to v3: define PostgreSQL as locale authority with an atomic revisioned projection for offline tools and literal UTF-8 TSV catalogs; synchronize EN/pt-BR research and story artifacts. The v2 QA re-review remained CONCERNS without a new score; product decisions and fresh QA still block implementation.
- Bump only PATCH to `0.5.2`; keep `.release-stage` at `alpha` and `VERSION` at the zero-source marker for the not-yet-committed checkout.

## v0.5.1-alpha

- Normalize the macOS first-run sequence number across the bilingual READMEs. Explicitly pass `.Path` from PowerShell `Resolve-Path` to `Import-Certificate`, and add a contract test for the platform instructions. Red reproduced the stale pt-BR step number; Green passed the focused contract suite (6/6). The Windows and macOS commands remain documented as untested on their native hosts.
- Prepare documentation-only PATCH version `0.5.1-alpha`; keep the release stage at `alpha`.
- Record the unmet AIOX release gate: the required canonical `docs/guides/release-procedure.md` is absent. FND-7's owner-approved QA condition is met (9.2/10), but no beta stage promotion or release tag is made without the required procedure.

## v0.5.0-alpha

- Refresh FND-7 implementation, recovery, and operator acceptance evidence. Verify the documented absolute-path Linux CA installation behavior in a path containing spaces; update Windows/macOS commands and keep those host flows explicitly unverified. Add a regression-tested PostgreSQL test cleanup that removes and verifies isolated containers and volumes; record the full repository audit and ten improvement proposals in bilingual audit reports.

- Add configurable local OBS widgets backed by a PostgreSQL model and hash-only one-time capabilities. Management routes require the local session and CSRF protection; the Browser Source receives one-field projections through a read-only endpoint. Add allowlisted style validation and Unicode code-point limits, with unit, route, real-PostgreSQL, and OBS Chromium E2E coverage.
- Verify native OBS HTTPS trust and Page Permissions=None on Ubuntu 24.04 / OBS Studio 32.2.2 / CEF 127.0.6533.120; the final authenticated E2E measured 80 commit-to-DOM updates across eight active widgets at a maximum of 905 ms. It also verified bot stop/restart, stale-value recovery, Browser Source unload/reload, and capability rotation. Chrome manual acceptance confirms widget create/edit, one-time clipboard copy, regeneration/revocation, deletion, and queue-source selection against a temporary local PostgreSQL fixture. No Twitch synchronization was exercised. Follow-up QA fixes hide unconfirmed queue state, poll once per second, and clear content on HTTP 403; TDD regression tests record Red and Green. Independent QA re-review passed at 9.2/10; FND-7 is Done.
- Fix queue-management and current-account command policies so streamer/moderator access cannot be broadened by saved roles or VIP settings; cover the policy in unit, route, and PostgreSQL tests.
- Refresh bilingual README, story and integration status; add the FND-7 OBS setup guide and security limitations.

## v0.4.1-alpha

- Add the standard MIT license text and declare the license in package metadata. Synchronize licensing, version, and merged-story records in the English and pt-BR documentation.

## v0.4.0-alpha

- Fix OPS-3 authorization for Twurple's EventSub chat badge object map; add an end-to-end EventSub-to-authorization regression test. Independent QA reproduced the moderator-as-viewer defect (7/10), then revalidated the test-first fix and passed at 9.2/10.

- Add a canonical command definition registry used by parsing, role authorization, chat help, and the protected catalog API. Persist explicit per-command role allowlists in PostgreSQL `Setting` with transaction lock, optimistic version, and same-transaction audit; malformed policies fail closed. Account-label writes stay immutable streamer-only; global `!queue ping` stays immutable streamer/moderator-only. `queue` is reserved from slugs and aliases.
- Add global role-filtered `!queue comandos` while retaining `!<queue> comandos`; add the protected Commands panel page with explicit allowlist controls, immutable rows, session/CSRF/idempotency/version checks, and DOM `textContent` rendering.
- Share only the latest sanitized `/health` Twitch probe snapshot with the chat handler; ping includes runtime version and cached latency and does not initiate a Helix request. Add focused handler, route, panel, and real PostgreSQL migration-backed tests. Live Twitch chat ping was not verified during this implementation.

- Keep technical changelog entries under matching release headings in English and pt-BR.

## v0.3.1-alpha

- Update Prisma config’s vulnerable `deepmerge-ts` dependency to patched 8.0.2 through a scoped npm override; keep Prisma CLI, client, and PostgreSQL adapter aligned at 6.19.3. `npm audit` reports zero vulnerabilities.

## v0.3.0-alpha

- Complete independent FND-6 QA on revision `165c5c4`: 384 tests and repository gates pass; the browser callback denial/30-second recovery and authorized read-only Twitch health probe were verified. Record CONCERNS (90/100) because eligible-channel reward/chat/EventSub effects could not be exercised with the connected ineligible channel; no live write is claimed.
- Preserve the authenticated Twitch status in `/health` while measuring Helix latency for authenticated ineligible channels. Keep token refresh available for the read-only probe without starting reward/chat EventSub processing; verify with a live read-only Helix request (193 ms; later panel refresh 322 ms).
- Require a session-scoped `Idempotency-Key` on local API mutations. Hash canonical method/path/body without retaining request content; persist processing/completed state in `processed_operations`; replay completed JSON responses, reject key/payload conflicts, and block duplicate work while a reservation is pending. Cover replay and concurrent key claims with route and real-PostgreSQL tests.
- Add a protected manual Twitch reconciliation endpoint and connection-page action. Reuse the startup/reconnect reconciler, coalesce overlapping runs, and report unavailable integration clearly. Style OAuth callback success and failure states to match the panel, scrub query parameters from browser history, and return to the panel after 30 seconds.
- Restrict UID privacy changes to the durable app-managed Twitch reward update. Remove the local-settings/repository bypass; preserve PostgreSQL UID cleanup and cancellation of pending call notices as part of the remote intent.

- Add Twitch-native per-stream/per-user redemption caps and global cooldown to the Prisma model, migration, create flow, explicit DTOs, and app-owned reward matching. Add version-checked remote reward edits through a protected route and panel dialog; record prior settings and desired intent transactionally, purge stored UIDs/cancel pending call notices when UID mode becomes hidden, and confirm updates through an outbox worker that preflights reward ownership/configuration and reconciles ambiguous PATCH responses. Add PostgreSQL checks for positive configured values. Refresh the OAuth callback screen to match panel styling, show a 30-second return countdown, escape the channel label, and scrub code/state from browser history after exchange. Twitch live calls remain unverified.
- Complete the 2026-10-06 official Twitch capability crosswalk against FND-0–FND-9, OPS-1/OPS-2, and GitHub issues #17–#21; identify native reward limits as missing from FND-6 settings and record follower-scope decision for #17. Publish tracking issues #20/#21 and refresh open issue bodies #6/#17/#19 without comments.
- Split the streamer panel into accessible overview, queues, new-queue, operations, settings, and Twitch connection pages; select setup/recovery until connected, show the connected-channel summary afterward, and restore required Client Secret validation feedback.
- Add PostgreSQL priority class/reason fields and checks; lock a queue, audit the operator's manual benefit verification, append promotions to the destination lane, preserve same-lane movement, and select priority FIFO before standard FIFO without changing points intents.
- Add protected panel actions and manual-admission options for operator-verified priority categories (subscription, Bits, external payment, other); expose only allowlisted Portuguese labels, never payment evidence, and keep chat `add` standard.
- Translate continuous displayed chat positions into lane-local reordering positions; reject cross-lane moves and cover both cases with handler tests.
- Record FND-9's approved planning decisions for non-eligible channels, including Twitch Channel Points as viewer-earned channel-specific points, a dedicated Custom Reward created by the bot per eligible queue, unrelated rewards left untouched, and the manual streamer/moderator fallback.
- Expose the existing queue-locked waiting-entry move operation through a session/CSRF-protected panel route; validate position and add boundary-disabled move controls.
- Add a session-protected queue history projection capped at 100 terminal entries, selecting only presentation fields and omitting UID/redemption payloads; load it on demand in the queue panel.
- Add a cached Twitch Helix `getUserById` health probe with a 60-second TTL; `/health` reports only sanitized integration state and elapsed milliseconds.
- Add a pt-BR runtime health summary to the panel's live overview for local database, Twitch API state, and measured response time.
- Add formal bilingual FND-6 story records and update operator/integration documentation for FND-5 completion and the new health behavior.

## v0.2.0-alpha

The full runtime identity for each shipped artifact adds the exact seven-character source commit SHA, materialized by CI.

- Add a PostgreSQL transaction advisory lock shared by automatic account switches, owner resets, and manual/default account mutations; add a real-PostgreSQL regression test for stale ownership across queues.
- Claim chat command IDs and viewer cooldown timestamps atomically in `processed_operations`, protected by message/viewer advisory locks; management roles bypass the viewer cooldown.
- Add durable `reward.set_open` outbox operations with queue-version checks, managed-reward preflight, Twitch confirmation, and safe re-query after ambiguous responses; persist capped chat notification backoff and 429 retry-after scheduling.
- Add `POST /api/entries/:entryId/call-notification/resend` with local session/CSRF protection; reuses the idempotent outbox row, rejects stale or processing calls, audits the operator, and preserves existing timeout timestamps.
- Fix repeated `setQueueOpen` requests so pending intent is returned as pending without adding an outbox duplicate or reporting remote confirmation from local desired state.
- Add persistent archive/unarchive lifecycle: archive closes the managed reward and retains active-entry service; unarchive requires confirmed pause and leaves the queue closed.
- Add protected explicit queue-delete confirmation and staged deletion worker: enumerate remote unfulfilled pages, record missing redemption cancellations, block Twitch DELETE until confirmed, recheck remotely, and release queue keys only after final confirmation.
- Expose deletion tasks to the protected operation panel and restore `pending_close`/`delete_pending` when an operator retries an unknown or failed deletion stage. Reconcile a lost reward DELETE only after the persisted safe-to-delete gate.
- Keep deletion lifecycle tasks visible independently of the 200-row financial-operation history limit; a PostgreSQL regression covers an older pending deletion behind 205 newer records.
- Define per-PR version increments: small fixes/documentation use PATCH, new features/large implementations/complex fixes use MINOR, and MAJOR is reserved for significant product changes such as an owner-authorized official launch; only the product owner advances the stage.
- Require `@devops` to update the linked GitHub issue body and status after a Done story is published by merged PR; issue comments are avoided unless necessary to record a decision or blocker that does not fit the issue body.
- Shorten the public changelogs to user-visible outcomes in plain language; retain implementation, CI, and infrastructure details in this internal changelog.
- Add a tested `npm run validate:port-denylist` entry point for the AIOX pre-push security gate.
- Remove the stale v0.1.0 Compose/Docker build-argument fallback; local builds now retain the tracked `VERSION`, while CI continues to inject the materialized source identity.

## First materialized alpha image — v0.1.0-3e0c935-alpha (2026-10-05)

- GitHub Actions run `37391271083` passed all gates, materialized the exact seven-character source identity, and published the private GHCR multi-platform image for `linux/amd64` and `linux/arm64`. The `main` and version manifest resolved to the same image index. No GitHub Release or Git tag was created; `package.json`, `.release-stage`, and tracked `VERSION` remain `0.1.0`, `alpha`, and the zero marker respectively.

- Switch the Node app image to `node:24.20.0-alpine3.24`; test-first Compose contract and a clean production build verified Prisma musl/OpenSSL engine, bootstrap, three PostgreSQL migrations, non-root runtime and HTTPS health. Rebuilt/recreated the normal Compose app over the existing database/secrets volumes without deleting them. AMD64 image is 769,822,537 bytes; post-merge QEMU CI built and published both architectures.

- Added a main-only GHCR publishing job gated by every quality/build job. QEMU/Buildx publishes `linux/amd64` and `linux/arm64` tags, then creates universal `main` and materialized-version manifests. Compose and startup/update helpers now pull the registry image; README and version policy document pre-release package authentication and the public-visibility launch gate.
- Updated both uninstallers to remove the selected cached GHCR app tag explicitly; their default path still keeps all named data volumes.
- CI materializes the checkout's exact seven-character Git SHA into container images via external artifact output and a Compose build argument, then verifies the version from the built image. The tracked `VERSION` file is unchanged, no SHA commit-back occurs, and the published identity is `v0.1.0-3e0c935-alpha`.
- Decouple the default Compose application image tag (`main`) from the runtime product identity (`PRODUCT_VERSION` build argument).
- Record the operator-reported manual Windows acceptance at commit `f32c37a` and add a test-first regression for the startup helper; replacing `timeout /nobreak` with a `ping` delay passes the Linux contract test, pending Windows retest.
- Extend the bilingual README contract for Linux/macOS executable permissions and first-run TLS trust guidance; macOS runtime remains unverified.
- Add an allowlisted pt-BR label map for Twitch setup status pills and a generic fallback for unknown states; retain the detailed eligibility explanation and record pt-BR-default/English/Spanish/community translation direction without implementing full i18n.
- Added the `ci/apps-quality-workflow` GitHub Actions workflow, per-app ESLint/TypeScript-check scripts/configs, pinned Node definitions, immutable SHA-pinned Actions, PostgreSQL/Compose-backed tests, OpenGrep installation at the repository-pinned release, and production image build. No frontend bundler was introduced.

- QA reviewed FND-4 revision `b7a08b3` and recorded PASS (100/100), with all seven acceptance criteria traced to automated evidence. Native Windows scripts and live Twitch behavior remain explicitly unverified operator follow-up.

- Added idempotent local TLS bootstrap: a private CA and `localhost` server certificate persist in the operational-secrets volume, only the CA certificate is exported under ignored `.local/`, and Fastify/healthcheck/start scripts use HTTPS. The protected session cookie now has `Secure`, and HTTP local Origins are rejected. Real Compose acceptance verifies the HTTPS endpoint and local certificate chain; host trust installation remains a documented operator step.
- Verify Twitch Channel Points availability after Affiliate/Partner detection by querying all custom rewards through Twurple, exposing the 45/50 capacity threshold without leaking SDK errors; adapter tests use fakes and no live channel was tested.
- Added test-first durable custom reward creation: queue and intent commit atomically; a leased PostgreSQL worker checks eligibility/capacity, creates the reward paused with redemption queueing enabled, confirms its app-managed identity, and recovers lost responses without blind POST retries. Ambiguous ownership stays unknown and prevents queue use. Unit fakes and isolated PostgreSQL tests pass; no live Twitch request has been made. Operator has Twitch credentials ready for future Windows HTTPS acceptance, without sharing them here.
- Added an audited panel flow for manually selecting an exact matching app-managed reward after an ambiguous create; the choice is revalidated against Twitch, protected by local session/CSRF, and never reported as API confirmation. Explicit 429 responses reset the preflight uncertainty marker transactionally for a delayed retry; timeout outcomes still require reconciliation. Fixed the async credential form so it captures the secret input before `await`, and added a browser-event regression test. Validated on Ubuntu 24.04.5 LTS.
- Rewrote the bilingual README requirements/first-run sections with current Docker/WSL 2 prerequisites, Ubuntu/Linux setup, HTTPS CA import, exact Twitch callback, explicit unvalidated-Windows note, and approximate version-scoped hardware estimates. Added the mandatory English/pt-BR documentation rule to project agent instructions and README contribution guidance, with a contract test. Official Docker links were checked on 2026-10-05; hardware estimates are project estimates, not Docker's published minimums.
- Corrected stale managed-reward status in both language changelogs and the integration matrix; recorded the README platform/hardware documentation Red/Green evidence in both story logs. These documentation changes make no additional Twitch runtime claim.
- Added tested maintenance helpers: updater requires a clean `main` Git checkout and fast-forwards before rebuilding; uninstaller preserves all volumes by default and requires typing `APAGAR` before deletion, then removes only the exported CA certificate. Both language READMEs explain the limitations; native Windows execution remains unverified.
- Added a safe Twitch setup eligibility projection and panel guidance for Affiliate/Partner, Channel Points API availability, reward capacity and the near-limit warning. The API allowlists each projected value; no real broadcaster was queried.
- Added linked FND-4 story records with criteria, TDD/runtime evidence and a complete review file list in English and pt-BR so the integration work can enter the AIOX QA lifecycle.
- Fixed `.gitignore` so versioned Prisma migration SQL is included in repository changes while operational SQL dumps remain ignored; a regression test and `git check-ignore` verified all three migration files are visible.
- Added audited operator resolution for irrecoverably unknown financial outbox operations. The protected panel action records `resolved_manual`, preserves expected and observed Twitch status, and prevents retries without claiming a remote outcome; later authoritative Twitch events still update it to confirmed/conflict. Real PostgreSQL migration/integration and CSRF route tests cover it.
- Added a shared transition domain service that computes financial intent from locked PostgreSQL state/policy and commits status/order/audit atomically; verified through real migrations and concurrency tests. Chat/EventSub dispatch and financial outbox delivery remain in their assigned later stories.
- Reworked AIOX static analysis around the local OpenGrep `1.30.0` scanner: Layer 2 and workflow execution now run the configured command, findings block without automatic file edits, story templates and setup/QA/pre-push guidance match the behavior, and generated IDE/agent profiles were synchronized. Latest scan: 36 application JavaScript files, 0 findings. FND-1 remains InProgress pending native Windows `.bat` validation and formal specialist reviews.
- Started FND-2 after PO GO (9/10); added a test-first entry-transition decision function that rejects invalid lifecycle pairs and distinguishes external terminal observations from local financial decisions. This is a partial increment; no persistence service or outbox behavior is claimed.
- Added a test-first UID validator for exact nine-digit ASCII input, optional visible manual UID, hidden-mode discard and safe errors that never echo invalid text. Persistence clearing/projection behavior remains pending.
- Added test-first pure queue-key validation, Portuguese command parsing and command authorization. A regression test caught and removed viewer enrollment from bare `!<queue>`; authorization also rejects attempts to use self-service leave against another identity.
- Added isolated real-Compose startup/restart acceptance, POSIX start-helper execution with a path containing spaces, and a static `apps/web` entrypoint served through `@fastify/static`. Linux quality gates pass; Windows `.bat` runtime remains unverified on this host.
- Expanded the FND-5/FND-6 sequence for shared application services and full streamer management through the local panel. Replaced GitHub issue bodies #1 and #6; intentionally posted no comments. Activated `$aiox-ux-design-expert` at FND-6 planning and recorded bilingual desk research and interaction guidance; no usability sessions are claimed.
- Added OAuth-from-fresh-install runtime composition so setup routes remain available before credentials, financial/chat workers activate after authorization, and call timeouts remain suspended until Twitch recovery. Added regression coverage for operator/state UID projections and product version in `/api/state`.
- Removed runtime font CDN requests from the local panel; a route test rejects external CSS URLs. Rebuilt the running Compose image without removing database or secret volumes; DB and app health returned connected/healthy with Twitch `not_configured`.
- Added test-first `limpar` preview/confirm for chat and panel, bound to the same actor/channel/queue and a 15-second active-entry snapshot. PostgreSQL atomically removes the snapshot, records each audit decision, and creates cancellation intents for every redemption even while called/in service.
- Added test-first account ownership semantics: only individual automatic calls bind the current account; manual labels preserve the owner link; a terminal transition resets to the latest default only for its owning entry. Added an audited default-label mutation and protected panel control.
- Added normalized `should_redemptions_skip_request_queue` reward projection and reconciliation guard; an incompatible Twitch reward now becomes visible divergence before redemption import.
- Added linked central operator README translations and dated official integration research for Twitch, Twurple, Prisma, PostgreSQL, and Docker Compose; recorded the documentation-contract TDD cycle.
- Added FND-1 version validation/materialization, bootstrap and Compose startup scripts, Prisma schema/migration, and real PostgreSQL integration coverage.
- Added the Postgres group as a supplemental group to the non-root migrate/bot services so they can read the `0440` shared secret.
- Extended `/health` with the running `product_version`, a real PostgreSQL connectivity result, and `twitch_api: not_configured` until the Twitch integration is implemented. Database failures return a sanitized 503.
- Docker runtime storage was moved to `/home/gustavo/.docker-data` and containerd storage to `/home/gustavo/.containerd-data` during host maintenance; no product installation or application data is included in this project change.

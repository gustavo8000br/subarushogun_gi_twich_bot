# Ledger of open acceptance criteria and the shortest path to the beta launch (80% rule)

**Date:** 2026-11-10. **Author:** `@po` (Pax). **Base:** `main` at `dcfe3da`, release `v0.3.0-0d0b595-beta`. **Scope:** documentation only; nothing was created, edited or closed on GitHub.
**Português:** [Ledger dos critérios de aceitação abertos](../pt-BR/process/open-acceptance-criteria-2026-11-10.md)

**Purpose.** Owner correction (2026-11-10): the target is to **launch the beta stage (`v1.0.0-beta`)** to a streamer friend who uses **Windows**, with at least **80% of the planned launch features tested and functional** (section 0 defines and measures it). Work runs in continuous cycles (next open criterion, implement, validate, update story and handoff, repeat). This ledger lists what is still open, classifies it and fixes the order of the cycles.

**Sources read:** open boxes of the stories OPS-15, OPS-22, OPS-23, OPS-24, OPS-25, OPS-26, OPS-31 and OPS-32 (`grep -n '- \[ \]'`); the rows of [backlog-inventory](backlog-inventory.md); the top of [session-handoff](../session-handoff.md); [VERSIONING](../VERSIONING.md). Checkbox counts are in the stories; this ledger groups them into 47 rows. Nothing here is new scope (Article IV): every row points to an existing ID.

**Classes.** **A** = possible in this environment (Docker, disposable PostgreSQL, Chromium, local OBS Flatpak, the SubaruShogun test channel under the current authorizations). **B** = blocked (owner, platform, external data). **C** = not required for the beta launch (can wait). Cycle column: C1..C12 = cycle of the path in section 4; R = declared caveat (outside the path). Effort: P small, M medium, G large. Risk = risk to the streamer if left open.

## 0. Target, measure and current percentage

**Owner corrections (2026-11-10).** (1) The target is **not the stable version**: it is to **launch the beta stage** (`v1.0.0-beta`) to the friend streamer, with **at least 80% of the planned launch features tested and functional**. This replaces the old rule "`v1.0.0-beta` only when everything is validated". `rc` and `stable` come later, each with the owner's express OK. (2) **Q1 answered: the friend uses Windows**, so the Windows installer, update, uninstall and OBS flow are critical path for the beta, not an accepted risk. (3) **Q2 answered: refund by group (OPS-31, #115) is in the beta launch.** OPS-32, SSE, TypeScript and `status` stay out unless the formula below needs them (it does not). Q3 (`legacy` and old commits) stays with the owner and blocks nothing.

### (a) Planned launch set: 32 features

Credit: Y = tested and functional by the criterion in (b); N = not yet. Evidence classes: **FX** fixture/unit; **PG** disposable PostgreSQL with real migrations; **BR** real browser through the real server; **OBS** native OBS Linux; **TW** real Twitch on the SubaruShogun test channel; **WIN** real run on Windows by the owner. The credits are documentary (taken from gates, stories and the roadmap; nothing was re-run for this ledger); the `@qa` recomputes them at the final gate.

| # | Feature (source) | Credit | Evidence, or what is open |
|---|---|---|---|
| 1 | Local runtime, Linux install and lifecycle (FND-1, OPS-5) | Y | QA PASS 100/100; real Compose on Linux (PG) |
| 2 | Twitch OAuth connect and status (FND-4, OPS-2) | Y | TW 2026-11-05, gate 9.2 |
| 3 | Queue domain and ordering (FND-2) | Y | PG |
| 4 | Manual queues (FND-9) | Y | TW/BR: `teste-a` created and opened |
| 5 | Reward-backed queues: create, open, sync (FND-4, FND-9) | Y | TW: `teste-r`, outbox confirmed |
| 6 | Redemption to entry, call, complete, fulfill (FND-4, OPS-11) | Y | TW: real redemption of 50 points, fulfilled |
| 7 | Refund, cancel, reject and removal paths (OPS-22) | N | PG exists; live open: TS-25, TS-27 (LA-07, LA-08) |
| 8 | Durable financial outbox and recovery of `unknown` (FND-3, OPS-22) | Y | PG; gate 9.2 |
| 9 | Reconciliation with Twitch (FND-4) | N | Defect FT-69 (LA-02) |
| 10 | Queue deletion with verified cancellation (OPS-22) | Y | TW deletion live; PG; gate 9.2 (live cancel is feature 7) |
| 11 | Viewer chat commands (FND-5) | Y | PG/FX; TW only for `ping` and `conta` (declared) |
| 12 | Command permissions and roles (OPS-3, OPS-7, OPS-9) | Y | QA 10/10 (FX) |
| 13 | Real `ping` latency (OPS-26 slice A) | Y | TW reply 222 ms; equality in the 30 s window unproven (TS-24, class C) |
| 14 | Automatic Twitch reconnection (OPS-8) | Y | QA 9.5 (PG/FX) |
| 15 | Panel setup, overview, health (OPS-6, OPS-15) | Y | BR; gate 9.2 |
| 16 | Panel queue management and lifecycle actions (OPS-15) | Y | BR plus TW queue operations |
| 17 | Panel settings, permission editor, points operations: route/action parity (FT-06, FT-09) | N | LA-01, LA-23; E2E E1 to E8 pending |
| 18 | Localization en/es/pt-BR (FND-8) | Y | QA 9.2 |
| 19 | Account widget renders in native OBS Linux (OPS-13/25 subset) | Y | OBS e2e, gate 9.2 |
| 20 | Widget resilience: API restart, production build, legibility (OPS-25) | N | LA-09 to LA-13 |
| 21 | Widget links and capabilities (FND-7) | Y | QA 9.2; OBS |
| 22 | Queue calls, presence, removed rewards (OPS-11) | Y | QA 10/10 |
| 23 | Reward confirmation at service start (OPS-19) | N | Story In Progress; `@qa` checks at the gate and may convert it to Y |
| 24 | Current Account identity (OPS-18) | Y | TW `conta` equals the widget |
| 25 | First use and update on a clean Linux machine (FT-49) | N | LA-20 |
| 26 | Panel resilience and setup friction (FT-44, FT-66, FT-67) | N | LA-16, LA-17, LA-19 |
| 27 | Operator docs and runbooks (OBS runbook, never `dev:start`, duplicate-refund note) | N | LA-12, LA-14, LA-15, LA-18 |
| 28 | **Windows:** install, update, uninstall (OPS-5, OWN-01..04) | N | Owner run (LB-01); CI smoke uses a fake Docker |
| 29 | **Windows:** panel smoke, persistence, Twitch test channel (OWN-05/06 and checklist) | N | Owner run (LB-02) |
| 30 | **Windows:** OBS Browser Source widget (OWN checklist) | N | Owner run (LB-04) |
| 31 | OPS-31 chat notices, no-show/skip/reorder, widget "next" (FT-71..73) | N | Not built (LA-27) |
| 32 | OPS-31 refund by group: settlement, group lookup, refund at end of service (FT-74..77; FT-78 is its evidence) | N | Not built (LA-28, LA-29) |

**Future, outside the denominator:** SSE (OPS-23), TypeScript/Biome (OPS-24), `status` (OPS-26), calendar (OPS-32), OPS-27 to OPS-30, OPS-14, OPS-16, OPS-17, DOC-2/DOC-3, installer UX (OPS-12, at `rc`), macOS (before `rc`), screen reader (accepted risk).

### (b) "Tested and functional" criterion

A feature earns credit (binary, no half credit) only if all three hold:
1. An independent `@qa` verdict of at least 9.0 covers its scope, or a real test of the class below ran with no failure.
2. The evidence class matches the nature of the feature: money and queue state need **PG**; actions visible on Twitch need **TW** at least once for the family; panel features need **BR**; widget features need **OBS**; Windows features need **WIN** only (Linux evidence never counts for Windows).
3. No known open defect in that feature (example: FT-69 keeps feature 9 at N).

Without a real Windows run, features 28 to 30 stay **N** in the formula. If the owner returns the evidence kit with every item Pass for a feature, it becomes Y; any Fail keeps it N and reopens the corresponding OPS-15 criterion.

### (c) Formula and current percentage

`P = credited features / planned features`. Planned = 32. 80% of 32 = 25.6, so **26 features** are needed. **Current: 19 / 32 = 59.4%** (Y: 1, 2, 3, 4, 5, 6, 8, 10, 11, 12, 13, 14, 15, 16, 18, 19, 21, 22, 24).

**Guard (owner-visible rule proposed here):** the percentage alone does not release the label. Features 7 to 10 (money) and 28 and 30 (Windows install and OBS) must be Y; they cannot sit in the declared-caveat set. Gate target: **at least 28 / 32 (87.5%)**, so one late failure does not drop the launch below 80%.

| Step | Credited | Percentage | Note |
|---|---|---|---|
| Now | 19 | 59.4% | |
| After the agent-only cycles C2 to C5 (+ features 7, 9, 20, 25, 26, 27) | 25 | 78.1% | Still below 80%: agents alone do not get there without OPS-31 or Windows |
| + OPS-31 (features 31, 32) | 27 | 84.4% | Formula passes; the guard still fails without Windows |
| + Windows run by the owner (features 28, 29, 30) | 30 | 93.8% | Declared caveats: features 17 and 23 (6.3%) |

**Why SSE, TypeScript, `status` and OPS-32 stay out:** the formula passes at 84.4% without them, none is a money or guard feature, and each adds change risk before delivery. They are not planned launch features (see "Future"). Any new feature added to the launch set raises the denominator and the number needed.

## 1. Class A — possible here (29 rows)

"Path" = in the minimum path (section 4), with its cycle.

| ID | Source | Open criterion (short) | Owner (agent) | Effort | Risk | Cycle |
|---|---|---|---|---|---|---|
| LA-01 | FT-06 / FT-03, OPS-15, TODO-01/02 | Route/action traceability of the endpoint catalog, parity rows reconciled and the 8 browser E2E (E1 to E8) | `@qa` maps, `@dev` fills gaps | G | Medium | R |
| LA-02 | FT-69 (OPS-22) | Reconciliation returns `partial` / `reward_verification_failed` (404) for a reward the product itself deleted | `@dev`, `@data-engineer` | M | Medium (false financial alarm) | C2 |
| LA-03 | TS-22 (M-2b) | Stabilize `compose-runtime.test.js:1022` (flaky after `page.reload`) | `@dev`, `@qa` | M | Low (gate reliability) | C2 |
| LA-04 | TS-18 (OPS-22) | PG36-16: assert local `isOpen` after a late DELETE (`open_unknown`) or document the semantics | `@dev` | P | Low | C2 |
| LA-05 | TS-19 (OPS-22) | Reproduce the 9 mutations not run (M2, M3, M5, M7, M8, M11, M15, M16, M19) | `@qa` | M | Medium (financial confidence) | C2 |
| LA-06 | FT-55 (D-6) | `twitch_integration_degraded` structured logs on every `degraded` transition (diagnosis only) | `@dev` | P | Low | C2 |
| LA-07 | TS-25 (OPS-22) | Live check of a successful deletion cancellation with a redemption still waiting for refund (test channel) | `@qa` | M | Medium | C3 |
| LA-08 | TS-27 (OWN-13) | Creator rejection of a redemption in the Twitch queue; refund by removing a called entry | `@qa` | M | Medium | C3 |
| LA-09 | FT-64 (N-4) | Check a production build (`next build`) in native OBS, no Next dev badge | `@qa` | M | High (what the streamer shows on stream) | C4 |
| LA-10 | TS-23 (AC-W-3) | Restart the API on the same database; the widget recovers | `@qa` | M | Medium | C4 |
| LA-11 | TS-26 (AC-W-6, DP-4) | Dark and light scenes (status-line legibility in pixels) and the mobile checklist; keyboard run (screen reader excluded, see LB-05) | `@ux-design-expert`, `@qa` | M | Medium | C4 |
| LA-12 | FT-61 (N-1) | State the minimum Browser Source height in the widget form and runbook; status line inside the box | `@ux-design-expert`, `@dev` | P | Low | C4 |
| LA-13 | FT-62 (N-2) | Text shadow or background on the widget status line (needs the owner's OK on the style; a default is proposed) | `@ux-design-expert`, `@dev` | P | Low | C4 |
| LA-14 | FT-63 (N-3) | List the legacy `/overlay.html` URL in the runbook and check whether a queue-name widget exists | `@dev` | P | Low | C4 |
| LA-15 | FT-65 (N-5) | Runbook note: never stream with `dev:start` | `@dev` | P | High if ignored | C4 |
| LA-16 | FT-66 | `dev:start` banner shows `https://localhost:3000`, not `127.0.0.1` | `@dev` | P | Medium (setup friction) | C5 |
| LA-17 | FT-67 | Panel says the session is not valid at `127.0.0.1` instead of the generic text | `@dev`, `@ux-design-expert` | P | Medium | C5 |
| LA-18 | FT-70 | Document that a second redemption by a person with an active entry is refunded automatically (`duplicate_active_entry`) | `@dev` | P | Low | C5 |
| LA-19 | FT-44 (OPS-23) | Read timeout and `AbortSignal` in the panel read requests | `@dev` | M | Medium (hung panel) | C5 |
| LA-20 | FT-49 / OPS-15 AC "dev lifecycle", Linux part | Clean clone and first use on Linux with real Docker: install, start, open, update | `@qa` (`@dev` if it breaks) | M | High (installation) | C5 |
| LA-21 | OPS-15 AC "community catalog" | Install a complete community catalog after image build in a disposable environment; runtime discovery without rebuild; precedence, plurals, 5 s overlay cache | `@qa`, `@dev` | M | Low | R |
| LA-22 | TODO-04 (S-13) | UX review of S-13 with `@ux-design-expert` | `@ux-design-expert` | P | Low | R |
| LA-23 | FT-09, OWN-16..18, TODO-03/05/06/07 | Final independent `@qa` and `@architect` reviews, legacy-test audit repeat, browser checks (focus after saving the queue, 390x844, one-time widget link dialog), AC 10 builds/axe/es-pt-BR, reconcile the unticked boxes of #69 | `@qa`, `@architect`, `@devops` (boxes) | M | Medium | C6, C12 |
| LA-24 | Windows kit (OWN-01..06, OW-01) | Evidence kit and run script for the owner on Windows: exact commands, what to capture, pass/fail table mapped to features 28 to 30; fix whatever the agents can prove wrong without Windows | `@dev`, `@qa`, `@ux-design-expert` (texts) | M | High (the friend uses Windows) | C1 |
| LA-25 | Windows CI (windows-native-plan, risk 4) | `windows-latest` job (`npm ci`, lint, typecheck, `tests/unit`); contract tests for the `.bat` (embedded script decodes, CRLF kept, no hard-coded paths); the native installer smoke with a fake Docker already exists | `@devops`, `@dev` | M | Medium | C1 |
| LA-26 | OPS-31 planning boxes | Design (`@architect`, `@data-engineer`), UX plan >= 9.0, `@qa` test plan | `@architect`, `@data-engineer`, `@ux-design-expert`, `@qa` | M | High (financial) | C7, C8 |
| LA-27 | FT-71, FT-72, FT-73 | Chat notices, no-show/skip/reorder, widget "next" | `@dev` | G | Medium | C9 |
| LA-28 | FT-74..FT-77 | Settlement setting and refund groups, group lookup and scopes with reauthorization, refund at the end of service, "check group" state | `@dev`, `@data-engineer` | G | High (financial) | C10, C11 |
| LA-29 | FT-78 | Real-channel tests of OPS-31 on the test channel | `@qa` | M | High | C12 |

## 2. Class B — blocked (9 open rows, 1 closed)

| ID | Source | Criterion | Blocked by | Unblocked by |
|---|---|---|---|---|
| LB-01 | OPS-15 AC Windows installer, OW-01, OWN-01..04 | **Launch-critical (feature 28).** Windows installer against real Docker (fresh install, update, uninstall, data kept) | Owner run on Windows | The owner runs the kit of LA-24 and returns the table |
| LB-02 | OWN-05/06 and the Windows checklist | **Launch-critical (feature 29).** Panel smoke, persistence after reboot, Twitch test channel on Windows (the developer path `npm run dev` is optional and outside the formula) | Owner run on Windows | Same as LB-01 |
| LB-03 | OPS-15 AC dev lifecycle, D-05, OW-07, FT-50 | `dev` lifecycle, panel and OBS on macOS | Platform (no Mac) | A Mac before `rc` (D-05 = B) |
| LB-04 | OPS-15 AC native OBS/CEF, OPS-25 | **Windows OBS widget is launch-critical (feature 30).** macOS OBS stays before `rc` | Owner run on Windows | Same as LB-01; macOS: a Mac before `rc` |
| LB-05 | OWN-15 / OW-06 | Screen reader on the new UX pieces | No assistive technology | Accepted risk (owner, 2026-11-05); stays recorded, not a gate |
| LB-06 | OW-16, OW-17 | Live check on the owner's real channel (redemption, `ping`) | Owner action | Owner runs the checklist; the test-channel version is LA-07/LA-08 |
| LB-07 | VERSIONING | OK for `v1.0.0-rc` | Owner | Express OK at the bump |
| LB-08 | VERSIONING | OK for `v1.0.0-stable` | Owner | Express OK at the bump |
| LB-09 | Owner question Q1 | **Closed 2026-11-10:** the friend uses Windows, so LB-01, LB-02 and LB-04 are critical path | — | — |
| LB-10 | Handoff owner pending | Delete branch `legacy` (disable the ruleset); GitHub Support removal of old commits by SHA; delete the old edit-history revisions of PR #97 and issue #76 | Owner | Owner actions; hygiene before sharing the repository with the friend |

## 3. Class C — not required for the beta launch (13 rows)

| ID | Source | Criterion | Why it can wait |
|---|---|---|---|
| LC-01 | OPS-23 (D-7 SSE), FT-44 excluded | Event stream replacing polling (4 planning boxes open) | Polling works; SSE improves latency, not correctness. FT-44 (timeouts) is in LA-19 |
| LC-02 | OPS-24, TS-16, OW-13 | TypeScript/Biome migration, JSX typecheck | Internal quality, wide diff, risk of regression right before delivery; zero streamer-visible behavior |
| LC-03 | OPS-26 `status`, TS-24, OW-17 | Streamer `status` command and `ping` live probe | `ping` with real latency already shipped in 0.3.0; `status` is convenience |
| LC-05 | OPS-32 (#117) | Queue cycle calendar, "Old queues" tab (Draft, 7 boxes) | Convenience; owner already marked it a 0.4.0-beta candidate |
| LC-06 | OPS-27 (#104), FT-45/46 | Automatic guard against sensitive-data leaks | Hardening; recommended soon (public repository), not a streamer requirement. See also the credential-leak audit note (research, uncommitted) |
| LC-07 | OPS-28 (#107), FT-47/48 | Wider OpenGrep rules | Hardening |
| LC-08 | OPS-30 (#105), TS-17, FT-51/52 | CI job for the browser E2E scripts | Local `@qa` already runs them; CI only confirms |
| LC-09 | TS-20 | Deadlock probe for the accepted lock-order inversion | Failure mode is a generic 5xx, no hang found |
| LC-10 | TS-21 | `queue: max` in workflows | Workflow hygiene |
| LC-11 | FT-53 | Keep or improve 409 after a 401 read; write the restored-pause limit | Edge case, no defect known |
| LC-12 | FT-54 | UX acknowledgement of the singular deletion texts | Wording |
| LC-13 | FT-56..FT-60 | UX P3: `--danger` color, 10 px text, focus after disable, "reward" wording, es wording | Polish (FT-56 and FT-57 need owner OK) |
| LC-14 | FT-68 | API graceful shutdown under `node --watch` hangs (dev only) | Developer-only |

**Totals:** class A 29, class B 9 open (LB-05 is an accepted risk) plus 1 closed (LB-09), class C 13; 51 rows. OPS-31 moved from class C to class A on 2026-11-10 (owner decision).

## 4. Minimum path to 80% and the beta launch

Principle: first what protects the money; the Windows kit first of all because the owner's run is the long pole and runs in parallel with the agents; then OBS; then installation; then OPS-31; two `@qa` gates (G1 freezes the baseline before OPS-31 touches the financial code, so the credits already earned cannot silently regress; G2 is the launch gate). One agent at a time; no commit before each gate. "R" in the Cycle column of section 1 = declared caveat (not in the path).

| Cycle | Rows | Content | Agents | Effect on P |
|---|---|---|---|---|
| C1 | LA-24, LA-25 | Windows kit (commands, what to capture, pass/fail table), `windows-latest` CI job, `.bat` contract tests. Then **the owner runs it on Windows (blocker, in parallel)** | `@dev`, `@qa`, `@devops` | 0 now; unlocks features 28 to 30 (+3) |
| C2 | LA-02, LA-04, LA-06, LA-03, LA-05 | FT-69 reconciliation, test reliability, mutations | `@dev`, `@data-engineer`, `@qa` | +1 (feature 9) |
| C3 | LA-07, LA-08 | Live refund, cancel, reject, removal paths on the test channel | `@qa` | +1 (feature 7) |
| C4 | LA-09 to LA-15 | Widget in native OBS: production build, restart recovery, legibility, runbook | `@qa`, `@ux-design-expert`, `@dev` | +1 (feature 20) |
| C5 | LA-20, LA-16, LA-17, LA-18, LA-19 | Linux clean install and update, session message, timeouts, docs | `@qa`, `@dev` | +3 (features 25, 26, 27) |
| C6 | **Gate G1** (part of LA-23) | One `@qa` gate with score >= 9.0 on cycles C2 to C5; recompute the table; expected 25/32 | `@qa` | confirms 78.1% |
| C7 | LA-26 | OPS-31 design: `@architect` and `@data-engineer` (model, scopes, refund moment) | `@architect`, `@data-engineer` | 0 |
| C8 | LA-26 | OPS-31 UX plan (>= 9.0) and `@qa` test plan | `@ux-design-expert`, `@qa` | 0 |
| C9 | LA-27 | FT-71, FT-72, FT-73 (chat notices, no-show/skip/reorder, widget "next") | `@dev`, `@qa` for tests | +1 (feature 31) |
| C10 | LA-28 | FT-74, FT-75 (settlement setting, groups, lookup, scopes, reauthorization) | `@dev` (Opus candidate: financial), `@data-engineer` | 0 |
| C11 | LA-28 | FT-76, FT-77 (refund at end of service, "check group" state) | `@dev` | +1 (feature 32, after C12 proof) |
| C12 | LA-29, LA-23 | FT-78 real-channel tests on the test channel, then **Gate G2** (launch gate) | `@qa`, `@architect` | final recompute |

**Effort:** 12 cycles (10 build/test cycles, 2 gates; C7 and C8 are planning). After C6 the agent-only count is 25/32 (78.1%); after C12 it is 27/32 (84.4%); with the owner's Windows run 30/32 (93.8%). C9 to C12 add two features: that is the price of the owner's decision on OPS-31, and it is also what carries the formula past 80% without Windows. Order inside OPS-31 comes from the story groups (A to H).

**Windows: what agents prepare without Windows (C1, LA-24 and LA-25).**
1. An evidence kit in `docs/stories/OPS-15/` (en and pt-BR), built from the existing [Windows plan and checklist](../stories/OPS-15/windows-native-plan.md): exact PowerShell commands for each item (Windows build and Docker Desktop version, hash of the installer `.bat` against the release, `docker ps` and the product volume list before and after update and uninstall, health check of the panel, the OBS Browser Source steps), what to capture (versions, screenshots of the panel and `health` `ok`, command output with tokens, UID and chat text redacted) and a Pass/Fail table mapped to features 28, 29 and 30.
2. A `windows-latest` CI job (`npm ci`, lint, typecheck, `tests/unit`), deferred in the Windows plan until the beta preparation and now due; the native installer smoke with a fake Docker already exists in CI and in Main CD.
3. Contract tests for the `.bat` (the embedded `installer.ps1` decodes, CRLF kept, no hard-coded paths) on top of `tests/unit/windows-native-contract.test.js`; optional static analysis of the PowerShell script, only after the research index is checked.
4. Fixes to anything those checks prove wrong, without a Windows machine.

**C1 delivered (2026-11-10, no Windows machine used; no commit).** Kit: [`windows-validation-kit.md`](../stories/OPS-15/windows-validation-kit.md) (commands, what to capture, PASS/FAIL table OWN-01..06, LB-02, LB-04). CI: new `windows-quality` job in `quality-gates.yml` (`npm ci`, typecheck, Windows contract tests on `windows-latest`), **not yet in the required aggregate** (`quality-gate`) until a real run proves it stable; the native installer smoke already covered install, update and both uninstall policies on `windows-latest` with a fake Docker (unchanged). Tests: `tests/unit/windows-installer-contract.test.js` (22: `.bat` ASCII/CRLF/payload, language, port, menu, callback, no secrets, exit codes, data preservation) and a workflow contract block in `tests/unit/ci-workflow-contract.test.js` (no bash expansion in Windows steps, explicit shell). No installer defect was found. Credit: features 28 to 30 stay N until the owner returns the table (28 = OWN-01..04, 29 = LB-02-a..c, 30 = LB-04-a..b).

**What only the owner can do (blocker LB-01, LB-02, LB-04):** run the kit on a clean Windows 10/11 with Docker Desktop (WSL 2) and OBS, using the exact installer from the release workflow, and return the filled table. Feature 28 needs the install/update/uninstall items; 29 the panel, persistence and test-channel items; 30 the OBS items. Without the real run these stay N.

## 5. Version milestone, exit criteria and what changes in the documents

**Proposed label: `v1.0.0-beta`** (stage stays `beta`; MAJOR rises inside the beta, as the policy already allows). The owner replaces the old rule ("only when everything is validated") with "at least 80% tested and functional, guard features credited, caveats declared". Orion decides the bump and `@devops` executes it after the `@qa` verdict (alpha/beta authority); `rc` and `stable` follow with the owner's express OK each.

**What changes in the documents (owner decision to be applied by `@po`/`@dev`, then `@qa`, then `@devops`):**
- `docs/VERSIONING.md` and `docs/pt-BR/VERSIONING.md`: replace the sentence that reserves `v1.0.0-beta` for "everything validated and functional (including Windows, macOS, native OBS, and live Twitch evidence)" with the 80% rule and a link to this ledger; update "Current release plan" to the `1.0.0` target with the MAJOR justification (launch milestone chosen by the owner); keep: rc/stable bumps need the owner's express OK, macOS before `rc`.
- `AGENTS.md`, section "Política de bumps de versão" (authoritative; it prevails): same replacement. The contract tests that quote the old sentence (`documentation-contract`, version policy tests) are updated in the same change.
- At the bump `@devops` sets `1.0.0` in `package.json`, `package-lock.json` and tracked `VERSION`; `.release-stage` stays `beta`.
- `CHANGELOG-beta.md` and `docs/pt-BR/CHANGELOG-beta.md`: a new `## v1.0.0-beta` heading at the top (newest first), mirrored, categories with colored squares; a "Known limits" list that publishes the declared caveats (features not credited, macOS, screen reader, no SSE, no `status`, no calendar) and the measured percentage; a `> [!WARNING]` block only if OPS-31 changes a default behavior that was already released (decided at G2). Release notes reuse this section.

**What `@qa` validates at the launch gate (G2):**
1. Recompute the 32-row table with evidence per feature; `P >= 80%` and target >= 87.5%; the guard features (7 to 10, 28, 30) are Y; separate evidence by class (FX, PG, BR, OBS, TW, WIN) and list unrun checks.
2. OPS-31 real test on the test channel (refund by group, no-show/skip/reorder, widget "next") and no regression in the financial features (rerun of the PG battery and of the mutations of OPS-22).
3. Score >= 9.0; quality gates green (`npm run lint`, `typecheck`, `npm test`, `validate:localization`, `validate:version`, `validate:port-denylist`, `review:static`).
4. VERSIONING, AGENTS.md and both changelogs in parity and consistent with the contract tests; no secret, no session URL, no other project mentioned.
5. Preview and active data preserved (no `dev:stop` without `--keep-data`; disposable PostgreSQL for tests).

**Depends on the owner:** the Windows run (LB-01, LB-02, LB-04); the OK for `v1.0.0-rc` and `v1.0.0-stable`; the macOS result before `rc` (D-05) or an explicit waiver; the live check on the real channel before `stable` (LB-06); the style default of LA-13 if he wants another. If the Windows run is not returned, the formula can still pass (84.4%) but the guard fails: the launch needs the owner's explicit waiver recorded in the story, and the changelog must say that Windows is untested.

## 6. Owner questions

- **Q1:** answered 2026-11-10 (Windows).
- **Q2:** answered 2026-11-10 (OPS-31 enters the beta).
- **Q3:** `legacy` and old-commit clean-up stay with the owner; blocks nothing (LB-10).
- **Q4 (new, optional):** accept the two-gate plan (G1 and G2)? Recommended, because OPS-31 touches the financial code after the baseline is credited; with a single gate the cycles drop by one but a regression would surface only at the end.

## 7. Dependencies and notes

- C1 first so the owner can run Windows while agents work; C6 depends on C2 to C5; C7 to C12 depend on C6; G2 depends on C12 and on the Windows run (or waiver).
- OPS-31 (#115) is Ready (`@po` GO 8.7); its planning boxes (`@architect`, `@data-engineer`, `@ux-design-expert`, `@qa`) are open and form C7 and C8. FT-75 may require new Twitch scopes and a reauthorization by the streamer: the UX plan must cover it.
- Authorizations used: native OBS and the SubaruShogun test channel (2026-11-05); no Windows (owner run), no macOS, no screen reader.
- This ledger is a plan; no verdict is claimed. `@qa` and `@architect` run their own checks.

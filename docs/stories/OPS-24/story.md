# OPS-24 — Convert the backend to TypeScript and migrate lint from ESLint to Biome

[Português (pt-BR)](../../pt-BR/stories/OPS-24/story.md)

**Status:** Ready (`@po` GO 2026-10-27, see [po-validation.md](po-validation.md)). Implementation only after `@po` GO, the planning gates below, an issue created by `@devops`, and the sequencing rules in "Dependencies". **Issue:** #91 (created by `@devops`; no issue comments).
**Source:** owner decisions of 2026-10-27 (below); `@analyst` research note [typescript-migration-research.md](../OPS-15/typescript-migration-research.md) (slices TS-0..TS-5, risks, Q7 rule locations, Q8 Biome); `@architect` study [backend-migration-study.md](../../process/backend-migration-study.md) (hardening plan H-01..H-09, "do not rewrite in another language").
**Related:** OPS-15 (cutover must not freeze); OPS-22 (financial recovery — goes first, owns the bug that motivated typing); OPS-23 (SSE — waits only for TS-0 and TS-2, see "Dependencies"); OPS-21 (panel API contract — shares `http/*` and `queue-repository`); FT-01 and FT-28 (frontend write set touched by the Biome formatting commit).
**Coordination required:** `$aiox-po` (validation, rule wording), `$aiox-architect` (tsconfig/strict layout, Biome rules, owner-rule text in `AGENTS.md`), `$aiox-data-engineer` (only to confirm that `queue-repository` splitting and Prisma types change no schema or migration), `$aiox-analyst` (open items below, if any), independent `$aiox-qa`, `$aiox-devops` (issue, CI workflow). `$aiox-ux-design-expert`: not applicable, no user-facing change (see "UX note").

## Problem

The defects found in the live battery (a Twurple getter that does not exist, `error.status` where Twurple throws `statusCode`, test fakes that are plain objects instead of library classes) are **type-boundary defects that the repository's own checker is configured not to catch**: `tsconfig.json` has `strict: false`, the adapter parameters carry no JSDoc types, and only 92 JSDoc tags exist across 7,524 lines in 45 backend files ([study](../../process/backend-migration-study.md), section 2). The `@architect` study rejected a rewrite in another language (10 to 24 person-weeks, freezes OPS-15/OPS-20/OPS-21, no Twitch library as complete as Twurple 8.2.0) and the `@analyst` note verified the cheaper route: Node 24.20.0 runs `.ts` directly (type stripping, stable since 24.12.0), TypeScript 7.0.2 is already the native fast compiler, and Docker already runs the API as source.

Two tooling facts shape the work (note, sections 0, Q5 and Q8):

- `typescript-eslint` cannot run on TypeScript 7 (no programmatic API; `npm ci` fails on the peer range), so linting `.ts` with ESLint would force a second compiler. The owner therefore also chose **Biome** (lint and formatting in one binary) and `tsc --noEmit` as the type gate.
- Three config surfaces silently ignore `.ts` today: the Vitest `include` (`tests/**/*.test.{js,jsx}`), the ESLint globs, and both OpenGrep rules (`languages: [javascript]`). A converted file could be neither tested, linted nor scanned and the gates would still be green. Closing these is part of the first slice, not a follow-up.

## Owner decisions (2026-10-27)

1. The backend (`apps/api`) moves to **TypeScript**, without a rewrite in another language. Docker stays mandatory.
2. Lint moves from **ESLint to Biome** (lint and formatting) together with the conversion.
3. Order: typing and financial recovery (**OPS-22**) before the SSE (**OPS-23**). The conversion **must not freeze the OPS-15 cutover**.
4. Approved technical route: run `.ts` directly on Node 24.20.0 (type stripping, no build step) with `tsc --noEmit` as the gate; lint with Biome plus `tsc`; no `typescript-eslint`.
5. Changing the "JavaScript ESM with JSDoc" rule in `AGENTS.md` is an owner decision, **already taken on 2026-10-27**. This story therefore does not need a new owner decision to change it; it lists where the text lives (below) so `@architect` applies it in slice TS-0.

## Story

As the owner who maintains this bot with AI agents,
I want the backend converted incrementally to TypeScript with strict checking per converted folder and with Biome as the single linter and formatter,
so that a wrong library property, a wrong error shape or a fake that does not match the real class fails the compiler or the contract test instead of failing on a live stream, without freezing the OPS-15 cutover.

## Scope

**In (six slices, one PR each, in this order; names follow the research note, inventory IDs FT-30..FT-35):**

- **TS-0 — Tooling.** `tsconfig` flags for `.ts` plus a strict config for converted folders; Biome replacing ESLint (parity first, then one isolated formatting-only commit); OpenGrep scanning `.ts`; Vitest including `.ts`; audit of `validate:*` scripts and `.dockerignore`; the rule and documentation updates; one canary file through Docker and CI.
- **TS-1 — `apps/api/src/twitch/*`** (11 files, 1,332 lines) strict, typed over real Twurple classes, contract tests with real instances. Absorbs study items **H-02** (typed adapter) and **H-03** (contract tests with real instances).
- **TS-2 — `apps/api/src/outbox/*`** (5 workers) strict.
- **TS-3 — `apps/api/src/http/*`** routes strict, with JSON Schema type provider on the five highest-value routes (start of **H-05**).
- **TS-4 — `apps/api/src/persistence/queue-repository`** (2,460 lines), possibly split by aggregate first (H-07) without behavior change.
- **TS-5 — the rest** (`domain/`, `commands/`, `observability/`, root files `server`, `runtime*`, entry switch in `start-product.mjs`) and flipping `strict: true` globally for `apps/api`.

**Out of scope:**

- A rewrite in another language, NestJS, a bundler, a `dist/` build or `tsx` in production (route A of the note only).
- `apps/frontend` (Next) and `apps/shared` as TypeScript; the frontend rule stays as is ([front-end-architecture.md](../../front-end-architecture.md) line 13) and `apps/shared` is its own later decision. Biome does lint and format `apps/frontend` and `tests/` because ESLint covered them.
- Moving Prisma to the newer `prisma-client` generator (not recommended in the note).
- Changing behavior, routes, schema, migrations, user-visible text or panel contract. Every slice is behavior-preserving; fixes found by strict mode are separate, test-first changes recorded in the slice.
- Moving OpenGrep security rules into Biome; the OpenGrep scanner stays the only static reviewer (owner decision).
- Typescript-eslint type-aware rules (re-evaluate only when it supports the TS 7 API, issue #10940 upstream).
- Version bump, commit, push, PR, release, cutover.

## Acceptance criteria

Evidence classes stay separate: unit, isolated PostgreSQL with real migrations, Docker build and installer smoke, CI. Every behavior starts with a failing test (Red-first); tooling slices prove each gate with a deliberately planted violation before relying on it.

### Slice TS-0 — Tooling

1. **Given** `tsconfig.json` and `tsconfig.api.json`, **when** the flags are updated (`apps/**/*.ts` and `tests/**/*.ts` included, `allowImportingTsExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `noEmit`; `allowJs` and `checkJs` kept) and a second `tsconfig.api.strict.json` is added (`extends` root, `strict: true`, `include` limited to converted folders), **then** `npm run typecheck` runs both configs and a seeded type error in a converted file fails it.
2. **Given** Vitest `include` is `tests/**/*.test.{js,jsx,ts}`, **when** a `.test.ts` file with a failing assertion is added, **then** `npm test` runs and fails it; the transform time on the real suite is measured and recorded (the note marks it UNVERIFIED).
3. **Given** Biome is installed with an exact version pin and a `biome.json` that maps the repo's `eslint.config.js` (recommended set, unused variables ignoring `_`-prefixed names, the `**/web/*` and `**/web/**` restricted-import pattern scoped to `apps/frontend` and `apps/shared` with its message, ignores for `.next`, `out`, `coverage`), **when** `npm run lint`, `lint:api`, `lint:infra` and `lint:web` run, **then** they use Biome with warnings as errors, keep the same script names (so `.github/workflows/quality-gates.yml` lines 29 and 48 stay unchanged), and the current tree passes with zero findings or each delta against ESLint is documented in the slice evidence.
4. **Given** a seeded `../web/x.mjs` import in `apps/frontend`, **when** lint runs, **then** the restricted-import rule fails it (the rule must be proven on relative imports, which the note marks PARTIAL).
5. **Given** the parity check, **when** ESLint is removed, **then** `eslint`, `@eslint/js` and `eslint.config.js` are gone, `tests/unit/quality-script-contract.test.js` (line 8 "JSDoc-aware no-emit typecheck") and `tests/unit/ci-workflow-contract.test.js` (if it asserts `eslint`) are updated test-first, and the lockfile installs cleanly with `npm ci`.
6. **Given** the nursery rules `noFloatingPromises` and `noMisusedPromises`, **when** they are enabled on `apps/api` only, **then** they run at `warn` level as an experiment; promotion to `error` needs one slice with no false positives, recorded by `@qa`. They must not break `--error-on-warnings` gates, so `@architect` decides how the experiment is reported (open question 3).
7. **Given** `.opengrep/rules.yml` lists `languages: [javascript, typescript]` on both rules, **when** `npm run review:static` runs on a `.ts` fixture that contains a planted violation, **then** it reports the finding and exits non-zero; without the planted violation it exits zero. The fixture lives where the real scan will not report it as a project finding (location fixed by `@dev` and `@qa`).
8. **Given** the formatter is configured to the dominant current style measured on the repo (single quotes, semicolons, 2 spaces, line width), **when** `biome format --write` is run, **then** it is **one isolated, formatting-only commit** with no logic change, its hash is added to `.git-blame-ignore-revs`, and `git diff -w` or the test suite proves no behavior change. It is not created before the sequencing condition in "Dependencies" is met.
9. **Given** the canary `apps/api/src/twitch/credential-fingerprint.mjs` converted to `.ts` with its importers changed in the same slice, **when** the Docker image is built and started with `node apps/infra/scripts/start-product.mjs` on `node:24.20.0-alpine3.24`, **then** the API starts and the installer smoke passes; `.dockerignore` does not exclude `*.ts`; `prisma generate` runs before `tsc` in CI (the note marks both UNVERIFIED). CI evidence needs push authorization (OW-13); until then the evidence is local Docker and is recorded as such.
10. **Given** the `validate:localization`, `validate:version` and `validate:port-denylist` scripts, **when** they are audited, **then** any extension glob that would skip `.ts` is fixed test-first and the audit result is recorded.
11. **Given** the rule text, **when** the documentation list in "Rules and documents to update" is applied, **then** every listed file and line is updated in English and pt-BR (where a pt-BR twin exists), the documentation-contract tests pass, and `AGENTS.md` records that backend `apps/api` is TypeScript with erasable syntax run by Node type stripping while the rest stays JavaScript ESM with JSDoc until migrated.

### Slice TS-1 — `twitch/*`

12. **Given** the 11 files of `apps/api/src/twitch/*`, **when** they are converted to `.ts` with `import type` for types and `.ts` import specifiers, **then** they pass `tsconfig.api.strict.json` with `strict: true` and no `@ts-nocheck`, `@ts-ignore` or untyped `any` at the Twurple, Fastify or Prisma boundaries.
13. **Given** the adapter reads a redemption status, **when** it reads a property that `HelixCustomRewardRedemption` does not have, **then** `tsc` fails. This is proven by a deliberate compile-error test or fixture and closes H-02. (If OPS-22 slice 1, FT-24, has already fixed the mapping in JavaScript, this slice types that code; it does not re-fix it.)
14. **Given** a test helper in one file that builds real `HelixCustomRewardRedemption` instances from recorded raw Helix JSON (`new HelixCustomRewardRedemption(raw)`, with `client` passed through `as unknown as` only where a method that needs it is exercised), **when** the twitch tests run, **then** they use real Twurple instances instead of plain-object fakes for Twurple types (H-03), asserting round trips with `getRawData`. Fakes elsewhere are typed `Pick<RealClass, ...>` so an invented property fails `tsc`.
15. **Given** `@twurple/*` is pinned at 8.2.0, **when** the helper depends on the `@private` constructor, **then** a test fails if a minor upgrade changes the constructor signature, and the helper stays in a single file.
16. **Given** the error classification function from OPS-22 slice 1, **when** it is converted, **then** it narrows on `instanceof HttpStatusCodeError` so `statusCode` is the only accessible field after the check.

### Slice TS-2 — `outbox/*`

17. **Given** the five outbox workers, **when** converted, **then** they pass strict, the outbox state values and operation types are string-literal unions, and a `switch` over them ends with a `never` exhaustiveness check that `tsc` enforces.
18. **Given** the PostgreSQL integration tests of the outbox (leases, attempts, `unknown`, retry), **when** they run after the conversion on isolated PostgreSQL with real migrations, **then** they pass unchanged (behavior-preserving).

### Slice TS-3 — `http/*`

19. **Given** the `http/*` route files, **when** converted, **then** they pass strict, and the five routes chosen by `@architect` (first candidates: the ones OPS-21 and OPS-22 change most) use `@fastify/type-provider-json-schema-to-ts` with `as const` schemas that validate input and output and type the handler, re-applied in each encapsulated plugin scope.
20. **Given** an unexpected error on any converted route, **when** it is thrown, **then** the safe error contract is unchanged: localized generic text with `referenceId`, no message, stack or internal data (a test per converted route group).
21. **Given** the OPS-21 error-`code` guard and idempotency tests, **when** the slice lands, **then** they pass unchanged.

### Slice TS-4 — `queue-repository`

22. **Given** `persistence/queue-repository.mjs` (2,460 lines), **when** `@architect` and `@data-engineer` decide whether to split it by aggregate first, **then** a split (if chosen) is its own behavior-preserving PR with the PostgreSQL integration suite green before and after, and the conversion follows.
23. **Given** the converted repository, **when** it passes strict, **then** Prisma calls use the generated client types (no generator change, no schema or migration change), and the full PostgreSQL integration suite passes with real migrations.
24. **Given** strict mode surfaces latent errors, **when** one reveals a real defect, **then** it is recorded and fixed test-first as a separate change with its own Red test, never hidden by a cast or suppression.

### Slice TS-5 — Remainder and global `strict`

25. **Given** all remaining `apps/api` files are `.ts`, **when** `strict: true` is set in the root config for `apps/api` and `checkJs` is dropped for it, **then** `npm run typecheck` is green, `tsconfig.api.strict.json` is merged away, and no `@ts-nocheck` remains in `apps/api`.
26. **Given** the entry files are converted, **when** `start-product.mjs` points to the `.ts` entry, **then** the Docker image, Compose stack and installer smoke start the product unchanged.
27. **Given** the whole slice set, **when** the final gates run, **then** the numbers recorded are: lines and files converted, `strict` error count per folder at the start of each slice, JSDoc tags remaining, and the Vitest and `tsc` timings before and after.

## Dependencies

- **Depends on:** `@po` GO and issue; OPS-22 slices (FT-24, FT-25, FT-26) merged before the slices that touch the same files (below); owner authorization for push/PR (OW-13) for the CI evidence of AC 9.
- **Order against OPS-22 and OPS-23 (owner decision 3):** OPS-22 first. TS-0 can start in parallel with OPS-22 only if its write set does not overlap (it touches config, docs and one canary file, not `twitch/*`). TS-1 starts after FT-24 (same `helix-adapter` and `reconciliation` files); TS-2 after FT-25 and FT-26 (`financial-worker`, `reward-worker`); TS-4 after FT-26 (deletion changes `queue-repository`). **OPS-23 (FT-27..FT-29) waits only for TS-0 (FT-30) and TS-2 (FT-32, because FT-27 makes the outbox workers emit notifications).** TS-3 (FT-33) and FT-27 are ordered by `@architect` on `http/*` (never two `@dev` agents on the same files); TS-1 (FT-31) runs after FT-24 independently of OPS-23; TS-4 (FT-34) and TS-5 (FT-35) never block OPS-23 or the cutover. Reason: honors "typing before SSE" for the files SSE touches without letting 5 to 7.5 person-weeks hold a cutover dependency (owner decision 3). Correction required by `@po` ([po-validation.md](po-validation.md)); confirmation by the owner is pending (OD-24-3).
- **Coordination with FT-28 and FT-01:** the Biome formatting commit rewrites `apps/frontend`, which FT-01 (page polish) and FT-28 (shared provider) edit. The formatting commit runs **after or between** those branches merge, never while they are open, and is isolated with a `.git-blame-ignore-revs` entry. If the sequencing is not possible before the cutover, the fallback is Biome as linter only first and the formatter later (note, Q8).
- **Coordination with OPS-21:** FT-11..FT-16 change `queue-routes.mjs` and the Next client; TS-3 is ordered against them (one write set at a time).
- **Does not block the OPS-15 cutover.** Nothing in FT-10, FT-09 or OW-11 depends on this story; if a conflict appears, the cutover wins and the TypeScript slices wait.
- **Is a dependency of:** nothing in the cutover; H-04 and H-05 of the study are absorbed here.

## Risks

(Numbers follow the research note, Q6.)

1. **ESLint and TypeScript 7 incompatibility** blocks linting `.ts`. Mitigation: Biome plus `tsc` (decision 4); typescript-eslint is not added.
2. **Import-path regressions** (`.mjs` to `.ts`) that tests do not cover. Mitigation: one folder per PR, importers changed in the same PR, full `npm test` and a Docker smoke test per slice.
3. **Strict mode surfaces many latent errors**, especially in `queue-repository`, so TS-4 may run long. Mitigation: error count measured per folder before each slice (a read-only `tsc` run by `@qa`), optional split first, no suppression comments.
4. **OpenGrep silently not scanning `.ts`**, giving false confidence in `review:static`. Mitigation: AC 7 plants a violation in a `.ts` fixture before any file is converted.
5. **CI time:** `tsc` 7 is fast; the heavy parts remain Docker PostgreSQL and `next build`. Mitigation: measure in AC 27.
6. **`@private` Twurple constructor** in the test helper could change in a minor release. Mitigation: AC 15, one helper file, pinned 8.2.0.
7. **Formatting commit conflicts** with every open branch and hides blame. Mitigation: isolated commit after or between open OPS-15 branches, `.git-blame-ignore-revs`, tests prove no logic change.
8. **Biome's type-aware coverage is smaller than typescript-eslint** (no equivalents listed for `await-thenable`, `switch-exhaustiveness-check`, `no-unsafe-*`; the two promise rules are nursery). Mitigation: `tsc` strict and the `never` convention carry the type checks; the nursery rules start as warnings.
9. **Type stripping accepts only erasable syntax and does no type check.** Mitigation: `erasableSyntaxOnly`, and `tsc` is a mandatory CI gate (a green `node` run proves nothing about types).
10. **Delivery pressure:** this work competes with the cutover and OPS-22/OPS-23 for the same files and the same single owner review. Mitigation: the dependency order above; every slice is independently shippable and can pause between slices.

## Complexity (estimate by `@sm`, to be confirmed by `@architect`)

Scope 5, integration 3, infrastructure 4, knowledge 3, risk 4 = **19 → COMPLEX (GG)**. Priority **P2** (approved follow-up that must not block the cutover; it is not a P0/P1 dependency of FT-10). Difficulty **GG** overall; effort per the note (UNVERIFIED): TS-0 **G** (1 to 1.5 person-weeks including Biome), TS-1 **G** (1 to 1.5), TS-2 **M** (0.5), TS-3 **G** (1 to 1.5), TS-4 **G** (1 to 1.5), TS-5 **M** (0.5 to 1). Total about 5 to 7.5 person-weeks, of which about 2 to 3 were already planned as H-02, H-03 and H-05.

## Business value

The bug class that left financial operations in `unknown` and blocked queue deletion becomes a compile-time error instead of a live-stream incident (estimated 0.5 to 1.5 person-weeks per incident in the study). AI agents get fast, native compiler feedback and one tool for lint and format, with the runtime model (Node plus Docker, source in the image) and the Twitch layer unchanged.

## Test plan (test-first)

1. **Canary until Docker and CI:** TS-0 converts one small file and proves the whole chain (tsc, Vitest, Biome, OpenGrep, Docker build and start, installer smoke, CI) before any folder is converted.
2. **Gate proofs by planted violation:** a type error (tsc), a failing `.test.ts` (Vitest), a lint violation and a `../web/x.mjs` import (Biome), a rule violation in a `.ts` fixture (OpenGrep). Each gate must fail on the plant and pass without it.
3. **Biome parity:** `biome lint` on the current tree compared with `eslint` before ESLint is removed; deltas listed and accepted by `@qa`.
4. **Helper with real Twurple instances:** unit tests assert getters on instances built from recorded Helix payloads, and a test detects a changed `@private` constructor.
5. **Behavior preservation:** unit suite per slice; PostgreSQL integration (isolated instance, real migrations, never SQLite or Prisma mocks) for TS-2 and TS-4; Compose and installer smoke for TS-0 and TS-5.
6. **Gates before closing each slice:** `npm run lint`, `npm run typecheck` (both configs), `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist`, `npm run review:static` (OpenGrep only; record command, result and accepted findings), plus the Docker build. If `format:check` is added, it joins the list and `@architect` updates the quality-gate list in `AGENTS.md` and `CLAUDE.md`. `@qa` runs the final independent gates and issues the verdict before `@devops` commits.

## Rules and documents to update (slice TS-0)

From the `@analyst` note, Q7 (VERIFIED by `grep` on 2026-10-27, re-checked by `@sm` the same day). Changing `AGENTS.md` is the owner's decision, already taken on 2026-10-27 (decision 5); `CLAUDE.md`, `.claude/CLAUDE.md` and `.aiox-core/constitution.md` contain no occurrence of the rule and need no change.

| File:line | Current text (short) | Change |
|---|---|---|
| `AGENTS.md:111` | "JavaScript ESM com JSDoc" (stack) | "TypeScript (erasable syntax, run by Node type stripping) for `apps/api`; JavaScript ESM with JSDoc elsewhere until migrated". `@architect` writes it. |
| `docs/CONTRIBUTING.md:12` | "Keep product code JavaScript ESM with JSDoc. Do not introduce TypeScript, a transpiler…" | Rewrite: backend `apps/api` may be TypeScript with no transpiler; frontend rule unchanged. |
| `docs/pt-BR/CONTRIBUICAO.md:12` | Same, pt-BR | Same, pt-BR. |
| `docs/fullstack-architecture.md:7` | "Product runtime is JavaScript ESM…" | Update for the TypeScript backend. |
| `docs/pt-BR/fullstack-architecture.md:7` | Same, pt-BR | Same, pt-BR. |
| `docs/front-end-architecture.md:13` | Browser source stays JS ESM with JSDoc; Next "does not authorize TypeScript application code" | Frontend scope: keep; at most add that the backend rule is separate. |
| `docs/pt-BR/front-end-architecture.md:13` | Same, pt-BR | Same, pt-BR. |
| `docs/architecture.md:28` | Prisma `prisma-client-js` "pinned to preserve JavaScript generation" | Still valid; reword the reason (typed client already generated, no generator change needed). |
| `docs/pt-BR/architecture.md:28` | Same, pt-BR | Same, pt-BR. |
| `docs/process/backend-migration-study.md:19,91` (assumption A3 and "rule adherence"); also lines 9, 71, 72 and 156 ("no `.ts` yet") | Assumption A3 and the "keeps JS + JSDoc" decision | Add a note that the owner decision of 2026-10-27 supersedes it. |
| `docs/pt-BR/process/backend-migration-study.md:19,91` (same lines; also 9, 71, 72, 156) | Same, pt-BR | Same, pt-BR. |
| `tests/unit/quality-script-contract.test.js:8` | "JSDoc-aware no-emit typecheck" | Update wording and expectations together with the rules, test-first. |
| `tests/unit/ci-workflow-contract.test.js` | assertions on `eslint`, if any | Update test-first (AC 5). |
| `docs/research-index.md` (row 22 and the type-stripping row) and pt-BR | "Node type stripping" PARTIAL | `@analyst` upgrades to VERIFIED (not `@sm`). |
| `package.json`, `eslint.config.js`, `.opengrep/rules.yml`, `vitest.config.js`, `tsconfig*.json`, `.dockerignore`, `.git-blame-ignore-revs`, `biome.json` | tooling | Implementation files, listed by `@dev` in the File List. |

Changelogs of the stage are updated in English and pt-BR together before any commit (project rule).

## Planning gates before implementation

- [x] `@analyst` research: [typescript-migration-research.md](../OPS-15/typescript-migration-research.md) (2026-10-27; Node, TS 7, Fastify, Prisma, Twurple, Biome verified; the "only a test confirms" list is covered by the ACs above).
- [x] `@architect` study: [backend-migration-study.md](../../process/backend-migration-study.md) (2026-10-27).
- [x] Owner decisions recorded (2026-10-27), including the `AGENTS.md` rule change.
- [x] `@po` validation (10 points) and GO (9.0/10, 2026-10-27); `@po` also confirms that no UX gate applies (see "UX note").
- [ ] `@architect`: tsconfig and strict layout, which five routes get schemas (TS-3), split or not of `queue-repository` (TS-4), reporting of the nursery rules, text for `AGENTS.md`, order against FT-27 and OPS-21 slices.
- [ ] `@data-engineer`: confirm that splitting `queue-repository` and typing Prisma calls need no schema or migration change.
- [ ] `@qa` test plan (planted-violation proofs, Biome parity method, isolated PostgreSQL, evidence separation) and the read-only `tsc --strict` error count per folder.
- [x] `@devops` creates the GitHub issue: parent issue #91 exists; slices as sub-issues just-in-time and reviews the workflow impact (script names unchanged); no issue comments.
- [ ] Owner: schedule of the formatting commit relative to open OPS-15 branches (open question 1); OW-13 for the CI evidence.

## UX note

No user-facing text, route or behavior changes; slices are behavior-preserving, so the mandatory `@ux-design-expert` gate is not planned. `@po` confirms this at validation. If a slice ends up changing visible text, that change is moved to its own story.

## Open questions (for `@po` / `@architect` / owner)

1. When is the Biome formatting commit scheduled: before the OPS-15 branches still open (conflicts) or after they merge? Recommended: after or between them, otherwise formatter later.
2. Is `format:check` added to the quality-gate list in `AGENTS.md`, `CLAUDE.md` and CI, or does `biome check` inside `lint` cover it? (Changing the gate list is an `@architect` and owner matter.)
3. How are the nursery promise rules reported without breaking `--error-on-warnings`: a separate script, or enabled at `error` only after a clean slice?
4. Does `apps/shared` follow the backend later, or stay JavaScript with the frontend? Not decided here.
5. [AUTO-DECISION] Inventory IDs: the research note names the slices TS-0..TS-5, but the inventory already uses TS-01..TS-12 for test items, so the inventory uses FT-30..FT-35 for these slices (reason: avoid two different IDs reading almost the same). The story keeps the note's names.

6. **Owner decisions pending (from the `@po` validation, 2026-10-27):**
   - **OD-24-1:** formatting enforced through `lint` (`biome check` after the formatting commit, no new gate name; recommended) vs a separate `format:check` gate. (Answers question 2.)
   - **OD-24-2:** window of the formatting-only commit: first window with no open branch on `apps/`, after FT-26 and FT-01/FT-28 merge and before the cutover freeze, hash in `.git-blame-ignore-revs`; if no window exists, the formatter waits until after the cutover (TS-0 ships Biome as linter only). (Answers question 1.)
   - **OD-24-3:** OPS-23 waits only for TS-0 and TS-2 (recommended; see "Dependencies").
   - **OW-13:** push authorization for the CI evidence of AC 9.

## Definition of Done

- ACs 1 to 27 have recorded Red-first evidence by class; for AC 9 the CI part is either executed after OW-13 or explicitly recorded as pending by the owner.
- All quality gates green after each slice, ESLint removed, `.ts` is linted, tested, type-checked and scanned (proved by planted violations), `AGENTS.md` and the listed documents updated in English and pt-BR.
- `@qa` verdict recorded; File List and checklists updated; no behavior change attributable to the conversion.

## SM draft validation (story-draft-checklist, 2026-10-27)

1. Goal and context: clear (defect class, owner decisions, relation to OPS-15, OPS-22, OPS-23). PASS.
2. Technical guidance: route, flags, packages, files and folder sizes named from the `@analyst` note; open design points assigned to `@architect`. PASS.
3. References: point to the note sections (Q1..Q8) and the study. PASS.
4. Self-containment: slices, order, formatting-commit handling, rule locations and the unverified items stated; unknowns listed as open questions. PASS.
5. Testing: classes separated; planted-violation proofs; PostgreSQL real; CI evidence dependent on OW-13 stated. PASS.
6. Static analysis: `npm run review:static` recorded; OpenGrep stays the only reviewer; `.ts` coverage is an AC. PASS.
- Result: ready for `@po`. No requirement was invented; effort figures are the note's UNVERIFIED estimates and are marked as such.

## File List

- `docs/stories/OPS-24/story.md` (new)
- `docs/pt-BR/stories/OPS-24/story.md` (new)
- `docs/stories.md` (index entry)
- `docs/pt-BR/stories.md` (index entry)
- `docs/process/backlog-inventory.md` and pt-BR (items ST-17, FT-30..FT-35)
- `docs/process/kanban-board-design.md` and pt-BR (board load and hierarchy)

Implementation files will be listed here by `@dev` after the gates.

## Change Log

- 2026-10-27 — `@sm` (River): story drafted from the `@analyst` TypeScript/Biome research, the `@architect` backend study and the owner decisions of 2026-10-27. Status Draft.
- 2026-10-27 — `@po` (Pax): `*validate-story-draft` 10 points = 9.0/10, **GO**. Issue #91 registered. Status Draft → Ready. UX gate confirmed not applicable. Required fix before OPS-23 starts: state which TS slices precede OPS-23 (see [po-validation.md](po-validation.md)); `format:check` and formatting-commit recommendations recorded there.
- 2026-10-27 — `@sm` (River): "Dependencies" corrected as required by `@po` (OPS-23 waits only for TS-0 and TS-2; TS-3 and FT-27 ordered by `@architect`); planning-gate boxes for `@po` GO and issue #91 ticked; open questions 1-2 and OD-24-1..3 recorded as owner decisions pending. No AC, title or scope changed.

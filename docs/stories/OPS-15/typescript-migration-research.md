# OPS-15: Incremental Backend Migration to TypeScript (research note)

[Português brasileiro](../../pt-BR/stories/OPS-15/typescript-migration-research.md)

- Author: `@analyst` (Atlas). Date: 2026-10-27. Desk research plus a read-only inspection of the repository. No code was changed.
- Trigger: the owner decided on 2026-10-27 that the backend (`apps/api`) **moves to TypeScript**. Docker stays mandatory, there is no rewrite in another language, the change is incremental, the OPS-15 cutover is not frozen, and the setup must give AI agents fast compiler feedback.
- Golden rule: research-index row 22 (`docs/process/backend-migration-study.md`) was read first and is reused for the measurements (7,524 lines in 45 files, 92 JSDoc tags, `strict:false`) and for the H-01..H-09 hardening plan. Its "Node type stripping" row was PARTIAL. This note upgrades that row to VERIFIED and covers only what was missing.
- Labels: **VERIFIED** means an official source or the repository/`node_modules` code. **PARTIAL** means a secondary or incomplete source. **UNVERIFIED** means an inference or estimate.

## 0. Repository facts that change the picture (VERIFIED, read 2026-10-27)

| Fact | Where | Consequence |
|---|---|---|
| `typescript` is **7.0.2**, the native Go compiler | `package.json:79`, `node_modules/typescript/package.json` | Type-checking is already fast. TS 7.0 has **no programmatic API**, so `typescript-eslint` cannot use it (see Q5). |
| `tsconfig.json` sets `allowJs`, `checkJs`, `noEmit`, `module/moduleResolution: NodeNext`, `skipLibCheck`, `strict:false`, and includes only `apps/**/*.js` / `*.mjs` | `tsconfig.json` | `.ts` files are not checked today. `tsconfig.api.json` extends it with `apps/api/**`. |
| The runtime image copies `apps/` as source and runs `node apps/infra/scripts/start-product.mjs`. It has no build step for the API. `prisma generate` runs inside the image. | `Dockerfile` | The image already "runs source". Type stripping keeps that model. |
| Prisma 6.19.3 uses `prisma-client-js`, and its typed client already exists at `node_modules/.prisma/client/index.d.ts` | `docs/architecture.md:28`, `node_modules` | You do not need to change the Prisma generator to get types. |
| Vitest 5.0.3 includes only `tests/**/*.test.{js,jsx}` | `vitest.config.js` | `.test.ts` files would be ignored until the include pattern changes. |
| ESLint flat config covers `apps/**/*.{js,mjs,jsx}` and `tests/**/*.js` only. `typescript-eslint` is not installed. | `eslint.config.js` | `.ts` files would not be linted. |
| Both OpenGrep rules declare `languages: [javascript]` | `.opengrep/rules.yml:3,13` | `.ts` files would probably not be scanned (Q5). |
| `HelixCustomRewardRedemption` has the runtime constructor `(data, client)`. The `.d.ts` inherits the `@private` `DataObject` constructor `(data)`. `@twurple/common` exports `getRawData` and `rawDataSymbol`. | `node_modules/@twurple/api/lib/endpoints/channelPoints/HelixCustomRewardRedemption.{js,d.ts}`, `node_modules/@twurple/common/lib/DataObject.*` | Contract tests can build real instances from raw JSON without network access (Q3). |

## Q1. Node 24.20.0 type stripping, and whether to run `.ts` directly or compile

**VERIFIED** ([Node.js v24 docs, "Modules: TypeScript"](https://nodejs.org/docs/latest-v24.x/api/typescript.html), read 2026-10-27):

- Type stripping was added in v22.6.0 and enabled by default in v23.6.0. It stopped printing the experimental warning in v24.3.0 and became **stable (Stability 2) in v24.12.0**. On 24.20.0, `node file.ts` works with no flag. `--experimental-strip-types` is no longer needed. `--no-strip-types` turns the feature off.
- Node replaces types with whitespace and performs **no type checking**, so line and column numbers in stack traces stay the same.
- Unsupported without `--experimental-transform-types`: `enum`, `namespace` with runtime code, parameter properties, and import aliases (`import x = …`). Decorators fail to parse. `.tsx` is unsupported.
- File extensions are mandatory in imports (`import './x.ts'`). Type-only imports must use `import type` (match it with `verbatimModuleSyntax`).
- Node **ignores `tsconfig.json`**, so `paths` and downlevelling do not apply. It refuses `.ts` under `node_modules`.
- Recommended config (TS ≥ 5.8): `target: esnext`, `module: nodenext`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `rewriteRelativeImportExtensions`, and optionally `noEmit`. When `.ts` is only executed (never emitted), `noEmit` + `allowImportingTsExtensions` lets `tsc` accept `.ts` specifiers. `rewriteRelativeImportExtensions` only matters if you emit `.js`.
- The page gives no explicit production recommendation. It points to `tsx` for full `tsconfig` support.

**TypeScript 7.0** ([announcement, 2026-07-08](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)): native port with typical full-build speedups of about 8–12x. It ships no programmatic API. The compatibility package `@typescript/typescript6` (a `tsc6` executable) lets it run side by side. PARTIAL for details: secondary sources ([Visual Studio Magazine](https://visualstudiomagazine.com/Articles/2025/12/02/Microsoft-Gets-Real-on-Native-TypeScript-Remake.aspx), [TS 7 progress, Dec 2025](https://devblogs.microsoft.com/typescript/progress-on-typescript-7-december-2025)) say JS emit was "not fully ported", `strict` became the default, and `@enum`/`@constructor` JSDoc support was dropped.

| Option | Pros | Cons for this project |
|---|---|---|
| **A. Run `.ts` directly (type stripping) + `tsc --noEmit` as the gate** | No build step, and the Dockerfile stays almost the same (`COPY apps` already ships source). Stack traces keep their line numbers. The same files run in dev, tests and production. There is no new dependency, and agents get the fastest feedback loop (native `tsc`). | Only erasable syntax is allowed (no `enum`/parameter properties/decorators). Types are never checked at runtime, so CI **must** run `tsc`. Imports need `.ts` extensions. Some startup cost to strip types (UNVERIFIED, expected small). |
| B. Compile with `tsc` to `dist/` | Standard and familiar. | TS 7 emit completeness is PARTIAL. It adds a build stage, `dist/` path changes to `start-product.mjs`, installer and tests, plus source maps. |
| C. Bundle with `esbuild`/`tsup` | Fast, and gives one artifact. | New dependencies. Bundling Prisma's generated client and native engines is a known source of friction (UNVERIFIED for 6.19.3). Stack traces depend on source maps. It also changes the "runs source" model the installer relies on. |

**Recommendation:** Option A, run directly with `erasableSyntaxOnly`, and make `tsc --noEmit` the compile gate. Revisit only if a non-erasable feature is required (it should not be: Fastify, Prisma and Twurple need no decorators).

## Q2. Incremental migration

- **Coexistence (VERIFIED by config semantics, PARTIAL for TS 7 behavior):** keep `allowJs` + `checkJs`, add `apps/**/*.ts` to `include`, and add `allowImportingTsExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `noEmit`. At runtime Node lets an `.mjs` file import `./x.ts` (the extension is explicit). A converted file's importers must change `./x.mjs` → `./x.ts` in the same slice. `skipLibCheck` stays on.
- **Conversion order:** edge adapters first, because that is where the bug class lives (Twurple getters, `statusCode` vs `status`). Go `apps/api/src/twitch/*` (11 files, 1,332 lines), then `outbox/*` (5 workers), then `http/*` routes with schemas (H-05), then `persistence/queue-repository.mjs` (2,460 lines, last because it is the largest), then `domain/`, `commands/`, `observability/`, and finally the root files (`server.mjs`, `runtime*.mjs`). `apps/shared` is used by the Next frontend, so treat it as its own decision (OPS-15 frontend owners).
- **The 92 JSDoc tags:** when a file moves to `.ts`, turn `@param {T}` / `@returns {T}` / `@typedef` into TS annotations, `type` and `interface`. Keep descriptive JSDoc text. In files not yet converted, leave JSDoc alone. TS 7 still checks it (with `@enum` and `@constructor` dropped, PARTIAL).
- **Strict per module:** recommended is a second config, `tsconfig.api.strict.json` (`extends` root, `strict: true`, `include` = converted folders only), plus `npm run typecheck` running both configs. Converted folders then never regress, while the rest stays `strict:false`. Project references need `composite` and declaration emit, which is heavier than this repo needs (UNVERIFIED for TS 7 with `noEmit`). Use `// @ts-nocheck` only as a short, tracked exception, never as a slice's exit state. The flip happens when every file is converted: root `strict: true`, drop `checkJs` for `apps/api`.

## Q3. Vitest with TypeScript

- Vitest transforms `.ts` through Vite without type-checking (PARTIAL; general Vitest behavior, not re-read for 5.0.3). Change `include` to `tests/**/*.test.{js,jsx,ts}`. Transform cost per file is expected to be small next to Docker PostgreSQL setup (UNVERIFIED, so measure it). Type errors in tests are caught by `tsc` only if `tests/**/*.ts` is in a tsconfig `include`. Add it.
- `vi.mock`: use `vi.mocked(fn)` for typed mocks. Prefer typing fakes as `Pick<RealClass, 'used' | 'members'>`. A fake that invents a property then fails `tsc`, which is the H-02/H-03 goal.
- **Real Twurple instances without network (VERIFIED in `node_modules`):** `HelixCustomRewardRedemption` extends `DataObject`. The runtime constructor is `(data, client)` and stores `data` under `rawDataSymbol`. Its getters read only raw data. The `.d.ts` exposes only the inherited `@private` constructor `(data)`. So in a test helper, build one with `new HelixCustomRewardRedemption(rawJson)` from a recorded Helix response (`HelixCustomRewardRedemptionData` shape), and pass `client` through an `as unknown as` constructor cast only if a method such as `getUser()` is exercised. Assert round-trips with `getRawData(instance)`. Risk: the constructor is `@private` and could change in a Twurple minor version. Keep the helper in one file and pin `@twurple/*` at 8.2.0 (row 9 trigger).

## Q4. Prisma, Twurple, Fastify

- **Prisma (VERIFIED in repo):** `prisma-client-js` already generates `index.d.ts`. You need no generator change, no Dockerfile change (`prisma generate` already runs in the runtime stage) and no installer change. CI `typecheck` needs `prisma generate` to have run before `tsc` (check `quality-gates.yml`; the jobs run `npm ci`, and whether the client's postinstall generates there is UNVERIFIED). Moving to the newer `prisma-client` generator (TS output, required `output`, `importFileExtension`) is optional and **not recommended** now. Its docs describe Prisma 7, where `prisma-client-js` is deprecated ([Prisma generators](https://www.prisma.io/docs/orm/prisma-schema/overview/generators), PARTIAL for 6.x).
- **Twurple 8.2.0:** written in TypeScript and ships `.d.ts` (VERIFIED in `node_modules`). These are first-class types.
- **Fastify 5.12.5:** first-class types. Official type providers ([Fastify Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/), VERIFIED) are `@fastify/type-provider-json-schema-to-ts`, `-typebox`, and `-zod`, used via `Fastify().withTypeProvider<…>()`. You must re-apply it in each encapsulated plugin scope. With json-schema-to-ts, schemas stored in variables need `as const`. For H-05, use **json-schema-to-ts**: it keeps plain JSON Schema (Fastify-native validation, no new runtime schema library), and the same schemas validate routes and give request/reply types. Start with the 5 high-value routes named in the study.

## Q5. Project tooling

| Tool | Change needed | Evidence |
|---|---|---|
| `npm run typecheck` / `typecheck:api` | Add `apps/**/*.ts` (and `tests/**/*.ts`) to `include`, add the flags from Q1, and add the strict config from Q2 | VERIFIED (config read) |
| ESLint (superseded by Q8: owner prefers Biome) | Needs `@typescript-eslint/parser` for `.ts`. **Blocker:** typescript-eslint has no TypeScript 7 support. `npm ci` fails on its peer range (`<6.1.0`), and the maintainers say to run TS 6 alongside TS 7 ([issue #12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518), closed 2026-08-10 as duplicate of #10940). Options: install TS 6 under the name `typescript` for the linter and keep TS 7 as `tsc` via an alias or `@typescript/typescript6`, or use a linter that does not need the TS API (not researched). The exact package layout needs a test in the repo. | VERIFIED (issue) / PARTIAL (workaround layout) |
| OpenGrep (`review:static`) | In Semgrep's language table, `javascript` covers `.js/.jsx` and `typescript` covers `.ts/.tsx` ([Semgrep rule syntax](https://semgrep.dev/docs/writing-rules/rule-syntax)). Add `typescript` to `languages` in both rules, then prove it with a `.ts` fixture. | PARTIAL (OpenGrep inherits Semgrep syntax, not tested) |
| `validate:*` scripts | Not inspected in depth. Any extension glob (`.mjs`) in `validate-localization` would miss `.ts`, so grep them in slice 0. | UNVERIFIED |
| `npm test` / coverage | Change the Vitest `include`. Coverage includes `.ts` once tests import it (PARTIAL). | PARTIAL |
| `npm run build` / `docker compose build` | With option A, nothing changes except import paths and the entry file in `start-product.mjs` once `server`/`runtime` are converted. `.dockerignore` must not exclude `*.ts`. | VERIFIED (Dockerfile) / UNVERIFIED (`.dockerignore`) |
| Contract tests | `tests/unit/quality-script-contract.test.js:8` asserts a "JSDoc-aware" typecheck, so update its wording and expectations together with the rules (Q7). | VERIFIED |

## Q6. Cost, order and risks (estimates are UNVERIFIED)

Basis: the study's measurements. A sizeable part overlaps with H-02/H-03/H-05, which were already planned.

| Slice | Scope | Estimate (person-weeks with agents) |
|---|---|---|
| TS-0 | Tooling: tsconfig flags + strict config, Biome (Q8), OpenGrep `typescript`, Vitest include, validate-script audit, rule/doc updates (Q7), contract test. Convert 1 small file (`twitch/credential-fingerprint.mjs`) as a canary through Docker build + CI. | 0.5–1 (+0.5 Biome) |
| TS-1 | `twitch/*` (11 files, 1,332 lines) strict, typed over real Twurple classes, contract tests (absorbs H-02/H-03) | 1–1.5 |
| TS-2 | `outbox/*` (5 workers) strict | 0.5 |
| TS-3 | `http/*` routes + json-schema-to-ts on the top 5 routes (start of H-05) | 1–1.5 |
| TS-4 | `persistence/queue-repository` (2,460 lines), possibly split into files first | 1–1.5 |
| TS-5 | `domain/`, `commands/`, `observability/`, root files, entry switch, global `strict: true` | 0.5–1 |
| **Total** | | **≈5–7.5** (about 2–3 of that already sits inside H-02/H-03/H-05) |

Each slice is its own PR. Run it after the OPS-15 cutover-critical work, or in parallel if the write sets don't overlap (check them against open OPS-15 branches).

Risks:

1. ESLint/TS 7 incompatibility blocks linting `.ts`; resolved by moving to Biome (Q8).
2. Regressions from import-path renames (`.mjs` → `.ts`) that tests don't cover. Mitigation: one folder per PR, plus a full `npm test` and a Docker smoke test.
3. Strict mode surfaces many latent errors in `queue-repository`. That's the point of strict mode, but it can make TS-4 run long.
4. OpenGrep silently not scanning `.ts`, which would give false confidence in `review:static`.
5. CI time: `tsc` 7 is fast, so the extra cost is small. The heavy parts are still Docker PostgreSQL and `next build` (study §).
6. The `@private` Twurple constructor in test helpers.

## Q7. Where the "JavaScript ESM with JSDoc" rule lives (VERIFIED, `grep` on 2026-10-27)

| File:line | Text (short) | Action for `@po`/`@sm` |
|---|---|---|
| `AGENTS.md:111` | "JavaScript ESM com JSDoc" (stack) | Change to "TypeScript (erasable syntax, run via Node type stripping) for `apps/api`; JS ESM with JSDoc elsewhere until migrated" |
| `docs/CONTRIBUTING.md:12` | "Keep product code JavaScript ESM with JSDoc. Do not introduce TypeScript, a transpiler…" | Rewrite (backend TS allowed, no transpiler for the API) |
| `docs/pt-BR/CONTRIBUICAO.md:12` | Same in pt-BR | Same |
| `docs/fullstack-architecture.md:7` and `docs/pt-BR/fullstack-architecture.md:7` | "Product runtime is JavaScript ESM…" | Update |
| `docs/front-end-architecture.md:13` and pt-BR `:13` | Browser source stays JS ESM with JSDoc and Next "does not authorize TypeScript…" | Frontend scope. Keep or decide separately. |
| `docs/architecture.md:28` and pt-BR `:28` | Prisma `prisma-client-js` "pinned to preserve JavaScript generation" | Still valid with option A. Reword the reason. |
| `docs/process/backend-migration-study.md:19,91` and pt-BR | Assumption A3 | Note that the owner decision supersedes it |
| `tests/unit/quality-script-contract.test.js:8` | "JSDoc-aware no-emit typecheck" | Update with TS-0 |
| `CLAUDE.md`, `.claude/CLAUDE.md`, `.aiox-core/constitution.md` | **No occurrence** of the rule (`.claude/CLAUDE.md:87` only says "TypeScript/JavaScript best practices") | No change needed |

## Q8. Biome instead of ESLint (owner preference, 2026-10-27)

Repo facts (VERIFIED): `eslint` 10.12.0 + `@eslint/js` 10.0.1, no Prettier. `eslint.config.js` has 54 lines. Scripts are `lint`, `lint:api`, `lint:infra`, `lint:web`, all with `--max-warnings=0`. CI `quality-gates.yml` runs `npm run lint:${{ matrix.app }}` (line 29) and `npm run lint` (line 48). There is no `.vscode/` folder. `apps/frontend` and `tests/` are linted.

**Biome status (VERIFIED, [Biome blog](https://biomejs.dev/blog/)):** v2.6 released 2026-10-15 (v2.5 2026-06-05, about 500 rules and cross-file linting). It is a linter + formatter in one binary for JS/TS/JSX/ESM/JSON. It does **not** use the TypeScript compiler, so it avoids the TS 7 / typescript-eslint blocker in Q5 entirely (inference: Biome has its own parser and inference engine).

**Type-aware rules (VERIFIED, rule pages):** Biome has its own type inference engine, enabled by the **Types** domain, which also turns on the project scanner. [`noFloatingPromises`](https://biomejs.dev/linter/rules/no-floating-promises/) (since v2.0.0) and [`noMisusedPromises`](https://biomejs.dev/linter/rules/no-misused-promises/) (since v2.1.0) exist. Both are **nursery** ("experimental, behavior can change"), default severity *information*, with unsafe fixes. The [rule-sources page](https://biomejs.dev/linter/rules-sources/) lists no Biome equivalent for `await-thenable`, `no-unnecessary-condition`, `switch-exhaustiveness-check`, `restrict-template-expressions`, or the `no-unsafe-*` family. How complete Biome's inference is compared with the TS checker is UNVERIFIED. Expect fewer findings than typescript-eslint.

**Domains (VERIFIED, [Domains](https://biomejs.dev/linter/domains/)):** domains auto-enable from dependencies. **Next** (next ≥ 14) gives `noImgElement`, `noHeadElement`, `useInlineScriptId`, `noDocumentImportInPage`, and more. **React** gives `useHookAtTopLevel` (= rules-of-hooks) and `useExhaustiveDependencies` ("inspired by" exhaustive-deps, so options may differ), `useJsxKeyInIterable`, and more. **Test** (vitest) also auto-enables. `@next/next/no-html-link-for-pages` has no equivalent listed. Note that the repo does **not** use `eslint-config-next` or react-hooks plugins today (VERIFIED, `eslint.config.js`), so Biome's Next/React domains *add* coverage rather than replace it.

**Rule-by-rule map of the repo's `eslint.config.js`:**

| Current ESLint rule/setting | Biome | Status |
|---|---|---|
| `eslint.configs.recommended` (core recommended set) | `linter.rules.recommended: true` | Mostly equivalent (most core rules mapped; full parity not confirmed). PARTIAL |
| `no-unused-vars` with `argsIgnorePattern: '^_'` | `noUnusedVariables` (Biome ignores `_`-prefixed names by default; UNVERIFIED for exact args semantics) | Equivalent |
| `no-restricted-imports` with `patterns.group ['**/web/*','**/web/**']` + message (OPS-15 S-03, scoped to `apps/frontend` + `apps/shared`) | [`noRestrictedImports`](https://biomejs.dev/linter/rules/no-restricted-imports/) with `patterns: [{ group, message }]` (gitignore-style), scoped with `overrides[].includes` | Equivalent. `**/web/*` matching relative imports must be tested. PARTIAL |
| `globals` (node/browser lists) | Not needed. Undeclared-variable checks come from `noUndeclaredVariables` (off by default) and `tsc` | Use `tsc` |
| `ignores` (`.next`, `out`, `coverage`) | `files.includes` with `!` negations | Equivalent |
| `ecmaFeatures.jsx`, `sourceType: module` | Native | Equivalent |

**OpenGrep:** independent of the linter, so it stays the only static reviewer (owner rule). Add `typescript` to `languages` as in Q5. Do not try to move OpenGrep security rules into Biome (GritQL plugins exist but are a different, unneeded scope).

**Formatting:** Biome replaces Prettier (the repo has none). To avoid churn, do this:

1. Configure the formatter to match the dominant current style (single quotes, semicolons, 2 spaces, line width, as measured on the repo).
2. Run `biome format --write` in **one isolated, formatting-only commit**, with no logic changes.
3. Add that commit to `.git-blame-ignore-revs`.
4. Run it after or between open OPS-15 branches merge, because formatting conflicts with every open branch.

The alternative is to enable `linter` only first and the formatter later.

**Scripts/CI/IDE:** `lint*` → `biome lint <paths> --error-on-warnings` (or `biome check` for lint + format). Add `format:check` (`biome format` without `--write`) or use `biome ci` in CI (the official CI-oriented command, PARTIAL: not re-read). CI lines 29/48 keep the same script names, so the workflow YAML can stay unchanged if script names stay. Update `tests/unit/quality-script-contract.test.js` and `ci-workflow-contract.test.js` if they assert `eslint`. Remove `eslint`, `@eslint/js` and `eslint.config.js`. Pin `@biomejs/biome` exactly. VS Code: the official `biomejs.biome` extension (formatter + diagnostics), optionally in `.vscode/extensions.json`.

**Recommendation: Biome + `tsc --noEmit` (strict per module, Q2) as the type gate.** Do not add typescript-eslint. It is blocked by TS 7.0.2 (Q5), and keeping a TS 6 copy only for linting adds a second compiler and peer-range friction. Enable the nursery rules `noFloatingPromises` and `noMisusedPromises` **only on `apps/api` (`overrides`) at `warn` level as an experiment**, and promote them to `error` after one slice shows no false positives. Unhandled promises are a real risk in the outbox/Twitch workers. Re-evaluate typescript-eslint type-aware rules (`await-thenable`, `switch-exhaustiveness-check`, `no-unsafe-*`) only when it supports the TS 7 API (issue #10940). Covering `switch-exhaustiveness-check` with a `never` check in `tsc` is a coding convention, not a lint rule.

**Order and cost (UNVERIFIED estimate):** Biome goes **first, inside TS-0** (+0.5 person-week): linter migration and parity check (lint the current tree with zero findings, or document deltas), then the isolated format commit. Every `.ts` file created afterwards is then born formatted and linted, and the TS-0 tooling blocker disappears. Total remains about 5–7.5 person-weeks.

## Only a test in the project environment confirms

- That `node` 24.20.0 in `node:24.20.0-alpine3.24` starts the converted canary from `start-product.mjs`, and the Docker build plus installer smoke test still pass.
- That TS 7.0.2 accepts the mixed `.mjs` → `.ts` imports with `allowImportingTsExtensions` + `checkJs`, plus how many errors the strict config produces per folder.
- The working ESLint layout with TS 6 + TS 7 side by side under `npm ci` (lockfile, peer ranges).
- That OpenGrep with `languages: [javascript, typescript]` flags a seeded violation in a `.ts` fixture.
- That CI `typecheck` sees the generated Prisma types, and the Vitest transform time on the real suite.
- That `new HelixCustomRewardRedemption(raw)` getters return the expected values for a recorded payload.
- Biome parity: `biome lint` over the current tree vs `eslint` findings, `noRestrictedImports` blocking a seeded `../web/x.mjs` import in `apps/frontend`, false-positive rate of the nursery promise rules on `apps/api`, and diff size of the formatting commit.

## Sources (accessed 2026-10-27)

- [Node.js v24 — Modules: TypeScript](https://nodejs.org/docs/latest-v24.x/api/typescript.html) (VERIFIED)
- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) (VERIFIED headline, via search excerpt)
- [Progress on TypeScript 7, December 2025](https://devblogs.microsoft.com/typescript/progress-on-typescript-7-december-2025) and [Visual Studio Magazine](https://visualstudiomagazine.com/Articles/2025/12/02/Microsoft-Gets-Real-on-Native-TypeScript-Remake.aspx) (PARTIAL)
- [typescript-eslint issue #12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518) (VERIFIED)
- [Fastify Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/) (VERIFIED)
- [Prisma generators](https://www.prisma.io/docs/orm/prisma-schema/overview/generators) (PARTIAL; v7 page)
- [Semgrep rule syntax, language table](https://semgrep.dev/docs/writing-rules/rule-syntax) (PARTIAL for OpenGrep)
- [Biome blog (v2.6, 2026-10-15)](https://biomejs.dev/blog/), [Domains](https://biomejs.dev/linter/domains/), [noFloatingPromises](https://biomejs.dev/linter/rules/no-floating-promises/), [noMisusedPromises](https://biomejs.dev/linter/rules/no-misused-promises/), [noRestrictedImports](https://biomejs.dev/linter/rules/no-restricted-imports/), [Rule sources](https://biomejs.dev/linter/rules-sources/) (VERIFIED)
- Repository: `package.json`, `tsconfig*.json`, `Dockerfile`, `vitest.config.js`, `eslint.config.js`, `.opengrep/rules.yml`, `node_modules/@twurple/*` (VERIFIED)

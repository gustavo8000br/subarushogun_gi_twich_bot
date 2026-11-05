# Development guide

[Português brasileiro](pt-BR/DESENVOLVIMENTO.md) · [Back to README](../README.md)

Current version: `0.3.0-beta`. Platform status (2026-10-21): validated by a person on Ubuntu Linux only; Windows is planned; **macOS has not been validated** (CI runs only the installer smoke on `macos-15`).

## 1. Requirements

- Node.js `24.20.0` (pinned in `package.json`; do not switch) and npm.
- Docker Engine/Desktop with Compose v2 (disposable PostgreSQL, Compose checks).
- OpenGrep `1.30.0` on `PATH` for the static-analysis gate.
- Twitch credentials are not needed for the automated suite.

## 2. Run everything

```sh
npm ci                     # once after cloning or when the lockfile changes
npm run dev                # same as npm run dev:start
```

`npm run dev` checks Node, dependencies and Docker, starts an isolated PostgreSQL, snapshots before migrations, then starts Fastify (API only, `127.0.0.1:${APP_PORT:-3109}`) and the Next.js panel with HTTPS and hot reload at `https://localhost:${NEXT_DEV_PORT:-3000}`. **Always open `https://localhost:3000`, never `127.0.0.1`** (the dev HTTPS origin used for session and CSRF validation is `localhost`). The OBS overlay is the Next `/overlay` route (there is no `/overlay.html`).

| Command | What it does |
|---|---|
| `npm run dev` / `npm run dev:start` | API + Next + disposable PostgreSQL (see above) |
| `npm run dev:stop` | stops the dev processes **and deletes the dev database volume** (snapshots in `.local/dev-db/backups/` are kept) |
| `npm run dev:stop -- --keep-data` | stops the processes and only the `db` container; keeps volumes |
| `npm run dev:db:start` / `dev:db:stop` | start or stop only the dev database (keeps data) |
| `npm run build` | builds the deployable image (`compose.yaml` + `compose.build.yaml`) |
| `npm run build:frontend` | builds the Next.js frontend alone |

Details worth knowing:

- The dev database is bound to host port `55432`, in a Compose project named `queuebot-dev-<last 28 characters of the checkout path>`. Two checkouts ending in the same text must set different `DEV_COMPOSE_PROJECT` values (lowercase letters, digits, `-`, `_`; up to 63 characters). Password and snapshots live in `.local/dev-db/`, separate from the product `compose.yaml`.
- First run creates the ignored `.env.product.local` from `.env.product.example` (never overwritten). An explicit `DATABASE_URL` skips Docker and automatic migrations: use only a disposable database. Set `APP_PORT` and `FASTIFY_DEV_ORIGIN` together to change the API port.
- Next proxies `/api/*`, `/overlay/api/*`, `/health` and `/callback` to Fastify (`apps/frontend/scripts/dev-proxy-config.mjs`). In Codespaces, forward port `3000`; the dev configuration accepts the exact Codespaces host. Restart after changing the dev origin or the Next config.
- `dev:stop` refuses to remove anything unless the file is `compose.dev.yaml` at the repository root, the project has the `queuebot-dev-` prefix and every container/volume carries the matching `com.docker.compose.project` label. With an explicit `DATABASE_URL` it only stops processes.
- Never run `docker compose down -v` unless you mean to delete development data. Local Compose images use `IMAGE_TAG=dev`; never push that tag.

## 3. Test and gates

The `@dev` tests while implementing (test-first: Red, Green, Refactor). The `@qa` runs the full battery independently **once, at the end of the story or bundle**; there is no slice commit before that gate. GitHub CI only confirms what `@qa` already ran.

```sh
npm run lint && npm run typecheck && npm test
npm run review:static                 # OpenGrep, the only static reviewer
npm run validate:version && npm run validate:localization && npm run validate:port-denylist
docker compose config --quiet
npm test -- --run tests/unit/<file>.test.js     # one file
npm run lint:api && npm run typecheck:api       # per area: api, infra, frontend
npm run lint:frontend && npm run typecheck:frontend
```

PostgreSQL guarantees need integration tests on an isolated PostgreSQL with real migrations (never SQLite or Prisma mocks); they provision disposable resources and must not touch the active product volumes.

### Browser scripts (`*-browser-only`)

Fourteen scripts run the panel or overlay in local Chrome against the running Next preview, with every API response intercepted by fixtures. They never write to PostgreSQL, Twitch, Docker or OBS, and they are **not** native OBS/CEF, axe or assistive-technology evidence. Start `npm run dev`, then run one, for example:

```sh
APP_ORIGIN=https://localhost:3000 npm run test:e2e:overlay:browser-only
```

Scripts (all named `test:e2e:<name>:browser-only`, except `overlay:parity-browser-only`): `overlay`, `overlay:parity`, `queue-lifecycle`, `queue-outcome`, `queue-call-resend`, `queue-settings`, `queue-reward-settings`, `manual-entry`, `manual-entry-outcomes`, `queue-reward-resolution`, `queue-creation`, `queue-creation-accepted`, `widget-link`, `panel-layout`. `CHROME_CHANNEL` selects the browser. The separate `npm run test:e2e:overlay` is the full OBS-connected scenario and may create or remove OBS sources and disposable Compose data.

### Native OBS (Linux, Flatpak or not)

Native OBS/CEF and live Twitch checks are run by `@qa` on the owner's test channel, following [the native OBS runbook](stories/OPS-25/obs-native-runbook.md) (scene-collection backup first; Flatpak path `~/.var/app/com.obsproject.Studio/config/obs-studio/basic/scenes/`; no stream start and no real redemption without the owner's explicit OK). Widget links are never written in docs, logs or commits.

## 4. What to do when you change X

| You change | Do |
|---|---|
| Behavior (any code) | Write the failing test first; record the exact command and result in the bilingual story ([Contributing](CONTRIBUTING.md)) |
| Panel or overlay UI | Plan and review with `@ux-design-expert` (minimum 9.0/10); update the matching `*-browser-only` script; localize en, es and pt-BR (`npm run validate:localization`) |
| Database schema | Go through `@data-engineer`; Prisma migration + isolated PostgreSQL integration test |
| Chat commands | Update the command catalog and the three-language messages; keep `ping`/`status` as system commands |
| Scripts, ports, Compose | Update this guide, `README.md`, the pt-BR twin and the contract tests (`tests/unit/documentation-contract.test.js`) |
| Version or changelog | Follow `docs/VERSIONING.md` and `AGENTS.md`; update the changelog in en and pt-BR together; `npm run validate:version` |
| Any doc | Keep en and pt-BR in parity and the links relative |

## 5. Project layout

```text
apps/api/       Fastify API, domain, Prisma schema and migrations
apps/frontend/  Next.js App Router panel and OBS overlay (the only panel; there is no apps/web)
apps/shared/    Modules shared by Next and the API (panel helpers, localization catalogs)
apps/infra/     Compose and operational scripts
tests/          Unit, integration and browser acceptance tests
docs/           Stories, process, research and references (docs/archive keeps long history)
```

## 6. GitHub Codespaces

The Dev Container (`.devcontainer/devcontainer.json`, `post-create.sh`) installs Node.js `24.20.0`, Docker Engine with Docker Compose v2, GitHub CLI, OpenGrep `1.30.0`, Codex CLI `0.161.0` and runs `npm ci`. The Codespace has its own Docker daemon and storage, so it cannot touch volumes on your computer. Open the branch on GitHub, then **Code → Codespaces → Create codespace on …**, and wait for post-create to finish. A 4-core machine is a practical start; stop the Codespace when done. Codex is installed but not signed in: run `codex login --device-auth`, then `codex`. No product data, Twitch tokens or host credentials are copied in. References: [Dev Container configuration](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/adding-a-dev-container-configuration/introduction-to-dev-containers), [Docker-in-Docker](https://github.com/devcontainers/features/tree/main/src/docker-in-docker), [Codex CLI](https://developers.openai.com/codex/cli), [OpenGrep install](https://github.com/opengrep/opengrep/blob/main/INSTALL.md).

## 7. CI and delivery

`compose.yaml` is pull-only runtime configuration used by the installer. [CI](../.github/workflows/ci.yml) runs on pull requests and calls the shared quality gates; main image publication and tagged releases are separate workflows (see the [CI/CD guide](CI-CD.md)). End users install a prebuilt image with the platform installer; maintainers build locally with `npm run build`. Commits, push and PRs belong to `@devops`, after the `@qa` verdict.

## 8. API diagnostic log levels

The API reads `APP_LOG_LEVEL` through Compose (default `info`). Levels, most severe first: `emergency`, `alert`, `critical`, `error`, `warn`, `notice`, `info`, `verbose`, `debug`, `trace`; a threshold includes itself and the more severe ones. Reward-link diagnosis logs aggregate counts at `info` and safe mismatch reason codes at `verbose`; raw Twitch rewards, titles, IDs, prompts, tokens and error messages are never logged.

```sh
APP_LOG_LEVEL=verbose docker compose up -d --force-recreate bot
docker compose logs -f bot
```

PowerShell: set `$env:APP_LOG_LEVEL = 'verbose'` first. Return with `APP_LOG_LEVEL=info docker compose up -d --force-recreate bot`. These commands recreate only the bot service and keep the database and secret volumes.

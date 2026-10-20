# OPS-20 — Simplify development startup and separate runtime from image builds

[Português brasileiro](../../pt-BR/stories/OPS-20/story.md)

**Status:** Backlog — implementation paused to respect the existing project sequence; the current worktree contains unreviewed OPS-20 implementation changes.
**Related:** OPS-5 unified installer; OPS-15 Next.js migration and local development runtime.
**Version policy:** Keep product at `v0.2.0-beta`; no release, version bump, issue, commit, or push in this slice.

## Story

As a developer setting up this project on a new machine,
I want one clear hot-reload command with actionable preflight errors, while the end-user path remains a prebuilt-image installer,
so that development setup is diagnosable without teaching end users Node, npm, source builds, or Docker Compose internals.

## Acceptance criteria

1. After one `npm ci`, `npm run dev` remains the single development entry point and runs Next HTTPS/HMR plus Fastify watch against the checkout-specific disposable PostgreSQL. Before provisioning or migration it checks the pinned Node version, installed project dependencies, and Docker Compose/engine only when managed DB is required.
2. Preflight failures identify the failed prerequisite and exact recovery action (`npm ci`, install/use Node `24.20.0`, start Docker Desktop/Engine with Compose v2, or set an explicitly disposable `DATABASE_URL`). No dependency is silently installed, no user file is overwritten, and no child service/database/migration starts after failed preflight.
3. `compose.yaml` is a pull-only runtime manifest for installers and operators. Local/CI image builds are explicit through `compose.build.yaml`; `npm run build` and quality workflows use both manifests. Runtime exposes only the loopback frontend, keeps API and PostgreSQL private, and preserves the current service order, secrets, and persistent data behavior.
4. Installer packaging continues embedding only runtime configuration, removes source/build settings as before, and its existing lifecycle/data-safety contracts remain unchanged. End users do not need Node/npm, a source checkout, or local product image compilation.
5. English/pt-BR README, development, installation/installer, and architecture guidance agree on the two paths and give the exact development and end-user commands. Development URLs correctly state HTTPS. No claim is made that an unreleased installer or GHCR package is publicly available.
6. Named tests cover preflight order and sanitized actionable diagnostics, Compose runtime/build manifest contracts, installer pull-only packaging, private network/volume boundaries, and bilingual documentation parity. No active development or product database/volume is used for validation.
7. UX review of first-run developer and installer guidance scores at least **9/10** for comprehension and recovery; independent AIOX QA reviews acceptance criteria, tests, and changed docs. This is documentation/CLI onboarding, not a panel UI change.

## UX plan — before implementation

- Audience: developer returning to a fresh Ubuntu checkout and non-technical streamer using the future public installer.
- Developer journey: install the pinned Node version and dependencies once; run `npm run dev`; see one concise progress stream; if startup cannot proceed, receive a specific prerequisite, a copyable recovery command, and a link to the matching guide before any database mutation.
- End-user journey: use the platform installer’s existing **Install / Start** action; choose language/port where prompted; see localized progress and a clear panel URL or recovery guidance. Never ask the streamer to clone source or build the app.
- Information hierarchy: (1) which path applies, (2) one command/action, (3) what is starting, (4) exact error/recovery, (5) safety boundary for local data. Keep API/database implementation detail in developer architecture docs, not user quick start.
- Failure states: missing/wrong Node, missing `node_modules`, unavailable Compose CLI/daemon, and explicit external DB selection are distinct. Never show raw stack traces, secrets, connection strings, or database contents.
- Accessibility/readability: plain language, short numbered actions, copyable commands, text labels rather than color-only status, equivalent EN/pt-BR content.
- UX gate: **9.2/10 conceptual plan** for single-command development, pre-mutation diagnostics, and installer/source separation. This score is for the approved design plan only; implementation review and cold-start usability check must be recorded separately before the story is Ready for Review.

## Architecture and data coordination

- Runtime topology is unchanged: frontend is the only host-published service; API remains private and handles Twitch/domain/persistence; PostgreSQL is private and stores streamer-provided state locally.
- `compose.yaml` remains the installer’s source of truth and must not require source/build context. `compose.build.yaml` adds only local build context/args for `bootstrap`, `migrate`, and `bot`.
- No schema, migration, credentials, active database, or active volume changes. Dara owns review of this boundary and confirms validation uses no product data.
- Preserve active `npm run dev`, its `.next` directory, and its checkout-specific Compose DB/volume.

## Validation plan

- TDD for preflight and Compose/package contracts; focused tests first.
- `npm run lint`, `npm run typecheck`, `npm test`, localization/version checks, static analysis if installed, `docker compose config --quiet`, `docker compose -f compose.yaml -f compose.build.yaml config --quiet`, and `git diff --check`.
- Build-only validation may use the explicit build manifest; do not run Compose `up`, migrations, volume cleanup, or dev-server restart against the active preview.
- Independent QA records a scoped verdict and score; no claim of public installer availability, platform cold-start acceptance, or full OPS-15 gate closure.

## File list

- To be updated by `$aiox-dev` during implementation.

## Change log

| Date | Change | Author |
|---|---|---|
| 2026-10-20 | Created bilingual implementation story from the owner-approved development/end-user flow; documented UX-first plan, pull-only runtime/build split, and active database safety. | `$aiox-sm` |

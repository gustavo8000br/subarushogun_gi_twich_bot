# QA slice after G1 (2026-11-13) - `@qa` (Quinn)

**Verdict: CONCERNS. Score 9.1/10** (minimum 9.0 met). Scope: the uncommitted tree on top of the 7 G1 commits (G1-3, G1-4, Dependabot, runbook 0.1 / D-5). No code was changed by QA; scratch files lived in `.local/qa-audit/post-g1/` and were deleted.

## Battery (one full run, idle machine, Node 24.20.0)

| Gate | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` (disposable PostgreSQL via Docker) | **198 files, 2171 passed, 12 skipped, 0 failed**, 128 s. The 12 skips are the same 12 PowerShell-container tests as in G1 (no PowerShell image here); +5 tests vs G1 (4 compose + 1 panel) |
| `validate:localization` / `validate:version` / `validate:port-denylist` | exit 0 / 0 / 0 |
| `npm run review:static` (OpenGrep) | exit 0, 0 findings, 153 files |
| `actionlint` plain | only the known `queue: max` message (`main-cd.yml:27`, `release.yml:15`); with CI's `-ignore` it is clean (exit 0). Workflows are untouched |
| `zizmor --pedantic .github/workflows` | 15 findings, 0 medium, 0 high (same as G1, exit 12 = low) |
| `git diff --check` on all changed files | clean |
| Secrets / session URL / client names on the added lines | none (only `apiClient` matched "client") |

## Real restart test (Docker 29, own Compose project `qapostg1restart`, port 3991, image `main`)

- `docker inspect`: `db` and `bot` = `unless-stopped`; `bootstrap` and `migrate` = `no`.
- **Finding about the method:** `docker kill` (any signal, including SIGKILL) and `docker stop` go through the Docker API and mark the container as manually stopped, so they are **not** restarted. This is the behavior the owner wants ("docker stop manual is respected"), but it also means `docker kill` is not a crash simulation. Verified: after `docker kill -s QUIT` and after `docker kill`, both stayed `exited`.
- **Real crash** (signal sent from inside the container, so Docker sees a process exit): `db` `kill -QUIT 1` and `bot` `kill -9` of the node process. Both came back, `RestartCount=1`, and both reached `healthy` in under 10 s.
- `docker stop` (and `compose stop`) manual: stayed stopped for 12-15 s, not resurrected.
- `compose down --volumes --remove-orphans`: 7 resources removed, then no container, volume or network of the project remained, so the policy cannot bring them back.
- Cleanup: the project, its volumes and network are gone; temp cert/catalog dirs removed. The old install (`subarushogun-gi-twitch-queue-bot-*`: 4 containers Exited 5 weeks, 2 volumes) was not touched.
- Not tested: reboot / Docker daemon restart (needs sudo); applying the policy to an existing install (needs `up -d` to recreate the containers; the old containers have no policy).

## Mutations (run on a copy, original untouched)

All killed: db `restart` removed (restart-policy test red), bot `restart` changed to `always` (red), `docker-compose` Dependabot entry removed (contract test red, plus the unrelated docs-dependent test that only fails in the docs-less copy), panel-shell guard changed to `true` (G1-3 test red: `expected <h2 id="migration-title"> to be null`).

## Runbook 0.1 (D-5), en and pt-BR

Faithful and no invented command: the CA paths match `docs/INSTALLATION.md:55,74` and `installer.sh:376`; the relative links resolve; the Windows `Import-Certificate` statement matches the guide; the symptom, versions (OBS 32.2.2, `obs-browser` 2.26.9, CEF 127.0.6533.120, TLS 1.3, `secure`) match `docs/integrations.md:80`. en and pt-BR have the same 7 items.

## Findings

1. **CONCERN, runbook 0.1 step 3 (both languages, line 19):** it says the 2026-10-06 trust worked by importing into "the NSS database of the user that runs OBS". The evidence (`docs/integrations.md:80`) says the CA went into **"a temporary CEF NSS profile"**, removed afterward. Not the same thing. Also `~/.pki/nssdb` exists on this machine (mtime 2026-10-06) but holds no certificates (checked read-only), and `certutil` is not installed. Proposed text: "On 2026-10-06 the CA was imported into a **temporary CEF NSS profile** (not the regular user store) and removed afterward; which store OBS reads by default, and the import command, were not recorded."
2. **GAP (not a defect): TLS trust in OBS not validated now.** Step 3 gives no command (by design), `certutil` is missing, and improvising one is forbidden. Registered as not validated; step 7 of the runbook already says so.
3. **Minor, zizmor on `.github/dependabot.yml`:** 4 medium `dependabot-cooldown` findings (2 pre-existing, 2 from the new entries). CI does not run zizmor on that file; optional `cooldown` later.
4. **Nit:** the brief cites `compose.yaml:15,47`; the lines are 16 and 48.
5. **Doc suggestion:** note in the changelog / handoff that existing installs get the policy only after `docker compose up -d` recreates `db` and `bot`.

## Ready groups for `@devops`

1. G1-4: `compose.yaml` + `tests/unit/compose-restart-policy.test.js` (ready).
2. Dependabot: `.github/dependabot.yml` + `tests/unit/ci-workflow-contract.test.js` (ready).
3. G1-3: `panel-shell.jsx` + `tests/unit/next-overview-panel.test.jsx` (ready).
4. Runbook 0.1 (en + pt-BR) + the OPS-15 story File List increments: ready **after** the one-sentence fix in finding 1 (`@dev`/`@po` text only).

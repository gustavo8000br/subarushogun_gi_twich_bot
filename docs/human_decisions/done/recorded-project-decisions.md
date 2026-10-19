# Recorded project decisions

**Status:** Done — no new owner choice requested.
**Português:** [Decisões de projeto registradas](../../decisoes_humanas/concluidas/decisoes-de-projeto-registradas.md)

## Decisions already recorded — no new choice requested

- Keep the vanilla production panel until panel/overlay parity, legacy-test audit, independent architecture/UX/QA, native OBS/CEF acceptance, and isolated rollback all pass. Only then propose cutover/removal for explicit owner authorization.
- Keep OPS-15 **In Progress**; do not close FND-9, remove vanilla, create a PR, or merge as part of the current implementation work.
- Do not change schema, persistence, cross-session clear semantics, or domain/API policy under this UI migration without the required story and Data Engineer coordination.
- OpenGrep is a tool-installation blocker, not a product decision. The project pins a release and requires signature verification; install the required verifier/tool or leave the static-analysis gate Pending. Never bypass signature verification. See the [project CI/CD tool references](../../CI-CD.md) and [OpenGrep's pinned installation guide](https://github.com/opengrep/opengrep/blob/acf67b45c97c4b63626536605c77064ef536806d/INSTALL.md).

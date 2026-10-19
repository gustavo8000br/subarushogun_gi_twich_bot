# HD-01 — Windows runtime path for local API/database verification

**Status:** Decision recorded: option A is already authorized; runtime restoration is operational follow-up.
**Português:** [HD-01 — Caminho de runtime Windows para validar API/banco local](../../decisoes_humanas/concluidas/HD-01-caminho-runtime-windows.md)

### HD-01 — Windows runtime path for local API/database verification

**Status:** Docker Desktop was previously authorized for a full reinstall. Its Linux engine is currently unavailable. This is a request for a preference only if you want to change that path; no new authorization is needed to continue with the already approved Docker route.

| Option | Choice | Effect |
| --- | --- | --- |
| **A — Repair/reinstall Docker Desktop (recommended)** | Use Docker Desktop with its Linux-container backend for isolated PostgreSQL and the later Compose/installer gates. | Matches OPS-15's Compose and real-installer acceptance needs. A working Docker engine is still required for those gates. Docker's current Windows guide calls WSL 2 the default backend for most users and lists WSL 2.1.5+ as the minimum. |
| B — Native PostgreSQL for the local smoke only | Install PostgreSQL on Windows and point only the development API to a newly created disposable database. | Can unblock the local session/state/locale smoke. It does **not** validate Docker Compose, the packaged installer, or the required Docker-backed install/update/uninstall flow. |
| C — Defer runtime verification | Continue code and contract-test work and leave runtime criteria Pending. | No system installation is needed now; persisted/runtime evidence stays blocked. |

**Recommendation:** Keep A as the project path, consistent with the prior Docker reinstall authorization and the Windows installer goal. Use B only if you specifically want the local API smoke sooner while Docker repair is deferred. Docker documents its Windows backends and WSL requirements [here](https://docs.docker.com/desktop/setup/install/windows-install/) and [here](https://docs.docker.com/desktop/features/wsl/). PostgreSQL provides a Windows binary installer path [here](https://www.postgresql.org/download/windows/); that alternative does not establish Compose acceptance.

**Current selection:** A is already authorized; the engine has not yet been restored. No reply is required unless you prefer B or C.



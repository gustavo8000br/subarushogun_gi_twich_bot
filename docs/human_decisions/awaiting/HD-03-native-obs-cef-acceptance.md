# HD-03 — Native OBS/CEF acceptance owner outcome

**Status:** Awaiting: no native OBS/CEF run or owner acceptance is recorded.
**Português:** [HD-03 — Resultado do proprietário para aceite nativo OBS/CEF](../../decisoes_humanas/aguardando/HD-03-aceite-nativo-obs-cef.md)

### HD-03 — Native OBS/CEF acceptance owner outcome

**Status:** Pending. No native OBS/CEF run or owner acceptance is recorded for the current migration checkpoint.

| Option | Choice | Effect |
| --- | --- | --- |
| A — Accept after a successful native test | Run the story's overlay matrix in OBS Browser Source and record OBS/CEF versions, URL/capability behavior, reload, resize, multi-source and error recovery. | Closes the owner acceptance only for the tested revision and platform; other OPS-15 gates remain open. |
| B — Reject with a reproducible finding | Record platform/versions and the failing matrix case, then return the defect to implementation. | Keeps the acceptance gate open while a specific compatibility issue is fixed and re-tested. |
| **C — Defer acceptance (recommended now)** | Leave the native gate Pending until a real OBS/CEF session is available. | Prevents Chromium-only evidence from being mistaken for native acceptance and keeps cutover blocked. |

**Recommendation:** C at this checkpoint. OBS documents Browser Source as CEF-based, so native acceptance must be performed in OBS itself. [OBS Browser Source documentation](https://obsproject.com/kb/browser-source).

**Current selection:** C until the native test is run. No reply is required now; choose A or B only after reviewing the recorded native evidence.



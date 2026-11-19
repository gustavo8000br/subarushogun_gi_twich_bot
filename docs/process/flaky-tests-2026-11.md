# Flaky tests under load (record, 2026-11-19)

Status: **open record, no fix yet.** Owner of the decision to open a story/issue: `@sm`/`@devops` (the board and issues are not edited here). Pt-BR copy: [`docs/pt-BR/process/flaky-tests-2026-11.md`](../pt-BR/process/flaky-tests-2026-11.md).

| Test | Symptom | Where observed | Frequency observed |
|---|---|---|---|
| `tests/unit/next-queue-lifecycle-recovery.test.jsx`, "maps the API cancellation conflict into safe UI feedback" | `expected 'null' to contain 'panel.queue.delete.cancel.processing'` | `@qa` full battery of the research-flow package (2026-11-18, 333 s run, 231/232 files); CI of PR #148 | 1 failure in that full run; the file passed 3/3 when rerun alone. CI occurrence reported by the orchestrator (not re-verified here) |
| `compose-widgets-overlay-revoke` (Chromium integration) | Chromium step timeout | CI of PR #148 | reported by the orchestrator, 1 occurrence (not re-verified here) |

## Hypothesis (not proven)

- The unit test fails only under full-suite or CI load: it passed 3/3 when run alone, which is the only isolation result proven so far; the Chromium case is a single report and was not re-run alone. The assertions race a UI/network state (the pending-cancel feedback appears asynchronously) against a fixed or too tight wait, so a slow worker misses the window.
- The Chromium case is a timeout, consistent with a loaded runner rather than a logic error.
- Related earlier work: TS-15 (flaky Chromium queue-deletion test, fixed in `0644cec`, PR #101) and TS-22 (`compose-runtime.test.js:1022`) in [`backlog-inventory.md`](backlog-inventory.md).

## Next step (when scheduled)

1. Reproduce with the full suite under CPU load (not alone) and record the failure rate over a fixed number of runs.
2. Replace the fixed wait by waiting on the observable state (`findBy*` / `waitFor` on the feedback element, or `waitForResponse` for the network call), test-first, without weakening the assertion.
3. Do not skip or loosen the tests meanwhile; a failure caused by this flake is re-run by `@qa` and reported, never waived silently.

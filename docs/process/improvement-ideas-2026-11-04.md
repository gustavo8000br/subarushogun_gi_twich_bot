# Improvement and hardening survey — 2026-11-04

[Português brasileiro](../pt-BR/process/improvement-ideas-2026-11-04.md)

Source: owner request on 2026-11-04 ("bring 10 things that can receive an improvement or hardening, scored 0 to 10, I want it to reach 9.5"). The "today" scores are **Orion's estimates** based on concrete findings (`@qa` gates, CI, opinions); they are not measurements. This file is the INPUT of the `@sm`, who turns it into stories and actions; the `@devops` registers cards and issues (with the `## Decisões do dono` and `## Gates` sections of `docs/process/issue-body-template.md`).

| # | Idea | Evidence | Today | To reach 9.5 | Effort | Status |
|---|---|---|---|---|---|---|
| 1 | Browser E2E in CI | No workflow runs the 12 `*-browser-only` scripts; `queue-lifecycle` stayed broken 4 of 4 without an alert | 4.0 | CI job with the 12 scripts (Next HTTPS and Chrome, ~10 s each); a flaky script is investigated, never rerun until it passes | M | Planned: TS-17 |
| 2 | Timeouts on panel reads | `lib/api/client.mjs:27` calls `fetch` without a timeout; an API that accepts the connection and never answers leaves the panel on "Carregando idiomas…" | 5.0 | `AbortSignal.timeout` on reads only; mutations keep the uncertain-result path; error state with recovery; test with a hung API | S | Planned: FT-44 (OPS-23) |
| 3 | Panel and backend typing | 59 type errors in the JSX outside the gate; backend in JavaScript with JSDoc | 5.0 | JSX typed and back in `typecheck:web`; strict conversion by area; global `strict: true` | L | Planned: TS-16 and OPS-24 |
| 4 | Static scanning | OpenGrep has only two rules (unsafe HTML and credentials in logs) | 4.0 | Rules for raw SQL, `eval`/`Function`, SSRF, secrets in code, `dangerouslySetInnerHTML`, headers and cookies, each with a rule test | M | NEW |
| 5 | Guard against sensitive-data leaks | The session URL reached 45 commits in a public repository; protection is only text in `AGENTS.md` | 5.0 | Automatic check in a local hook and in CI that rejects `claude.ai/`, tokens and `Claude-Session:` in commits, files and PR bodies, with a test of the check itself | S | NEW |
| 6 | Panel API contract | OPS-21: idempotency, session recovery and error codes in 7 slices | 5.5 | Server idempotency state machine; per-intent keys in the client; legacy `error` removed; routes promoted to `reexecutable` | L | Planned: OPS-21 |
| 7 | Live updates | The overlay polls every 1 s; the panel only updates on reload | 5.5 | Authenticated SSE with a 15 s heartbeat, event invalidation, polling fallback (p95 <= 2 s) | L | Planned: OPS-23 |
| 8 | Validation outside Ubuntu | Windows, macOS, native OBS and live Twitch have no result | 3.0 | Native overlay matrix in OBS, Windows installer, a Mac, a real Twitch battery on the test channel | L | Partial: A-02, D-05, OW-16 (needs the owner) |
| 9 | Accessibility actually proven | UX score 9.1 from static review; accessibility 8.8; no screen reader used | 6.0 | Screen reader (NVDA or VoiceOver), measured contrast and 320 px, focus after navigation, automated axe test on the main flows | M | Partial: A-05 (needs the owner) |
| 10 | Clean install | The `create_host_path` bug only showed on a fresh runner because everything ran with the folder already created | 6.0 | CI job with a clean clone and first use (install, start, open, update) on Linux, macOS and Windows, with no pre-existing folder | M | NEW |

## Reading
- **Cheapest and highest return:** #5 (S) and #2 (S). **Realistic ceiling with agents only:** #8 and #9 reach ~7.0; the rest needs human validation and the owner's machines; no native result is claimed without evidence.
- **New (no card or story yet):** #4, #5 and #10. Planned (already have a card): #1, #2, #3, #6, #7.
- **Orion's decision:** register #4, #5 and #10 in Backlog; start with #5 after the OPS-22 package.

## Registration (2026-11-04, `@sm`)
- Ideas #4, #5 and #10 became the Draft stories [OPS-28](../stories/OPS-28/story.md) (ST-21), [OPS-27](../stories/OPS-27/story.md) (ST-20) and [OPS-29](../stories/OPS-29/story.md) (ST-22); idea #1 (TS-17) became [OPS-30](../stories/OPS-30/story.md) (ST-23). Slices FT-45..FT-52. Ideas #2, #3, #6 and #7 keep their scope and only gained a "Meta 9,5" section in OPS-23, OPS-24 and OPS-21. Ideas #8 and #9 stay with the owner actions.
- The objective 9.5 ruler, the exit criteria, the numbered actions (AÇ-00..AÇ-47) and the order (#5, #2, #1, #10, #4, #6, #7, #3) are in [improvement-actions-2026-11-04.md](improvement-actions-2026-11-04.md). The ready issue bodies are in [improvement-issue-bodies-2026-11-04.md](improvement-issue-bodies-2026-11-04.md).
- Correction found while registering: the survey says 12 browser scripts; 13 `*-browser-only` files exist in `tests/e2e/` on 2026-11-04.

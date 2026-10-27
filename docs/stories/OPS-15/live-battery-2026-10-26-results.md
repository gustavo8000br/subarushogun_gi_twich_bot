# OPS-15 — Live battery results, round 1 (2026-10-26)

[Português brasileiro](../../pt-BR/stories/OPS-15/live-battery-2026-10-26-results.md)

Executor: Orion (browser/chat) with DB checks; **not yet validated by @qa**. Plan: [live-battery-2026-10-26.md](live-battery-2026-10-26.md). Channel `subarushogun`, live, owner-authorized. Partial round: 10 of 43 cases run; the rest are NOT RUN.

| Case | Result | Evidence |
|---|---|---|
| P-03 reward baseline | PASS | Twitch dashboard: 0 custom rewards before the run |
| LB-05 manual queue B | PASS | DB: `manual_only`, no reward, timeout 3 |
| LB-06 reward-backed queue A | PASS | DB: `synced`, closed, `reward.create` confirmed; dashboard shows `[TESTE] Fila A QA`, 1,000,000 |
| LB-23 ping | PASS | `Pong 🏓 Bot ativo · v0.2.0-0000000-beta · Twitch: latência indisponível` |
| LB-25 queue list | PASS | `Filas disponíveis: teste-b (fechada), teste-a (fechada).` |
| LB-27 entry + duplicate via alias | PASS | added; duplicate refused |
| LB-28 position | PASS | position 1 (list/`lista` not run) |
| LB-29 call + notice | PASS with defect D-2 | notice said `(posição ?)` instead of `posição 1` |
| LB-30 presence | PASS | `call_acknowledged_at` set |
| LB-31 serve/complete | PASS | status `completed`, no financial outbox |
| LB-34 clear (lowercase confirm) | PASS | `Fila limpa: 1 pessoas removidas; 0 reembolsos…` |
| LB-35 clear with `CONFIRMAR` | **FAIL — D-1 confirmed** | preview repeated instead of clearing |
| LB-42/43 cleanup | PASS | both queues `deleted`, `reward.delete` confirmed, 0 redemptions; dashboard back to 0 custom rewards |

## Defects
- **D-1:** `!<queue> limpar CONFIRMAR` (any letter case other than exact lowercase) does not confirm; the parser accepts it but `chat-handler.mjs:266` compares exactly. Needs a story, `@dev` test-first fix and `@qa` gate.
- **D-2:** call notice shows `{position}` as `?` when the entry is called by `proximo` (plan expected `1`). To be confirmed whether `?` is intended for called entries.
- **D-3 (owner report):** after deleting a queue the open tab stays on `/queues` with no success message and no redirect; it should show a "deleted successfully" message and go to the queue list or to "new queue" when none remain.
- **D-4 (owner report):** after creating a queue the panel does not navigate to the created queue; it should.
- **D-5 (owner report, earlier instance, not reproducible now; DB/log of this instance have 0 redemptions):** after a manual redemption of the reward from Twitch chat, the owner had to confirm the redemption in the Twitch dashboard, and deleting the test queue then hit a sync problem. Needs a dedicated real-redemption test with the owner's second account or the owner redeeming, with `@data-engineer` and `@dev`.

## NOT RUN (this round)
Panel LB-01…04, 07…18; widgets/overlay LB-19…22; chat LB-24, 26, 32, 33, 36…38; recovery LB-39…41. Overlay and the extension-based flows remain for the next round; native OBS is the owner's.

## Redemption flow reproduced live (2026-10-27, owner redeemed 10 points during a real stream)
1. Reward-backed queue `teste-r` opened; owner redeemed: redemption `observed`/`UNFULFILLED`, entry `waiting` (source redemption). Integration showed `degraded` from the stream start (D-6), yet the event arrived.
2. Call from panel: `chat.call` confirmed; chat showed the default call message; owner `!teste-r presente` answered correctly.
3. **Start service:** outbox `redemption.fulfill` created and went to `unknown` / `remote_state_unavailable` after 1 attempt; redemption stayed `pending`/`UNFULFILLED` on Twitch (D-5). Complete: entry `completed`, nothing changed on Twitch.
4. Operations page showed "Estado desconhecido" with Retry/Manual resolution; Retry made attempt 2 with the same result (consistent failure).
5. **Delete queue:** panel dialog promised cancellation; queue went `deleting`/`delete_pending`, `reward.delete` `unknown` (`queue_deletion_financial_conflict`); no cancel was ever created. "Sync now" did not clear it.
6. Twitch refused to delete the reward while 1 redemption was pending (must complete or reject). Cleanup done by hand on Twitch: rejected the redemption (10 points refunded) and deleted the reward; custom rewards list back to empty. **The local queue stays stuck in `deleting` (disposable dev DB).**
- **D-6:** `/health` `twitch_integration: degraded` from stream start with no log line.
- **D-7 (owner report):** panel pages do not update dynamically; they need a manual reload.
- Under investigation: `redemption-sync-research.md` (@analyst) and `panel-defects-architecture-review.md` (@architect).

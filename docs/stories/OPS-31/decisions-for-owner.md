# OPS-31 — Decisions for the owner (design v2, revised with the owner's answers)

[Português (pt-BR)](../../pt-BR/stories/OPS-31/decisions-for-owner.md)

**Prepared by:** `@architect` (Aria), 2026-11-15. **Revised 2026-11-15** with the owner's answers to O-1..O-10. Each answer below is the owner's literal text (pt-BR, as given to the orchestrator), followed by what it does to the design. Source: [architect-design-v2](architect-design-v2.md) (section in brackets). O-1 and O-2 repeat open decisions of the [2026-11-13 audit](../../audits/audit-2026-11-13.md) (D-06, D-17); the money states cannot be built without them. **Revised again 2026-11-15 (v2.2)** with the owner's answers to Q-1, Q-2 and the merge question, and the new owner rule about the end of a live. **Revised a third time 2026-11-15 (v2.3)** with the owner's answers to Q-3, Q-4 and DB-5.

Already decided earlier and **not** asked again: refund only at the end of the service; the streamer decides cancel/skip/no-show of a member on the spot; groups subscriber (paid, gifted, Prime), moderator, VIP, own list, the streamer counts as a member; one scope per group; lookup failure asks the streamer; own list max 500; OW-31-1 (nothing automatic for members); model use (D-18, orchestrator).

## Status

| Item | Status | Decided | Short effect |
|---|---|---|---|
| O-1 | DECIDED (A) | 2026-11-15 | Audited manual resolution of `conflict`/`failed` (P0) |
| O-2 | DECIDED (per-queue setting) | 2026-11-15 | Policy S1 "closed with the switch off" |
| O-3 | DECIDED (per-queue setting) | 2026-11-15 | Policy S2 "direct conclusion" |
| O-4 | DECIDED (per-queue setting) | 2026-11-15 | Policy S3 "moderator conclusion by chat" |
| O-5 | DECIDED (per-queue setting) | 2026-11-15 | Policy S5 "re-entry cap" (counter: design section 3.11) |
| O-6 | DECIDED (A) | 2026-11-15 | External settlement shown in the panel only, no chat message |
| O-7 | DECIDED (A) | 2026-11-15 | No time limit in OPS-31; visible count; OPS-32 brings the 7-day policy |
| O-8 | DECIDED (per-queue setting) | 2026-11-15 | Chat `limpar` runs; members' destination is policy S4 |
| O-9 | DECIDED (A) | 2026-11-15 | One state, "closed" |
| O-10 | DECIDED (A) | 2026-11-15 | New queues start with the UX-plan notices; existing queues all off |
| Q-1 | DECIDED | 2026-11-15 | The streamer's own chat `concluir` refunds like the panel (follows queue policy S2) |
| Q-2 | DECIDED | 2026-11-15 | The S5 cap counts per live, from EventSub `stream.online`/`stream.offline` (not the rolling window) |
| Merge | DECIDED | 2026-11-15 | A new live right after the previous one (connection drop) is the SAME session; window default 10 min, configurable |
| LIVE-1 | DECIDED (owner rule) | 2026-11-15 | The end of a live does not clear or reset queues, nor change entries or redemptions |
| Q-3 | DECIDED | 2026-11-15 | A refund made without a live counts against the LAST live session |
| Q-4 | DECIDED | 2026-11-15 | Only `type=live` opens a live session |
| DB-5 | DECIDED | 2026-11-15 | The cap counts at the intent; a failed refund returns no budget; no extra worker write; over the cap the refund waits for the streamer |

## O-1 — How does a `conflict` or `failed` financial task leave review? (audit D-06) [P0, §3.7] — DECIDED

**Owner (2026-11-15), literal:** "O-1 A: resolução manual auditada de `conflict`/`failed` (`remoteConfirmed:false`; no conflict mostrar o status remoto lido)."
- **Effect:** P0 adds the audited manual exit for both states, as `unknown` has today. The panel shows the remote status stored by the worker's last read (and its time, **HYPOTHESIS** that the time is available: `@data-engineer` confirms) for `conflict`. No new Twitch call is needed to show it.

## O-2 — A normal redemption left `UNFULFILLED` when a switch is off [P7 + policy S1, §3.10] — DECIDED

**Owner (2026-11-15), literal:** "O-2: resgate UNFULFILLED com chave desligada → **segue o que o streamer define no painel** (configuração por fila)."
- **Effect:** no global answer; a per-queue setting (S1) with values `wait` (safe default for new queues), `fulfill`, `refund`, plus `legacy` (today's behavior) kept only for queues that exist at the upgrade. Because `wait` needs the `awaiting_choice` state, the behavior ships in P7, **not** in P0 (P0 loses the R2 item). The audit decision D-17 stays open for existing queues until the streamer picks a value.

## O-3 — A direct conclusion (called → completed) for a member [P7 + policy S2, §3.10] — DECIDED

**Owner (2026-11-15), literal:** "O-3: conclusão direta (called→completed) como fim do atendimento → **o streamer decide** (configuração por fila)."
- **Effect:** setting S2: `wait` (default), `refund` (counts as the end of the service), `fulfill` (points kept, today's rule).

## O-4 — May a moderator's chat `concluir` refund a member? [P7 + policy S3, §3.10] — DECIDED

**Owner (2026-11-15), literal:** "O-4: `concluir` de moderador pelo chat devolve pontos de membro → **segue a configuração da fila**."
- **Effect:** setting S3: `wait` (default) or `refund`. The streamer's own chat `concluir` is treated as the panel end of service (see open question Q-1).

## O-5 — Abuse by re-entering to be refunded again [P7 + policy S5, §3.10, §3.11] — DECIDED

**Owner (2026-11-15), literal:** "O-5: teto contra reentrada → **configurável pelo streamer** (configuração por fila/live)."
- **Effect:** setting S5 (cap and window). The design counts refunds by deriving them from data already stored (`redemptions.user_id`), not from a new personal-data store (section 3.11). Open question Q-2 (what "live" means: the product has no stream-session concept). (v2.2) "Per live" is now defined by Q-2 and the merge answer below; section 3.11 of the design holds the live session.

## O-6 — When Twitch finalizes a held redemption outside the product [§3.8] — DECIDED

**Owner (2026-11-15), literal:** "O-6 A: liquidação externa só registrada no painel ("liquidado na Twitch"), sem mensagem no chat."
- **Effect:** `settled_external` is recorded and shown in the panel only; no chat notice is created for it (section 3.8 updated).

## O-7 — How long may "waiting for your decision" and "check group" last? [§3.2 rule 3, §3.7] — DECIDED

**Owner (2026-11-15), literal:** "O-7 A: sem limite de tempo na OPS-31; contagem visível no cartão da fila e na navegação; a OPS-32 traz a política de 7 dias."
- **Effect:** no timer anywhere in OPS-31. The count of pending decisions is exposed by `GET /api/state` and shown on the queue card and in the navigation (texts and placement belong to `@ux-design-expert`).

## O-8 — Clearing the queue by chat (`limpar`) when members are in it [§3.6 item 5, policy S4] — DECIDED

**Owner (2026-11-15), literal:** "O-8: `limpar` pelo chat roda (renova o ciclo da fila); o destino dos pontos dos membros **segue a configuração da fila**."
- **Effect:** the clear runs; non-members follow today's rule (refund); members go where S4 says: `wait` (default), `refund` or `fulfill`. The chat reply gives the counts.

## O-9 — "Paused" and "closed": one state or two? [§7.1, AC 3] — DECIDED

**Owner (2026-11-15), literal:** "O-9 A: um estado, "fechada"."
- **Effect:** no new state; chat and panel say "closed".

## O-10 — Which chat notices start on for new queues? [§7.2] — DECIDED

**Owner (2026-11-15), literal:** "O-10 A: filas novas com avisos como no plano de UX (entrada, atendimento, estado da fila, pontos ligados; reordenação desligada); filas existentes tudo desligado."
- **Effect:** the five notice columns keep `false` as the database default (existing rows stay off); the queue-creation code writes the UX defaults for new queues.

## Decided in the v2.2 revision (2026-11-15)

Wording note: the texts below are the owner's answers as relayed to `@architect` by the orchestrator; the owner's original chat messages were not available to this agent.

### Q-1 — The streamer's own chat `concluir` of a member in service — DECIDED

**Owner, as relayed:** "Q-1: o `concluir` do próprio streamer pelo chat devolve como o painel (segue a política da fila, S2)."
- **Effect:** the streamer's own chat `concluir` has the same effect as the panel end of service (refund of a held member). A direct conclusion `called→completed` follows the queue policy S2, for the streamer as for anyone. Moderators keep S3. The earlier `[AUTO-DECISION]` is now the owner's decision; no change to the design tables.

### Q-2 — What "per live" means for the S5 cap — DECIDED

**Owner, as relayed:** "Q-2: o teto 'por live' (S5) usa o EventSub `stream.online`/`stream.offline` (não a janela deslizante)."
- **Effect:** a per-channel live session fed by EventSub plus a reconciliation by Get Streams ([design 3.11 and 3.12](architect-design-v2.md), research [EventSub stream.online](../../research/2026-11-15-eventsub-stream-online/README.md)). The hours window (`reentry_window_hours`) stays only as the **fallback** when no session is known or the subscription was revoked. New package P6b (before P7) and migration M4.

### Merge — A new live right after the previous one — DECIDED

**Owner, as relayed:** "uma nova live que começa logo depois da anterior (queda de conexão) conta como a MESMA sessão."
- **Effect:** a merge window (initial value **10 minutes**, suggested by the research and **configurable**; the 10 is not a Twitch constant). A live that starts within the window after the previous one ended joins the same session and keeps the budget of the cap.

### LIVE-1 — The end of a live does not reset the queues — DECIDED (owner rule)

**Owner, as relayed:** "quando a live ENCERRA, o produto NÃO apaga nem reseta as filas. As filas continuam como estão até o streamer resetar."
- **Effect:** the end of a live only closes the counting session of the S5 cap. It does not trigger clear, refund, expiry or a state change of any queue, entry or redemption. The design states it explicitly (invariant LIVE-1, sections 0, 1, 3.11, 3.12, 6.1) and proposes the AC 13 (section 17); the PG mutation test proves it.

## Decided in the v2.3 revision (2026-11-15)

Wording note: as relayed to `@architect` by the orchestrator; the owner's original chat messages were not available to this agent.

### Q-3 — A refund made while no live is running — DECIDED

**Owner, as relayed:** "Q-3: retorno sem live conta contra a ÚLTIMA sessão de live."
- **Effect:** the cap window is the last live session when no live is running; the end of a live gives no fresh budget and nobody is blocked (over the cap the refund only waits). Design 3.11 D (a). The fallback hours window stays only for "no session known / subscription revoked / stale session" (3.11 D (b)).

### Q-4 — Stream types that open a live session — DECIDED

**Owner, as relayed:** "Q-4: só `type=live` abre sessão."
- **Effect:** `rerun`, `premiere`, `playlist` and `watch_party` are logged as ignored and write nothing (design 3.11 B rule 1).

### DB-5 — What the cap counts and when — DECIDED

**Owner, as relayed:** "DB-5: o teto conta na intenção; falha do reembolso não devolve orçamento; sem escrita extra do worker; acima do teto o reembolso espera o streamer."
- **Effect:** the cap counts when the refund intent is recorded, not when Twitch confirms; a refund that later ends `failed` or `resolved_manual` returns no budget; the financial worker writes nothing extra for the cap (no new lock edge); over the cap an automatic refund becomes `awaiting_choice` and waits for the streamer, who can still refund by hand. Design 3.11 C2 and the gate (section 4).

## Open questions after this revision

None. Q-3 and Q-4 were open in v2.2 and are decided above.

- None.

Also left to the specialists, not to the owner: the merge-window range and wording (`@ux`) and the retention values (`@data-engineer`; the DE review proposes whole sessions older than 90 days).

No owner decision is pending for the design.

## Owner actions (not decisions) needed later

- Reconnect the test channel with the new scopes and perform the real redemptions for FT-78 (runs A and B).
- Confirm that the real points spent in run B on the test channel are acceptable (the authorization of 2026-11-05 covers the test channel).
- Stream a short live on the test channel for the P8 run C (start, stop, restart inside and outside the merge window, drop the connection) so the real EventSub behavior and the subscription cost are observed.

# OPS-20 — UX plan and review (refund eligibility)

[Português brasileiro](../../pt-BR/stories/OPS-20/ux-plan.md)

**Author:** `@ux-design-expert` (Uma), 2026-10-21. **Story:** [story.md](story.md) (17 ACs, owner decisions 1–7). **Inputs:** [ux-research.md](ux-research.md), [architecture.md](architecture.md) (async `pending_check`, eligibility worker, three slices, OD-1 resolved as additive by owner decision 7), [data-model.md](data-model.md), [research.md](research.md) (Verification round 2), [OPS-15 page UX review](../OPS-15/page-ux-review.md).
**Nature:** planning gate only. No code, catalog or style change was made. Code facts come from a read-only reading on `feat/ops-15-next-panel` of `apps/frontend/features/queues/{queue-settings-form.jsx, queue-list.jsx, queue-clear.mjs, queue-lifecycle-actions.jsx}`, `features/connection/connection-page-content.jsx`, `features/operations/operations-page-content.jsx`, `styles/panel.css`, `apps/web/panel-catalog.mjs` and `apps/web/localization/catalogs/{panel,chat}/{en,es,pt-BR}.tsv`.

## 0. Gate result

**Score: 9.1/10, static code/copy review only. Gate: PASS (≥ 9.0) for the scope in section 12.** Not covered: visual rendering, real browser, assistive technology, reading test with streamers, real Twitch dashboard labels. Three owner decisions are requested (section 13); none blocks the score, but OD-UX-1 changes slice sequencing.

## 1. Baseline (what exists today)

| Fact | Evidence |
|---|---|
| Points policy is one fieldset `panel.queue_settings.section_points` ("Conta e políticas de pontos") with three checkboxes using "reembolso"/"reembolso". It is shown for every queue, including manual-only. | `queue-settings-form.jsx` (`BOOLEAN_SETTINGS.slice(3)`), catalogs line 168–170 |
| The queue card already renders up to ~9 equal-weight secondary buttons (OPS-15 review "Queues 6.0"). | `queue-list.jsx` `queue-lifecycle-actions` |
| Clear dialog: generic title "Confirmar ação", button "Confirmar", copy promises `{refunds}` refunds, no plurals ("1 pessoas"). Delete dialog: same generic title/button. | `queue-list.jsx` L272–283, `queue-lifecycle-actions.jsx`, OPS-15 X3/X4 |
| Plural pattern exists: `.one/.many/.other` keys (e.g. `panel.reconciliation.complete.*`). Placeholders are registered in `panel-catalog.mjs`. | catalogs, `panel-catalog.mjs` |
| `.button-danger` exists; dialogs use native `<dialog>` with `showModal()`; `role="status"`/`role="alert"` split already used. | `panel.css` L412, queue dialogs |
| The queue settings and entry actions are hidden while a queue is `deleting` (`canManageEntries`). | `queue-list.jsx` L335 |
| Chat strings print `{refunds}` and say "A refund was requested". | `chat/*.tsv` `exit_pending`, `remove_pending`, `clear_confirm`, `clear_done` |
| Connection page has a single "Reconectar com a Twitch" button and no list of optional permissions; the follower scope warning lives on the Commands page. | `connection-page-content.jsx`, `panel.command.follower_scope_*` |

## 2. Principles applied

1. Say what happens to the points, in the viewer-facing outcome, not in Twitch states ("pendente na Twitch", never "UNFULFILLED").
2. Never a past-tense refund before Twitch confirms; "pedida/requested" until confirmed; 404 is never "returned".
3. Irreversibility is stated at the option, again in the confirmation, with a verb button and the least destructive default focus.
4. Add no new top-level button to the queue card action row; new actions live inside a collapsed per-queue section.
5. One term per concept (glossary, section 9); every count string uses plural keys.

## 3. Information architecture and placement

### 3.1 Settings form — section "Devolução de pontos"

Replaces the current `section_points` fieldset (same position, after "Privacidade"). Order inside, as **sibling** fieldsets (never nested inside a radio item, ux-research §4 GOV.UK note):

| # | Block | Control | Visible when |
|---|---|---|---|
| A | "Quando tentar devolver" | the three existing checkboxes, relabeled; plus a fixed hint that removal from the waiting list, clear and delete always try, following the rule | queue has a reward (`channel_points`, or converted manual with historical redemptions) |
| B | "Quem recebe os pontos de volta?" | radio group: Todo mundo (default) / Só inscritos / Ninguém, each with one-sentence hint | same as A |
| C | "Inscritos e exceções" | checkbox "Contar inscrições de presente" (on); nested fieldset "Também devolver para": Sua própria conta / Moderadores / VIPs (all off); additive hint | B = Só inscritos |
| D | "Quando alguém não tiver direito" | radio group: Deixar pendente para eu decidir (default) / Marcar como atendido automaticamente — os pontos não poderão mais ser devolvidos | B ≠ Todo mundo (inert under everyone, data-model §1) |
| E | Permission notice | warning paragraph + "Permitir na Twitch" button (or "save first" text while dirty) | B = Só inscritos and `channel:read:subscriptions` missing; extra line when C enables moderators/VIPs and their scope is missing |
| F | Gift/manual note | one sentence: manual return is possible from "Precisa da sua decisão"; variant when D = auto says manual return is impossible | B ≠ Todo mundo |

Rules:
- **Hidden entirely** for queues created as `manual_only` and for non-affiliate/non-partner channels (`getChannelEligibility()`), AC 9/15.
- **Read-only summary** for converted manual queues (architecture §5, Q3): one paragraph stating the stored rule and handling, no inputs.
- Hidden fields keep their draft values and are sent unchanged (data-model: flags are inert, not reset).
- Hint under B: "Vale para as próximas devoluções desta fila, inclusive de quem já está nela." (truthful: snapshot is taken at decision time).
- **Auto-fulfill confirmation happens at Save, not on radio change** (arrow keys change radios; a dialog on change would fire while browsing). If the saved draft changes D from keep → auto, Save opens an alert dialog first (section 5, dialog S1).
- The Save action bar and the existing `role="status"` dirty indicator stay as they are.

### 3.2 Per-queue section "Precisa da sua decisão"

- **Placement:** inside the queue card, after the action row and before the entry groups, as a `<details>` (collapsed by default) whose `<summary>` reads the count ("3 resgates precisam da sua decisão"). Rendered only when count > 0. Rendered **also when the queue is `deleting`** (the delete waits on these items; today `canManageEntries` hides everything else).
- **Card header badge:** the same text, small, next to the queue state pill (text, not color only). Clicking it opens the `<details>` and moves focus to its heading.
- **Two groups** (each a `<section>` with `<h3>` and count):
  1. "Verificando inscrição" — `pending_check` with `check_pending`/`rate_limited` or retrying `server_error`/`timeout`/`lookup_error`. Group hint: no points returned yet, nothing to do, but you can decide now.
  2. "Esperando você" — `awaiting_streamer` and `pending_check` that stopped (`scope_missing`, `unauthorized`, `forbidden`, `channel_ineligible`, exhausted retries, `malformed_response` after its retry).
- **Row content:** viewer display name; trigger in plain words; age ("há 12 min", `Intl.RelativeTimeFormat` in panel locale); one status line from the mapping in section 6; actions "Devolver os pontos" and "Marcar como atendido" (both `button-secondary`, 44 px); a selection checkbox (group "Esperando você" and "Verificando inscrição" both selectable for bulk mark served, because the override is allowed on `pending_check`, architecture §2.6).
- **Group-level action** (only in "Esperando você" when any row has a retryable-by-human reason): "Conferir de novo com a Twitch" (re-arm, architecture Q4). One button per group, not per row.
- **Rows leave the list** once their resolution becomes `refund_requested`/`fulfill_requested`; the outcome is reported by the status region and tracked on the Operations page (existing points-return group). The list never shows "confirmed" itself.
- **Per-viewer subscriber status is panel-only**; nothing here is echoed to chat (architecture §7).

### 3.3 Bulk "marcar como atendidos"

- Bar above the rows: header checkbox "Selecionar todos os {count} desta lista" (`aria-checked="mixed"` when partial, derived from rows); text "{count} selecionados"; button "Marcar {count} como atendidos" (`button-danger`, disabled at 0). No bulk "return points" (owner decision 6 lists bulk only for mark served).
- Scope is explicit: the selection covers only rows currently in this queue's list; at most `refundOverride.bulkMax` (100). If the list has more, the header checkbox selects the first 100 (oldest first) and the hint says "Até 100 por vez."
- On refresh, selection is pruned to rows still present; a pruned count is stated in the dialog ("2 já foram resolvidos e saíram da seleção").
- Result: partial outcomes per line (section 7), never one merged sentence.

### 3.4 Queue clear and delete copy

- **Clear dialog** (existing `QueueClearAction`): title "Limpar a fila “{title}”?"; body as a list of lines chosen by the rule and handling in the preview; existing 15-second line kept; buttons "Voltar" (default focus) and "Limpar {count} pessoas" (`button-danger`). Requires the preview DTO to expose `rule`, `handling`, `count`, `redemptionCount` (dev/architect detail; `refundsRequested` is meaningful only under `everyone`).
- **Clear result:** one line per non-zero outcome: people removed, returns requested, checking, waiting for you, marked served without return.
- **Delete dialog:** rule-aware body; states that the Twitch reward is deleted only after every redemption is resolved, including those waiting for a decision, because deleting the reward makes pending redemptions served without return (F4). Buttons "Voltar" / "Excluir fila" (`button-danger`).
- **Delete in progress:** card line "A exclusão está esperando {count} resgates que precisam da sua decisão." with button "Ver resgates esperando decisão" (opens 3.2 and focuses it).

### 3.5 Connection page — optional permissions

- New card "Permissões opcionais" after the connection status card: one row per optional permission actually needed by some queue (`subscriptions` if any queue uses Só inscritos; `moderators`/`vips` only if a queue enables those flags). Each row: name, one-sentence purpose, status text "Permitida" / "Não permitida".
- One button "Permitir na Twitch" (scope-only re-consent, architecture §3), with the note that the user goes to Twitch and comes back and the current connection keeps working.
- On return: `role="status"` with "Permissão concedida. {count} resgates voltaram para verificação." or, if denied, a warning `role="status"` (not alert; not time-critical).
- The same button appears in the queue-card banner and in settings block E; all three call one shared action.

### 3.6 Terminology unification in existing strings

Within OPS-20 copy scope: replace "reembolso/reembolso(s)" by "devolver os pontos / devolução de pontos" (pt-BR), "reembolso" by "devolver los puntos / devolución de puntos" (es), and "refund" by "return the points" (en) in `queue_settings.refund_*`, `queue.clear.*`, `queue.confirm.delete*`, `operations.group.points_refund` and the four chat strings. Owner confirmation requested (OD-UX-2) because it touches strings outside the new feature.

## 4. Conditional fields, radio groups, focus

- Radio groups: native `<fieldset>`/`<legend>` + `<input type="radio">` (native arrow-key behavior; no custom `role="radiogroup"` needed). Each option hint linked with `aria-describedby`.
- Reveal of C/D: rendered after B; focus stays on the radio the user moved to. The "Só inscritos" hint ends with "Mais opções aparecem abaixo." so screen-reader users learn about the reveal (GOV.UK: reveal is not always announced). No live region for reveal.
- Unique ids per queue (`refund-rule-${queue.id}` …), fixing the OPS-15 X7 class of bug for new fields.
- Permission button while dirty: replaced by text "Salve as alterações e depois permita na Twitch." (leaving for OAuth would drop the draft).
- Dialog focus: on open, focus the least destructive button ("Voltar"/"Manter pendente(s)"); Escape = that button; on close, focus returns to the invoker. If the invoking row no longer exists (success, or resolved by someone else during polling), focus goes to the section heading (`tabindex="-1"`); if the whole section disappeared, to the queue card `h2` (`tabindex="-1"`).
- Polling never moves focus unless the focused row disappeared (then the rule above, plus a status line "A lista mudou: um resgate foi resolvido por outra pessoa.").
- Reason validation: on submit with empty reason, focus the field, `aria-invalid="true"`, error text linked with `aria-describedby` (`role="alert"` on the error only).

## 5. Confirmation dialogs

All use `<dialog>` with `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby` = specific title, `aria-describedby` = effect paragraph. No Yes/No/OK/"Confirmar". Ordinary saves are not confirmed (SC 3.3.4 note in ux-research §4).

| Id | Trigger | Title | Default focus | Destructive button | Reason field |
|---|---|---|---|---|---|
| S1 | Save with handling changed to auto | "Marcar automaticamente como atendido?" | "Manter pendente" | "Salvar e marcar automaticamente" (danger) | no |
| R1 | Row "Devolver os pontos" | "Devolver os pontos de {viewer}?" | "Voltar" | "Devolver os pontos" (primary) | yes |
| M1 | Row "Marcar como atendido" | "Marcar o resgate de {viewer} como atendido?" | "Voltar" | "Marcar como atendido" (danger) | yes |
| B1 | Bulk | "Marcar {count} resgates como atendidos?" (plural) | "Manter pendentes" | "Marcar {count} como atendidos" (danger) | yes, one for the batch |
| C1 | Clear | "Limpar a fila “{title}”?" | "Voltar" | "Limpar {count} pessoas" (danger) | no |
| D1 | Delete | "Excluir a fila “{title}”?" | "Voltar" | "Excluir fila" (danger) | no |

- Reason: `<select>` "Motivo (fica no histórico do painel)" with presets per action plus "Outro motivo", which reveals a `<textarea maxlength="280">` with a visible remaining-characters counter (not live). The stored reason is the preset label in the panel locale or the typed text (data-model requires 1–280 chars). Mirrors the existing `PriorityReasonDialog` select pattern.
- R1 adds a line when the row is non-eligible: "Pela regra da fila, esta pessoa não teria direito. Você pode devolver mesmo assim." and, for `pending_check`, "A verificação em andamento será cancelada."
- While submitting: buttons disabled, `role="status"` "Enviando…"; double submit blocked (version + batch id).

## 6. Status vocabulary and live regions

### 6.1 State → copy (panel)

| Internal state | pt-BR copy (key in section 8) | Group |
|---|---|---|
| `pending_check` + `check_pending` / retrying `server_error`,`timeout`,`lookup_error` | "Verificando inscrição. Nenhum ponto devolvido ainda." (`status.checking`) | Verificando |
| `pending_check` + `rate_limited` with `next_check_at` | "A Twitch pediu uma pausa. Nova verificação às {time}. Nenhum ponto devolvido ainda." (`status.rate_limited`) | Verificando |
| `pending_check` + `scope_missing` | "Não deu para conferir: falta a permissão da Twitch." (`status.scope_missing`) | Esperando você |
| `pending_check` + `unauthorized` | "Não deu para conferir: reconecte a Twitch." (`status.unauthorized`) | Esperando você |
| `pending_check` + `forbidden` | "A Twitch recusou a verificação." (`status.forbidden`) | Esperando você |
| `pending_check` + `channel_ineligible` | "O canal não pode usar Pontos do Canal agora." (`status.channel_ineligible`) | Esperando você |
| `pending_check` + exhausted/malformed | "Não deu para conferir com a Twitch." (`status.check_failed`) | Esperando você |
| `awaiting_streamer` | "Sem direito pela regra da fila. Pendente na Twitch." (`status.not_eligible`) | Esperando você |
| `refund_requested` (outbox not confirmed) | "Devolução pedida à Twitch. Aguardando confirmação." (`status.refund_requested`) | leaves list; result line / Operations |
| `fulfill_requested` (not confirmed) | "Marcação como atendido pedida à Twitch. Aguardando confirmação." (`status.fulfill_requested`) | leaves list |
| Twitch confirmed CANCELED | "Pontos devolvidos (confirmado pela Twitch)." (`status.refund_confirmed`) | Operations only |
| Twitch confirmed FULFILLED | "Marcado como atendido (confirmado pela Twitch)." (`status.fulfill_confirmed`) | Operations only |
| 404 not UNFULFILLED | "A Twitch informou que o resgate já não estava pendente. Nenhum ponto foi devolvido por este app." (`status.not_pending_remote`) | Operations / rejection |

The mapper is one pure function (`refund-decision-status.mjs`), exhaustive over `resolution × unknown_reason × outbox status`, with a unit test that the `*_confirmed` keys are returned **only** for a Twitch-confirmed outbox state.

### 6.2 Live regions

- One persistent `role="status"` region per decision section for action results (polite). Created on mount, not on message, so it is announced reliably.
- `role="alert"` only for action failures (error, stale version) and the inline reason error. Warnings (permission denied, partial bulk) use `role="status"` with `is-warning`.
- Worker/polling updates (rows moving from Verificando to Esperando, counts changing) are **not** announced; the summary count updates silently (avoid F103 over-announcement). Exception: the focused-row-removed line in section 4.
- Result messages say "pedida/enviada à Twitch", never "devolvidos".

## 7. Mobile (390 × 844) and keyboard/AT behavior

- Settings: radios and checkboxes one per line, full-width labels, hints below; the long auto option label wraps (no truncation); the permission button full width.
- Decision rows: stacked — line 1 checkbox (44 × 44 target) + name; line 2 trigger · age; line 3 status; line 4 two actions in a 2-column grid of 44 px buttons. No horizontal scroll at 390 px. Bulk bar is static (not sticky) above the list, wraps to two lines.
- Dialogs: existing `width: min(540px, calc(100vw - 28px))`; actions stack with the destructive button **last** in DOM and visually; reason textarea 3 rows.
- Card badge wraps below the title on narrow width.
- Keyboard: every action reachable by Tab in reading order; `<details>` toggles with Enter/Space; arrows inside radio groups; Escape closes dialogs to the safe choice; no keyboard trap; visible focus via existing global `:focus-visible`.
- AT: accessible names include the viewer ("Devolver os pontos de {viewer}", "Selecionar o resgate de {viewer}") so the repeated buttons are distinguishable; groups are labelled sections with headings; counts are in text.

## 8. Copy drafts (en / pt-BR / es)

Plural keys follow `panel.reconciliation.*` (`.one`, `.many`, `.other`; `.many` = `.other` text). Every placeholder must be registered in `panel-catalog.mjs`. `(changed)` = existing key with new text.

### 8.1 Settings form

| Key | Placeholders | en | pt-BR | es |
|---|---|---|---|---|
| `panel.queue_settings.section_points` (changed) | — | Returning points | Devolução de pontos | Devolución de puntos |
| `panel.refund.when.legend` | — | When to try to return points | Quando tentar devolver | Cuándo intentar devolver |
| `panel.queue_settings.refund_removed` (changed) | — | When I remove someone who was called or is being served | Ao remover quem foi chamado ou está em atendimento | Al quitar a alguien llamado o en atención |
| `panel.queue_settings.refund_no_show` (changed) | — | When the called person doesn't show up | Quando a pessoa chamada não aparecer | Cuando la persona llamada no se presente |
| `panel.queue_settings.refund_viewer_leave` (changed) | — | When the called person leaves the queue | Quando a pessoa chamada sair da fila | Cuando la persona llamada salga de la cola |
| `panel.refund.when.always_hint` | — | Removing someone still waiting, clearing or deleting the queue always tries to return points, following the rule below. | Remover quem ainda espera, limpar ou excluir a fila sempre tenta devolver os pontos, seguindo a regra abaixo. | Quitar a quien aún espera, vaciar o eliminar la cola siempre intenta devolver los puntos, según la regla de abajo. |
| `panel.refund.rule.legend` | — | Who gets their points back? | Quem recebe os pontos de volta? | ¿Quién recupera sus puntos? |
| `panel.refund.rule.everyone` | — | Everyone | Todo mundo | Todos |
| `panel.refund.rule.everyone_hint` | — | Same as today: everyone gets their points back. | Como hoje: todos recebem os pontos de volta. | Como hasta ahora: todos recuperan sus puntos. |
| `panel.refund.rule.subscribers` | — | Only subscribers | Só inscritos | Solo suscriptores |
| `panel.refund.rule.subscribers_hint` | — | Checked with Twitch when the points would be returned. More options appear below. | Conferido com a Twitch na hora de devolver. Mais opções aparecem abaixo. | Se comprueba con Twitch al momento de devolver. Más opciones aparecen abajo. |
| `panel.refund.rule.nobody` | — | Nobody | Ninguém | Nadie |
| `panel.refund.rule.nobody_hint` | — | Points are never returned automatically. | Os pontos nunca são devolvidos automaticamente. | Los puntos nunca se devuelven automáticamente. |
| `panel.refund.rule.applies_hint` | — | Applies to the next returns in this queue, including people already in it. | Vale para as próximas devoluções desta fila, inclusive de quem já está nela. | Se aplica a las próximas devoluciones de esta cola, incluso a quienes ya están en ella. |
| `panel.refund.audience.legend` | — | Subscribers and exceptions | Inscritos e exceções | Suscriptores y excepciones |
| `panel.refund.audience.count_gifted` | — | Count gifted subscriptions | Contar inscrições de presente | Contar suscripciones regaladas |
| `panel.refund.audience.count_gifted_hint` | — | Someone who received a gifted sub counts as a subscriber. | Quem ganhou uma inscrição de presente conta como inscrito. | Quien recibió una suscripción regalada cuenta como suscriptor. |
| `panel.refund.audience.also_legend` | — | Also return points to | Também devolver para | También devolver a |
| `panel.refund.audience.broadcaster` | — | Your own account | Sua própria conta | Tu propia cuenta |
| `panel.refund.audience.moderators` | — | Moderators | Moderadores | Moderadores |
| `panel.refund.audience.vips` | — | VIPs | VIPs | VIP |
| `panel.refund.audience.additive_hint` | — | Moderators and VIPs who subscribe already get points back as subscribers. Check these to include the ones who don't. | Moderadores e VIPs inscritos já recebem como inscritos. Marque para incluir também os que não são inscritos. | Los moderadores y VIP suscritos ya los recuperan como suscriptores. Marca para incluir también a los que no lo son. |
| `panel.refund.handling.legend` | — | When someone isn't eligible | Quando alguém não tiver direito | Cuando alguien no tenga derecho |
| `panel.refund.handling.keep` | — | Keep it pending so I can decide | Deixar pendente para eu decidir | Dejar pendiente para decidir yo |
| `panel.refund.handling.keep_hint` | — | The redemption stays pending in Twitch and appears in "Needs your decision". You can still return the points. | O resgate fica pendente na Twitch e aparece em “Precisa da sua decisão”. Você ainda pode devolver os pontos. | El canje queda pendiente en Twitch y aparece en “Necesita tu decisión”. Aún puedes devolver los puntos. |
| `panel.refund.handling.auto` | — | Mark as served automatically — points can no longer be returned | Marcar como atendido automaticamente — os pontos não poderão mais ser devolvidos | Marcar como atendido automáticamente — ya no se podrán devolver los puntos |
| `panel.refund.handling.auto_hint` | — | Keeps your Twitch request list clean, but Twitch does not allow returning points afterwards. | Deixa a lista de pedidos da Twitch limpa, mas a Twitch não permite devolver os pontos depois. | Mantiene limpia tu lista de solicitudes de Twitch, pero Twitch no permite devolver los puntos después. |
| `panel.refund.manual_note` | — | Did someone help with a gifted sub? You can return the points of any pending redemption by hand in "Needs your decision". | Alguém ajudou com uma inscrição de presente? Você pode devolver os pontos de qualquer resgate pendente em “Precisa da sua decisão”. | ¿Alguien ayudó con una suscripción regalada? Puedes devolver los puntos de cualquier canje pendiente en “Necesita tu decisión”. |
| `panel.refund.manual_note_auto` | — | With automatic "served", redemptions of people who aren't eligible can't have their points returned by hand. | Com “atendido automaticamente”, os resgates de quem não tem direito não podem ter os pontos devolvidos manualmente. | Con “atendido automáticamente”, a los canjes de quien no tiene derecho no se les pueden devolver los puntos manualmente. |
| `panel.refund.scope.missing` | — | To check subscribers, Twitch needs your permission. Until then, returns in this queue wait for your decision. No points are returned without it. | Para conferir inscritos, a Twitch precisa da sua permissão. Até lá, as devoluções desta fila esperam a sua decisão. Nenhum ponto é devolvido sem ela. | Para comprobar suscriptores, Twitch necesita tu permiso. Hasta entonces, las devoluciones de esta cola esperan tu decisión. No se devuelven puntos sin él. |
| `panel.refund.scope.missing_roles` | — | To check moderators and VIPs, allow it on Twitch too. Until then, people who aren't subscribers wait for your decision. | Para conferir moderadores e VIPs, permita também na Twitch. Até lá, quem não for inscrito espera a sua decisão. | Para comprobar moderadores y VIP, permítelo también en Twitch. Hasta entonces, quien no sea suscriptor espera tu decisión. |
| `panel.refund.scope.save_first` | — | Save your changes, then allow it on Twitch. | Salve as alterações e depois permita na Twitch. | Guarda los cambios y luego permítelo en Twitch. |
| `panel.refund.scope.allow` | — | Allow on Twitch | Permitir na Twitch | Permitir en Twitch |
| `panel.refund.readonly_summary` | `rule`, `handling` | This queue is now manual. Its earlier redemptions keep this rule: {rule}. When someone isn't eligible: {handling}. | Esta fila agora é manual. Os resgates antigos seguem esta regra: {rule}. Quando alguém não tiver direito: {handling}. | Esta cola ahora es manual. Los canjes anteriores siguen esta regla: {rule}. Cuando alguien no tenga derecho: {handling}. |
| `panel.refund.confirm_auto.title` | — | Mark as served automatically? | Marcar automaticamente como atendido? | ¿Marcar automáticamente como atendido? |
| `panel.refund.confirm_auto.body` | `title` | In “{title}”, redemptions of people who aren't eligible will be marked as served on Twitch. After that, their points can no longer be returned. Redemptions already pending don't change. | Em “{title}”, os resgates de quem não tiver direito serão marcados como atendidos na Twitch. Depois disso, não dá mais para devolver os pontos desses resgates. Os resgates que já estão pendentes não mudam. | En “{title}”, los canjes de quien no tenga derecho se marcarán como atendidos en Twitch. Después, ya no se podrán devolver sus puntos. Los canjes que ya están pendientes no cambian. |
| `panel.refund.confirm_auto.keep` | — | Keep pending | Manter pendente | Mantener pendiente |
| `panel.refund.confirm_auto.accept` | — | Save and mark automatically | Salvar e marcar automaticamente | Guardar y marcar automáticamente |

### 8.2 Decision list, rows and bulk

| Key | Placeholders | en | pt-BR | es |
|---|---|---|---|---|
| `panel.refund.list.summary.one/.other` | `count` | 1 redemption needs your decision / {count} redemptions need your decision | 1 resgate precisa da sua decisão / {count} resgates precisam da sua decisão | 1 canje necesita tu decisión / {count} canjes necesitan tu decisión |
| `panel.refund.list.title` | — | Needs your decision | Precisa da sua decisão | Necesita tu decisión |
| `panel.refund.group.checking` | — | Checking subscription | Verificando inscrição | Comprobando suscripción |
| `panel.refund.group.checking_hint` | — | No points returned yet. Nothing to do, but you can decide now. | Nenhum ponto devolvido ainda. Não precisa fazer nada, mas você pode decidir agora. | Aún no se devolvieron puntos. No hace falta hacer nada, pero puedes decidir ahora. |
| `panel.refund.group.awaiting` | — | Waiting for you | Esperando você | Esperándote |
| `panel.refund.group.recheck` | — | Check again with Twitch | Conferir de novo com a Twitch | Comprobar de nuevo con Twitch |
| `panel.refund.trigger.removed_waiting` | — | Removed while waiting | Removido enquanto esperava | Quitado mientras esperaba |
| `panel.refund.trigger.removed_while_called` | — | Removed after being called | Removido depois de chamado | Quitado después de ser llamado |
| `panel.refund.trigger.viewer_left_called` | — | Left after being called | Saiu depois de chamado | Se fue después de ser llamado |
| `panel.refund.trigger.no_show` | — | Didn't show up | Não apareceu | No se presentó |
| `panel.refund.trigger.queue_cleared` | — | Queue cleared | Fila limpa | Cola vaciada |
| `panel.refund.trigger.queue_deleted` | — | Queue deleted | Fila excluída | Cola eliminada |
| `panel.refund.row.age` | `age` | {age} | {age} | {age} (value from `Intl.RelativeTimeFormat`) |
| `panel.refund.status.checking` | — | Checking subscription. No points returned yet. | Verificando inscrição. Nenhum ponto devolvido ainda. | Comprobando suscripción. Aún no se devolvieron puntos. |
| `panel.refund.status.rate_limited` | `time` | Twitch asked for a pause. Next check at {time}. No points returned yet. | A Twitch pediu uma pausa. Nova verificação às {time}. Nenhum ponto devolvido ainda. | Twitch pidió una pausa. Nueva comprobación a las {time}. Aún no se devolvieron puntos. |
| `panel.refund.status.scope_missing` | — | Couldn't check: Twitch permission is missing. | Não deu para conferir: falta a permissão da Twitch. | No se pudo comprobar: falta el permiso de Twitch. |
| `panel.refund.status.unauthorized` | — | Couldn't check: reconnect Twitch. | Não deu para conferir: reconecte a Twitch. | No se pudo comprobar: vuelve a conectar Twitch. |
| `panel.refund.status.forbidden` | — | Twitch refused the check. | A Twitch recusou a verificação. | Twitch rechazó la comprobación. |
| `panel.refund.status.channel_ineligible` | — | The channel can't use Channel Points right now. | O canal não pode usar Pontos do Canal agora. | El canal no puede usar Puntos del Canal ahora. |
| `panel.refund.status.check_failed` | — | Couldn't check with Twitch. | Não deu para conferir com a Twitch. | No se pudo comprobar con Twitch. |
| `panel.refund.status.not_eligible` | — | Not eligible under this queue's rule. Pending in Twitch. | Sem direito pela regra da fila. Pendente na Twitch. | Sin derecho según la regla de la cola. Pendiente en Twitch. |
| `panel.refund.status.refund_requested` | — | Return requested from Twitch. Waiting for confirmation. | Devolução pedida à Twitch. Aguardando confirmação. | Devolución solicitada a Twitch. Esperando confirmación. |
| `panel.refund.status.fulfill_requested` | — | "Served" requested from Twitch. Waiting for confirmation. | Marcação como atendido pedida à Twitch. Aguardando confirmação. | Marcado como atendido solicitado a Twitch. Esperando confirmación. |
| `panel.refund.status.refund_confirmed` | — | Points returned (confirmed by Twitch). | Pontos devolvidos (confirmado pela Twitch). | Puntos devueltos (confirmado por Twitch). |
| `panel.refund.status.fulfill_confirmed` | — | Marked as served (confirmed by Twitch). | Marcado como atendido (confirmado pela Twitch). | Marcado como atendido (confirmado por Twitch). |
| `panel.refund.status.not_pending_remote` | — | Twitch said the redemption was no longer pending. No points were returned by this app. | A Twitch informou que o resgate já não estava pendente. Nenhum ponto foi devolvido por este app. | Twitch indicó que el canje ya no estaba pendiente. Esta app no devolvió puntos. |
| `panel.refund.action.return` | `viewer` | Return the points (aria: Return the points of {viewer}) | Devolver os pontos (aria: Devolver os pontos de {viewer}) | Devolver los puntos (aria: Devolver los puntos de {viewer}) |
| `panel.refund.action.serve` | `viewer` | Mark as served (aria: Mark {viewer}'s redemption as served) | Marcar como atendido (aria: Marcar o resgate de {viewer} como atendido) | Marcar como atendido (aria: Marcar el canje de {viewer} como atendido) |
| `panel.refund.select.row` | `viewer` | Select {viewer}'s redemption | Selecionar o resgate de {viewer} | Seleccionar el canje de {viewer} |
| `panel.refund.select.all.one/.other` | `count` | Select the 1 in this list / Select all {count} in this list | Selecionar o 1 desta lista / Selecionar todos os {count} desta lista | Seleccionar el 1 de esta lista / Seleccionar los {count} de esta lista |
| `panel.refund.select.count.one/.other` | `count` | 1 selected / {count} selected | 1 selecionado / {count} selecionados | 1 seleccionado / {count} seleccionados |
| `panel.refund.select.cap` | `max` | Up to {max} at a time. | Até {max} por vez. | Hasta {max} a la vez. |
| `panel.refund.bulk.button.one/.other` | `count` | Mark 1 as served / Mark {count} as served | Marcar 1 como atendido / Marcar {count} como atendidos | Marcar 1 como atendido / Marcar {count} como atendidos |
| `panel.refund.list.loading` | — | Loading redemptions… | Carregando resgates… | Cargando canjes… |
| `panel.refund.list.failed` | — | Couldn't load the redemptions. | Não foi possível carregar os resgates. | No se pudieron cargar los canjes. |
| `panel.refund.list.retry` | — | Try again | Tentar de novo | Intentar de nuevo |
| `panel.refund.list.changed` | — | The list changed: a redemption was resolved by someone else. | A lista mudou: um resgate foi resolvido por outra pessoa. | La lista cambió: otra persona resolvió un canje. |
| `panel.refund.list.empty_after` | — | No redemptions waiting for a decision. | Nenhum resgate esperando decisão. | No hay canjes esperando decisión. |
| `panel.refund.open_list` | — | See redemptions waiting for a decision | Ver resgates esperando decisão | Ver canjes que esperan decisión |

### 8.3 Override dialogs, reason and results

| Key | Placeholders | en | pt-BR | es |
|---|---|---|---|---|
| `panel.refund.dialog.back` | — | Back | Voltar | Volver |
| `panel.refund.r1.title` | `viewer` | Return the points of {viewer}? | Devolver os pontos de {viewer}? | ¿Devolver los puntos de {viewer}? |
| `panel.refund.r1.body` | — | Twitch will return the points of this redemption. Once requested, it can't be undone. | A Twitch vai devolver os pontos deste resgate. Depois do pedido, não dá para desfazer. | Twitch devolverá los puntos de este canje. Una vez solicitado, no se puede deshacer. |
| `panel.refund.r1.not_eligible` | — | Under this queue's rule, this person wouldn't be eligible. You can return them anyway. | Pela regra da fila, esta pessoa não teria direito. Você pode devolver mesmo assim. | Según la regla de la cola, esta persona no tendría derecho. Puedes devolverlos igualmente. |
| `panel.refund.r1.cancels_check` | — | The check in progress will be cancelled. | A verificação em andamento será cancelada. | Se cancelará la comprobación en curso. |
| `panel.refund.m1.title` | `viewer` | Mark {viewer}'s redemption as served? | Marcar o resgate de {viewer} como atendido? | ¿Marcar el canje de {viewer} como atendido? |
| `panel.refund.m1.body` | — | After that, the points of this redemption can no longer be returned. | Depois disso, não dá mais para devolver os pontos deste resgate. | Después, ya no se podrán devolver los puntos de este canje. |
| `panel.refund.b1.title.one/.other` | `count` | Mark 1 redemption as served? / Mark {count} redemptions as served? | Marcar 1 resgate como atendido? / Marcar {count} resgates como atendidos? | ¿Marcar 1 canje como atendido? / ¿Marcar {count} canjes como atendidos? |
| `panel.refund.b1.body` | — | After that, the points of these redemptions can no longer be returned. Any already resolved by someone else are skipped. | Depois disso, não dá mais para devolver os pontos desses resgates. Os que outra pessoa já resolveu são ignorados. | Después, ya no se podrán devolver los puntos de estos canjes. Los que otra persona ya resolvió se omiten. |
| `panel.refund.b1.pruned.one/.other` | `count` | 1 was already resolved and left the selection. / {count} were already resolved and left the selection. | 1 já foi resolvido e saiu da seleção. / {count} já foram resolvidos e saíram da seleção. | 1 ya se resolvió y salió de la selección. / {count} ya se resolvieron y salieron de la selección. |
| `panel.refund.b1.keep` | — | Keep pending | Manter pendentes | Mantener pendientes |
| `panel.refund.reason.label` | — | Reason (kept in the panel history) | Motivo (fica no histórico do painel) | Motivo (queda en el historial del panel) |
| `panel.refund.reason.hint` | `max` | Only shown in the panel. Up to {max} characters. | Só aparece no painel. Até {max} caracteres. | Solo se muestra en el panel. Hasta {max} caracteres. |
| `panel.refund.reason.preset.helped_sub` | — | Helped with a sub or gift | Ajudou com inscrição ou presente | Ayudó con una suscripción o regalo |
| `panel.refund.reason.preset.queue_mistake` | — | Queue mistake | Erro na fila | Error en la cola |
| `panel.refund.reason.preset.not_eligible` | — | Not eligible under the channel rule | Sem direito pela regra do canal | Sin derecho según la regla del canal |
| `panel.refund.reason.preset.served_elsewhere` | — | Already served outside the queue | Já atendido fora da fila | Ya atendido fuera de la cola |
| `panel.refund.reason.preset.other` | — | Other reason | Outro motivo | Otro motivo |
| `panel.refund.reason.text_label` | — | Write the reason | Escreva o motivo | Escribe el motivo |
| `panel.refund.reason.remaining` | `count` | {count} characters left | {count} caracteres restantes | {count} caracteres restantes |
| `panel.refund.reason.required` | — | Choose or write a reason to continue. | Escolha ou escreva um motivo para continuar. | Elige o escribe un motivo para continuar. |
| `panel.refund.sending` | — | Sending… | Enviando… | Enviando… |
| `panel.refund.result.return` | `viewer` | Return of {viewer}'s points requested from Twitch. Waiting for confirmation. | Devolução dos pontos de {viewer} pedida à Twitch. Aguardando confirmação. | Devolución de los puntos de {viewer} solicitada a Twitch. Esperando confirmación. |
| `panel.refund.result.serve` | `viewer` | "Served" for {viewer}'s redemption requested from Twitch. Waiting for confirmation. | Marcação como atendido do resgate de {viewer} pedida à Twitch. Aguardando confirmação. | Marcado como atendido del canje de {viewer} solicitado a Twitch. Esperando confirmación. |
| `panel.refund.result.bulk_done.one/.other` | `count` | 1 sent to Twitch to be marked as served. / {count} sent to Twitch to be marked as served. | 1 enviado à Twitch para marcar como atendido. / {count} enviados à Twitch para marcar como atendidos. | 1 enviado a Twitch para marcar como atendido. / {count} enviados a Twitch para marcar como atendidos. |
| `panel.refund.result.bulk_skipped.one/.other` | `count` | 1 skipped: already resolved. / {count} skipped: already resolved. | 1 ignorado: já estava resolvido. / {count} ignorados: já estavam resolvidos. | 1 omitido: ya estaba resuelto. / {count} omitidos: ya estaban resueltos. |
| `panel.refund.result.bulk_rejected.one/.other` | `count` | 1 couldn't be changed: no longer pending in Twitch. / {count} couldn't be changed: no longer pending in Twitch. | 1 não pôde ser alterado: não está mais pendente na Twitch. / {count} não puderam ser alterados: não estão mais pendentes na Twitch. | 1 no se pudo cambiar: ya no está pendiente en Twitch. / {count} no se pudieron cambiar: ya no están pendientes en Twitch. |
| `panel.refund.result.track` | — | Follow the result in Twitch sync and point returns. | Acompanhe o resultado em Sincronização com a Twitch e devolução de pontos. | Sigue el resultado en Sincronización con Twitch y devolución de puntos. |
| `panel.refund.reject.already_has_intent` | — | This redemption already has a request in progress. Nothing was changed. | Este resgate já tem um pedido em andamento. Nada foi alterado. | Este canje ya tiene una solicitud en curso. No se cambió nada. |
| `panel.refund.reject.not_unfulfilled` | — | This redemption is no longer pending in Twitch. Nothing was changed. | Este resgate não está mais pendente na Twitch. Nada foi alterado. | Este canje ya no está pendiente en Twitch. No se cambió nada. |
| `panel.refund.reject.stale` | — | The list changed while you were deciding. It's updated; check and try again. | A lista mudou enquanto você decidia. Já atualizamos; confira e tente de novo. | La lista cambió mientras decidías. Ya está actualizada; revisa e inténtalo de nuevo. |
| `panel.refund.recheck.done.one/.other` | `count` | 1 redemption is being checked again. / {count} redemptions are being checked again. | 1 resgate voltou para verificação. / {count} resgates voltaram para verificação. | 1 canje vuelve a comprobarse. / {count} canjes vuelven a comprobarse. |

Unexpected errors keep the existing generic text plus `panel.error.reference` `{id}` (CLAUDE.md error rule).

### 8.4 Clear and delete

| Key | Placeholders | en | pt-BR | es |
|---|---|---|---|---|
| `panel.queue.clear.title` | `title` | Clear the queue “{title}”? | Limpar a fila “{title}”? | ¿Vaciar la cola “{title}”? |
| `panel.queue.clear.people.one/.other` | `count` | 1 person will be removed. / {count} people will be removed. | 1 pessoa será removida. / {count} pessoas serão removidas. | Se quitará 1 persona. / Se quitarán {count} personas. |
| `panel.queue.clear.rule_everyone.one/.other` | `count` | Twitch will be asked to return the points of 1 redemption. / … of {count} redemptions. | A devolução dos pontos de 1 resgate será pedida à Twitch. / … de {count} resgates será pedida à Twitch. | Se pedirá a Twitch devolver los puntos de 1 canje. / … de {count} canjes. |
| `panel.queue.clear.rule_subscribers_keep.one/.other` | `count` | 1 redemption will be checked with Twitch. If eligible, its return is requested; if not, it waits for your decision. / {count} redemptions will be checked with Twitch. Eligible ones get a return request; the others wait for your decision. | 1 resgate será conferido com a Twitch. Se tiver direito, a devolução é pedida; se não, espera a sua decisão. / {count} resgates serão conferidos com a Twitch. Quem tiver direito tem a devolução pedida; os demais esperam a sua decisão. | Se comprobará 1 canje con Twitch. Si tiene derecho, se solicita la devolución; si no, espera tu decisión. / Se comprobarán {count} canjes con Twitch. A quien tenga derecho se le solicita la devolución; los demás esperan tu decisión. |
| `panel.queue.clear.rule_subscribers_auto.one/.other` | `count` | … if not, it is marked as served without return. / … the others are marked as served without return. | … se não, é marcado como atendido, sem devolução. / … os demais são marcados como atendidos, sem devolução. | … si no, se marca como atendido, sin devolución. / … los demás se marcan como atendidos, sin devolución. |
| `panel.queue.clear.rule_nobody_keep.one/.other` | `count` | No points will be returned. 1 redemption will wait for your decision. / {count} redemptions will wait for your decision. | Nenhum ponto será devolvido. 1 resgate vai esperar a sua decisão. / {count} resgates vão esperar a sua decisão. | No se devolverán puntos. 1 canje esperará tu decisión. / {count} canjes esperarán tu decisión. |
| `panel.queue.clear.rule_nobody_auto.one/.other` | `count` | No points will be returned. 1 redemption will be marked as served. / {count} redemptions will be marked as served. | Nenhum ponto será devolvido. 1 resgate será marcado como atendido. / {count} resgates serão marcados como atendidos. | No se devolverán puntos. 1 canje se marcará como atendido. / {count} canjes se marcarán como atendidos. |
| `panel.queue.clear.expiry` | — | This confirmation is valid for 15 seconds. | Esta confirmação vale por 15 segundos. | Esta confirmación es válida durante 15 segundos. |
| `panel.queue.clear.accept.one/.other` | `count` | Clear 1 person / Clear {count} people | Limpar 1 pessoa / Limpar {count} pessoas | Quitar 1 persona / Quitar {count} personas |
| `panel.queue.clear.done.one/.other` (changed) | `count` | 1 person removed. / {count} people removed. | 1 pessoa removida. / {count} pessoas removidas. | Se quitó 1 persona. / Se quitaron {count} personas. |
| `panel.queue.clear.out.return.one/.other` | `count` | 1 return requested from Twitch. / {count} returns requested from Twitch. | 1 devolução pedida à Twitch. / {count} devoluções pedidas à Twitch. | 1 devolución solicitada a Twitch. / {count} devoluciones solicitadas a Twitch. |
| `panel.queue.clear.out.checking.one/.other` | `count` | 1 being checked. / {count} being checked. | 1 em verificação. / {count} em verificação. | 1 en comprobación. / {count} en comprobación. |
| `panel.queue.clear.out.awaiting.one/.other` | `count` | 1 waiting for your decision. / {count} waiting for your decision. | 1 esperando a sua decisão. / {count} esperando a sua decisão. | 1 esperando tu decisión. / {count} esperando tu decisión. |
| `panel.queue.clear.out.served.one/.other` | `count` | 1 marked as served, without return. / {count} marked as served, without return. | 1 marcado como atendido, sem devolução. / {count} marcados como atendidos, sem devolução. | 1 marcado como atendido, sin devolución. / {count} marcados como atendidos, sin devolución. |
| `panel.queue.delete.title` | `title` | Delete the queue “{title}”? | Excluir a fila “{title}”? | ¿Eliminar la cola “{title}”? |
| `panel.queue.confirm.delete.one/.other` (changed, everyone) | `count` | 1 active entry will be removed and Twitch will be asked to return its points. The reward is deleted only after every redemption is resolved. This may stay pending if Twitch doesn't confirm. / {count} active entries … their points … | 1 entrada ativa será removida e a devolução dos pontos será pedida à Twitch. A recompensa só é excluída depois que todos os resgates forem resolvidos. Pode ficar pendente se a Twitch não confirmar. / {count} entradas ativas serão removidas e a devolução dos pontos será pedida à Twitch. … | Se quitará 1 entrada activa y se pedirá a Twitch devolver sus puntos. La recompensa solo se elimina cuando todos los canjes estén resueltos. Puede quedar pendiente si Twitch no confirma. / Se quitarán {count} entradas activas … |
| `panel.queue.confirm.delete_rule.one/.other` (subscribers or nobody) | `count` | 1 active entry will be removed. Returning its points follows this queue's rule. The Twitch reward is deleted only after every redemption is resolved, including those waiting for your decision; this keeps Twitch from marking them as served without return. / {count} active entries … | 1 entrada ativa será removida. A devolução dos pontos segue a regra da fila. A recompensa da Twitch só é excluída depois que todos os resgates forem resolvidos, inclusive os que esperam a sua decisão; isso evita que a Twitch os marque como atendidos sem devolução. / {count} entradas ativas serão removidas. … | Se quitará 1 entrada activa. La devolución de puntos sigue la regla de la cola. La recompensa de Twitch solo se elimina cuando todos los canjes estén resueltos, incluso los que esperan tu decisión; así Twitch no los marca como atendidos sin devolución. / Se quitarán {count} entradas activas. … |
| `panel.queue.delete.accept` | — | Delete queue | Excluir fila | Eliminar cola |
| `panel.queue.delete.waiting_decisions.one/.other` | `count` | Deletion is waiting for 1 redemption that needs your decision. / … for {count} redemptions that need your decision. | A exclusão está esperando 1 resgate que precisa da sua decisão. / … {count} resgates que precisam da sua decisão. | La eliminación espera 1 canje que necesita tu decisión. / … {count} canjes que necesitan tu decisión. |

"…" in this table repeats the same sentence with the plural form; implementation must write the full text.

### 8.5 Connection page and queue banner

| Key | Placeholders | en | pt-BR | es |
|---|---|---|---|---|
| `panel.connection.optional.title` | — | Optional permissions | Permissões opcionais | Permisos opcionales |
| `panel.connection.optional.subscriptions` | — | Check subscribers | Conferir inscritos | Comprobar suscriptores |
| `panel.connection.optional.subscriptions_hint` | — | Used by queues set to "Only subscribers" to know who gets points back. | Usada pelas filas com “Só inscritos” para saber quem recebe os pontos de volta. | La usan las colas con “Solo suscriptores” para saber quién recupera sus puntos. |
| `panel.connection.optional.moderators` | — | Check moderators | Conferir moderadores | Comprobar moderadores |
| `panel.connection.optional.vips` | — | Check VIPs | Conferir VIPs | Comprobar VIP |
| `panel.connection.optional.roles_hint` | — | Used only by queues that also return points to moderators or VIPs. | Usada só por filas que também devolvem pontos a moderadores ou VIPs. | La usan solo las colas que también devuelven puntos a moderadores o VIP. |
| `panel.connection.optional.granted` | — | Allowed | Permitida | Permitido |
| `panel.connection.optional.missing` | — | Not allowed | Não permitida | No permitido |
| `panel.connection.optional.note` | — | You'll go to Twitch and come back here. Your current connection keeps working. | Você vai para a Twitch e volta para cá. A conexão atual continua funcionando. | Irás a Twitch y volverás aquí. Tu conexión actual sigue funcionando. |
| `panel.connection.optional.done.one/.other` | `count` | Permission granted. 1 redemption is being checked again. / … {count} redemptions are being checked again. | Permissão concedida. 1 resgate voltou para verificação. / … {count} resgates voltaram para verificação. | Permiso concedido. 1 canje vuelve a comprobarse. / … {count} canjes vuelven a comprobarse. |
| `panel.connection.optional.done_none` | — | Permission granted. | Permissão concedida. | Permiso concedido. |
| `panel.connection.optional.denied` | — | Twitch didn't grant the permission. Redemptions keep waiting for your decision. | A Twitch não concedeu a permissão. Os resgates continuam esperando a sua decisão. | Twitch no concedió el permiso. Los canjes siguen esperando tu decisión. |
| `panel.refund.banner.scope_missing` | — | This queue checks subscribers, but the Twitch permission is missing. Until then, returns wait for your decision. | Esta fila confere inscritos, mas falta a permissão da Twitch. Até lá, as devoluções esperam a sua decisão. | Esta cola comprueba suscriptores, pero falta el permiso de Twitch. Hasta entonces, las devoluciones esperan tu decisión. |
| `panel.operations.group.points_refund` (changed) | — | Point returns | Devolução de pontos | Devolución de puntos |

### 8.6 Chat (rule-aware; privacy: no per-viewer subscriber status)

| Key | Placeholders | en | pt-BR | es |
|---|---|---|---|---|
| `chat.queue.exit_pending` (changed, everyone) | — | You left the queue. Returning your points was requested and is awaiting confirmation. | Você saiu da fila. A devolução dos pontos foi pedida e aguarda confirmação. | Saliste de la cola. Se pidió devolver tus puntos y está pendiente de confirmación. |
| `chat.queue.exit_rule` (subscribers) | — | You left the queue. Returning points follows the channel's rule. | Você saiu da fila. A devolução dos pontos segue a regra do canal. | Saliste de la cola. La devolución de puntos sigue la regla del canal. |
| `chat.queue.exit_no_return` (nobody) | — | You left the queue. | Você saiu da fila. | Saliste de la cola. |
| `chat.queue.remove_pending` (changed, everyone) | — | Person removed. Returning the points is awaiting confirmation. | Pessoa removida. A devolução dos pontos aguarda confirmação. | Persona quitada. La devolución de puntos está pendiente de confirmación. |
| `chat.queue.remove_rule` (subscribers/nobody) | — | Person removed. Returning points follows the channel's rule. | Pessoa removida. A devolução dos pontos segue a regra do canal. | Persona quitada. La devolución de puntos sigue la regla del canal. |
| `chat.queue.clear_confirm` (changed, everyone) | `queue`, `clear_command`, `confirm_command`, `count`, `refunds` | Confirm within 15 seconds with !{queue} {clear_command} {confirm_command}: {count} people will be removed; returning points will be requested for {refunds}. | Confirme em até 15 segundos com !{queue} {clear_command} {confirm_command}: {count} pessoas serão removidas; a devolução dos pontos será pedida para {refunds}. | Confirma en 15 segundos con !{queue} {clear_command} {confirm_command}: se quitarán {count} personas; se pedirá devolver los puntos de {refunds}. |
| `chat.queue.clear_confirm_rule` (subscribers/nobody) | `queue`, `clear_command`, `confirm_command`, `count` | Confirm within 15 seconds with !{queue} {clear_command} {confirm_command}: {count} people will be removed; returning points follows the channel's rule. | Confirme em até 15 segundos com !{queue} {clear_command} {confirm_command}: {count} pessoas serão removidas; a devolução dos pontos segue a regra do canal. | Confirma en 15 segundos con !{queue} {clear_command} {confirm_command}: se quitarán {count} personas; la devolución de puntos sigue la regla del canal. |
| `chat.queue.clear_done` (changed, everyone) | `count`, `refunds` | Queue cleared: {count} people removed; returning points requested for {refunds}, awaiting confirmation. | Fila limpa: {count} pessoas removidas; devolução dos pontos pedida para {refunds}, aguardando confirmação. | Cola vaciada: {count} personas quitadas; devolución de puntos solicitada para {refunds}, pendiente de confirmación. |
| `chat.queue.clear_done_rule` (subscribers) | `count` | Queue cleared: {count} people removed. Returning points follows the channel's rule and is being checked. | Fila limpa: {count} pessoas removidas. A devolução dos pontos segue a regra do canal e está em verificação. | Cola vaciada: {count} personas quitadas. La devolución de puntos sigue la regla del canal y se está comprobando. |
| `chat.queue.clear_done_none` (nobody) | `count` | Queue cleared: {count} people removed. No points will be returned. | Fila limpa: {count} pessoas removidas. Nenhum ponto será devolvido. | Cola vaciada: {count} personas quitadas. No se devolverán puntos. |

Chat plural support was not verified in the chat catalog loader; if absent, keep these sentences count-neutral as written ("{count} pessoas" risk stays for `count = 1`) and record it for OPS-14 (#65), which owns chat wording.

## 9. Terminology glossary

| Concept | pt-BR | en | es | Never use |
|---|---|---|---|---|
| Twitch CANCELED (refund) | devolver os pontos / devolução de pontos | return the points | devolver los puntos / devolución de puntos | reembolso, reembolsar, refund (en UI), estorno |
| Twitch FULFILLED | marcar como atendido / atendido | mark as served / served | marcar como atendido / atendido | FULFILLED, concluído, completado |
| Twitch UNFULFILLED | pendente na Twitch | pending in Twitch | pendiente en Twitch | UNFULFILLED, em aberto |
| Request sent, not confirmed | pedida à Twitch, aguardando confirmação | requested from Twitch, waiting for confirmation | solicitada a Twitch, esperando confirmación | devolvido, concluído (before confirmation) |
| Unknown status (`pending_check`) | verificando inscrição / não deu para conferir | checking subscription / couldn't check | comprobando suscripción / no se pudo comprobar | não inscrito (for unknown), erro |
| `awaiting_streamer` | esperando você / precisa da sua decisão | waiting for you / needs your decision | esperándote / necesita tu decisión | bloqueado |
| Eligibility | ter direito / sem direito | eligible / not eligible | tener derecho / sin derecho | elegível (jargon in labels) |
| Subscriber | inscrito / inscrição | subscriber / subscription | suscriptor / suscripción | sub, assinante |
| OAuth scope | permissão da Twitch | Twitch permission | permiso de Twitch | scope, escopo, API |
| Re-consent | permitir na Twitch | allow on Twitch | permitir en Twitch | reautorizar OAuth |
| Reward | recompensa | reward | recompensa | reward (in pt-BR/es) |
| Manual override | decidir manualmente (actions named by effect) | decide by hand | decidir manualmente | override |

Twitch's own pt-BR/es dashboard labels for complete/reject are **UNVERIFIED** (ux-research §5); "atendido" is our product term and must be checked against a real dashboard before release (manual check M6).

## 10. Test list

### 10.1 Unit (Node, `.mjs`)
1. Settings projection/dirty/reconcile include the six new fields; hidden fields keep values; payload never resets flags.
2. Visibility function: hidden for created-manual and non-affiliate; read-only for converted; C only for subscribers; D only when rule ≠ everyone.
3. Status mapper exhaustive over `resolution × unknown_reason × outbox status`; `*_confirmed` keys only for Twitch-confirmed outbox; 404 maps to `not_pending_remote`; unknown never maps to `not_eligible`.
4. Group assignment (Verificando vs Esperando você) per reason and attempts exhausted.
5. Bulk selection reducer: mixed state, cap at `bulkMax`, oldest-first, prune on refresh with pruned count, stable `resolutionBatchId` per dialog.
6. Clear preview/confirm validators for the new DTO per rule × handling; result lines omit zero outcomes.
7. Catalog parity: every new key in en/es/pt-BR with identical placeholder sets registered in `panel-catalog.mjs`; plural keys have `.one/.many/.other`.
8. Terminology guard: no `reembols`/`estorno` in pt-BR/es panel and chat catalogs for refund keys; no `UNFULFILLED|FULFILLED|scope|API` in any refund-related label.
9. Reason validation 1–280, control characters rejected, preset label stored in locale.

### 10.2 RTL (component)
10. Rule radio change reveals C/D after the group, focus stays on the radio, hint text present.
11. Save with keep → auto opens S1; initial focus "Manter pendente"; Escape keeps draft and returns focus to Save; accept submits once.
12. Permission block: clean form shows button; dirty form shows save-first text; three entry points call one action.
13. Decision section: summary count text, badge opens and focuses heading, rendered for `deleting` queues, hidden at 0.
14. Rows: unique accessible names per viewer; ids scoped by queue.
15. R1/M1/B1: `role="alertdialog"`, labelled/described, default focus least destructive, specific button verbs, reason required with `aria-invalid` and error focus.
16. Results: single, bulk partial (done/skipped/rejected lines), stale 409 re-fetch, already-has-intent; status vs alert roles.
17. Focus after success/removal: next target per section 4; polling removal of focused row announces `list.changed`.
18. Clear dialog per rule × handling text, verb button with count, plurals 1 and n; delete dialog rule variants; delete waiting line with jump button.
19. Connection optional-permissions card rows shown only when needed; callback result granted with count / none / denied.

### 10.3 Browser E2E (Playwright; panel API and Twitch boundary fakes, disposable PostgreSQL per project rules)
20. Configure subscribers + keep, clear a queue, see checking → waiting rows after fake worker answers, return one, mark rest in bulk.
21. Missing scope path: banner, permission round trip with fake OAuth, rows re-armed message.
22. Delete blocked by pending decisions, resolve, delete continues.
23. Keyboard-only run of 20–22 (no pointer), no focus loss to `body`.
24. Viewport 390 × 844 and 1280 × 800: no horizontal scroll, targets ≥ 44 × 44, dialogs fit; 200% zoom reflow.
25. axe-core scan of settings, decision section and dialogs: zero serious/critical.
26. Chat fake: rule-aware messages never contain a viewer name with subscriber status.

### 10.4 Manual only (cannot be automated here)
- M1 NVDA + Firefox (Windows) and M2 VoiceOver + Safari (macOS): radio reveal hint, alertdialog reading order, status announcements not duplicated, mixed checkbox state.
- M3 VoiceOver + iOS Safari at 390 × 844; M4 TalkBack + Chrome Android (optional).
- M5 Reading test with the real streamer (pt-BR) and one es speaker: can they predict the effect of "Marcar como atendido automaticamente" and of "Só inscritos" with a gifted sub?
- M6 Compare "atendido"/"devolver" with the live Twitch dashboard pt-BR/es labels.
- M7 Visual review of contrast for `.is-warning` and `button-danger` in both states.

## 11. "UX done" acceptance per slice

**Slice 1 (migration, evaluator, everyone/nobody, forced paths through the rule).**
- U1.1 Terminology unified in existing refund strings (section 3.6) in en/es/pt-BR, guard test 8 green.
- U1.2 Clear and delete dialogs use specific titles, verb buttons, `button-danger`, default focus "Voltar", plural keys; `everyone` wording keeps today's meaning (golden text test).
- U1.3 Chat `everyone` wording updated; no other rule exposed in UI (see OD-UX-1).
- U1.4 Static re-review by `@ux-design-expert` ≥ 9.0 on the changed strings.

**Slice 2 (provider, worker, scopes, re-consent, subscribers rule).**
- U2.1 Connection optional-permissions card and shared "Permitir na Twitch" action with granted/denied/re-armed results.
- U2.2 Status mapper (test 3) and copy keys in 8.2 status rows exist and are tested, even if the list UI arrives in slice 3.
- U2.3 Settings rule selector still not exposed for subscribers/nobody unless slice 3 is shipped together (OD-UX-1).

**Slice 3 (override, bulk, lists, gating, copy).**
- U3.1 Settings section complete (3.1) with S1 dialog; hidden/read-only cases covered.
- U3.2 Decision section, rows, bulk, R1/M1/B1, focus and live-region rules (sections 3.2–6) implemented; tests 1–19 green.
- U3.3 Clear/delete rule-aware copy and delete-waiting jump; chat rule variants.
- U3.4 E2E 20–26 green with fakes; evidence types labeled separately.
- U3.5 Manual checks M1–M3 and M5–M7 run and recorded in the story, or explicitly listed as pending with owner acknowledgement before release.
- U3.6 Final `@ux-design-expert` review recorded, distinguishing static, browser and AT evidence.

## 12. Score (static code/copy review only)

**Scope reviewed:** this plan's IA, interaction rules, copy in three languages and test list against the story ACs, owner decisions 1–7, architecture/data-model states and current panel code. **Not covered:** visual design, real browser behavior, screen readers, user research, Twitch dashboard labels, chat catalog plural support.

First pass (internal, before fixes): **8.4/10**. Gaps found and fixed in this document:
1. Auto-fulfill confirmation fired on radio change (hostile to arrow keys) → moved to Save (S1). +0.2
2. Decision list hidden for `deleting` queues while delete waits on it → explicitly rendered, plus jump action. +0.2
3. Slice 1 could expose "Ninguém" + keep with no list to resolve items → OD-UX-1 gating and U1.3/U2.3. +0.2
4. Multi-count sentences broke plurals → one line per outcome, plural keys everywhere in the panel. +0.1
5. Reason field undefined though data-model requires it → select + "Outro motivo" pattern with bounds. +0.1
6. Permission button would drop unsaved drafts → save-first variant. +0.1 (rounded: total 9.1)

| Criterion (weight) | Score |
|---|---|
| AC/decision coverage (AC 2, 4, 7–9, 12–15; decisions 1–7) (20%) | 9.5 |
| Truthfulness of states and copy (20%) | 9.5 |
| Accessibility plan: semantics, focus, live regions (20%) | 9.0 |
| Simplicity / no new button wall / plain language (15%) | 8.5 |
| Copy completeness en/es/pt-BR, placeholders, plurals (15%) | 9.0 |
| Testability and slice acceptance (10%) | 9.0 |
| **Weighted** | **9.1** |

Why not higher: card complexity still grows (one more collapsible section and badge) on a page scored 6.0 in OPS-15; Twitch label alignment and chat plurals are unverified; moderator vs streamer actor (architecture A2) is unverified, so copy uses "você" for everyone; nothing here is validated visually or with AT.

## 13. Decisions needed from the owner

- **OD-UX-1 (recommended: yes):** expose "Só inscritos"/"Ninguém" in the panel only when slice 3 ships (list + overrides), so no pending redemption is created without a way to resolve it. Slices 1–2 stay behind the default `everyone`.
- **OD-UX-2 (recommended: yes):** apply "devolver os pontos / devolver los puntos / return the points" to existing refund strings and the four chat strings (section 3.6).
- **OD-UX-3 (recommended: yes):** reason is required for every manual action, including bulk (one reason per batch), using presets plus "Outro motivo".

## 14. Risks

- Pending redemptions accumulate in Twitch's request list (cap/expiry UNVERIFIED); mitigated by badge, list and bulk.
- Async check: right after a removal the panel and chat can only say "verificando"/"segue a regra do canal".
- Product term "atendido" may differ from Twitch's own pt-BR/es labels (M6).
- Queue card density; follow-up of the OPS-15 action-hierarchy fix still needed.
- Chat plural behavior unknown (OPS-14).

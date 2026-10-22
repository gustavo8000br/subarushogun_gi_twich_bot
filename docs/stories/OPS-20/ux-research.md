# OPS-20 — UX research: refund eligibility, non-eligible handling, override and re-consent

[Português brasileiro](../../pt-BR/stories/OPS-20/ux-research.md)

**Author:** `@analyst` (Atlas), 2026-10-21. **Input for:** the `@ux-design-expert` gate of [story.md](story.md) (see also [architecture.md](architecture.md), [data-model.md](data-model.md), [research.md](research.md)).
**Nature:** desk research plus a read-only reading of the current panel catalogs. No browser, assistive technology, Twitch call or user test was run. This document gives no UX score; the score belongs to `@ux-design-expert`.

Labels: **VERIFIED** = confirmed in an official or primary source on 2026-10-21; **PARTIAL** = partly confirmed or only secondary sources; **UNVERIFIED** = not confirmed.

## 1. What the panel must let a non-technical streamer do

| # | Task | Story source |
|---|---|---|
| T1 | Pick one refund rule per queue: everyone / subscribers only / nobody | AC 1, 4 |
| T2 | Under "subscribers only": opt in streamer, moderators, VIPs; count gifted subs (default on) | AC 2, 3; owner decisions 1, 2, 7 |
| T3 | Choose non-eligible handling: keep UNFULFILLED until decided (default) vs mark FULFILLED automatically (final) | AC 13; owner decision 6; architecture §5 |
| T4 | Review redemptions "checking" (`pending_check`/unknown) or "awaiting your decision" (`awaiting_streamer`) | AC 7; data-model §2.4 |
| T5 | Per-redemption manual override: return points / mark served, with reason | AC 8 |
| T6 | Bulk "mark as served" | owner decision 6; architecture §2.6 |
| T7 | Fix the missing `channel:read:subscriptions` scope (reconnect Twitch) | AC 9, 10 |
| T8 | Read clear/delete results as counts by outcome, "requested"/"pending", never "confirmed" | AC 12, 13 |

## 2. Platform fact that drives the UX — VERIFIED

Twitch API reference, Update Redemption Status (https://dev.twitch.tv/docs/api/reference/#update-redemption-status, page dated 2026-10-19, read in research.md round 2): “You may update a redemption only if its status is UNFULFILLED.” and “Setting the status to CANCELED refunds the user’s channel points.” So FULFILLED is **final**: no later refund through the API. Deleting a reward marks UNFULFILLED redemptions FULFILLED (same reference). The architecture's `keep_unfulfilled` default is the only reversible choice.

Whether pending UNFULFILLED redemptions expire or are capped by Twitch: **UNVERIFIED** (research.md §3). Copy must not promise either.

## 3. Comparable tools — how they present refund handling

| Tool | Finding | Status |
|---|---|---|
| Twitch Creator Dashboard / Mod View | Reward requests queue with per-item complete/reject and "Complete All"/"Reject All"; reject returns the points; moderators reach it via Mod View. Only from third-party guides (eklipse.gg, filipchabik.ghost.is); official help page https://help.twitch.tv/s/article/channel-points-guide did not render for the tool. Exact pt-BR/es labels not seen. | PARTIAL |
| Twitch "skip reward requests queue" | Redemptions are FULFILLED immediately (API reference, `should_redemptions_skip_request_queue`). | VERIFIED |
| Firebot | Skip-queue setting: “These redemptions are approved by Twitch immediately and cannot be refunded from Firebot.” Queue: “you can approve or reject pending redemptions.” (https://docs.firebot.app/v5/core/channel-rewards) — a precedent for stating irreversibility **at the setting**, before the choice. | VERIFIED (third-party official doc) |
| Streamer.bot | Fulfill/refund via "Update Redemption Status" subaction; reward must be created by Streamer.bot and must not skip the queue (https://docs.streamer.bot/faq/fulfill-cancel-cpr). Action-builder UX, no eligibility rule UI. | VERIFIED |
| Lumia Stream | User forum: redemptions could not be refunded because "Auto Fill Request" was on (https://forum.lumiastream.com/t/redeem-twitch-points-not-working-hfx/632). Shows the real harm of a silent auto-fulfill default. | PARTIAL (single user report) |
| Mix It Up | Only its own Redemption Store docs found (https://dev.site.mixitupapp.com/docs/features/consumables/redemption-store); no Twitch refund UX found. | UNVERIFIED |
| StreamElements, Nightbot, Fossabot | No documentation found on refunding Twitch channel-point redemptions or on subscriber-based refund rules. | UNVERIFIED |

**Gap/opportunity:** none of the tools found offers a per-queue "refund only subscribers" rule; streamers currently do this by hand in the Twitch queue. There is no established pattern to copy, so plain language and explicit consequences matter more. No tool found surfaces an "unknown subscriber status" state.

## 4. Accessibility guidance (WCAG 2.2 / WAI-ARIA APG)

- **SC 3.3.4 Error Prevention (Legal, Financial, Data), AA — VERIFIED** (https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html): for financial transactions at least one of reversible / checked / confirmed. Channel points are not money, so applicability is an analogy (**PARTIAL**), but "mark FULFILLED" (irreversible) and "return points" fit the "confirmed" technique G98/G168 (review then confirm). The page also says it is not meant to require confirmation for every save.
- **SC 4.1.3 Status Messages, AA — VERIFIED** (https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html): results ("12 marked as served, 2 skipped") use `role="status"` (ARIA22); errors/warnings `role="alert"` only when important and time-sensitive; failure F103 and overuse of assertive.
- **APG Modal Dialog — VERIFIED** (https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): for “the final step in a process that is not easily reversible” it “may be advisable to set focus on the least destructive action”. **APG Alert Dialog — VERIFIED** (https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/): `role="alertdialog"`, `aria-modal`, `aria-labelledby` title, `aria-describedby` message.
- **APG Radio Group — VERIFIED** (https://www.w3.org/WAI/ARIA/apg/patterns/radio/): group label via `aria-labelledby`, extra info via `aria-describedby`, arrow keys change selection. APG says nothing about conditional fields.
- **GOV.UK Design System radios — VERIFIED** (https://design-system.service.gov.uk/components/radios/): fieldset + legend; hint = one short sentence, no links; “Conditionally reveal questions only”; users are not always told when revealed content appears; keep revealed questions simple. Arrow-key selection also means revealed fields appear/disappear while the user only browses options — a reason to keep the audience checkboxes as a separate, always-visible-when-relevant fieldset rather than nested inside the radio item. (Inference, **PARTIAL**.)
- **NN/g, confirmation dialogs (Nielsen, 2018-02-18, reviewed 2026-08-07) — VERIFIED** (https://www.nngroup.com/articles/confirmation-dialog/): reserve for serious/irreversible actions; restate the request and the effect; specific button labels, not Yes/No; no "Yes" default; undo beats confirmation; overuse trains click-through.
- **Bulk actions — PARTIAL** (Shopify Polaris https://shopify.dev/docs/apps/build/app-home/migrate-from-polaris-react/select-all-actions; https://www.saasui.design/blog/saas-bulk-actions-ux-patterns): live selection count, header checkbox indeterminate (ARIA `mixed`) derived from rows, label the scope ("this page" vs "all matching"), report partial success. Not normative.

## 5. Plain-language copy (en / pt-BR / es)

- **pt-BR — VERIFIED:** Lei nº 15.263/2025 (Política Nacional de Linguagem Simples, https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15263.htm) applies to public bodies, not to this project, but art. 5 techniques are a usable checklist: short sentences in direct order, one idea per paragraph, common words, explain jargon, avoid unnecessary foreign words.
- **Current catalog inconsistency (VERIFIED, read in `apps/web/localization/catalogs/panel/*.tsv`):** pt-BR mixes "reembolso" (`queue_settings.refund_*`, `queue.clear.*`) and "Devolução de Pontos do Canal" (`operations.group.points_refund`); es mixes "reembolso" and "devolución de puntos". Recommend one verb: **devolver os pontos / devolver los puntos / return the points**, because "reembolso" suggests money.
- Avoid jargon in labels: "UNFULFILLED", "FULFILLED", "scope", "API". Use "pendente na Twitch / marcado como atendido / permissão da Twitch". Keep the technical term in a secondary hint only if needed.
- Uncertain states must say what is **known** and what **happens next**, never past-tense refund verbs: "Ainda verificando se é inscrito. Nenhum ponto foi devolvido." vs wrong "Pontos devolvidos". Requested ≠ confirmed: "Devolução solicitada à Twitch" until Twitch confirms (AC 12, 14; matches the existing `panel.operation.confirm.resolve` tone).
- Privacy (architecture §7): chat must never say whether a named viewer is a subscriber; per-viewer status is panel-only.
- Wording of irreversibility: state the consequence before the action, in the option itself (Firebot precedent), and again in the confirmation: "Depois disso, não dá mais para devolver os pontos desses resgates."
- Twitch's own pt-BR/es labels for complete/reject: **UNVERIFIED**; check in a real dashboard before aligning terms.

## 6. Draft copy examples (for UX review, not final strings)

| Element | en | pt-BR | es |
|---|---|---|---|
| Rule legend | Who gets their points back? | Quem recebe os pontos de volta? | ¿Quién recupera sus puntos? |
| Option | Only subscribers | Só inscritos | Solo suscriptores |
| Hint (subs) | Checked with Twitch when the refund is decided | Conferido com a Twitch na hora de decidir a devolução | Se comprueba con Twitch al decidir la devolución |
| Gift note | Gifted subs count by default. You can still return points to anyone by hand. | Inscrições de presente contam por padrão. Você ainda pode devolver os pontos de qualquer pessoa manualmente. | Las suscripciones regaladas cuentan por defecto. Igual puedes devolver los puntos a cualquiera manualmente. |
| Handling A (default) | Keep it pending so I can decide (points can still be returned) | Deixar pendente para eu decidir (ainda dá para devolver os pontos) | Dejar pendiente para decidir (aún se pueden devolver los puntos) |
| Handling B | Mark as served automatically — points can no longer be returned | Marcar como atendido automaticamente — os pontos não poderão mais ser devolvidos | Marcar como atendido automáticamente — ya no se podrán devolver los puntos |
| Unknown | Checking subscription… No points returned yet. | Verificando inscrição… Nenhum ponto devolvido ainda. | Comprobando suscripción… Aún no se devolvieron puntos. |
| Scope missing | To check subscribers, reconnect Twitch and allow "read subscriptions". Until then, these stay pending. | Para conferir inscritos, reconecte a Twitch e permita "ler inscrições". Até lá, ficam pendentes. | Para comprobar suscriptores, vuelve a conectar Twitch y permite "leer suscripciones". Hasta entonces, quedan pendientes. |
| Bulk confirm button | Mark 12 as served | Marcar 12 como atendidos | Marcar 12 como atendidos |

## 7. Ten prioritized UX recommendations

1. **Irreversibility at the point of choice.** In the non-eligible handling radio, put the consequence in the option label of "mark served automatically" (not only a tooltip), keep `keep_unfulfilled` as default, and require a confirmation (alert dialog, focus on "Keep pending") when switching to auto. (VERIFIED basis: Twitch API, Firebot, APG, NN/g.)
2. **Every confirmation names count + effect + permanence**, with verb buttons ("Mark 12 as served" / "Keep pending"), never Yes/No/OK; no destructive default. Confirm only irreversible or financial steps (mark served, return points, auto-fulfill switch, clear/delete), not ordinary saves.
3. **One "Needs your decision" list per queue**, split into "Checking subscription" and "Not eligible — waiting for you", with age, reason code in plain words and row actions "Return points" / "Mark served". Show a badge count in queue cards so items do not silently accumulate (R2).
4. **Truthful status vocabulary**, fixed across panel and chat: *checking*, *waiting for you*, *return requested*, *returned (Twitch confirmed)*, *marked served*, *could not update*. Never past tense before Twitch confirms; 404 never shown as returned.
5. **Re-consent as a contextual banner**, shown on queues set to "subscribers only" and in the settings form when saving that rule without the scope: what is missing, why, what happens until then ("stay pending"), one "Reconnect Twitch" button, and a status message after return listing re-armed items.
6. **Structure the form with fieldsets:** rule radiogroup (legend as question); audience checkboxes and "count gifted subs" in a separate fieldset shown only for "subscribers only", announced via a short description, and keep focus stable when it appears. Hide the whole block for manual-only/non-affiliate queues (show read-only for converted manual queues).
7. **Bulk "mark served" done safely:** checkbox column with row-specific labels, header checkbox with mixed state, explicit scope ("12 selected" vs "all 40 waiting in this queue"), one idempotent batch id, result via `role="status"` with partial outcome ("10 marked served, 2 skipped: already resolved").
8. **Override dialog with a bounded reason** (≤ 280 chars, visible counter, optional quick picks like "Helped with a sub"), explaining that it cannot undo an already-requested refund/served action (Q2) and a clear localized rejection when stale or already resolved.
9. **Rule-aware clear/delete copy:** counts by outcome (return requested / not eligible / checking) and, for delete, an explicit blocker message with the two exit actions when pending items exist; never one up-front refund number under "subscribers only".
10. **Unify terminology** to "devolver os pontos / devolver los puntos / return the points" across all three catalogs (replace "reembolso"), plain-language review against Lei 15.263 art. 5, and a short "How this works" disclosure explaining that status is checked at decision time and Prime/gift appear as Twitch reports them.

## 8. Pitfalls to avoid

- Saying or implying "points returned" for `unknown`, `requested` or a 404.
- Mapping unknown to "not a subscriber" (e.g. "0 subscribers" when the scope is missing).
- Hiding the auto-fulfill consequence in a tooltip or help link (hint text should not contain links).
- Nesting checkboxes inside a radio item so that arrow-key browsing silently adds/removes fields.
- Overusing confirmations or `role="alert"`/assertive live regions for routine saves.
- "Select all" that silently means only the visible page.
- Announcing subscriber status of named viewers in chat.
- Jargon labels (UNFULFILLED, scope, API) and mixed "reembolso"/"devolução" terms.
- Promising Twitch expiry or caps of pending items (UNVERIFIED).
- Claiming accessibility from static review: a browser + screen reader pass (NVDA/VoiceOver) is still required.

## 9. Limitations

- Twitch Help Center did not render; dashboard queue labels and any expiry rule are not confirmed (PARTIAL/UNVERIFIED).
- No StreamElements, Nightbot, Fossabot or Mix It Up refund-handling docs found; absence of evidence is not evidence of absence.
- Copy examples are drafts; no reading test with streamers was done.
- Channel points are not money; applying SC 3.3.4 is an analogy.

## Sources (accessed 2026-10-21)

- Twitch API reference: https://dev.twitch.tv/docs/api/reference/#update-redemption-status
- Twitch Help (did not render): https://help.twitch.tv/s/article/channel-points-guide
- Third-party Twitch queue guides: https://blog.eklipse.gg/streaming-tips/refund-twitch-channel-points.html, https://filipchabik.ghost.is/how-to-refund-channel-points-on-twitch
- Firebot: https://docs.firebot.app/v5/core/channel-rewards
- Streamer.bot: https://docs.streamer.bot/faq/fulfill-cancel-cpr
- Lumia forum: https://forum.lumiastream.com/t/redeem-twitch-points-not-working-hfx/632
- Mix It Up: https://dev.site.mixitupapp.com/docs/features/consumables/redemption-store
- WCAG 2.2 SC 3.3.4: https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html
- WCAG 2.2 SC 4.1.3: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
- APG Modal Dialog: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ ; Alert Dialog: https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/ ; Radio Group: https://www.w3.org/WAI/ARIA/apg/patterns/radio/
- GOV.UK radios: https://design-system.service.gov.uk/components/radios/
- NN/g: https://www.nngroup.com/articles/confirmation-dialog/
- Bulk actions: https://shopify.dev/docs/apps/build/app-home/migrate-from-polaris-react/select-all-actions, https://www.saasui.design/blog/saas-bulk-actions-ux-patterns
- Lei 15.263/2025: https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15263.htm

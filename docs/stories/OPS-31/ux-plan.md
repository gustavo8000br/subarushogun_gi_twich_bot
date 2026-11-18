# OPS-31 — UX plan: refund of points by group and queue notices

[Português (pt-BR)](../../pt-BR/stories/OPS-31/ux-plan.md)

> **2026-11-15:** the settlement policy (S1..S5), live sessions, `awaiting_choice`/`settled_external` states and the manual resolution of `conflict`/`failed` are planned in [ux-plan-v2.md](ux-plan-v2.md), which wins where it differs from this v1.

**Author:** `@ux-design-expert` (Uma) — **Date:** 2026-11-11 — **Mode:** YOLO (owner absent; decisions marked `[AUTO-DECISION]`).
**Story:** [story.md](story.md) (ACs 1-28) — **Design:** [architect-design.md](architect-design.md) (D-31-1..D-31-11, questions of section 10) — **Research:** [queue-group-refund note](../../research/2026-11-06-queue-group-refund/README.md) (summary only; no new research).
**Evidence class:** **static review** of the design, the story and the panel code patterns (`apps/frontend/features/queues/`, `outcome-region.jsx`, panel catalogs). **Not validated:** see section 9.

## 1. Answers to the eight questions of the `@architect`

| # | Question | Decision | Reason |
|---|---|---|---|
| 1 | Refund / do not refund: modal or inline; how to make "do not refund" final without a second confirmation | **Native `<dialog>` modal** (same pattern as the clear dialog), **one step**: two equal-weight buttons plus "Back". Each button **is** the confirmation. The button label states the consequence ("Do not refund (final)"), and the dialog body states it in one sentence. No pre-selected choice, no default focus on either choice (focus goes to the dialog title). | The panel already uses `<dialog>` with `showModal()` for destructive actions: free focus trap, `Esc`, inert background. A modal prevents an accidental click on the row behind. An inline row control is easy to mis-click on a live stream. One step keeps the stream moving: the explicit label is the "specific confirmation", a second confirm would only add friction (a refund is equally irreversible, so both choices need the same weight) |
| 2 | Three marks on the entry row | Text badges, never color alone: **"Points held until the end"**, **"Check group"**, **"Waiting for your decision"**. Distinct from the OPS-22 words ("Unknown state · review in the panel") and shown on another screen | Different words, different place (queue screen vs operations screen), different action, as the design requires (D-31-8 rule 4) |
| 3 | Where the pending list lives | A **"Pending decisions" section on the Queues page**, above the queue cards, grouped by queue, plus a **count badge** on each queue card and on the "Queues" navigation item. No new page | Entries leave the queue, so a per-card row list would vanish after a clear. The Queues page is where the streamer already works; a count on the navigation item survives the end of the stream and the next login. Not on Operations (do not mix with OPS-22). Avoids a new page (and the `PageLayout` obligation) |
| 4 | Batch choice of three and counts | Extend the existing clear/delete `<dialog>`: **counts line** (members, outside the group, to check), then a **radio group of three** for the members. **No option pre-selected**; "Confirm" is disabled with a visible reason until one is chosen (only when there are members) | A required, conscious choice, in line with "nothing is refunded automatically". Radios (not three buttons) so the 15 s confirmation pressure does not push a click |
| 5 | Group switches, "pending reconnect", `moderation:read` text | Fieldset "Who gets points back" with four checkboxes. A group without its scope can be ticked and saved: it shows a **"Waiting for reconnection"** badge and, after saving, the **"Reconnect to Twitch"** button (reuses `panel.connection.reconnect`). The moderator row carries a short reason for the broad permission | D-31-5 rule 8 |
| 6 | Retention notice and "checked at the decision moment" | One visible paragraph **directly under the moment control** (not in a tooltip), linked with `aria-describedby`; text in section 6 | AC 11: on the control itself |
| 7 | Texts and which notices start on | Section 7. New queues: **on** for joined, turn/service, queue state, points outcome; **off** for "reordered". **Existing queues migrate with every notice off** | Matches the compatibility rule ("existing queues behave exactly as today", D-31-7); reordering is frequent and noisy |
| 8 | Position of a skipped or restored entry | **Confirmed: position 2** (right after the first waiting entry). The panel and the chat both state the new position | The person is not sent to the end and the next person is not passed over twice; stating the position removes surprise |

## 2. Screens and flows

### 2.1 Queue settings — "Points" block (FT-74)

Placed in the existing queue settings form (`queue-settings-form.jsx`), after the three refund switches, as a `<fieldset>` with a `<legend>` "Points of the Channel".

1. **Moment** (radio group, 2 options): "Use the points when service starts (default)" / "Return the points when service ends, for the groups I choose".
2. **Retention notice** (paragraph under the radios, always visible when the second option is selected, and also readable for the first). `aria-describedby` of the radio group.
3. **Groups** (fieldset, four checkboxes, visible and enabled only when the second moment is selected; collapsed otherwise): subscribers, moderators, VIPs, my own list ("manage the list in Settings" link). The streamer always counts as a member (stated in one line).
4. **Empty set**: allowed, with a non-blocking hint "No group chosen: nobody will get points back."
5. **Disabled with reason** (AC 12): the whole refund mode shows the first failing condition as text next to the radio (`aria-describedby`), never only a greyed control. Reasons: reward not created by this app; skip-request-queue is on; the channel is not affiliate/partner. A missing scope is **not** a disabled state (it is "waiting for reconnection", see 2.7).
6. **Notices** (separate fieldset "Chat notices", five switches, section 7.2).
7. The refund mode control is **not rendered** until FT-76 is delivered (the API refuses it), so no copy about a half feature ships.
8. Save: reuses the existing form feedback (`role="status"` / `role="alert"`). If the queue already has held redemptions, changing the moment shows: "This change applies to new decisions. Points already held keep the rule they were decided under." (snapshot rule, D-31-2 rule 5).

### 2.2 Decide when closing a member's entry (FT-76, FT-72; AC 20)

Trigger: the streamer clicks remove, cancel or no-show on a row. The button becomes `aria-busy` and an inline `role="status"` says "Checking group…" (the lookup runs on the server; only for queues in refund mode with groups). Three outcomes:

- **Not a member**: today's behavior, no question.
- **Member**: the API answers "choice required"; the panel opens the **decision dialog**.
- **Unknown**: the entry closes, the points stay held, and the feedback says "The group could not be checked. {name}'s points stay held. Decide in Pending decisions." with a link to the section.

**Decision dialog** (one component, also used by the pending list):

- Title (heading, receives focus): "Return the points of {name}?"
- Body: "{name} is in a group that gets points back. The entry is closed without a finished service."
- Button 1 (primary style): **"Refund the points"**. Helper text under it: "We ask Twitch to return the points. Twitch confirms later."
- Button 2 (secondary style, same size): **"Do not refund (final)"**. Helper text: "The redemption is completed and the points are not returned. This cannot be undone."
- Button 3 (link style): "Back" — closes without any change; `Esc` does the same.
- Neither choice is pre-focused or default; `Enter` on the title does nothing.
- Both helper texts are `aria-describedby` of their button.
- While the request runs: both buttons `disabled` + `aria-busy`, a `role="status"` line "Saving your decision…". On success the dialog closes. On "already decided" (D-31-3): the dialog stays closed, the card feedback reads "Already decided: points refunded / not refunded." (`role="status"`).
- Skip: **no question**. Feedback: "{name} moved to position {position}. Points stay held until the entry leaves the queue." (members only).
- Triggers that cannot ask (timer no-show, chat commands, viewer leaves): the entry closes and appears in Pending decisions as "Waiting for your decision". The card feedback (when the panel is open) is a `role="status"` line "{name} left the queue. Points waiting for your decision." with a link to the section.

### 2.3 Batch closing: clear and delete (AC 26)

Extends `queue-clear` and the delete confirmation dialogs.

1. Step 1 (loading, `role="status"`): "Checking groups…". Failure here never blocks the clear: those people count as "to check".
2. Counts line (plural keys): "{members} in a group, {others} outside the group, {check} to check."
3. One sentence per bucket (visible text): outside the group → "refund requested as today"; to check → "stay held in Pending decisions"; members → choose below.
4. Radio group (legend "For the people in a group"), **none selected**: "Refund everyone's points" / "Do not refund (final)" / "Decide one by one later".
5. Buttons, in tab order after the radios: "Confirm", then "Back". "Confirm" is `aria-disabled`-style disabled with `aria-describedby` "Choose what happens to the points of the people in a group" until a radio is chosen. With zero members the radio group is not rendered and the dialog is as today plus the counts.
6. The existing 15 s validity is short for a decision. `[AUTO-DECISION]` ask `@dev` to use **60 s when there are members** (the snapshot guard stays); when the snapshot changes the existing "queue changed" alert appears, the counts refresh and the radio selection is **reset** (a choice made for other numbers is not reused).
7. Delete variant: adds "The queue stays being deleted until every pending decision is made." when the choice is "decide one by one" or there are people to check.
8. Result (`role="status"` in the card feedback): "{count} people removed. Refund requested for {refunds}; {pending} waiting for your decision." Never "refunded" (D-31-6 rule 6).

### 2.4 Pending decisions section (FT-77; AC 21)

- Heading "Pending decisions" (`h2`), count in the heading; appears only when at least one item exists; otherwise the empty text is shown once, small ("Nothing waiting for a decision.") so the streamer learns where it lives.
- Grouped by queue (`<section aria-label>` per queue, queue title as `h3`). Row: display name, mark ("Waiting for your decision" or "Check group"), for "Check group" the plain reason (7.4), how long ago.
- **Waiting for your decision** row: one button "Decide…" (opens the decision dialog).
- **Check group** row: two buttons: "Check again" and "Decide…" (dialog with Refund / Do not refund / "Decide later"; "Decide later" is the "keep" of AC 21 and changes nothing). Under "Check again" a visible hint: "If the person is not in the group, the redemption is completed without refund." (consequence before the click).
- Batch: per-queue checkbox per row and a bar "Select all / {n} selected" with "Decide for selected…" (same dialog, text "…the {n} selected people"). A checkbox per row has the person's name as label.
- Result of "Check again" (`role="status"`): in a group and still in service → "In a group. Points stay held until the end."; in a group and closed → "In a group. Decide about the points."; not in a group → "Not in a group. Redemption completed without refund."; still unknown → "Still could not check. {reason}".
- Survives a clear, the end of the stream and a restart; never expires by itself (AC 21).
- Responsive: rows stack under 600 px (name and mark on the first line, buttons full width below).

### 2.5 Visible states on the queue and in the widget

- Queue card badge: "{n} waiting for your decision" (link to the section), shown only when n > 0, with text and an icon from the project icon set (icon map file `app/components/ui/icons/icon-map.ts` does not exist in this repo; use the icons the panel already uses and **do not invent any**; the mark must also read as text).
- In-service row of a member: mark "Points held until the end" and, under the complete button, the hint "On finishing, we request the return of the points." (`aria-describedby` of "complete"). After completing: card feedback "Service finished. Refund requested; Twitch will confirm." (`role="status"`).
- "Check group" mark on any row: with a "Decide in Pending decisions" link.
- Skipped / restored: feedback states the new position.
- **Widget "next" (AC 8):** one extra line "Next: {displayName}" inside the account widget, smaller than the current name, in the widget's configured text color (contrast follows the widget editor's existing colors; ≥ 4.5:1 against the configured background is a check for `@qa`). One line, `text-overflow: ellipsis`, no user id, no login. **No waiting entry: the line is not rendered at all** (no "Next: —", no empty box). No toggle in this story `[AUTO-DECISION]` (not in the ACs; reopen on request). The widget is read inside OBS, so it carries no live region. The editor preview shows the sample "Next: Sample name".

### 2.6 Own list (Settings, FT-74; AC 10)

- Section "Own refund list" in channel Settings: "People you trust. Used by any queue that has this group ticked. Stored: number of the Twitch account and a label."
- Form: login (resolved once when adding; reuses the existing `twitch_user_not_found` error), label (optional, max 40; **prefilled with the typed login**, editable, so the list is readable `[AUTO-DECISION]`, stored as the label), "Add". Counter "{n} of 500".
- List (`<ul>`): label, date added, "Remove" per row (no dialog, reversible by adding again; result `role="status"` "Removed {label}", focus moves to the next row, or to the heading when the list becomes empty).
- "Clear all": opens a `<dialog>` with the count "Remove all {n} people from the list? Queues using this group will refund nobody from it."; buttons "Back" / "Clear list".
- Empty: "No one on the list yet." Errors: not found, already in list, limit reached (7.5).

### 2.7 Reauthorization by scope (FT-75; AC 16)

1. The streamer ticks a group whose scope is missing and **saves**. The group shows "Waiting for reconnection" and a text: "To check {group}, Twitch needs your permission. {reason}". The reconnect button appears **only when the form has no unsaved changes** (otherwise a hint "Save first, then reconnect").
2. "Reconnect to Twitch" leaves for the Twitch authorization (full navigation). The panel does not promise what Twitch will list (real test item 6 is open).
3. On return, the outcome region announces: success → "Twitch reconnected. Permission for {group} granted." and focus goes to the outcome region; not granted → "Permission for {group} was not granted. The group stays waiting for reconnection." (`alert`).
4. Moderator reason (broad scope): "Twitch groups the reading of moderators under a wide, read-only moderation permission. The app only asks whether a person is a moderator."
5. Until granted, lookups of that group fail → "Check group" with reason `scope_missing`; the Pending decisions row offers "Reconnect to Twitch" next to "Check again".
6. Existing connections keep working: the required scopes do not change; no banner or forced reconnect for streamers who never enable a group.

### 2.8 Errors and empty states

Generic failures use the panel's localized generic text with `referenceId` (OutcomeRegion shows it). Never a Twitch message, user id or stack. Table of texts in 7.5.

## 3. Mapping to existing patterns (reuse and conflicts)

| Need | Reuse | Conflict / adaptation |
|---|---|---|
| Modal decisions | `<dialog class="operation-confirmation">`, `showModal()`, `aria-labelledby`/`describedby` (clear dialog, reward dialogs) | The clear dialog focuses its first control; here focus goes to the **title** (`tabindex="-1"`) so no choice is armed |
| Result messages | Card-level `queue-action-feedback` with `role=status`/`alert` (queue-list); `OutcomeRegion` for page-level outcomes (two always-mounted live elements, role never switched) | Do not mount a new live region per dialog result; write into the existing regions. Reconnect results go to `OutcomeRegion` |
| Focus after closing | The call-next pattern (`statusRef.current.focus()`) | The trigger row may have disappeared (entry removed): focus the card feedback region (`tabindex="-1"`), then the Pending section heading |
| Buttons | `small-action`, `button button-secondary` | The class `.small-action` has no definition found in the source styles read; its height is **not verified** (checklist item) |
| Plurals | `OutcomeRegion` plural keys (`.one/.other`) | New count keys must have `.one` and `.other` in the three languages |
| Switches | Existing `queue_settings.*` keys | Notices and groups are new fieldsets, not three more lines of the old list |
| Reconnect | `panel.connection.reconnect` | — |

## 4. Accessibility and responsiveness

- **Live regions:** results `role="status"`; refusals/failures `role="alert"`; the two stay mounted (project rule). The "Checking group…" line is `role="status"` and `aria-busy` on the triggering button. No region changes role while it has text.
- **Focus:** dialog open → title; close → trigger or, if gone, feedback region; reconnect return → outcome region; list "Remove" → next row; nothing steals focus on a timer.
- **Tab order:** settings: moment radios → retention notice (not focusable) → group checkboxes → reconnect (when shown) → notice switches → Save. Decision dialog: title → Refund → Do not refund → Back. Batch dialog: title → radios → Confirm → Back. Pending list: row action(s) in visual order; batch bar before the rows.
- **Targets:** every new button, checkbox and radio at least 44 x 44 px including its label area, at 320, 390 and 768 px; 8 px spacing between the two decision buttons; at 320 px the decision buttons are full width and stacked.
- **Contrast:** text and badge text at least 4.5:1, large text and control borders 3:1; marks use text + icon, never color alone; the "final" wording is text, not red alone. `@qa` measures; the project palette values were not recomputed here.
- **Destructive actions:** "Do not refund (final)" (decision dialog, batch, pending), "Clear list". Each names the consequence in its own label or helper, as the specific confirmation.
- **Zoom/reflow:** dialogs scroll inside themselves at 320 px and 200% zoom; no horizontal scroll; long names wrap (`overflow-wrap: anywhere`).
- **Motion:** no animation is required for any state.
- **Language:** `lang` follows the panel locale; chat texts follow the channel language.
- **Screen readers:** designed for them, **not tested**; the owner accepted the risk.

## 5. Contrast with the story and the design

- Skip does not ask (design D-31-4) — implemented as 2.2. This is the one place where AC 20 lists "skip" and the design narrows it; the plan follows the design.
- The "check group" mark never uses the OPS-22 vocabulary (design D-31-8): "unknown" is never shown for it.
- "Retry" in Pending decisions carries a final consequence for non-members; stated before the click instead of a second dialog (the normal path would have completed it as well).

## 6. Texts of the retention notice

| Key | en | es | pt-BR |
|---|---|---|---|
| `panel.settlement.retention` | The group is checked when service starts or when the entry is closed, not when the person joins. For people in a chosen group, the redemption stays pending on Twitch and the points only come back after you finish the service. Everyone else is served as usual. | El grupo se comprueba cuando empieza la atención o se cierra la entrada, no cuando la persona se une. Para quien está en un grupo elegido, el canje queda pendiente en Twitch y los puntos solo vuelven cuando termines la atención. A los demás se les atiende como siempre. | O grupo é verificado quando o atendimento começa ou a entrada é encerrada, não quando a pessoa entra na fila. Para quem está em um grupo escolhido, o resgate fica pendente na Twitch e os pontos só voltam depois que você concluir o atendimento. As demais pessoas são atendidas como sempre. |

## 7. Catalog keys

Rules: no jargon; no user id, no raw error; pt-BR keeps "recompensa" for the reward; "Pontos do Canal" for the points; "resgate" for a redemption; chat texts are short (well under 500 characters; the sender composes lists with `more_suffix`). `{user}` and `{queue}` are the existing placeholder style. Plural keys have `.one` and `.other` in the three languages (Spanish also `.many` where the catalog tooling requires it, as the existing keys do).

### 7.1 Chat notices (catalog `chat`; the keys of the `@architect` plus the ones marked **new**)

| Key | en | es | pt-BR |
|---|---|---|---|
| `chat.notice.joined` | @{user}, you joined {queue} at position {position}. We will tell you when it is your turn. | @{user}, entraste en la cola {queue} en la posición {position}. Te avisaremos cuando sea tu turno. | @{user}, você entrou na fila {queue} na posição {position}. Avisaremos quando for a sua vez. |
| `chat.notice.joined_many` | {count} people joined {queue}. Use the queue command to see your position. | {count} personas entraron en la cola {queue}. Usa el comando de la cola para ver tu posición. | {count} pessoas entraram na fila {queue}. Use o comando da fila para ver sua posição. |
| `chat.notice.refused.queue_closed` | @{user}, {queue} is closed. This redemption was refused and the return of your points was requested. | @{user}, la cola {queue} está cerrada. Este canje se rechazó y se solicitó la devolución de tus puntos. | @{user}, a fila {queue} está fechada. Este resgate foi recusado e a devolução dos seus pontos foi solicitada. |
| `chat.notice.refused.queue_paused` | @{user}, {queue} is paused. This redemption was refused and the return of your points was requested. | @{user}, la cola {queue} está en pausa. Este canje se rechazó y se solicitó la devolución de tus puntos. | @{user}, a fila {queue} está em pausa. Este resgate foi recusado e a devolução dos seus pontos foi solicitada. |
| `chat.notice.refused.duplicate_entry` | @{user}, you are already in {queue}. This redemption was refused and the return of your points was requested. | @{user}, ya estás en la cola {queue}. Este canje se rechazó y se solicitó la devolución de tus puntos. | @{user}, você já está na fila {queue}. Este resgate foi recusado e a devolução dos seus pontos foi solicitada. |
| `chat.notice.queue_paused` | {queue} is paused. New redemptions will be refused and the points returned. | La cola {queue} está en pausa. Los canjes nuevos se rechazarán y se devolverán los puntos. | A fila {queue} está em pausa. Novos resgates serão recusados e os pontos devolvidos. |
| `chat.notice.queue_closed` | {queue} is closed. New redemptions will be refused and the points returned. | La cola {queue} está cerrada. Los canjes nuevos se rechazarán y se devolverán los puntos. | A fila {queue} foi fechada. Novos resgates serão recusados e os pontos devolvidos. |
| `chat.notice.queue_reopened` | {queue} is open again. Redeem the reward to join. | La cola {queue} está abierta otra vez. Canjea la recompensa para entrar. | A fila {queue} foi reaberta. Resgate a recompensa para entrar. |
| `chat.notice.service_ended` | @{user}, your service in {queue} is finished. Thank you! | @{user}, tu atención en la cola {queue} terminó. ¡Gracias! | @{user}, seu atendimento na fila {queue} terminou. Obrigado! |
| `chat.notice.service_ended_next` (**new**) | @{user}, your service in {queue} is finished. Next: @{next}. | @{user}, tu atención en la cola {queue} terminó. Sigue: @{next}. | @{user}, seu atendimento na fila {queue} terminou. Próximo: @{next}. |
| `chat.notice.next_up` (**new**) | @{user}, you are next in {queue}. Be ready! | @{user}, eres el siguiente en la cola {queue}. ¡Prepárate! | @{user}, você é o próximo da fila {queue}. Fique atento! |
| `chat.notice.no_show` | @{user}, you did not answer the call in {queue} and were marked absent. | @{user}, no respondiste a la llamada en la cola {queue} y se te marcó como ausente. | @{user}, você não respondeu à chamada na fila {queue} e foi marcado como ausente. |
| `chat.notice.skipped` | @{user}, your turn in {queue} was moved. You are now at position {position}. | @{user}, tu turno en la cola {queue} se aplazó. Ahora estás en la posición {position}. | @{user}, sua vez na fila {queue} foi adiada. Você agora está na posição {position}. |
| `chat.notice.restored` | @{user}, your absence was undone. You are back in {queue} at position {position}. | @{user}, se deshizo tu ausencia. Volviste a la cola {queue} en la posición {position}. | @{user}, sua ausência foi desfeita. Você voltou à fila {queue} na posição {position}. |
| `chat.notice.reordered` | The order of {queue} changed. Use the queue command to see your position. | El orden de la cola {queue} cambió. Usa el comando de la cola para ver tu posición. | A ordem da fila {queue} mudou. Use o comando da fila para ver sua posição. |
| `chat.notice.cleared.one` | {queue} was cleared. {count} person removed. | Se vació la cola {queue}. Se quitó {count} persona. | A fila {queue} foi limpa. {count} pessoa removida. |
| `chat.notice.cleared.other` | {queue} was cleared. {count} people removed. | Se vació la cola {queue}. Se quitaron {count} personas. | A fila {queue} foi limpa. {count} pessoas removidas. |
| `chat.notice.cleared_refunds` (**new**, suffix) | Points return requested for {refunds}. | Devolución de puntos solicitada para {refunds}. | Devolução de pontos solicitada para {refunds}. |
| `chat.notice.cleared_pending` (**new**, suffix) | {pending} waiting for a decision. | {pending} esperan una decisión. | {pending} aguardam uma decisão. |
| `chat.notice.points.refund_requested` | @{user}, we asked Twitch to return your points. We will tell you when it is confirmed. | @{user}, pedimos a Twitch que devuelva tus puntos. Te avisaremos cuando se confirme. | @{user}, pedimos à Twitch a devolução dos seus pontos. Avisaremos quando for confirmada. |
| `chat.notice.points.refunded` | @{user}, your Channel Points were returned. | @{user}, tus puntos del canal fueron devueltos. | @{user}, seus Pontos do Canal foram devolvidos. |
| `chat.notice.points.not_refunded` | @{user}, your redemption was completed and the points will not be returned this time. | @{user}, tu canje se completó y los puntos no se devolverán esta vez. | @{user}, seu resgate foi concluído e os pontos não serão devolvidos desta vez. |
| `chat.notice.points.pending_decision` | @{user}, you left {queue}. The streamer will decide about your points. | @{user}, saliste de la cola {queue}. El streamer decidirá sobre tus puntos. | @{user}, você saiu da fila {queue}. O streamer vai decidir sobre os seus pontos. |
| `chat.notice.more_suffix.one` / `.other` | ` and {count} more` | ` y {count} más` | ` e mais {count}` |

Rules: `refunded` is sent only after Twitch confirms (D-31-10); "Check group" sends **no** chat message (it would reveal an internal state); the refusal family never uses the words of the points family (AC 28); the end-of-service text picks `service_ended_next` when a waiting entry exists and `service_ended` otherwise.

### 7.2 Panel — settings and notices

| Key | en | es | pt-BR |
|---|---|---|---|
| `panel.settlement.legend` | Channel Points | Puntos del canal | Pontos do Canal |
| `panel.settlement.mode.start` | Use the points when service starts (default) | Usar los puntos cuando empieza la atención (predeterminado) | Usar os pontos quando o atendimento começar (padrão) |
| `panel.settlement.mode.end` | Return the points when service ends, for the groups I choose | Devolver los puntos al terminar la atención, para los grupos que elija | Devolver os pontos ao terminar o atendimento, para os grupos que eu escolher |
| `panel.settlement.retention` | (section 6) | (section 6) | (section 6) |
| `panel.settlement.groups.legend` | Who gets points back | Quién recibe los puntos de vuelta | Quem recebe os pontos de volta |
| `panel.settlement.groups.self` | You always count as a member of the chosen groups. | Tú siempre cuentas como miembro de los grupos elegidos. | Você sempre conta como membro dos grupos escolhidos. |
| `panel.settlement.group.subscriber` | Subscribers (paid, gifted and Prime) | Suscriptores (de pago, regalados y Prime) | Inscritos (pagos, presenteados e Prime) |
| `panel.settlement.group.moderator` | Moderators | Moderadores | Moderadores |
| `panel.settlement.group.vip` | VIPs | VIP | VIPs |
| `panel.settlement.group.own_list` | My own list | Mi propia lista | Minha lista própria |
| `panel.settlement.group.manage_list` | Manage the list in Settings | Gestionar la lista en Ajustes | Gerenciar a lista em Configurações |
| `panel.settlement.group.empty_hint` | No group chosen: nobody will get points back. | Ningún grupo elegido: nadie recibirá puntos de vuelta. | Nenhum grupo escolhido: ninguém terá os pontos devolvidos. |
| `panel.settlement.group.pending_reconnect` | Waiting for reconnection | Esperando reconexión | Aguardando reconexão |
| `panel.settlement.group.needs_scope` | To check {group}, Twitch needs your permission. | Para comprobar {group}, Twitch necesita tu permiso. | Para verificar {group}, a Twitch precisa da sua permissão. |
| `panel.settlement.group.reason.moderator` | Twitch groups the reading of moderators under a wide, read-only moderation permission. The app only asks whether a person is a moderator. | Twitch agrupa la lectura de moderadores en un permiso amplio de moderación, solo de lectura. La app solo pregunta si una persona es moderadora. | A Twitch agrupa a leitura de moderadores em uma permissão ampla de moderação, somente leitura. O app só pergunta se a pessoa é moderadora. |
| `panel.settlement.group.save_first` | Save first, then reconnect. | Guarda primero y luego reconecta. | Salve primeiro e depois reconecte. |
| `panel.settlement.group.reconnect` | Reconnect to Twitch | Reconectar con Twitch | Reconectar com a Twitch |
| `panel.settlement.unavailable.reward_not_owned` | Not available: this reward was not created by this app. | No disponible: esta recompensa no la creó esta app. | Indisponível: esta recompensa não foi criada por este app. |
| `panel.settlement.unavailable.skip_queue` | Not available: the reward skips the request queue on Twitch. | No disponible: la recompensa se salta la cola de solicitudes de Twitch. | Indisponível: a recompensa pula a fila de solicitações da Twitch. |
| `panel.settlement.unavailable.not_affiliate` | Not available: the channel must be affiliate or partner. | No disponible: el canal debe ser afiliado o socio. | Indisponível: o canal precisa ser afiliado ou parceiro. |
| `panel.settlement.change_applies_later` | This change applies to new decisions. Points already held keep the rule they were decided under. | Este cambio se aplica a decisiones nuevas. Los puntos ya retenidos mantienen la regla con la que se decidieron. | Esta mudança vale para novas decisões. Os pontos já retidos mantêm a regra com que foram decididos. |
| `panel.notice_settings.legend` | Chat notices | Avisos en el chat | Avisos no chat |
| `panel.notice_settings.joined` | Say the position when someone joins | Decir la posición cuando alguien entra | Avisar a posição quando alguém entrar |
| `panel.notice_settings.service` | Announce end of service, next person, absences and skips | Avisar fin de atención, siguiente, ausencias y aplazamientos | Avisar fim de atendimento, próximo, ausências e adiamentos |
| `panel.notice_settings.state` | Announce when the queue is paused, closed, reopened or cleared | Avisar cuando la cola se pausa, cierra, reabre o vacía | Avisar quando a fila for pausada, fechada, reaberta ou limpa |
| `panel.notice_settings.reordered` | Announce when you reorder the queue | Avisar cuando reordenes la cola | Avisar quando você reordenar a fila |
| `panel.notice_settings.points` | Tell the person what happened to their points | Decir a la persona qué pasó con sus puntos | Contar à pessoa o que aconteceu com os pontos dela |
| `panel.notice_settings.hint` | Messages are limited so the chat is never flooded; the "your turn" call always goes first. | Los mensajes están limitados para no saturar el chat; el aviso de turno siempre va primero. | As mensagens têm limite para não inundar o chat; a chamada de "sua vez" sempre vai primeiro. |

### 7.3 Panel — decision dialog, marks, batch

| Key | en | es | pt-BR |
|---|---|---|---|
| `panel.entry.mark.held` | Points held until the end | Puntos retenidos hasta el final | Pontos retidos até o fim |
| `panel.entry.mark.check_group` | Check group | Comprobar grupo | Verificar grupo |
| `panel.entry.mark.awaiting_choice` | Waiting for your decision | Esperando tu decisión | Aguardando sua decisão |
| `panel.entry.hint.complete_held` | On finishing, we request the return of the points. | Al finalizar, solicitamos la devolución de los puntos. | Ao concluir, solicitamos a devolução dos pontos. |
| `panel.entry.action.skip` / `_aria` | skip / Skip {user} | aplazar / Aplazar a {user} | pular / Pular {user} |
| `panel.entry.action.restore` / `_aria` | restore / Bring {user} back to the queue | restaurar / Devolver a {user} a la cola | restaurar / Trazer {user} de volta à fila |
| `panel.entry.checking_group` | Checking group… | Comprobando el grupo… | Verificando o grupo… |
| `panel.entry.moved_position` | {user} moved to position {position}. | {user} pasó a la posición {position}. | {user} foi para a posição {position}. |
| `panel.entry.moved_position_held` | {user} moved to position {position}. Points stay held until the entry leaves the queue. | {user} pasó a la posición {position}. Los puntos siguen retenidos hasta que salga de la cola. | {user} foi para a posição {position}. Os pontos continuam retidos até a pessoa sair da fila. |
| `panel.entry.group_unchecked` | The group could not be checked. The points of {user} stay held. Decide in Pending decisions. | No se pudo comprobar el grupo. Los puntos de {user} siguen retenidos. Decide en Decisiones pendientes. | Não foi possível verificar o grupo. Os pontos de {user} continuam retidos. Decida em Decisões pendentes. |
| `panel.entry.left_awaiting` | {user} left the queue. Points waiting for your decision. | {user} salió de la cola. Puntos esperando tu decisión. | {user} saiu da fila. Pontos aguardando sua decisão. |
| `panel.entry.completed_refund_requested` | Service finished. Refund requested; Twitch will confirm. | Atención finalizada. Devolución solicitada; Twitch la confirmará. | Atendimento concluído. Devolução solicitada; a Twitch vai confirmar. |
| `panel.settlement.choice.title` | Return the points of {user}? | ¿Devolver los puntos de {user}? | Devolver os pontos de {user}? |
| `panel.settlement.choice.title_many` | Return the points of the {count} selected people? | ¿Devolver los puntos de las {count} personas seleccionadas? | Devolver os pontos das {count} pessoas selecionadas? |
| `panel.settlement.choice.body` | {user} is in a group that gets points back. The entry is closed without a finished service. | {user} está en un grupo que recibe puntos de vuelta. La entrada se cierra sin una atención terminada. | {user} está em um grupo que recebe os pontos de volta. A entrada é encerrada sem um atendimento concluído. |
| `panel.settlement.choice.refund` | Refund the points | Devolver los puntos | Devolver os pontos |
| `panel.settlement.choice.refund_help` | We ask Twitch to return the points. Twitch confirms later. | Pedimos a Twitch que devuelva los puntos. Twitch lo confirma después. | Pedimos à Twitch a devolução dos pontos. A Twitch confirma depois. |
| `panel.settlement.choice.no_refund` | Do not refund (final) | No devolver (definitivo) | Não devolver (definitivo) |
| `panel.settlement.choice.no_refund_help` | The redemption is completed and the points are not returned. This cannot be undone. | El canje se completa y los puntos no se devuelven. No se puede deshacer. | O resgate é concluído e os pontos não voltam. Isso não pode ser desfeito. |
| `panel.settlement.choice.later` | Decide later | Decidir después | Decidir depois |
| `panel.settlement.choice.back` | Back | Volver | Voltar |
| `panel.settlement.choice.saving` | Saving your decision… | Guardando tu decisión… | Salvando sua decisão… |
| `panel.settlement.choice.already_refund` | Already decided: points refunded. | Ya decidido: puntos devueltos. | Já decidido: pontos devolvidos. |
| `panel.settlement.choice.already_no_refund` | Already decided: points not refunded. | Ya decidido: puntos no devueltos. | Já decidido: pontos não devolvidos. |
| `panel.queue.clear.settlement.counts` | {members} in a group, {others} outside the group, {check} to check. | {members} en un grupo, {others} fuera del grupo, {check} por comprobar. | {members} em grupo, {others} fora do grupo, {check} para verificar. |
| `panel.queue.clear.settlement.others` | Outside the group: refund requested as today. | Fuera del grupo: devolución solicitada como hasta ahora. | Fora do grupo: devolução solicitada como hoje. |
| `panel.queue.clear.settlement.check` | To check: they stay held in Pending decisions. | Por comprobar: quedan retenidos en Decisiones pendientes. | Para verificar: ficam retidos em Decisões pendentes. |
| `panel.queue.clear.settlement.legend` | For the people in a group | Para las personas en un grupo | Para as pessoas em um grupo |
| `panel.queue.clear.settlement.refund_all` | Refund everyone's points | Devolver los puntos de todos | Devolver os pontos de todos |
| `panel.queue.clear.settlement.no_refund` | Do not refund (final) | No devolver (definitivo) | Não devolver (definitivo) |
| `panel.queue.clear.settlement.one_by_one` | Decide one by one later | Decidir uno por uno después | Decidir um a um depois |
| `panel.queue.clear.settlement.choose` | Choose what happens to the points of the people in a group. | Elige qué pasa con los puntos de las personas en un grupo. | Escolha o que acontece com os pontos das pessoas em grupo. |
| `panel.queue.delete.settlement_wait` | The queue stays being deleted until every pending decision is made. | La cola sigue en eliminación hasta que se tome cada decisión pendiente. | A fila continua em exclusão até que cada decisão pendente seja tomada. |
| `panel.queue.clear.settlement.done` | {count} people removed. Refund requested for {refunds}; {pending} waiting for your decision. | Se quitaron {count} personas. Devolución solicitada para {refunds}; {pending} esperan tu decisión. | {count} pessoas removidas. Devolução solicitada para {refunds}; {pending} aguardam sua decisão. |

(plural variants `.one/.other` are required for `counts` and `done`; `done` and `choice.title_many` follow the `OutcomeRegion` plural convention.)

### 7.4 Panel — pending list and reasons

| Key | en | es | pt-BR |
|---|---|---|---|
| `panel.pending.title` | Pending decisions | Decisiones pendientes | Decisões pendentes |
| `panel.pending.empty` | Nothing waiting for a decision. | Nada espera una decisión. | Nada aguardando decisão. |
| `panel.pending.card_badge` | {count} waiting for your decision | {count} esperando tu decisión | {count} aguardando sua decisão |
| `panel.pending.decide` | Decide… | Decidir… | Decidir… |
| `panel.pending.recheck` | Check again | Comprobar de nuevo | Verificar de novo |
| `panel.pending.recheck_hint` | If the person is not in the group, the redemption is completed without refund. | Si la persona no está en el grupo, el canje se completa sin devolución. | Se a pessoa não estiver no grupo, o resgate é concluído sem devolução. |
| `panel.pending.select_all` / `.selected` | Select all / {count} selected | Seleccionar todo / {count} seleccionadas | Selecionar tudo / {count} selecionadas |
| `panel.pending.decide_selected` | Decide for selected… | Decidir para las seleccionadas… | Decidir para as selecionadas… |
| `panel.pending.recheck.held` | In a group. Points stay held until the end. | En un grupo. Los puntos siguen retenidos hasta el final. | Está em um grupo. Os pontos continuam retidos até o fim. |
| `panel.pending.recheck.awaiting` | In a group. Decide about the points. | En un grupo. Decide sobre los puntos. | Está em um grupo. Decida sobre os pontos. |
| `panel.pending.recheck.not_member` | Not in a group. Redemption completed without refund. | No está en un grupo. Canje completado sin devolución. | Não está em um grupo. Resgate concluído sem devolução. |
| `panel.pending.recheck.still_unknown` | Still could not check. {reason} | Sigue sin poderse comprobar. {reason} | Ainda não foi possível verificar. {reason} |
| `panel.pending.reason.scope_missing` | Twitch permission missing. Reconnect to Twitch. | Falta el permiso de Twitch. Reconecta con Twitch. | Falta a permissão da Twitch. Reconecte com a Twitch. |
| `panel.pending.reason.unauthorized` | Twitch no longer accepts the connection. Reconnect to Twitch. | Twitch ya no acepta la conexión. Reconecta con Twitch. | A Twitch não aceita mais a conexão. Reconecte com a Twitch. |
| `panel.pending.reason.forbidden` | Twitch did not allow this check. Reconnect to Twitch. | Twitch no permitió esta comprobación. Reconecta con Twitch. | A Twitch não permitiu esta verificação. Reconecte com a Twitch. |
| `panel.pending.reason.rate_limited` | Twitch asked us to wait. Try again in a moment. | Twitch pidió esperar. Inténtalo en un momento. | A Twitch pediu para aguardar. Tente de novo em instantes. |
| `panel.pending.reason.twitch_unavailable` | Twitch is not answering right now. Try again later. | Twitch no responde ahora. Inténtalo más tarde. | A Twitch não está respondendo agora. Tente mais tarde. |
| `panel.pending.reason.timeout` | The check took too long. Try again. | La comprobación tardó demasiado. Inténtalo de nuevo. | A verificação demorou demais. Tente de novo. |
| `panel.pending.reason.malformed_response` / `.lookup_error` | The check failed. Try again; if it repeats, decide by hand. | La comprobación falló. Inténtalo de nuevo; si se repite, decide a mano. | A verificação falhou. Tente de novo; se repetir, decida manualmente. |
| `panel.pending.reason.channel_not_eligible` | This channel is not affiliate or partner, so Twitch does not share this list. | Este canal no es afiliado ni socio, así que Twitch no comparte esta lista. | Este canal não é afiliado nem parceiro, então a Twitch não compartilha esta lista. |
| `panel.pending.age` | {time} ago | hace {time} | há {time} |
| `panel.reconnect.granted` | Twitch reconnected. Permission for {group} granted. | Twitch reconectada. Permiso de {group} concedido. | Twitch reconectada. Permissão de {group} concedida. |
| `panel.reconnect.not_granted` | Permission for {group} was not granted. The group stays waiting for reconnection. | No se concedió el permiso de {group}. El grupo sigue esperando reconexión. | A permissão de {group} não foi concedida. O grupo continua aguardando reconexão. |

### 7.5 Panel — own list, errors, empty

| Key | en | es | pt-BR |
|---|---|---|---|
| `panel.refund_list.title` | Own refund list | Lista propia de devolución | Lista própria de devolução |
| `panel.refund_list.description` | People you trust. Used by any queue that has this group ticked. Stored: the Twitch account number and a label. | Personas de tu confianza. La usa toda cola con este grupo marcado. Se guarda: el número de la cuenta de Twitch y una etiqueta. | Pessoas de confiança. Usada por toda fila com este grupo marcado. Fica guardado: o número da conta da Twitch e um rótulo. |
| `panel.refund_list.label` | Label (optional) | Etiqueta (opcional) | Rótulo (opcional) |
| `panel.refund_list.add` | Add | Añadir | Adicionar |
| `panel.refund_list.count` | {count} of {max} | {count} de {max} | {count} de {max} |
| `panel.refund_list.added_on` | Added on {date} | Añadido el {date} | Adicionado em {date} |
| `panel.refund_list.remove_aria` | Remove {label} from the list | Quitar a {label} de la lista | Remover {label} da lista |
| `panel.refund_list.removed` | Removed {label}. | Se quitó a {label}. | {label} removido. |
| `panel.refund_list.clear` | Clear all | Vaciar todo | Limpar tudo |
| `panel.refund_list.clear_confirm` | Remove all {count} people from the list? Queues using this group will refund nobody from it. | ¿Quitar a las {count} personas de la lista? Las colas que usen este grupo no devolverán a nadie de ella. | Remover as {count} pessoas da lista? As filas que usam este grupo não devolverão ninguém dela. |
| `panel.refund_list.clear_done` | List cleared. | Lista vaciada. | Lista limpa. |
| `panel.refund_list.empty` | No one on the list yet. | Aún no hay nadie en la lista. | Ainda não há ninguém na lista. |
| `panel.refund_list.error.duplicate` | This person is already on the list. | Esta persona ya está en la lista. | Esta pessoa já está na lista. |
| `panel.refund_list.error.limit` | The list is full ({max} people). Remove someone to add another. | La lista está llena ({max} personas). Quita a alguien para añadir otra. | A lista está cheia ({max} pessoas). Remova alguém para adicionar outra. |
| `panel.refund_list.error.not_found` | reuse `panel.entry.error.twitch_user_not_found` | reuse | reuse |
| `panel.settlement.error.generic` | Could not save the decision. Nothing was changed. Try again. | No se pudo guardar la decisión. No se cambió nada. Inténtalo de nuevo. | Não foi possível salvar a decisão. Nada foi alterado. Tente de novo. |
| `panel.settlement.error.stale` | This entry changed. Refresh the queue and review it. | Esta entrada cambió. Actualiza la cola y revísala. | Esta entrada mudou. Atualize a fila e revise. |
| `panel.settlement.error.uncertain` | The decision may have been saved. Refresh before trying again. | La decisión pudo haberse guardado. Actualiza antes de reintentar. | A decisão pode ter sido salva. Atualize antes de tentar de novo. |
| `widget.queue.next` (overlay catalog) | Next: {name} | Siguiente: {name} | Próximo: {name} |

Unexpected failures: the generic localized text with `referenceId` (existing), never the raw reason.

## 8. Scores (static review, 0-10; minimum 9.0)

| Item | Score | Main reason / residual |
|---|---|---|
| Settings per queue (moment, groups, retention text, disabled reasons) | 9.3 | Text on the control; reuses form patterns. Hidden until FT-76 avoids a half feature |
| Decision dialog (refund / do not refund) | 9.3 | One step, equal weight, consequence in the label. Residual: speed on a live stream not measured |
| Batch choice and counts (AC 26) | 9.1 | No default avoids silent decisions; the 60 s window is a request to `@dev` |
| "Check group" (list, reasons, actions) | 9.2 | Plain reasons, consequence stated before "Check again". Residual: wording of the OPS-22 contrast |
| Marks, queue badge, widget "next" | 9.0 | Marks are text; widget contrast depends on user colors; icon choice not validated |
| Reauthorization by scope | 9.0 | Clear steps; the content of the second Twitch authorization is unknown (real test item 6) |
| Texts (panel + chat, 3 languages) | 9.2 | Short, no jargon; Spanish and phrasing not reviewed by a native speaker |
| Accessibility and responsiveness (design) | 9.1 | Reuses proven patterns; every measurement is pending |
| Pending decisions section | 9.2 | Survives clear/restart; no new page |
| **Overall** | **9.1 / 10** | Valid only for this scope and only as a **static** review |

## 9. What was NOT validated

- No browser, no visual check, no screenshot, no 320/390/768 px test: layout, spacing, wrapping and 44 px targets are design intent, not measured. The `.small-action` size is unknown.
- No contrast measurement (palette values not recomputed).
- No screen reader (NVDA, VoiceOver, TalkBack): accepted risk by the owner. Keyboard-only flow was not run.
- No real Twitch run: reconnect screens, lookup latency (how long "Checking group…" lasts), chat limiter behavior, widget in native OBS.
- The panel code was read only for patterns (dialog, regions, focus), not line by line; the icon map file named in the agent rules does not exist in this repository, so no icon was chosen.
- Spanish and Portuguese texts were written by the agent; no native review. Catalog plural rules for Spanish `.many` were not checked against the localization validator.
- Open facts from the design stay open: Twitch expiry of an `UNFULFILLED` redemption (if short, the retention paragraph must change after the real test), restoration of reward limits after a cancel, second authorization content.

## 10. Checklist for `@qa`

**Browser, each at 320, 390 and 768 px (and 200% zoom at 320):**
- [ ] Settings: moment radios, retention paragraph visible and linked by `aria-describedby`; group checkboxes; disabled reasons appear as text; empty-set hint; "waiting for reconnection" badge; reconnect button hidden while the form is dirty.
- [ ] Decision dialog: title focused on open; `Esc` and "Back" close without effect; both choices equal size; no choice pre-armed; buttons stack and are full width at 320; "Do not refund (final)" wording present; result lands in the card region; "already decided" appears on a second tab.
- [ ] Skip of a member asks nothing and states the new position (2); no-show by timer lists the item as waiting.
- [ ] Clear and delete dialogs: counts correct for 0 members, only members, mixed, some unknown; radios without default; Confirm disabled with visible reason; selection reset when the snapshot changes; result text says "requested", never "refunded".
- [ ] Pending decisions: appears after a clear and after a reload; badge on card and navigation; recheck outcomes (four texts); batch selection by name labels; hint before "Check again"; stacked rows below 600 px.
- [ ] Own list: add (login resolved once, label prefilled), duplicate, limit, remove (focus moves), clear all dialog, empty text.
- [ ] Widget "next": shown with a waiting entry, absent without one, long name ellipsis, no id/login; native OBS is a separate class (OPS-25 method).
- [ ] Chat notices (fake and then real): texts in en, es, pt-BR; no text over 500 characters; refusal vs points families never mixed; "refunded" only after confirmation; no message for "check group".
- [ ] Targets at least 44 px for every new control; 8 px between the two decision buttons.
- [ ] Contrast at least 4.5:1 for text and marks (measure); marks readable without color.
- [ ] Live regions: one `status` and one `alert` stay mounted; no role switch with text; no focus theft on timers.
- [ ] Keyboard only: full tab order as in section 4, dialogs trap and restore focus (or fall back to the feedback region).
- [ ] Catalog validation: `npm run validate:localization` with the new keys, plural forms in three languages, no key missing in any language.

**Screen reader:** not requested (risk accepted by the owner); record as "not run".

## 11. Notes for other agents

- `@po`: new items for the story text: notices default (new queues on except "reordered"; migrated queues all off), skip/restore position 2, widget with no toggle, own list label prefilled with the login, `Decide later` as the "keep" of AC 21, 60 s window request.
- `@architect`: new chat keys `service_ended_next`, `next_up`, `cleared_refunds`, `cleared_pending` beyond your list; confirm "check group" sends no chat message; confirm the "Check again" consequence for non-members matches D-31-5 rule 7.
- `@dev`: do not invent icons; read `OutcomeRegion` and the clear dialog before building; keep one decision-dialog component for the row, the pending list and the batch.

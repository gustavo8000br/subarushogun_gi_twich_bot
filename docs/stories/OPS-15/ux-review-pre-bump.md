# UX plan and review before the 0.3.0-beta bump (2026-11-05)

Português: `docs/pt-BR/stories/OPS-15/ux-review-pre-bump.md`. Author: `@ux-design-expert` (Uma). Inputs: [po-validation-bugs-pre-bump.md](po-validation-bugs-pre-bump.md), [architect-note-pre-bump.md](architect-note-pre-bump.md), [ts-10-wave-note.md](ts-10-wave-note.md), OPS-25 story (widget sections), the code read below.

**Review type: STATIC** (texts, catalogs, CSS, component code, computed contrast from the CSS hex values). **Not** a visual, browser, native OBS/CEF or assistive-technology review. Every score below is valid only for the scope named in its row.

**Research:** no GAP in `docs/research-index.md` for these items (chat text, panel notices, catalog wording, two CSS values). No internet research was done.

## 1. Scores

| # | Item | Score | Scope of the score | Verdict |
|---|---|---|---|---|
| 1 | `ping` texts (D-8) | **9.1** | final wording en/es/pt-BR, how the codes reach the streamer | GO |
| 2 | FT-53 panel text, live region, focus | **9.1** | text, `reason` mapping, region and focus (code read) | GO |
| 3 | FT-54 singular and "recompensa" | **9.2** | the four singular/plural families, pt-BR term rule | GO |
| 4 | Account widget in OBS (states and texts) | **8.8** | existing texts and state logic only; no pixel evidence | BELOW 9.0 (see 3.4) |
| 5 | D1 (language picker), D3 (reward dialogs) | **9.0** | behavior and CSS values, static | GO with conditions |
| 6 | DP-4 mobile checklist | **9.0** | plan for `@qa`, not an execution | GO |
| | **General (items with `@dev` work: 1, 2, 3, 5)** | **9.1** | | `@dev` may start |
| | General including 4 and 6 | **9.0** | | |

Item 4 does not block `@dev` (no code is planned for the widget), but AC-W-6 cannot be closed at 9.0 until the `@qa` native run supplies the evidence listed in 3.4. Who resolves it: `@qa` (run), then `@ux-design-expert` re-scores in one short addendum.

## 2. Final texts (key -> en / es / pt-BR)

### 2.1 Chat `ping` (chat catalogs)

Owner format is binding; the review checks readability and length (all replies are well under 500 characters).

| Key | en | es | pt-BR |
|---|---|---|---|
| `chat.ping.response` (`{version}`, `{latency}` = integer ms) | `Pong 🏓 - {version} - {latency}ms.` | `Pong 🏓 - {version} - {latency}ms.` | `Pong 🏓 - {version} - {latency}ms.` |
| `chat.ping.error` (`{version}`, `{code}`) | `Pong 🏓 - {version} - no Twitch measurement ({code}).` | `Pong 🏓 - {version} - sin medición de Twitch ({code}).` | `Pong 🏓 - {version} - sem medição da Twitch ({code}).` |
| `chat.ping.unavailable` | remove (grep must prove no use) | remove | remove |

Decisions:
- `[AUTO-DECISION]` the "ms" unit stays attached to the number (`219ms`) in all three languages, because the owner format and AC-D8-1 fix it. The only cost is a minor typographic variation in es; accepted for one consistent chat line.
- The old `Bot ativo`/`Twitch:` wording is dropped. "Pong" plus the version is enough for viewers; the failure form says plainly "no measurement" instead of "unavailable" (it is a statement about the measurement, not an alarm about the bot).
- The code in parentheses is jargon for viewers, but it is the only place where the streamer sees the cause without opening logs. It is short, uppercase and sits at the end, so viewers can ignore it. Kept (owner format). No raw error, number or stack is ever printed.
- Never print "0ms" for a failure: the error form is used for every non-`ok` state (architect contract).

How the streamer sees the codes (`TWITCH_PROBE_FAILED`, `TWITCH_NOT_CONNECTED`): in the chat reply itself, and explained on the commands page by extending one existing description key (no new panel key, no new markup). `/health` and the overview card keep `panel.health.ping_unavailable` ("Sem medição" / "No measurement" / "Sin medición"), which already matches the chat wording.

| Key | en | es | pt-BR |
|---|---|---|---|
| `panel.command.description.global_queue_ping` | Check the bot, its version, and Twitch latency. With no measurement, the reply shows a code: TWITCH_NOT_CONNECTED (channel not connected) or TWITCH_PROBE_FAILED (Twitch did not answer the measurement). | Comprobar el bot, su versión y la latencia de Twitch. Sin medición, la respuesta muestra un código: TWITCH_NOT_CONNECTED (canal no conectado) o TWITCH_PROBE_FAILED (Twitch no respondió a la medición). | Verificar o bot, sua versão e a latência da Twitch. Sem medição, a resposta traz um código: TWITCH_NOT_CONNECTED (canal não conectado) ou TWITCH_PROBE_FAILED (a Twitch não respondeu à medição). |

### 2.2 FT-53 (panel catalogs)

Current state read: `queue-lifecycle.mjs` maps `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` to the existing key `panel.queue.delete.cancel.remote_delete_attempted` and the result is rendered by `queue-lifecycle-actions.jsx` as `<p class="queue-action-feedback is-error" role="alert">`. That existing text already says "may have reached Twitch" and "the read did not confirm". It is correct and safe for every reason except the 401, where the useful next step (reauthorize) is missing.

| Key | en | es | pt-BR |
|---|---|---|---|
| **new** `panel.queue.delete.cancel.remote_delete_attempted_reauthorize` (only when `reason === 'authorization_required'`) | The request to delete the reward may have reached Twitch, but Twitch refused the authorization, so we could not check whether the reward still exists. The deletion was not cancelled. Reauthorize the channel on the Twitch connection page, refresh the panel, and review the queue before trying to cancel again. | La solicitud para eliminar la recompensa puede haber llegado a Twitch, pero Twitch rechazó la autorización y no se pudo comprobar si la recompensa sigue existiendo. La eliminación no se canceló. Vuelve a autorizar el canal en la página Conexión de Twitch, actualiza el panel y revisa la cola antes de intentar cancelar de nuevo. | O pedido para excluir a recompensa pode ter chegado à Twitch, mas a Twitch recusou a autorização e não foi possível conferir se ela ainda existe. A exclusão não foi cancelada. Reautorize o canal na página Conexão Twitch, atualize o painel e confira a fila antes de tentar cancelar de novo. |
| existing `panel.queue.delete.cancel.remote_delete_attempted` (used for `verification_unavailable`, `reward_absent`, `reward_diverged`, `reward_not_paused`, missing or unknown `reason`) | unchanged | unchanged | unchanged |

Rules for `@dev`:
- Use the exact label of `panel.navigation.connection` in each language ("Twitch connection", "Conexión de Twitch", "Conexão Twitch"); a contract test can compare the text with that key.
- The text must NOT promise that cancelling will work after reauthorization (OPS-22 AC 16 limit: a pause task restored to `unknown/failed` is not re-armed; "retry now" is needed). The wording "review the queue before trying to cancel again" respects that.
- Select the specific key only on `reason === 'authorization_required'` through an allowlist check (`Object.hasOwn`); any other value, a non-string or an absent field uses the existing generic key. The `reason` string is never rendered.
- No per-reason texts for the four other reasons: the generic text is accurate for each of them and avoids revealing Twitch state in more detail than needed.
- The sentence is long (about 50 words). It is split into three short sentences (what may have happened, what was not done, what to do). Do not add a link inside the alert (keeps the alert a single text node, see below).

Live region and focus (static reading):
- Keep `role="alert"` (already chosen by `outcome.element === 'alert'`): the person just pressed "cancel deletion" and needs to hear the failure. Do not use `status` for this case.
- Do not move focus. The "cancel deletion" button stays rendered and focused; moving focus to the alert would hide the context. The alert is a plain paragraph, so there is no focus trap.
- Known limit: if the same alert text appears twice in a row (second failed attempt with the same `reason`), the content does not change and screen readers may not re-announce it. Cheap mitigation for `@dev`: clear the notice when the cancel starts (the existing `deletion.cancelling` line already appears), so the next alert is a fresh insertion. `@qa` should verify this with a screen reader (checklist).
- No reference ID is expected in this 409 (it is not an unexpected error); the existing `referenceId` rendering is untouched.

### 2.3 FT-54 (panel catalogs)

Acknowledgement of the four families (AC-F54-1): `panel.queue.confirm.delete_local.one` and `panel.queue.confirm.delete_converted.one`, in en, es and pt-BR, were read.

- **Singular forms, en/es/pt-BR: acknowledged, no change.** Agreement is correct ("{count} active entry will be removed", "Se quitará {count} entrada activa", "{count} entrada ativa será removida"); placeholders `{title}` and `{count}` are identical to the plural forms. pt-BR has `one`, `many` and `other`; es has `one`, `many`, `other`; en has `one`, `other` (CLDR categories per language).
- **Term rule (pt-BR):** "recompensa" for reward, "resgate" for redemption, and never the English word "reward" outside a quoted proper name. Gender and article follow Portuguese ("a recompensa", "da Twitch", never "a reward Twitch").
- **Mandatory in this slice (the deletion family of AC-F54-2):** `panel.queue.confirm.delete_local.{one,many,other}`, `panel.queue.confirm.delete_converted.{one,many,other}`, `panel.operation.confirm.continue_delete`, `panel.queue.delete.cancel.{already_deleted,reward_absent,reward_diverged,unverified,processing}`, `panel.queue.delete.done`, `panel.queue.delete.pending`, `panel.queue.confirm.retry_delete_converted`, `panel.queue.status.pending_local_delete`. Edit only the word and its article.
- **Widget keys (AC-F54-4): YES, they enter this slice.** They are visible in the widget editor next to "recompensa" elsewhere on the same page.

| Key | pt-BR (final) |
|---|---|
| `panel.queue.confirm.delete_local.one` | Excluir a fila local “{title}”? {count} entrada ativa será removida. Não há recompensa nem resgate da Twitch vinculados a esta fila. |
| `panel.queue.confirm.delete_local.many` / `.other` | Excluir a fila local “{title}”? {count} entradas ativas serão removidas. Não há recompensa nem resgate da Twitch vinculados a esta fila. |
| `panel.queue.confirm.delete_converted.{one,many,other}` | current text with: "A reward Twitch permanecerá…" -> "A recompensa da Twitch permanecerá…" (keep the rest and the singular/plural verb) |
| `panel.widget.queue_label` | Fila / recompensa vinculada |
| `panel.widget.source.help` | Para exibir dados de uma fila, selecione a fila específica abaixo. A recompensa de Pontos do Canal vinculada é selecionada junto com ela, quando houver. |
| other keys of the family | replace "a reward" -> "a recompensa", "esta reward" -> "esta recompensa", "a reward Twitch" -> "a recompensa da Twitch", "da reward" -> "da recompensa" |

Finding beyond the PO scope (recommendation, `@dev` may widen the Red scan): 28 pt-BR panel values still contain the English word "reward"/"rewards" (a scan of the whole catalog, not only the family). The other 12 outside the family and the widget are: `queue_mode_transition_pending`, `panel.reward_settings.eyebrow` ("CUSTOM REWARD DA FILA" -> "RECOMPENSA PERSONALIZADA DA FILA"), `manual_mode_retry`, `mode_transition.failed`, `mode.converted`, `pending_local_delete_diverged`, `retry_delete_converted_diverged`, `form.section_reward`, `form.mode_channel_points_hint`, `form.twitch_setup_required` and the two already listed. The same rule applies; widening the scan to the whole pt-BR catalog is one test and removes the need for a third pass. Not mandatory for the gate.

Optional es parity fix (non-blocking): `delete_converted.*` in es says "la comunicación con Twitch" where en/pt-BR say "synchronization requests" ("solicitudes de sincronización con Twitch"). Suggested es: "…hasta confirmar todos los canjes conocidos, las solicitudes de sincronización con Twitch y las devoluciones de puntos relacionadas." Apply to `one`, `many` and `other`.

### 2.4 Widget states (OPS-25 subset)

Texts exist today in the overlay catalogs (`overlay.status.*`); no new key.

| State | What the audience sees | Streamer-facing text (key) | en / es / pt-BR |
|---|---|---|---|
| Loading (first poll) | nothing (empty value, empty status) | none | none |
| Connected (authorized) | only the account label, white, no status line | none | none |
| Stale (poll failed, last value kept) | the label at 82% opacity plus a small line | `overlay.status.stale` | `Update delayed` / `Actualización retrasada` / `Atualização atrasada` |
| Data unavailable (first poll failed) | the small line only | `overlay.status.data_unavailable` | `Data temporarily unavailable` / `Datos no disponibles temporalmente` / `Dados temporariamente indisponíveis` |
| Error / not authorized / revoked | the small line only; no label, no internals | `overlay.status.unavailable` | `Source unavailable` / `Fuente no disponible` / `Fonte indisponível` |

The en/es strings above are the intended translations of the pt-BR texts; `@dev` or `@qa` confirm they match `overlay/en.tsv` and `overlay/es.tsv` as they are (this review read only the pt-BR catalog; if the other catalogs differ, treat the difference as a note, not a change).

Decision `[AUTO-DECISION]`: keep the three texts unchanged. They carry no technical term, token, URL or error code, and they are understandable by a viewer ("source unavailable"). Hiding the unauthorized state would leave the streamer blind (an empty source looks identical to "loading"). The story forbids a widget redesign; any change goes to a separate story with its own plan.

## 3. Review per item

### 3.1 Item 1, `ping` (9.1)
Strengths: one fixed shape, one short sentence, same structure in the three languages, no raw error. Gaps that cost points: the code is jargon for viewers (owner format, accepted); "ms" glued to the number in es (owner format). Not validated: how Twitch chat renders the emoji on each client; real latency values (OW-17).

### 3.2 Item 2, FT-53 (9.1)
Strengths: two facts in one text, safe by construction (closed `reason`), no new interaction, the alert and focus behavior already fit. Gaps: no clickable link to the connection page (deliberately omitted to keep the alert simple; the page name matches the navigation label); repeated identical alert may not be re-announced (mitigation above). Not validated: screen reader output.

### 3.3 Item 3, FT-54 (9.2)
Strengths: the singular forms are already correct; a mechanical, test-backed term rule. Gap: es "la comunicación" parity drift (optional fix). Not validated: layout of the longer pt-BR strings in the dialog.

### 3.4 Item 4, widget (8.8)
What the code shows: `overlay.css` sets `html, body { overflow: hidden }`, the label width is `max-content`, and `.overlay-status` is `position: absolute; top: 100%` (below the label), white at 78% alpha, 12 px, with no shadow or background.
Risks that a static review cannot close:
1. **Clipping:** if the OBS Browser Source height equals the label height, the status line sits outside the box and is clipped (`overflow: hidden`). The streamer would then see an empty source in the unauthorized and data-unavailable states, the same as "loading". This is the main thing `@qa` must observe in AC-W-5.
2. **Legibility:** white at 78% on 12 px text has 12.4:1 against black but there is no guarantee over a light or busy scene (no text shadow or backdrop). Not measurable without the real scene.
3. **Timing:** no loading text means a 1-5 s empty source after reload; acceptable for the audience, but `@qa` records the real time (AC-W-1).
What is missing to reach 9.0: pixel evidence from the native OBS run on this machine (states over transparent and dark backgrounds, status visible inside the source box). Who resolves: `@qa` runs AC-W-1..5 and records screenshots of the three states; `@ux-design-expert` re-scores with a short addendum. If risk 1 is confirmed it becomes a separate bug story (the subset allows no fix).

### 3.5 Item 5, D1 and D3 (9.0)
**D1 (language picker, behavior only):** the code (`language-picker.jsx`) falls back to pt-BR when the saved locale has no catalog and keeps the chosen locale while saving. No markup change, so tab order is unchanged (select, then nothing else added) and the accessible name is unchanged (`aria-label`). The fallback matches the existing notice `panel.locale.incomplete` ("saved language is not complete; Brazilian Portuguese is active temporarily"), so what the select shows and what the notice says agree. On a failed save the select returns to the persisted value and the error notice appears; correct.
Concerns (all pre-existing, none worsened; handle as follow-ups, not blockers):
- The select is `disabled` while saving; browsers drop focus from a control that becomes disabled, so a keyboard user loses their place after choosing a language. Suggest a follow-up that restores focus to the select when saving ends (or uses `aria-disabled`).
- `.language-picker .locale-notice.is-error { color: var(--danger) }` uses `--danger`, which is not defined in the CSS found (only `--text`, `--muted`, `--purple`, `--green`, `--surface*`). The declaration is invalid at computed time and the text inherits its parent color, so the error notice is not red. It stays readable (the message is conveyed by text), but the intended error color is lost. Suggest using the already used error color `#ffc5ca` (11.5:1 on the dialog background).
- Select and notice use 10 px text (`.language-picker select`), below the 12 px minimum used elsewhere. Not part of D1; flag to the owner.

**D3 (reward dialogs, visible CSS):** `.reward-resolution-dialog .operation-confirmation-actions { gap: 12px }` (was 9 px) and `.connection-notice, .hint { font-size: 14px }` (was 13 px), scoped to `.reward-resolution-dialog`. Static findings:
- Focus and tab order: unchanged (CSS only, no `order`, no new focusable element); the existing `:focus-visible` outline 2 px purple stays.
- Contrast (computed from hex, notice backgrounds blended over the dialog `#15141d`): error `#ffc5ca` 11.5:1, warning `#e7cf8c` 10.8:1, success `#9ae4be` 11.2:1, hint text `#f2f1f8` on `#11121a` 16.6:1, queue summary `#c4bfd2` 10.2:1, labels `#d8d5e0` 12.6:1. All above 4.5:1; the font-size change does not alter color.
- Layout: the actions row is `flex-wrap: wrap`; buttons are 44 px high, so +3 px of gap only makes the wrapped layout looser. The dialog has `max-height: calc(100dvh - 28px)` with `overflow-y: auto`, so +1 px of text cannot push content out of reach. The settings dialog has a sticky action bar (`bottom: -22px`); a longer error alert at 320 px could sit under it, which only a visual run can show (checklist).
- 14 px notices are an improvement for readability; accepted.
Static review at 390x844 and 768x900: no breakpoint rule applies to these classes, so the layout is the same as at desktop with `min(540px, 100vw - 28px)` width (362 px at 390; 540 px at 768). Visual confirmation is for `@qa`.

### 3.6 Item 6, DP-4 (9.0)
See the checklist in section 5.

## 4. What was NOT validated
- No visual review in any browser; no screenshot; no 320/390/768 px run.
- No native OBS/CEF run (widget); no light-background legibility check.
- No screen reader (NVDA, VoiceOver, Orca, TalkBack) and no keyboard-only run.
- Contrast was computed from hex values in the CSS, not measured from rendered pixels (alpha blends, anti-aliasing and the OBS scene are not covered).
- The en/es overlay catalogs were not read; the pt-BR overlay texts were.
- Real Twitch behavior (401 after DELETE, live `ping`) is owner/QA evidence, not UX.
- No code was changed by this review.

## 5. Checklist for `@qa` and the owner

Mobile (DP-4), after the removal of the old panel, on the Next panel at **320x568, 390x844 and 768x1024** (portrait; also 768 landscape if available), real device or device emulation recorded as such:
1. **No horizontal scroll** at 320 px on queues, operations, commands, widgets, connection, overview (WCAG 1.4.10 reflow).
2. **Stacking:** the header, navigation, language picker and page content stack in a logical order; the DOM order equals the reading order.
3. **Touch targets:** buttons, links and selects at least 44x44 CSS px (the project standard; WCAG 2.2 minimum 24 px). Check the language picker select (its padding is small) and the queue entry action buttons (13 px text).
4. **Focus:** `:focus-visible` outline visible on every control in the dark theme; opening a dialog moves focus into it; closing returns it to the opener; Tab does not reach content behind the modal; Escape closes the confirmation dialogs.
5. **Dialogs at 320 and 390 px:** reward resolution and reward settings dialogs scroll inside themselves; the sticky action bar of the settings dialog does not hide the last field or a long error alert; actions wrap without overlap (D3 gap 12 px, notices 14 px).
6. **Zoom:** 200% text zoom (and 320 px) without clipped text or lost controls.
7. **Safe areas and keyboard:** on a phone, the on-screen keyboard does not cover the focused field in the settings form.

Screen reader and keyboard (owner or `@qa` with a screen reader):
8. FT-53: trigger the 409 (PG fixture or real) and confirm the alert is announced once, the focus stays on the "cancel deletion" button, and a second identical failure is announced again (or record that it is not).
9. Language picker: change language by keyboard only; record whether focus is lost when the select becomes disabled; confirm the fallback to Português (Brasil) with a locale that has no catalog and that the notice is announced.
10. Deletion confirmation dialogs (singular case, `{count} = 1`): read in pt-BR, en, es; confirm the sentence is natural for a screen reader.

Contrast in real pixels:
11. Measure with a color picker on a real screenshot: D3 notices (error, warning, success) and hint, queue summary, labels in the reward dialogs (expected >= 4.5:1, computed 10.2-16.6:1); the language picker error notice after the `--danger` fix.
12. Widget in native OBS (AC-W-5/6): screenshot of loading, authorized, stale/unavailable and unauthorized over a transparent and a dark scene, plus one light scene; check that the status line is inside the source box; record OBS and CEF versions.

Owner pending items:
- OK for the `--danger` color and a possible 12 px minimum in the language picker (follow-up, not in this bump).
- OW-17 live `ping` (AC-D8-9) and the real chat message for the widget (AC-W-8).
- Decide whether the whole pt-BR catalog "reward" sweep (12 more keys) enters this slice or the next.

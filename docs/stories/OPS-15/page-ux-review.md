# OPS-15 — Next panel page UX review (lens 2: static code and copy)

- Date: 2026-10-21
- Reviewer: `@ux-design-expert` (Uma), autonomous agent run
- Branch: `feat/ops-15-next-panel` (uncommitted working tree as found)
- Goal set by the owner: make every Next panel page as easy as possible for a non-technical streamer; target 10/10 per page.

## Scope and limits (read first)

**Covered:** static reading of `apps/frontend/app/(panel)/**`, `apps/frontend/app/(overlay)/**`, `apps/frontend/features/**`, `apps/frontend/styles/panel.css` and the panel catalogs `apps/web/localization/catalogs/panel/{en,es,pt-BR}.tsv` (key parity checked by script; copy sampled by grep, not read line by line in all 792 rows).

**NOT covered:** no visual rendering, no real browser, no 390×844 viewport run, no keyboard walk-through, no screen reader (NVDA/VoiceOver/TalkBack), no OBS/CEF, no Twitch or worker, no contrast measurement. Every score below is a **static code/copy score only**. "Mobile risk" items are predictions from CSS, not observations.

Scores do not satisfy the CLAUDE.md 9.0 gate for implementation of fixes; each fix batch still needs its own plan + review recorded in the story.

## Cross-cutting findings

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| X1 | High | Internal/English jargon leaks into pt-BR/es copy: "reward" (≈20 pt-BR strings mix "reward" and "recompensa"), "toggle", "FIFO", "local-first", "projeção de overlay", "Client ID/Secret", "Page Permissions None", "callback", "reconciliar/conciliação". | `pt-BR.tsv` keys `panel.queue.delete.*`, `panel.commands.policy_help`, `panel.entry.priority_audit_hint`, `panel.footer.brand`, `panel.widget.obs_help` | Glossary pass: one term per concept ("recompensa", "sincronizar"), keep Twitch UI terms only when quoted as the literal label the streamer will see in Twitch/OBS, with a gloss. |
| X2 | High | Brand "Fila Local" is hard-coded in the shell (sidebar + breadcrumb), so `es` shows Portuguese while catalog says "Cola local". | `panel-shell.jsx` L44, L64 | Use `t('panel.brand.name')`. |
| X3 | Medium | Generic confirmation dialogs: title "Confirmação"/"Confirm action" + button "Confirmar"; destructive actions use `button-primary` (not danger). Streamer must read a long paragraph to know what "Confirmar" does. | `queue-lifecycle-actions.jsx`, `queue-list.jsx` clear dialog, widgets confirm | Verb-specific titles and buttons ("Excluir fila", "Limpar 4 pessoas"), danger style for irreversible actions, cancel as default focus. |
| X4 | Medium | Plurals not handled in several count strings (`panel.queue.clear.done`, `panel.queue.clear.confirm`, `panel.queue.confirm.delete` "{count} entradas") → "1 pessoas". | catalogs | Use `.one/.other(/.many)` like `panel.reconciliation.*`. |
| X5 | Medium | Native HTML validation (`required`, `pattern`, `min`) shows browser-language messages, not panel locale, and no inline error summary. | `new-queue-form.jsx`, `queue-list.jsx` manual entry, widgets | Custom inline errors (`aria-invalid` + `aria-describedby`) in catalog language; keep native as backstop. |
| X6 | Medium | Mobile nav: 8 items in a horizontal scroller with only a 4px scrollbar as affordance; es label for Operations is "Sincronización con Twitch y devolución de puntos" (very long in a chip). | `panel.css` @620px; `es.tsv` | Shorter nav labels; edge fade or "more" affordance; verify at 390×844. |
| X7 | Low | Duplicated ids when several queues render: `priority-reason-error` / `priority-reason-hint` in `ManualEntryForm` are not queue-scoped. | `queue-list.jsx` L99–105 | Suffix with `queue.id`. |
| X8 | Low | Raw identifiers shown to the streamer (`Widget {id}` hash, operation `code` identifier, "Revisão N" of command catalog). | widgets card, operations card, commands heading | Hide behind a "details" disclosure or remove. |

Positive patterns worth keeping: skip link, `aria-current` nav, global `:focus-visible`, 44px targets in most action rows, `role=alert` vs `status` split, referenceId shown without internals, conflict (409) recovery flows, explicit "requested / awaiting Twitch" wording (`panel.queue.action_result.pending`, `panel.notice.reward_update_pending`, `panel.queue.clear.done` "reembolsos solicitados"), operations "resolve" confirm copy explicitly says it does **not** confirm refund.

## Per-page review

### 1. Overview `/` — static score **7.0/10**

- **Journey:** open panel → read "next step" card → follow link (connect / create queue / open queues) → glance health and counts.
- **Friction/jargon:** six health cards (Bot, Database, Twitch API with ping ms, Integration, Chat, Rewards) plus legend and "last reconciliation" timestamp — engineering view, not streamer view. Version chip is prominent. Next-step card uses decorative "✦".
- **States:** loading reuses `panel.health.database.checking` ("Verificando…") — wrong message for whole-panel load. Unavailable shows `role=alert` with no retry button. Refresh success/error notices present; 5 s quiet polling is good.
- **Keyboard/SR:** health status conveyed by text (good, not color-only). Summary cards are `article` without headings; acceptable. Refresh button `aria-busy` good.
- **Mobile:** cards stack to one column at 620px; heading actions grid OK in theory.
- **Truthfulness:** OK — health derived from API state; no "confirmed" claims.
- **i18n:** brand hard-coded (X2).
- **Fixes:** H — collapse health into one plain sentence ("Tudo funcionando" / "A Twitch precisa de atenção → Conexão") with details behind a disclosure; H — retry button on unavailable state; M — dedicated loading copy; L — move version to footer/settings.
- **Browser/AT only:** polling not stealing focus or re-announcing; overall reading order with SR.
- **To reach 10:** plain-language status summary, retry path, validated reading order with NVDA + VoiceOver, 390×844 screenshot review.

### 2. Queues `/queues` — static score **6.0/10**

- **Journey:** pick queue → open/pause intake → "Próximo"/call viewer → attend/complete/remove → optionally add manually, edit settings, edit reward, clear, delete.
- **Friction/jargon:** each queue card shows up to ~9 equal-weight secondary buttons (toggle, Próximo, Limpar, Excluir, Modo manual, Repetir, Editar recompensa, Resolver recompensa, …) — the live-stream primary action (call next) is visually equal to Delete. Lowercase labels "concluir", "remover". "Mover ↑/↓". Sync labels "resultado desconhecido · revise no painel" (you are already in the panel). Clear confirm says "vale por 15 segundos" with no visible countdown.
- **States:** empty state with CTA (good); history loading/error/retry (good); call recovery with focus management (very good); clear refresh-required path (good); per-row saving uses a global `saving` that disables every queue.
- **Keyboard/SR:** move up/down `aria-label` lacks the user name and reads the arrow glyph; call/attend/complete/remove include the name (good). Expiry announced via status region (good). Duplicate ids (X7). Native `<dialog>` with `showModal` gives focus trap.
- **Mobile:** entry rows with 4–5 44px buttons wrap to several lines per viewer; lifecycle row wraps into a button wall; high scroll cost during a live stream.
- **Truthfulness:** good — `pending` "Aguardando confirmação da Twitch", `uncertain` "pode ter sido registrada"; `panel.entry.add.refresh_failed` says "A API aceitou" — accurate but jargon ("API").
- **i18n:** plurals (X4); "reward" mix (X1).
- **Fixes:** H — action hierarchy: primary "Chamar próximo", intake toggle as switch, destructive/rare actions in a "Mais ações" menu; H — per-row overflow menu for move/priority on mobile; M — name in move labels, sentence-case labels; M — visible countdown or remove "15 segundos"; M — scope `saving` per queue; L — replace "API" with "o app".
- **Browser/AT only:** dialog focus return, live-region chatter during countdown, wrapping at 390px, timer accuracy.
- **To reach 10:** hierarchy redesign reviewed ≥9, SR walk-through of a full call cycle, mobile live-stream usability check.

### 3. New queue `/new-queue` — static score **7.5/10**

- **Journey:** name → command auto-suggested → entry mode (Channel Points/manual) → reward fields → handling → call message with live preview → create.
- **Friction/jargon:** "Aliases", "Modo do UID"/"Solicitar UID", placeholder tokens `{user}{queue}{position}{uid}{account}`; UID note requires knowing two other settings. Cost default 1000 without explanation.
- **States:** saving/confirmed/pending/warning/uncertain feedback with link to queues (good); submit disabled on `uncertain` (good, avoids duplicates). Twitch-not-connected hint with link (good).
- **Keyboard/SR:** fieldsets with legends (good); call-message error with `aria-describedby` (good); other fields rely on native validation (X5). `output` preview in `role=group` fine.
- **Mobile:** single column at 620px; action bar 44px.
- **Truthfulness:** creation result keys distinguish review/recovered (good).
- **Fixes:** M — explain UID in one line (what it is, why ask); M — insert-token chips instead of typing braces; M — localized inline validation; L — explain the default cost.
- **To reach 10:** field-level errors in locale, UID explainer, browser + SR form fill test.

### 4. Commands `/commands` — static score **7.5/10**

- **Journey:** read policy help → change minimum role per command → save → (follower) authorize at Twitch.
- **Friction/jargon:** "toggle", "Cargos superiores herdam acesso", "Revisão N" chip; select label repeats full syntax ("Nível mínimo da audiência · !fila add <usuário> [UID]").
- **States:** loading, error + reload, empty, 409 conflict + reload, follower scope lost/needed (all present, good). The "unsaved/no changes" hint is `role=status` and always rendered — fine, but announces on every edit.
- **Keyboard/SR:** each card labelled by heading; select has explicit `htmlFor` (good).
- **Mobile:** not checked; grid behaviour unknown at 390px.
- **Truthfulness:** follower consent copy states it does not change saved permissions (good); OAuth redirect validated.
- **Fixes:** M — rewrite policy help in plain language, drop "toggle"; L — remove revision chip; L — shorter select label.
- **To reach 10:** copy rewrite, browser test of OAuth round-trip messaging.

### 5. Connection `/connection` — static score **6.5/10**

- **Journey:** create Twitch app in console → paste Client ID/Secret → validate & save → connect (OAuth) → back with success/declined/error → sync.
- **Friction/jargon:** the hardest page for a non-technical user: "aplicativo confidencial", "callback", "Client ID/Client Secret" untranslated; no numbered steps; callback URL shown in `<code>` with no copy button; console link opens new tab without telling. When already connected, the credentials form stays prominent (risk of overwriting working credentials).
- **States:** validating/saved/saved-refresh-failed/error notices; OAuth callback notice cleared from URL (good). Notice rendered at page bottom — far from the clicked button on mobile.
- **Keyboard/SR:** inputs wrapped in labels (good); status chip and health rows are text. Notice uses `role=status` + `aria-live` (redundant but harmless) or `alert`.
- **Mobile:** long callback URL in `code` may overflow at 390px (no wrap rule observed for `.connection-callback-url` in this review).
- **Truthfulness:** "Twitch conectada com sucesso" depends on the server callback query param — acceptable; sync result distinguishes complete vs issues.
- **Fixes:** H — numbered 3-step wizard with copy-to-clipboard for the callback URL and a short gloss for ID/Secret; H — collapse credentials behind "Trocar credenciais" when connected; M — place notices next to the action; M — "abre em nova aba" hint; L — wrap long URL.
- **To reach 10:** wizard reviewed ≥9 and tested end-to-end with a real Twitch app by a non-technical tester.

### 6. Operations `/operations` — static score **6.5/10**

- **Journey:** see pending Twitch sync / point refunds / redemption confirmations → retry or record manual resolution → sync now.
- **Friction/jargon:** concept itself is technical; statuses "Conflito · requer revisão", "Estado desconhecido · revise no painel"; action "Reconciliar / tentar novamente"; type fallback "OPERAÇÃO TWITCH" uppercase; raw identifier `code`. No per-item explanation of *what the streamer should do*.
- **States:** loading, load error with reference + retry, empty with hint, refresh-failed keeping stale data, reconcile result plurals (good — strongest state handling in the panel).
- **Keyboard/SR:** cards labelled; native dialog with Escape blocked while saving (good). 5 s polling replaces list — may move focus target if an item disappears (browser check).
- **Truthfulness:** excellent — retry says pending, manual resolve explicitly not a refund confirmation.
- **Fixes:** H — per-status "o que fazer" sentence; M — rename to plain verbs ("Tentar de novo", "Marcar como resolvido por mim"); M — hide identifiers behind details; L — sentence case type fallback.
- **To reach 10:** guidance per status, SR test that polling does not disrupt focus/announcements.

### 7. Settings `/settings` — static score **8.0/10**

- **Journey:** rename current account label / default label → save.
- **Friction:** the difference between "current" and "default" label is not obvious; only two fields so impact is low.
- **States:** dirty/no-changes, saving, saved, saved-refresh-failed (warning), invalid, generic error — complete.
- **Keyboard/SR:** proper `htmlFor`, `aria-labelledby` sections.
- **Fixes:** M — one-line example of where each label appears (chat? overlay?); L — page is thin; language picker could also live here.
- **To reach 10:** clarify purpose with example, browser check.

### 8. Widgets `/widgets` — static score **6.0/10**

- **Journey:** create widget → choose source (fixed text / queue data) → style → save → copy one-time URL → add Browser Source in OBS.
- **Friction/jargon:** 19 style fields shown at once (margins, shadow X/Y, outline, overflow); select options are **untranslated raw values** (`left/center/right`, `none/outline/shadow`, `wrap/clip/ellipsis`, `system-ui`, weights `300…900`); width/height free text "auto"; OBS help mixes English ("Page Permissions None"); "Fila / reward vinculada".
- **States:** loading/error/empty/conflict refresh/replace draft (good). Counter shows `/240` while `maxLength=960` (inconsistent limit communication).
- **One-time link risk (High):** the secret-URL dialog closes on backdrop click and on Escape; the copy says closing loses the link. One accidental click forces regeneration (which invalidates the URL already in OBS? — needs API check).
- **Keyboard/SR:** custom `role=dialog` with a hand-written focus trap; confirmation `alertdialog` has a title but no `aria-describedby` consequence text; editor close "×" labelled (good).
- **Mobile:** editor collapses to one column, preview moves to top (good intent); 19 fields → very long scroll.
- **Truthfulness:** fine.
- **Fixes:** H — translate all option labels; H — make the link dialog non-dismissable by backdrop/Escape until "Copiado" or explicit "Fechar mesmo assim"; H — presets (e.g. "Simples", "Com contorno", "Com sombra") with "Avançado" disclosure; M — consistent char limit; M — localize OBS steps with numbered list; L — hide widget id.
- **Browser/AT only:** custom focus trap correctness, clipboard API failure path, preview fidelity vs OBS.
- **To reach 10:** presets + translated options + safe link dialog, then browser + OBS/CEF validation.

### 9. Overlay `/overlay` — static score **7.0/10** (limited scope)

- **Journey:** OBS loads URL → widget renders text; the streamer's "UX" is setup correctness, viewers see output.
- **Notes:** minimal markup with `aria-live` (irrelevant inside OBS but harmless). Error/expired-link presentation lives in `apps/web/overlay-renderer.mjs` (not reviewed here). No way for the streamer to see from the panel whether OBS is actually polling.
- **Fixes:** M — panel-side "last seen by OBS" indicator (needs story/API, do not invent); L — friendly on-overlay message for revoked link.
- **To reach 10:** OBS/CEF native validation (transparency, sizing, revoked link) — impossible statically.

## Score table (static only)

| Page | Score | Main blocker to 10 |
|---|---|---|
| Overview | 7.0 | Technical health grid, no retry |
| Queues | 6.0 | Flat action hierarchy, mobile button wall |
| New queue | 7.5 | UID/token jargon, native validation |
| Commands | 7.5 | Jargon in help |
| Connection | 6.5 | No guided wizard, untranslated credential terms |
| Operations | 6.5 | No "what to do" per status |
| Settings | 8.0 | Purpose of labels unclear |
| Widgets | 6.0 | Untranslated options, 19 fields, dismissable one-time link |
| Overlay | 7.0 | Needs OBS/CEF validation |

## Top 8 fixes (ranked)

1. Widgets: translate every style option; add presets + "Avançado".
2. Widgets: one-time link dialog not dismissable by backdrop/Escape before copy.
3. Queues: action hierarchy (primary "Chamar próximo", "Mais ações" menu for destructive/rare actions).
4. Glossary pass removing "reward/toggle/FIFO/local-first/callback/reconciliar" from pt-BR/es.
5. Connection: numbered wizard, copy button for callback URL, collapse credentials when connected.
6. Overview: plain-language status summary replacing the six technical cards; retry on unavailable.
7. Operations: one "what to do" sentence per status; plain action verbs.
8. Pluralization + verb-specific/danger confirmation dialogs; localize brand "Fila Local".

## Evidence still required (cannot be produced statically)

Real browser at 390×844 and desktop; keyboard-only run of each journey; NVDA + Firefox and VoiceOver + Safari passes; contrast measurement of `panel.css` palette; OBS/CEF overlay render; Twitch OAuth round-trip with real app; clipboard failure path.

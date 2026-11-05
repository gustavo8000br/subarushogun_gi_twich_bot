# OPS-15 UX Plan: One-Time Widget Link Dialog and Front-End Spec Corrections (S-13)

[Português brasileiro](../../pt-BR/stories/OPS-15/ux-plan-widget-link-and-spec.md) · Reviewer: `@ux-design-expert` (Uma) · Date: 2026-10-22 · Branch: `feat/ops-15-next-panel`

Planning only. No code, spec, catalog, or issue was changed. Sources read: `page-ux-review.md` (Widgets §8, X3), `flow-and-chat-review.md` (E2), `structural-review.md` (S-13), `docs/front-end-spec.md` + pt-BR copy, `apps/frontend/features/widgets/widgets-page-content.jsx`, `widget-management.mjs`, `app/(panel)/widgets/page.jsx`, `apps/frontend/features/queues/queue-reward-resolution-dialog.jsx`, `apps/frontend/styles/panel.css`, `apps/web/localization/catalogs/panel/{en,es,pt-BR}.tsv`, `tests/unit/next-widgets-page.test.jsx`, `package.json`.

## Item 1 — One-time overlay link dialog (loss-causing defect)

### 1.1 Current behavior (static evidence)

| # | Finding | Evidence |
|---|---|---|
| D1 | Backdrop `onMouseDown` on `.widget-secret-backdrop` clears `secret` — one mis-click destroys the only copy. | `widgets-page-content.jsx` secret dialog block |
| D2 | Global `keydown` Escape handler clears `secret` first (`if (secret) setSecret('')`). | effect at the top of `WidgetsPageView` |
| D3 | "Close" button closes immediately, even if nothing was copied. | secret dialog actions |
| D4 | Notice key `panel.widget.link.copied_once` is set on open but **does not exist in any catalog** (en/es/pt-BR); `panel.widget.link_lifetime_help` exists in all three but is **unused**. | catalogs line 232; component lines 172/188 |
| D5 | Initial focus is the first focusable element in DOM order = the read-only URL input (auto-selects the secret); the primary action is not focused. | `focusable()[0]?.focus()` |
| D6 | Return focus uses `document.activeElement` captured when the effect runs; after create, the editor has already unmounted, so focus target is unreliable (likely `body`). After regenerate, the confirmation and secret dialogs briefly coexist. | effect + `saveWidget`/`runAction` |
| D7 | The open notice is put in `role="status"`, so it is announced at the same time as the dialog title; status and failure share one element whose role flips `status`/`alert` (role changes on an existing node are not reliably announced). | secret dialog `<p role=…>` |
| D8 | The full secret URL is visible in clear text; a streamer capturing the screen/browser on stream would leak it. | readOnly input `value={secret}` |
| D9 | `link.close_loses` says "If you lose it, generate another one" but does not say the old link stops working; `link_lifetime_help` does. | catalogs |
| D10 | Navigation/reload while the dialog is open loses the link with no warning. | no `beforeunload` guard |

Positive: the secret is not rendered as text node, and the existing unit test asserts it leaves the DOM after close (`next-widgets-page.test.jsx` ~L133–153).

### 1.2 Target behavior

**State model (local component state only):** `linkDialog = { url, origin: 'create' | 'regenerate' | 'generate', widgetId, copied: false, view: 'link' | 'confirm-close', revealed: false }`.

1. **No accidental dismissal.** Backdrop click: no-op. Escape (and any browser close request): never closes; if `copied === false` it switches to the `confirm-close` view; if `copied === true` it closes (same as "Done").
2. **Primary path.** Buttons in `link` view: `Copy link` (primary), `Done, I copied the link` (secondary). After a successful clipboard write, `copied = true` and `Done` closes directly.
3. **Manual copy is legitimate.** If the user copied by selecting the text (clipboard API denied/unavailable), `Done` while `copied === false` goes to `confirm-close` (one extra, explicit step — not a block).
4. **`confirm-close` view (same dialog, content swap, not a stacked dialog):** title "Close without copying the link?"; body states the link **cannot be shown again**, and that a new link can be generated from the widget card, which **invalidates this one**; buttons `Back to the link` (default focus, secondary) and `Close anyway` (danger). There is no "regenerate" button inside the dialog: the current link is still on screen, so regenerating there would only destroy a valid link. The regenerate offer is delivered after close: focus lands on the card's `Generate new link`/`Regenerate` button and a page notice says so. `[AUTO-DECISION] Offer regenerate inside the confirm view? → No, offer it on the card with focus return (reason: in-dialog regenerate invalidates a link the user can still copy; card action already exists with its own confirmation).`
5. **Masked by default (visibility toggle).** Field shows a fixed placeholder (`••••••••••••`, not derived from the secret's length) with a `Show link`/`Hide link` toggle button (`aria-pressed`). Copy works while masked. Manual-copy fallback message tells the user to show the link first. When revealed, the real URL is in a read-only input (`spellcheck=false`, `autocomplete=off`, `dir="ltr"`, wraps on mobile). Rationale: D8 — streamers often capture the browser. **Owner decision O1** (default masked vs. visible).
6. **Unload guard.** While the dialog is open and `copied === false`, register `beforeunload` (generic browser prompt; no custom text is possible). Removed on close/unmount.
7. **Copy-success state is not a gate on correctness**: server state never depends on `copied`; it is UI-only.

**Dialog primitive — reuse the queues pattern.** Use native `<dialog>` + `showModal()` as in `queue-reward-resolution-dialog.jsx` (top layer, `inert` background, built-in focus containment, `aria-modal` semantics) instead of the hand-written trap. Guards required because native dialogs honor browser close requests:
- `cancel` event → `preventDefault()` and route to rule 1. Per the HTML close-watcher rules, Chromium may skip a cancelable `cancel` when there was no user activation since the last one (repeated Escape), so also handle the `close` event: if it fires while `url` is set and the close was not initiated by our code, immediately `showModal()` again in `confirm-close` view.
- Add `closedby="none"` where supported (explicitly disables light-dismiss and close requests); keep the guards as the cross-browser path.
- Research/limitations: MDN `<dialog>` (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog), MDN `closedBy` (https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/closedBy), WHATWG close requests (https://html.spec.whatwg.org/multipage/interaction.html#close-requests), WAI-ARIA APG modal dialog (https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), MDN Clipboard `writeText` (https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText). Browser support for `closedby` and the double-Escape behavior were **not verified in this project's browsers**; the browser E2E below is the evidence gate. If the guarded native dialog fails that E2E, fall back to the current custom backdrop with the fixed handlers (no Escape/backdrop close) plus `inert` on the page root.

**Focus management.**
- Initial focus: `Copy link` button (not the input — avoids auto-selecting/revealing the secret). In `confirm-close`: `Back to the link`.
- Trap: native modal containment; Tab order: Show/Hide → Copy link → Done (→ field when revealed, in DOM order before buttons).
- Return focus (explicit, not `activeElement`): `regenerate`/`generate` → that widget card's regenerate/generate button (located by `data-widget-id` after the list refresh); `create` → the new card's `Edit` button; fallback → page heading `Create widget` button. If the user chose `Close anyway`, return to the card's regenerate button.
- Close the regenerate `alertdialog` **before** opening the link dialog (no coexisting modals).

**Live-region strategy (never announce the secret).**
- Dialog `aria-labelledby` = title; `aria-describedby` = the lifetime help paragraph (`link_lifetime_help`), read once on open. Remove the open-time status notice (fixes D4/D7).
- One persistent, initially empty `role="status"` node inside the dialog for `Link copied.`; one separate, persistent `role="alert"` node for copy failure. Text is fixed catalog copy — never the URL, never a fragment.
- The URL never appears in `aria-label`, `aria-describedby`, `title`, document title, toasts, page notices, or live regions. Masked placeholder is `aria-hidden` with a visually-hidden label "Link hidden".

**Do not log or persist the secret.** No `console.*`, no telemetry/error reporter payload, no `localStorage`/`sessionStorage`/IndexedDB, no URL/query/hash/router state, no React context outside the page view, no `data-*` attribute. Clear state on close and on unmount. API error paths keep the existing generic `referenceId` notices. The capability URL fragment must not be sent to any analytics. Static check: a unit test asserting no `console` call receives the secret and storage APIs are untouched.

**Mobile 390×844.** Dialog `width: min(560px, 100%)`, `max-height: calc(100dvh - 20px)`, internal scroll; actions stack vertically full-width with primary first; buttons ≥ 44 px tall (match `.reward-*-dialog` min-height 44px); revealed URL wraps (`overflow-wrap: anywhere`); toggle sits on the field's row. The existing `@media (max-width: 480px)` rule top-aligns the backdrop — keep it.

**Keyboard/AT summary.** Enter/Space activate buttons; Escape = rule 1; no keyboard trap beyond the modal; visible focus via existing `:focus-visible` outline (`var(--purple)`); state is conveyed by text, not color.

### 1.3 Copy drafts (new/changed keys; `{placeholders}` none needed)

| Key | en | es | pt-BR |
|---|---|---|---|
| `panel.widget.link.title` (keep) | Copy this link to OBS | Copia este enlace en OBS | Copie este link para o OBS |
| `panel.widget.link_lifetime_help` (now used) | keep | keep | keep |
| `panel.widget.link.done` (new) | Done, I copied the link | Listo, copié el enlace | Pronto, copiei o link |
| `panel.widget.link.show` (new) | Show link | Mostrar enlace | Mostrar link |
| `panel.widget.link.hide` (new) | Hide link | Ocultar enlace | Ocultar link |
| `panel.widget.link.hidden_label` (new) | Link hidden | Enlace oculto | Link oculto |
| `panel.widget.link.copy_fallback` (change) | Couldn't copy automatically. Show the link, select it and copy it before closing — it won't be shown again. | No se pudo copiar automáticamente. Muestra el enlace, selecciónalo y cópialo antes de cerrar; no volverá a mostrarse. | Não foi possível copiar automaticamente. Mostre o link, selecione e copie antes de fechar — ele não será exibido de novo. |
| `panel.widget.link.confirm_close.title` (new) | Close without copying the link? | ¿Cerrar sin copiar el enlace? | Fechar sem copiar o link? |
| `panel.widget.link.confirm_close.body` (new) | This link can't be shown again. To use this widget later, generate a new link on its card — this link will then stop working. | Este enlace no se podrá mostrar de nuevo. Para usar el widget más tarde, genera un enlace nuevo en su tarjeta; este dejará de funcionar. | Este link não poderá ser exibido de novo. Para usar o widget depois, gere um novo link no card dele — este link deixará de funcionar. |
| `panel.widget.link.confirm_close.back` (new) | Back to the link | Volver al enlace | Voltar ao link |
| `panel.widget.link.confirm_close.confirm` (new) | Close anyway | Cerrar de todos modos | Fechar mesmo assim |
| `panel.widget.notice.link_closed_uncopied` (new, page notice) | Link closed without copying. Use "Generate new link" on the widget card when you need it. | Enlace cerrado sin copiar. Usa "Generar enlace nuevo" en la tarjeta del widget cuando lo necesites. | Link fechado sem copiar. Use "Gerar novo link" no card do widget quando precisar. |
| `panel.widget.link.copied_once`, `panel.widget.link.close_loses` | remove (missing / superseded) | | |

The quoted button label in `link_closed_uncopied` must match the actual `panel.widget.action.regenerate`/`generate` labels per locale at implementation time (localization validator check).

### 1.4 Tests

- **Unit/RTL (`tests/unit/next-widgets-page.test.jsx`, jsdom):** backdrop mousedown keeps the URL; Escape with `copied=false` shows `confirm-close`, URL still in state; `Back to the link` restores view with focus on `Copy link`; `Close anyway` removes URL from DOM and shows page notice; successful copy (mock `navigator.clipboard.writeText`) → status text `Link copied.` and `Done` closes directly; rejected copy → alert text, `Done` routes to confirm; masked by default — secret absent from `document.body.textContent` and from all `aria-*`/`title` attributes, present only after `Show link`; `console.*` spies and `Storage.prototype.setItem` never called with the secret; return focus targets per origin; regenerate confirm closes before link dialog opens; `beforeunload` listener added only while uncopied. jsdom lacks full `<dialog>` — stub `showModal/close` and dispatch `cancel`/`close` manually; this is **not** evidence of browser behavior.
- **Browser-only E2E (`tests/e2e/widgets-link-dialog-browser-only.mjs`, Playwright, disposable API/PostgreSQL):** create widget → dialog; click backdrop coordinates, press Escape twice quickly → dialog still open (guards close-watcher behavior); grant clipboard permission → Copy → read clipboard equals URL; deny permission → fallback alert; 390×844 viewport: no horizontal scroll, all actions visible/reachable; reload while uncopied → `beforeunload` dialog event fired. Extends flow E2 (create → open overlay URL → revoke).
- **Manual AT (not automated):** NVDA + Firefox/Chrome, Orca + Firefox, VoiceOver iOS (390 px): title + lifetime help read on open; URL never announced unless focused when revealed; "Link copied." announced once; confirm view announced on Escape; focus returns to the card button.
- Quality gates per `CLAUDE.md`, including `npm run validate:localization` for the new keys.

## Item 2 — S-13 front-end spec corrections

Facts from code: `package.json` — `next 16.4.1`, `react 19.3.1`, no third-party UI component or CSS framework (styles are hand-written `apps/frontend/styles/panel.css`, `overlay.css`). Routes under `app/(panel)`: `/`, `/connection`, `/queues`, `/new-queue`, `/commands`, `/operations`, `/settings`, `/widgets`; under `app/(overlay)`: `/overlay` (alias `/overlay.html`). Catalogs: `apps/web/localization/catalogs/{panel,chat,setup,lifecycle,overlay}/{en,es,pt-BR}.tsv`. `panel-provider.jsx` defaults to `pt-BR` and uses `state.product_locale` `{ locale, revision }` from the API, persisted via `persist-product-locale.mjs`; dates/numbers use `Intl.*Format(localeState.locale)`.

| # | Spec line | Problem | Type |
|---|---|---|---|
| C1 | :20 "Product interface language is pt-BR. Dates use pt-BR locale…" | Contradicted: en/es/pt-BR catalogs, product locale, `Intl` by locale. | Factual |
| C2 | :36 "No CSS or component framework is required." | Ambiguous/outdated: React + Next.js is the UI framework; there is still no component library/CSS framework. | Factual + **owner decision O2** (keep "no third-party component/CSS library" as a rule?) |
| C3 | :7 "…not a public viewer portal or overlay." | Same Next app now hosts the OBS overlay route (separate bundle). Panel itself is still not the overlay. | Factual |
| C4 | :9–16 IA lists 6 areas | Missing Commands, Widgets (overlay link management), Settings; "Account" ≠ current Settings page. | Factual (inventory) — exact content of Settings needs owner confirmation if it changes scope |
| C5 | :32 "future overlay projection" | Overlay exists (widgets + capability links). | Factual |
| C6 | absent | No rule for one-time secrets (widget links). | Product rule — **owner decision O3** (adopt Item 1 rule into spec) |

### Replacement text (en)

- :7 → "The streamer/operator uses the browser on the same computer to set up Twitch, inspect integration health, create and operate queues, manage chat commands and OBS widgets, resolve uncertain point operations, and review history. The panel is an authenticated operator surface; it is not a public viewer portal. The OBS overlay is served by the same Next.js application on a separate route and bundle (`/overlay`), authenticated by a per-widget capability link, and never exposes panel data or controls."
- IA → add: "**Commands:** chat command catalog and policies." · "**Widgets:** create, style, and preview overlay widgets; generate, regenerate, and revoke their one-time OBS links." · rename 6 to "**Settings:** product language and account text labels with current/default values and reset behavior." (confirm with owner)
- :20 → "The interface is localized through message catalogs (`en`, `es`, `pt-BR`; default `pt-BR`). The product locale is a server-side setting (`product_locale`, versioned) shared by panel, chat replies, and overlay; dates and numbers use `Intl` with the active product locale. No user-facing string is hard-coded in components. Technical IDs and state keys stay English."
- :32 → "…Chat messages, calls, and the overlay projection each follow their separate toggles…"
- :36 → "The panel is a Next.js (App Router) application using React; styles are project CSS (`panel.css`, `overlay.css`) without a third-party CSS or component library. Overlay code must not import panel modules (bundle boundary)." — last sentence of current paragraph replaced; rest kept.
- New bullet (O3): "One-time secrets (widget OBS links) are shown once, masked by default, copied via a button with visible success/failure status, never announced, logged, or persisted, and their dialog cannot be dismissed accidentally; closing without copying requires explicit confirmation."

### Replacement text (pt-BR)

- :7 → "A streamer/operadora usa o navegador no mesmo computador para configurar a Twitch, inspecionar a saúde da integração, criar e operar filas, gerenciar comandos de chat e widgets do OBS, resolver operações de pontos incertas e consultar o histórico. O painel é uma área autenticada da operadora; não é um portal público para viewers. O overlay do OBS é servido pela mesma aplicação Next.js em rota e bundle separados (`/overlay`), autenticado por um link de capacidade por widget, e nunca expõe dados ou controles do painel."
- IA → "**Comandos:** catálogo e políticas de comandos de chat." · "**Widgets:** criar, estilizar e pré-visualizar widgets de overlay; gerar, regenerar e revogar os links de uso único para o OBS." · "**Configurações:** idioma do produto e rótulos de texto da conta com valor atual/padrão e restauração."
- :20 → "A interface é localizada por catálogos de mensagens (`en`, `es`, `pt-BR`; padrão `pt-BR`). O idioma do produto é uma configuração do servidor (`product_locale`, versionada) compartilhada por painel, respostas de chat e overlay; datas e números usam `Intl` com o idioma ativo. Nenhum texto voltado à pessoa usuária fica fixo nos componentes. IDs técnicos e chaves de estado permanecem em inglês."
- :32 → "…Mensagens de chat, chamadas e a projeção de overlay seguem seus toggles independentes…"
- :36 → "O painel é uma aplicação Next.js (App Router) com React; os estilos são CSS do projeto (`panel.css`, `overlay.css`), sem biblioteca de CSS ou de componentes de terceiros. O código do overlay não pode importar módulos do painel (fronteira de bundle)."
- Novo item (O3): "Segredos de uso único (links de widget para o OBS) são exibidos uma vez, mascarados por padrão, copiados por botão com status visível de sucesso/falha, nunca anunciados, registrados em log ou persistidos, e o diálogo não pode ser fechado por acidente; fechar sem copiar exige confirmação explícita."

Caveat: whether chat replies and overlay share the product locale must be confirmed against FND-8/OPS-14 at edit time (chat locale parity is flagged as CONCERNS in `flow-and-chat-review.md`); if not, drop "shared by … chat replies, and overlay".

## Owner decisions

- **O1** Link field masked by default (recommended) vs. visible.
- **O2** Keep "no third-party component/CSS library" as a binding rule.
- **O3** Add the one-time-secret rule to the spec.
- **O4** Scope of the Settings IA entry (C4).

## Score (static code/copy review only)

First pass 8.4/10: missing return-focus target after create, regenerate-inside-dialog contradiction, no browser close-request risk, no unload guard. Fixed above (§1.2 return focus, AUTO-DECISION, `cancel`/`close` guards + `closedby`, `beforeunload`). **Final: 9.2/10 — gate passes for this scope.** NOT covered: visual review, real-browser behavior (dialog close watcher, clipboard permissions), OBS/CEF, assistive-technology testing, user research. Remaining deductions: browser support of `closedby`/double-Escape unverified; copy not reviewed by native es speaker.

# OPS-15 Research: One-Time Widget Link Dialog (native `<dialog>`, Clipboard, masking, tests)

- Date: 2026-10-22. Author: @analyst (Atlas). Research only; no code changed.
- Input for: `docs/stories/OPS-15/ux-plan-widget-link-and-spec.md` (Item 1).
- Labels: **VERIFIED** = confirmed in an official source or in this repository; **PARTIAL** = official source confirms part, the rest is a secondary source or my reading; **UNVERIFIED** = community or memory only, must be proven by the browser E2E.
- Limitation: no real browser was run for this research. Every browser claim below still needs the Playwright E2E listed in section 5.

## 1. Native `<dialog>`

### 1.1 Escape, `cancel`, and the "double Escape"

- **VERIFIED** (WHATWG HTML, "Close requests and close watchers", read 2026-10-22, https://html.spec.whatwg.org/multipage/interaction.html#close-requests-and-close-watchers): in the request-close algorithm, `canPreventClose` is true only when the window **has history-action activation**; the `cancel` event is fired "with the cancelable attribute initialized to canPreventClose".
- **Correction to the UX plan:** the plan says Chromium "may skip" `cancel`. Per the current spec, `cancel` **still fires but with `cancelable === false`**, so `preventDefault()` does nothing and the dialog closes. Older Chromium versions described in the Intent to Ship did skip it. Either way, the result is the same: **a `cancel` handler alone cannot keep the dialog open**.
- **PARTIAL** (Blink Intent to Ship, https://groups.google.com/a/chromium.org/g/blink-dev/c/jM5au7yYzHM/m/5SWuXPMdAgAJ; explainer mirror https://p.codekk.com/detail/60ecf1db982bbb7260281a26; Manuel Matuzović, 2025, https://www.matuzo.at/blog/2025/close-requests-dialog): this is intentional (anti back-button trapping), applies on desktop too. Consequences: (a) a dialog opened programmatically with no later click/key can close on the **first** Escape, because `showModal()` after a `fetch` does not grant activation; (b) after one prevented `cancel`, a second Escape without new activation goes through.
- **PARTIAL** (WPT README, https://searchfox.org/mozilla-central/source/testing/web-platform/tests/close-watcher/user-activation/README.md): `<dialog>` queues a task for `close`, but fires `cancel` synchronously.
- **UNVERIFIED:** calling `preventDefault()` on the `keydown` event for Escape stops the close request in Chromium/Firefox. Do not rely on this alone.

### 1.2 `closedby`

- **VERIFIED** (MDN `closedBy`, last modified 2026-08-24, https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/closedBy): values `any` (light dismiss + Escape + code), `closerequest` (Escape + code), `none` (code only). No or invalid attribute = Auto: `showModal()` acts as `closerequest`. Status: **Limited availability, not Baseline**.
- **PARTIAL** (MDN BCD as read by secondary sources, e.g. https://www.stefanjudis.com/blog/risky-mobile-close-requests/): Chrome/Edge/Android **134+**, Firefox **141+**, Safari stable **not supported** (Technology Preview only). Versions are not confirmed against the caniuse table.
- **VERIFIED** (MDN `<dialog>`, last modified 2026-10-02, https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog): backdrop clicks do **not** close a modal dialog unless `closedby="any"`. So the current D1 defect comes from our own `onMouseDown` handler, not from the browser.
- Fallback pattern: unsupported browsers ignore the attribute (Auto). Do not add any backdrop click handler (no-op is the default). Keep the `cancel` + `close` guards from 1.4.

### 1.3 Focus with `showModal()`

- **VERIFIED** (MDN `<dialog>`): focus goes to the first focusable descendant, or to the element with `autofocus`. `showModal()` makes the rest of the page inert and exposes `aria-modal="true"`. Always provide an explicit close button.
- **VERIFIED** (W3C WAI-ARIA APG Modal Dialog, https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): for an irreversible step, focus the **least destructive action**; if the opener no longer exists, move focus to an element that fits the workflow.
- **PARTIAL:** the HTML spec restores focus to the element that was focused before `showModal()`. In our create flow, that element (the editor) is unmounted, so we need **explicit** focus return, as planned (D6). In React, set it after the list re-renders (`useEffect`/`requestAnimationFrame` on a `data-widget-id` selector), not in the `close` handler synchronously.
- Note: in React 19, `autoFocus` on an element inside a `<dialog>` is applied on mount, not when `showModal()` runs (**UNVERIFIED**). It is safer to call `copyButtonRef.current.focus()` right after `showModal()`.

### 1.4 Recommended guard set (defense in depth)

1. `<dialog closedby="none">` (ignored where unsupported).
2. `keydown` on the dialog: if `Escape`, call `preventDefault()` and route to rule 1 (show `confirm-close` or close when `copied`). With `closedby="none"`, this is the only Escape path in Chrome 134+/Firefox 141+.
3. `cancel`: `preventDefault()` + route to rule 1 (covers Safari and cancellable cases).
4. `close`: if `closingByCode` ref is false and the link is still in state, call `showModal()` again in `confirm-close` view and move focus to `Back to the link` (covers non-cancelable `cancel`). Set `closingByCode = true` before every `dialog.close()` we call.
5. Never put a click/mousedown handler on the backdrop.

## 2. Clipboard API

- **VERIFIED** (MDN Secure Contexts, https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts): `localhost`, `*.localhost`, `127.0.0.0/8`, `::1` are potentially trustworthy; `https://localhost` is secure for two reasons. Clipboard is available on the panel.
- **VERIFIED** (MDN `writeText`, https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText): secure context only; returns a Promise; rejects with `NotAllowedError`. Baseline widely available (since 2020). web.dev (https://web.dev/articles/async-clipboard): Chrome 66, Firefox 63, Safari 13.1; Safari treats user activation differently (WebKit bug 222262).
- **PARTIAL/UNVERIFIED** (memory of Chromium/Firefox behavior, not re-confirmed today): Chromium grants `clipboard-write` automatically to the active tab, no prompt; it rejects when the **document is not focused** (for example DevTools focused). Firefox and Safari require **transient user activation**. Rule: call `writeText` **directly in the click handler**, before any `await`.
- Failure modes to handle: `navigator.clipboard` undefined (insecure context, old embedded browser such as OBS/CEF custom docks), `NotAllowedError` (no activation, permissions policy in an iframe, unfocused document), other rejections. All go to the fallback alert, never to a log that includes the URL.
- **VERIFIED** (MDN `execCommand`, last modified 2026-08-21, https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand): deprecated and non-standard; `copy` behavior varies between browsers. **Recommendation:** do not use `execCommand('copy')`; the fallback is manual select (reveal the field, select its text, tell the user to copy).

## 3. Masking the secret (screen readers and streaming)

- **VERIFIED** (MDN Turning off autocompletion, https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Turning_off_form_autocompletion): browsers ignore `autocomplete="off"` on password fields and still offer to save the login.
- Therefore **do not use `<input type="password">`**: it may trigger the password-manager save/generate UI (could store the secret in a profile sync), screen readers say "password, protected", and it changes copy/select behavior. **PARTIAL** (side effects inferred from the MDN note; not tested here).
- CSS masking (`-webkit-text-security`, `color: transparent`) is **not recommended**: the secret stays in the DOM and in the accessibility tree; screen readers read it; DevTools and extensions see it.
- Recommended: while masked, the real URL **is not in the DOM at all**. Render a fixed placeholder `aria-hidden="true"` + visually hidden text "Link hidden". `Copy link` reads from React state. On reveal, render a read-only `<input type="text">` (`autocomplete="off"`, `spellcheck={false}`, `dir="ltr"`, `name` absent, no `<form>` wrapper) or a `<code>` block. `aria-hidden` alone is not protection: the text is still in `textContent` and visible on stream.
- Live regions: fixed catalog text only ("Link copied.", failure message). Never the URL, nor in `aria-label`, `aria-describedby`, `title`, document title, toasts. Keep the `status` and `alert` nodes persistent and empty at mount (role changes are not reliably announced).

## 4. Testing React 19 + jsdom and Playwright

- **VERIFIED (local):** `node_modules/jsdom` 30.1.2 — `HTMLDialogElement-impl.js` is an empty class: no `showModal`, `close`, `requestClose`, `closedBy`, `cancel` handling, top layer or inert. jsdom has no `navigator.clipboard`.
- **VERIFIED (local):** `tests/unit/next-queue-reward-settings-dialog.test.jsx` already stubs `showModal` (sets `open`) and `close` (removes `open`, dispatches `close`). Reuse it; put it in a shared test helper. Community confirms the stub/polyfill approach (Porsche Design System, https://designsystem.porsche.com/v4/developing/vue/testing/; jsdom issue 3294).
- Unit tests: stub `close` to dispatch `close` **synchronously** but note it is queued in browsers; dispatch `new Event('cancel', { cancelable: true })` and `{ cancelable: false }` to cover both spec branches; dispatch `KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })`. Mock clipboard with `Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn() }, configurable: true })`, resolve and reject cases. `getByRole('dialog')` needs `open` set (stub handles it). This is not browser evidence.
- Playwright (project uses `playwright-core` ^1.64.1, scripts `tests/e2e/*-browser-only.mjs`): `context.grantPermissions(['clipboard-read','clipboard-write'], { origin })` and read via `page.evaluate(() => navigator.clipboard.readText())` — reliable in Chromium; Firefox/WebKit differ (**PARTIAL**, https://qaskills.sh/blog/playwright-clipboard-read-write-permissions, https://lightrun.com/answers/microsoft-playwright-bug-copy-to-clipboard). For denial, use a context without the grant, or override `navigator.clipboard.writeText` to reject via `addInitScript`.
- Escape cases in E2E: (a) open the dialog, press Escape **without** any click (no activation) → still open; (b) Escape, Escape quickly → still open; (c) click inside, Escape → `confirm-close`. Backdrop: `page.mouse.click(5, 5)` → still open. `beforeunload`: `page.on('dialog')` with `type() === 'beforeunload'` (requires a prior user gesture on the page in Chromium — **UNVERIFIED**).
- Run E2E in Chromium (main OBS/streamer browser) and, if available, Firefox; WebKit is optional (no `closedby`).

## 5. Recommended implementation (for @dev)

1. `<dialog ref closedby="none" aria-labelledby aria-describedby>` + `showModal()` in an effect; immediately focus `Copy link`.
2. Guards from 1.4 (keydown Escape, `cancel` preventDefault, `close` reopen with `closingByCode` ref). No backdrop handler.
3. `copy()`: synchronous call to `navigator.clipboard?.writeText(url)` in the click handler; on missing API or rejection, set failure alert; no `execCommand`.
4. Masked: URL not in DOM; reveal renders a read-only text input; no `type=password`, no form.
5. Persistent empty `role="status"` and `role="alert"` nodes, fixed copy.
6. Explicit return focus after list refresh; close the regenerate `alertdialog` before opening.
7. `beforeunload` only while `copied === false`.

## 6. Test strategy

- Unit (jsdom, shared stub): all rules from the UX plan + both `cancel` cancelable branches + Escape keydown + `close` without code → reopened + secret absent from DOM/attributes while masked + no console/storage leak.
- Browser E2E (Playwright, disposable API/PostgreSQL): cases in section 4 in Chromium, plus Firefox if available; record browser versions in the story.
- Manual AT: as in the UX plan. If the guard set fails E2E, use the plan fallback (custom backdrop + `inert`).

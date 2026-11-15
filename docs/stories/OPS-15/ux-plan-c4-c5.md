# OPS-15 — UX plan and review for LA-12, LA-13, LA-16, LA-17 (batches C4 and C5)

- Date: 2026-11-13
- Author and reviewer: `@ux-design-expert` (Uma), autonomous run (planning only, no code changed)
- Branch: `chore/emergency-snapshot-2026-11-12`
- Ledger: `docs/process/open-acceptance-criteria-2026-11-10.md` (rows LA-12, LA-13, LA-16, LA-17; LA-11 is the visual validation that closes LA-13)
- Portuguese twin: `docs/pt-BR/stories/OPS-15/ux-plan-c4-c5.md` (same structure)

## 0. Scope and limits (read first)

**Covered (static review):** reading of `apps/frontend/styles/overlay.css`, `apps/frontend/app/(overlay)/overlay/overlay-root.jsx`, `apps/shared/panel/overlay-renderer.mjs`, `apps/frontend/features/widgets/widgets-page-content.jsx`, `apps/frontend/scripts/dev-runtime-config.mjs`, `apps/frontend/scripts/dev-server.mjs`, `apps/frontend/features/panel-shell/panel-provider.jsx`, `apps/frontend/lib/api/client.mjs`, `apps/api/src/http/local-session.mjs`, the overlay and panel catalogs (en, es, pt-BR) and `docs/stories/OPS-25/obs-native-runbook.md`. WCAG contrast ratios below were **computed** from the WCAG 2.x relative-luminance formula (a calculation, not a pixel measurement).

**NOT covered (needs `@qa` visual validation, section 6):** no rendering, no real browser, no OBS/CEF, no pixel sampling, no keyboard walk-through, no screen reader, no real `npm run dev:start` run. Scores are static-review scores for the planned scope only; they do not certify the implemented result.

**Research:** `docs/research-index.md` was consulted first. Row 3 (FND-7 OBS Browser Source/CEF) is SUFFICIENT and no LACUNA applies to these four items, so no new research was requested. The WCAG thresholds used (1.4.3 = 4.5:1 for small text, 1.4.6 = 7:1 enhanced) are the published W3C values; this agent has no internet tool and did not re-open the pages. What Next 16.4 prints as the "Local" URL for a given `--hostname` is UNVERIFIED and is a measurement task for `@dev` (item 3).

## 1. Summary

| Item | Ledger | Decision (one line) | Score |
|---|---|---|---|
| 1 | LA-12 (FT-61, N-1) | Status line moves inside the widget box; the form shows a live minimum height and a non-blocking warning; the runbook states the same formula | 9.1 |
| 2 | LA-13 (FT-62, N-2) | Default style: white text on a 72% black chip, with the stale dimming moved off the status line; owner may override with two CSS variables | 9.2 |
| 3 | LA-16 (FT-66) | `dev:start` never prints `127.0.0.1` for the panel; Next is started with hostname `localhost` and `dev-server.mjs` prints its own first line with the `localhost` URL | 9.0 |
| 4 | LA-17 (FT-67) | When the page host is `127.0.0.1` or `[::1]`, the panel replaces the generic load error with a specific message and a link to the `localhost` URL | 9.1 |
| **Overall** | | Lowest item is 9.0, so the 9.0 gate is met for the reviewed scope | **9.1** |

Why these are above the gate: each item has one decision, exact trilingual text, measurable acceptance criteria, and a named fallback for its main risk. The residual risk is concentrated in things only a real browser or OBS can show (section 6), which is why no score is above 9.2.

## 2. Item 1 — LA-12 (FT-61): minimum Browser Source height

### 2.1 Finding (static)

`.overlay-status` is `position: absolute; top: 100%` (`overlay.css`), so the status line is drawn **below** the widget box. The renderer sets `height` and `overflow: hidden` for the `clip` and `ellipsis` overflow modes, and OBS crops everything outside the Browser Source. Result: when the Browser Source height equals the text height, the status line is outside the box and invisible. The form only says "Height (px or auto)" and never mentions OBS.

### 2.2 Decision

1. **Layout:** the status line becomes a normal row inside the box. `.overlay-widget` becomes a two-row grid (value row, status row). The status row is hidden when empty (`.overlay-status:empty { display: none }`), so a healthy widget has exactly the size it has today. When the widget has a fixed height, the grid pins the status row to the bottom (`grid-template-rows: 1fr auto`). `width: max-content` is kept, so with automatic width the box grows to fit the status text.
2. **Minimum height rule (single formula, used everywhere):** `minimum = ceil(font size x 1.4) + 20` px. The 20 px is the status row (12 px text on a 16 px line plus 2 px padding above and below). Example: font size 32 gives 65 px; font size 24 gives 54 px.
3. **Form:** under the Height field, a hint (always visible, linked with `aria-describedby`) shows the live minimum for the current font size. If the Height is a number below the minimum, a second message appears (`role="status"`, not blocking, save stays enabled, because a height lower than the minimum is a valid choice when the owner never wants a status line).
4. **Runbook:** `docs/stories/OPS-25/obs-native-runbook.md` (and the pt-BR twin) gets the same formula and one screenshot step per state.

### 2.3 Exact text

New keys in the `panel` catalogs (the `{min}` placeholder is an integer).

| Key | en | es | pt-BR |
|---|---|---|---|
| `panel.widget.height_hint` | Minimum height for this font size: {min} px (text plus 20 px for the status line). In OBS, set the Browser Source height to at least {min} px, or the status line is cut off. | Altura mínima para este tamaño de letra: {min} px (texto más 20 px para la línea de estado). En OBS, pon la altura de la fuente Navegador en al menos {min} px; si no, la línea de estado se corta. | Altura mínima para este tamanho de fonte: {min} px (texto mais 20 px para a linha de status). No OBS, deixe a altura da fonte Navegador em pelo menos {min} px, ou a linha de status será cortada. |
| `panel.widget.height_below_min` | This height is below {min} px. The status line may be cut off while it is shown. | Esta altura es menor que {min} px. La línea de estado puede cortarse mientras se muestra. | Esta altura é menor que {min} px. A linha de status pode ser cortada enquanto aparece. |

Runbook paragraph (en): "**Height.** The widget status line (for example "Update delayed") is drawn inside the widget box. Set the widget height, and the OBS Browser Source height, to at least `ceil(font size x 1.4) + 20` px. Example: font size 32 needs 65 px. With a smaller height the status line is cut off by OBS."
Runbook paragraph (pt-BR): "**Altura.** A linha de status do widget (por exemplo, "Atualização atrasada") é desenhada dentro da caixa do widget. Deixe a altura do widget, e a altura da fonte Navegador (Browser Source) do OBS, em pelo menos `ceil(tamanho da fonte x 1,4) + 20` px. Exemplo: fonte 32 precisa de 65 px. Com altura menor, o OBS corta a linha de status."

Existing label keys (`panel.widget.style.height`) stay unchanged.

### 2.4 Acceptance criteria (verifiable)

- AC-12.1 (unit): a pure function `minimumWidgetHeight(fontSize)` returns `ceil(fontSize * 1.4) + 20`; cases 8 -> 32, 24 -> 54, 32 -> 65, 128 -> 200.
- AC-12.2 (unit, jsdom): the Height field has `aria-describedby` pointing at the hint; the hint contains the number for the current font size and updates when the font size changes; the below-minimum message appears only when Height is numeric and lower than the minimum, never for `auto`, and Save stays enabled.
- AC-12.3 (catalog): both keys exist in en, es, pt-BR with the same `{min}` placeholder; `npm run validate:localization` passes.
- AC-12.4 (unit on `overlay.css`/renderer contract): `.overlay-status` is not `position: absolute` and has no `top: 100%`; `.overlay-status:empty` is `display: none`.
- AC-12.5 (browser, `@qa`): with height = the minimum for the font size and `overflow: clip`, in the stale, unavailable and data-unavailable states, the whole status chip is inside the box: sampled in a screenshot, the chip's bottom edge is at or above the box's bottom edge (0 px of the chip outside).
- AC-12.6 (docs): runbook en and pt-BR contain the formula and the example; both files updated together.

### 2.5 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| The 1.2 line-height factor is an approximation of the font's real `normal` line height (system-ui, Arial, Verdana, Georgia, Courier New differ) | Medium | AC-12.5 is run on all five font families in the form; if one needs more than 1.2, raise the factor to the worst measured value (formula stays one line) |
| Existing widgets saved with a small fixed height clip the value text while a status shows | Low | Only during an error/stale state; the below-minimum message tells the owner; no data migration |
| Status text wider than a narrow fixed width wraps to a second line (not counted in the minimum) | Low | Accepted and documented: the status wraps instead of being truncated, so no information is lost |
| Layout shift when the status appears (auto height grows by 20 px) | Low | Only on error/stale; the Browser Source is already required to have the minimum height |

### 2.6 Score: 9.1

Strong: root cause found in code (outside-the-box positioning), one formula reused in form, warning and runbook, non-blocking. Held back by: the 1.2 factor is unmeasured across fonts (needs OBS/browser run).

## 3. Item 2 — LA-13 (FT-62): status-line legibility

### 3.1 Finding (static, with computed contrast)

Current style: text `rgb(255 255 255 / 78%)`, no shadow, no background. Computed against a uniform scene color:

| Scene color | Current contrast | Notes |
|---|---|---|
| White `#FFFFFF` | 1.00:1 | invisible |
| Mid gray `#808080` | 3.08:1 | fails 4.5:1 |
| Black `#000000` | 12.41:1 | passes |

A second defect: `.overlay-widget.is-stale { opacity: .82 }` dims the whole widget, including the status line, which is the exact moment the status must be read. A chip with 72% black under that opacity computes to 4.35:1 on white, below 4.5:1.

### 3.2 Options considered

| Option | Verdict |
|---|---|
| A. Text shadow only | Rejected. A 12 px thin shadow does not create a guaranteed contrast ratio over a light or busy scene, and its legibility cannot be stated as a number |
| B. **Solid translucent background ("chip") + white text** | **Chosen.** The background sets a known luminance floor under the text, so the ratio is the same on any scene; the worst case is a pure white scene |
| C. Opaque black chip | Rejected for a default: heavier on dark scenes and hides more of the scene for no gain over 72% |

### 3.3 Decision (proposed default; the owner has not defined the style and may change it)

- Text: `#FFFFFF`, 100% opacity, 12 px on a 16 px line, weight 500.
- Chip: background `rgb(0 0 0 / 72%)`, padding `2px 6px`, border radius `3px`, `justify-self: start`.
- No text shadow (it adds blur without a guaranteed ratio).
- The stale dimming applies to `.overlay-value` only, not to the status chip.
- Style held in two local CSS custom properties on `.overlay-status`: `--overlay-status-fg` and `--overlay-status-bg`. This is overlay-local CSS, not a design-system token, so no token approval is involved. If the owner wants another style, only these two values change.
- The widget's own effect (outline, shadow) and color settings keep applying to the value only.

### 3.4 Computed contrast of the proposal (WCAG 2.x, white text over the composited chip)

| Scene color under the chip | Chip composite | Contrast |
|---|---|---|
| White `#FFFFFF` (worst case) | `rgb(71 71 71)` | 9.23:1 |
| Yellow `#FFFF00` | `rgb(71 71 0)` | 9.62:1 |
| Mid gray `#808080` | `rgb(36 36 36)` | 15.55:1 |
| Red `#FF0000` | `rgb(71 0 0)` | 16.52:1 |
| Black `#000000` | `rgb(0 0 0)` | 21.00:1 |

Pure white is the lightest possible backdrop, so 9.23:1 is the floor for any uniform or photographic scene. It clears 4.5:1 (1.4.3) and 7:1 (1.4.6). Alternative alphas, for the owner: 60% gives 5.74:1 on white (passes 4.5:1 only); 80% gives 12.63:1.

### 3.5 Exact text

No new user-facing text. The three existing strings stay as they are:

| Key | en | es | pt-BR |
|---|---|---|---|
| `overlay.status.unavailable` | Source unavailable | Fuente no disponible | Fonte indisponível |
| `overlay.status.data_unavailable` | Data temporarily unavailable | Datos temporalmente no disponibles | Dados temporariamente indisponíveis |
| `overlay.status.stale` | Update delayed | Actualización retrasada | Atualização atrasada |

### 3.6 Acceptance criteria (verifiable)

- AC-13.1 (CSS contract test): `.overlay-status` declares a background with alpha >= 0.70 and text color `#fff` at 100% opacity; no `opacity` is applied to `.overlay-widget.is-stale` itself (the rule targets `.overlay-value`).
- AC-13.2 (unit): a test computes the WCAG ratio from the two CSS custom property defaults against white and fails if it is below 7.0.
- AC-13.3 (browser, `@qa`, pixel measurement): in the stale, unavailable and data-unavailable states over four backgrounds (`#FFFFFF`, `#808080`, `#000000`, and a busy photo with white regions), sample the chip background pixel and the text pixel in a screenshot and compute the WCAG ratio; every sample >= 7.0:1 (hard floor 4.5:1).
- AC-13.4 (browser, `@qa`): stale state with the value dimmed: the status text pixel is still pure white (255,255,255), not dimmed.
- AC-13.5 (OBS/CEF, `@qa`, LA-11): the same four backgrounds as OBS scenes (Browser Source with transparent background over each scene); screenshots attached to the story. Any reading under 4.5:1 fails.
- AC-13.6: with `prefers-reduced-motion: reduce` nothing animates (existing rule kept).

### 3.7 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| The owner dislikes the chip look | Low | Two variables; alpha table above; the owner's OK is recorded before `rc` per the ledger |
| CEF renders `rgb(0 0 0 / 72%)` space-separated alpha differently from Chromium | Low | Use `rgba(0, 0, 0, 0.72)` in the CSS to be safe; confirmed in AC-13.5 |
| Chip covers part of the scene at the bottom edge | Low | It is 20 px high and only shown in an error/stale state |

### 3.8 Score: 9.2

Strong: the contrast is stated as numbers, the worst case is covered by construction, and an unrelated defect (stale dimming) that would have broken the fix was found. Held back by: computed, not pixel-measured, and CEF rendering unverified.

## 4. Item 3 — LA-16 (FT-66): `dev:start` banner

### 4.1 Finding (static)

`dev-runtime-config.mjs` starts Next with `--hostname 127.0.0.1` (when not in Codespaces) and `--port 3000`. Next prints its own "Local:" line from that hostname, so the first URL a new person sees is `https://127.0.0.1:3000`, where the panel session does not work (LA-17). `panelDevOrigin` is already `https://localhost:3000`; only the banner is wrong. `dev-server.mjs` prints nothing about the panel address itself.

### 4.2 Decision

1. Start Next with `--hostname localhost` outside Codespaces (Codespaces keeps `0.0.0.0` and its forwarded URL).
2. `dev-server.mjs` prints one first-party line right after the children are spawned, with the exact panel URL: it uses `config` (`PANEL_DEV_ORIGIN`), never a hard-coded string.
3. `@dev` **measures** two things before committing to step 1: (a) what Next 16.4.1 prints for `--hostname localhost`; (b) which interfaces it binds (`ss -ltn` on port 3000): the API's allowed hosts and the TLS certificate must still work for `localhost`. **Fallback** if `localhost` binds only IPv6 or breaks the proxy: keep `127.0.0.1` for the bind, keep step 2, and filter the child's stdout to rewrite the "Local:" line; whichever is used, the acceptance below is unchanged.
4. The API's internal `127.0.0.1:3109` is not a user address and is never printed as one.

### 4.3 Exact text (CLI output)

Development output in this script is English only today, so the CLI line stays English; the other two languages are given for the runbook.

| | Text |
|---|---|
| en (CLI and runbook) | Open the panel at https://localhost:3000 — use localhost, not 127.0.0.1. |
| es (runbook) | Abre el panel en https://localhost:3000: usa localhost, no 127.0.0.1. |
| pt-BR (runbook) | Abra o painel em https://localhost:3000: use localhost, não 127.0.0.1. |

The port in the text comes from `NEXT_DEV_PORT`, so it is `3000` by default only.

### 4.4 Acceptance criteria (verifiable)

- AC-16.1 (unit): `buildDevRuntimeConfig()` frontend args contain `--hostname localhost` when `CODESPACE_NAME` is unset, and `0.0.0.0` when it is set; the existing contract tests for `dev-runtime-config` are updated.
- AC-16.2 (unit): the banner function returns a line containing `config.panelDevOrigin` and not the substring `127.0.0.1`.
- AC-16.3 (real run, `@dev` then `@qa`, Linux): capture the complete stdout and stderr of `npm run dev:start` for 30 s; the text contains `https://localhost:3000` and contains no match for `127\.0\.0\.1:3000`. The report quotes the captured lines.
- AC-16.4 (real run): `https://localhost:3000` loads the panel and a state-changing action works; `ss -ltn` output for port 3000 is recorded in the story.
- AC-16.5 (docs): the setup docs/runbooks that show the dev URL use `localhost`, grep over `docs/` for `127.0.0.1:3000` returns only historical records.

### 4.5 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `--hostname localhost` binds `::1` only on some Linux/Windows setups, breaking `127.0.0.1` callers (the proxy uses `https://localhost:3109`) | Medium | Measurement step 3(b); the stated fallback; test on the Windows run (LB-01) too |
| Next's "Local:" text changes in a future version | Low | AC-16.3 is a real-output test; a banner of our own is the primary signal |
| The banner scrolls away under later logs | Low | The line is printed once at start and repeated by the README; the wrong-host panel message (item 4) is the safety net |

### 4.6 Score: 9.0

At the gate: the decision is clear and the root cause is known, but what Next prints and binds for `localhost` is unverified, so the plan depends on a measurement with a named fallback. It would rise with the real-output capture.

## 5. Item 4 — LA-17 (FT-67): wrong-host session message

### 5.1 Finding (static)

When the page is opened at `https://127.0.0.1:3000`, `apiClient.initializeSession()` fails or the first requests are refused (`local-session.mjs` returns 401/403 JSON for `/api/*` without a valid session), `panel-provider.jsx` sets `status = 'unavailable'` and `panel.error.local_load`: "Could not connect to the local API. Check that the service is running, then refresh the page." That is wrong advice: the service is running and refreshing never helps. The same key is used in `operations-page-content.jsx`. The first-party pt-BR fallback catalog (`load-first-party-panel-fallback.mjs`) lets the panel show text even when the catalog API call failed.

### 5.2 Decision

1. A small pure helper `wrongHostForPanel(location)` returns `{ host, url }` when `location.hostname` is `127.0.0.1` or `[::1]`, otherwise `null`. `url` is `https://localhost:` + the current port + the current pathname, **without** query string or hash (so one-time outcome parameters are never copied).
2. When the load fails and the helper returns a value, the panel shows `panel.error.wrong_host` plus a link whose text is `panel.error.wrong_host_action`, instead of `panel.error.local_load`. Same container as today (`role="alert"` card in `panel-shell.jsx`), so announcement behavior is unchanged. `operations-page-content.jsx` uses the same helper.
3. The link is a normal anchor to the `localhost` URL (no auto-redirect: an automatic redirect hides the cause, and the cookie jar and certificate trust are per host).
4. For any other failure the generic text stays.
5. **Language:** at the wrong host the catalogs cannot be loaded, so the text comes from the bundled first-party fallback (pt-BR). `@dev` checks whether that fallback can carry all three languages and then picks by `navigator.language`; if it cannot, pt-BR is shown and the URL, which is language-neutral, is the actionable part. This is accepted for this scope.
6. The message does not state a cause beyond what is known (the host differs from `localhost`); it does not blame the certificate or the cookie.

### 5.3 Exact text

`{host}` is the browser host, for example `127.0.0.1`; `{url}` is the corrected address.

| Key | en | es | pt-BR |
|---|---|---|---|
| `panel.error.wrong_host` | The session is not valid at {host}. This panel only works at localhost. | La sesión no es válida en {host}. Este panel solo funciona en localhost. | A sessão não vale em {host}. Este painel só funciona em localhost. |
| `panel.error.wrong_host_action` | Open {url} | Abrir {url} | Abrir {url} |

### 5.4 Acceptance criteria (verifiable)

- AC-17.1 (unit): `wrongHostForPanel` returns the object for `127.0.0.1` and `[::1]` with the right port and pathname and no query or hash; returns `null` for `localhost`, a Codespaces host, a LAN IP and an empty string.
- AC-17.2 (unit, jsdom): with the load rejected and location host `127.0.0.1`, the alert shows the wrong-host text and a link whose `href` is `https://localhost:<port>/<path>`; with host `localhost` it shows `panel.error.local_load`.
- AC-17.3 (catalog): both keys exist in en, es, pt-BR with matching `{host}`/`{url}` placeholders; `npm run validate:localization` passes.
- AC-17.4 (browser, `@qa`): open `https://127.0.0.1:3000/`; the alert shows the message, the link is focusable by keyboard, has a visible focus ring, and activating it lands on `https://localhost:3000/` with a working panel.
- AC-17.5: no console error text or stack is shown to the person; the message contains no `referenceId`, token or cookie data.
- AC-17.6 (a11y, static plus `@qa`): the card keeps `role="alert"`; link text is meaningful out of context (it contains the URL).

### 5.5 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| The failure at `127.0.0.1` is shown by another route (for example a 403 on a later action, not at load) | Medium | The helper is shared; `@dev` adds it wherever `local_load` and `SESSION_INITIALIZATION_FAILED` surface; AC-17.4 walks the real flow |
| pt-BR shown to an English or Spanish reader | Low | Accepted, see 5.2(5); URL is the actionable part |
| Fallback catalog does not contain the new keys | Medium | AC-17.2 and a catalog test that reads the fallback loader output; `@dev` adds the keys to the fallback source if it is separate |
| The user opens the app on a LAN address, not 127.0.0.1 | Low | Out of scope: generic text stays; the helper is deliberately limited to the loopback IPs |

### 5.6 Score: 9.1

Strong: specific cause, a way out in one click, no false claims, safe URL (no query). Held back by: language fallback and the exact failure route at `127.0.0.1` are not verified in a browser.

## 6. Static review versus what still needs real validation (`@qa`)

| Check | Type | Status |
|---|---|---|
| Code reading, root causes, layout/CSS contract | Static review | Done in this document |
| WCAG ratios in 3.4 | Computed from the formula | Done; not pixel-measured |
| Trilingual text, placeholder parity | Static review | Done; `validate:localization` to run |
| Pixel contrast on four backgrounds (AC-13.3, 13.4) | Real browser | **Pending `@qa`** |
| Status inside box on five font families (AC-12.5) | Real browser | **Pending `@qa`** |
| OBS/CEF scenes, transparent background, light and dark (AC-13.5, LA-11) | OBS/CEF native | **Pending `@qa`** |
| `npm run dev:start` real output and bound interfaces (AC-16.3, 16.4) | Real run | **Pending `@dev` then `@qa`** |
| Wrong-host flow at `https://127.0.0.1:3000` (AC-17.4) | Real browser | **Pending `@qa`** |
| Keyboard walk-through of the form hint, the warning and the link | Real browser | **Pending `@qa`** |
| Screen reader announcement (NVDA/VoiceOver) | Assistive technology | Out of scope here; tracked as LB-05 |
| OBS labels "Navegador" (es, pt-BR) match the localized OBS UI | OBS UI | **Pending `@qa`**; adjust the three hint strings if OBS uses another word |

## 7. What `@dev` implements (in this order)

1. **C4-a (LA-12 + LA-13, one change):** `overlay.css` grid layout, status row inside the box, chip style with the two CSS variables, stale dimming on the value only; `overlay-root.jsx` unchanged unless a class is needed; `minimumWidgetHeight` helper; hint and warning in `widgets-page-content.jsx`; the two keys in the `panel` catalogs (en, es, pt-BR); runbook paragraph in en and pt-BR. Tests: AC-12.1 to 12.4, 12.6, 13.1, 13.2.
2. **C4-b:** capture the AC-12.5 and AC-13.3 to 13.5 evidence with `@qa` (the script or manual steps go in the runbook).
3. **C5-a (LA-16):** measure Next's output and bound interfaces for `--hostname localhost` first, then change `dev-runtime-config.mjs`, add the banner line in `dev-server.mjs`, update the config contract test, run `dev:start` and attach the captured output. Tests: AC-16.1 to 16.3, 16.5.
4. **C5-b (LA-17):** `wrongHostForPanel` helper, use it in `panel-provider.jsx`/`panel-shell.jsx` and `operations-page-content.jsx`, the two keys in the `panel` catalogs and the fallback, link markup. Tests: AC-17.1 to 17.3, 17.5.
5. Update the story checklist and file list; en and pt-BR together; no change to design-system tokens.

Do not: add a text shadow to the status line, auto-redirect from `127.0.0.1`, block saving on a low height, or print `127.0.0.1` as a panel address.

## 8. Measurement note: line-height factor (2026-11-13)

Measured in the browser on this machine: the `system-ui` font has a `normal` line height of 1.344 x the font size, and the status chip ended 4 px outside the box with `ceil(font size x 1.2) + 20`. Following the risk mitigation in section 5, the factor was raised to **1.4** (the worst measured value, rounded up): `minimum = ceil(font size x 1.4) + 20` (font 8 -> 32 px, 24 -> 54 px, 32 -> 65 px, 128 -> 200 px). The other four families (Arial, Verdana, Georgia, Courier New) still need the AC-12.5 run with `@qa`; if one exceeds 1.4, raise the factor again. No acceptance credit is given here.

## 9. Measurement note: status chip contrast in native OBS (2026-11-13, D-2)

`@qa` measured the status chip in native OBS 32.2.2 (CEF 127) over a pure white scene: **3.19:1** with `rgba(0, 0, 0, 0.72)`, below the 4.5:1 floor of AC-13.5. The same widget in Chrome measured 9.29:1. OBS composites the browser layer in **linear light**, so 72% black over white becomes pixel 144 instead of 71. Sections 3 and 4 (4.35:1 and 9.23:1) were computed in sRGB and overstate the OBS result.

Measured candidates over a white / gray (128) / dark scene in OBS (source: `qa-c4-c5-live-2026-11-13.md`, section 2.3):

| Alpha | White | Gray | Dark |
|---|---|---|---|
| 0.72 (previous) | 3.19:1 | 9.59:1 | 21:1 |
| 0.85 | 5.25:1 | 12.82:1 | 21:1 |
| **0.90 (adopted)** | **7.11:1** | 14.74:1 | 21:1 |
| 1.00 | 21:1 | 21:1 | 21:1 |

Decision: `--overlay-status-bg` is now `rgba(0, 0, 0, 0.9)` (target 7:1 reached; not fully opaque, so the scene still shows slightly). Both variables remain, so the owner can still override them. The unit test requires alpha >= 0.90 and models the linear-light blend. **Rule: measure contrast and legibility in OBS, not only in Chrome**, because the two blend differently. This section supersedes the 72% figure in sections 2 to 4 and in AC-13.5. `@qa` must repeat the OBS white-scene measurement; no acceptance credit is given here.

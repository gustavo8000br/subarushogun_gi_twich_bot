# OPS-15 — UX plan and review for E7: show the `referenceId` when the overview fails to load

- Date: 2026-11-13
- Author and reviewer: `@ux-design-expert` (Uma), autonomous run (planning only, no code changed)
- Branch: `chore/emergency-snapshot-2026-11-12`
- Owner decision (2026-11-13): on an overview load failure (Next panel, E7), show the error `referenceId` next to the generic localized message, so the person can quote it to support. Project error rule: generic localized text + `referenceId`; never message, stack or internal data.
- Portuguese twin: `docs/pt-BR/stories/OPS-15/ux-plan-e7-reference-id.md` (same structure)

## 0. Scope and limits (read first)

**Covered (static review):** `apps/frontend/lib/api/client.mjs`, `apps/frontend/features/panel-shell/panel-provider.jsx`, `wrong-host-message.jsx`, `outcome-region.jsx`, `load-panel-snapshot.mjs`, `apps/frontend/features/widgets/widget-link-dialog.jsx` (existing copy pattern), `apps/frontend/styles/panel.css`, `apps/api/src/http/safe-http-error-handler.mjs`, `queue-routes.mjs`, `local-session.mjs`, `apps/shared/panel/panel-catalog.mjs`, the panel catalogs (en, es, pt-BR) and `tests/e2e/overview-degraded-browser-only.mjs`.

**NOT covered (needs `@qa`, section 8):** no rendering, no real browser, no keyboard walk-through, no screen reader, no pixel contrast sampling. Scores are static-review scores for this scope only and do not certify the implementation.

**Research:** `docs/research-index.md` rule applied; no new research was requested (no LACUNA: this reuses a pattern already in the panel). WCAG thresholds (1.4.3 = 4.5:1) are the published W3C values; this agent has no internet tool.

## 1. Findings (static)

1. The client already captures the id: `client.mjs` puts `referenceId` on the thrown error, taken from `payload.referenceId` or the `x-error-reference` response header (only for non-2xx responses with a server body).
2. The API creates it: `safe-http-error-handler.mjs` (unexpected errors, HTTP 500, body `{ code: 'INTERNAL_ERROR', error, referenceId }` plus header `x-error-reference`) and `queue-routes.mjs` (same pair on 5xx/503 paths). The id comes from `reportDiagnostic`, so it matches the structured server log.
3. The catalog key `panel.error.reference` ("Reference: {id}", es "Referencia: {id}", pt-BR "Referência: {id}") already exists in the three catalogs, in the first-party fallback (`panel-catalog.mjs`, placeholder `id`) and is rendered by `outcome-region.jsx` and the operations/queue screens. The overview load path is the only place that drops it: `panel-provider.jsx` (`.catch((loadError) => ...)`) sets only `status = 'unavailable'` and a message key. The E2E states this gap as `boundary('E7', ...)`.
4. The id format is already validated everywhere with `^[A-Za-z0-9_.-]{1,64}$` (`SAFE_REFERENCE`). That is the single allowlist to reuse.
5. At a failed first load the catalog request is part of the same `Promise.all`, so the panel renders with the pt-BR **first-party fallback** (the E2E asserts this). The new text must therefore exist in that fallback too.
6. The existing copy pattern (`widget-link-dialog.jsx`): `navigator.clipboard.writeText`, a `role="status"` region for success and a `role="alert"` region for failure, with a manual fallback.

## 2. Decision

### 2.1 Where

Inside the same `role="alert"` card that shows the generic message (`PanelLoadError` in `wrong-host-message.jsx`, class `status-card error-card`), as a second line **after** the message. No new region, no modal, no toast: the alert is announced once, message and id together, and nothing moves focus.

Structure (one card):

```
[generic localized message]
Referência: <code>overview-ref-9</code>   [Copiar referência]
[ "Referência copiada" status, empty until used ]
```

### 2.2 How it looks and behaves

- **Label and format:** the existing `panel.error.reference` ("Reference: {id}"). The id is wrapped in `<code>` (monospace, `user-select: all`, `overflow-wrap: anywhere` so 64 characters never overflow a narrow window). The id is shown exactly as received, no truncation, no case change, no grouping.
- **Copy:** a normal `<button type="button">` with the visible text "Copy reference" (the accessible name equals the visible text, WCAG 2.5.3). Uses `navigator.clipboard.writeText` with the id only (not the sentence). Min height 44 px, reusing the existing `.status-card button` style (already styled in `panel.css`, so no new tokens).
- **Feedback:** success text goes to a separate `role="status"` element ("Reference copied"); failure goes to a separate `role="alert"` ("Could not copy. Select the code and copy it."). Both elements exist from the first render and start empty, so the announcement is reliable. Failure always leaves the id selectable (`user-select: all`), so there is a manual path with no clipboard permission.
- **Focus:** nothing moves focus on load. After activating the button, focus stays on the button (no re-mount). The id is plain text in reading order, reachable by screen-reader browse mode; it needs no tab stop.
- **Screen readers:** the alert announces "message. Reference: overview-ref-9". The id is read as typed (no `aria-label` rewriting). `<code>` carries no extra role. The `lang` of the id is not changed.
- **Contrast:** the card text is `#ffc5ca` on the `surface-raised` background; the id inherits that color, no new color. `@qa` measures it (section 8); the floor is 4.5:1, the target 7:1. Do not dim the id with opacity.
- **Window width:** the line wraps under the message (flex-wrap), the button never shrinks below its label.

### 2.3 When the id is shown (by source of the failure)

| Failure | Has an id? | Shown? | Reason |
|---|---|---|---|
| HTTP 500 from `/api/state` (or another snapshot request) with `referenceId` in body or `x-error-reference` header | Yes (server-made, same id as the log) | **Yes** | The main case of the owner decision |
| HTTP 5xx/503 from `queue-routes.mjs` paths in the snapshot (for example `/api/queues`) | Yes | **Yes** | Same handler contract |
| Read timeout (`REQUEST_TIMEOUT`, `timedOut: true`, key `panel.error.read_timeout`) | No: the client aborted, there was no server answer, so any id would be invented | **No**; the timeout text stays alone | No invention (Constitution IV); a made-up client id would not match any log |
| Network failure / refused connection (`REQUEST_FAILED`, `status: 0`) | No | **No** | Same |
| Wrong host (`panel.error.wrong_host`, LA-17) | Not applicable: the message names its own fix; ids from a session-less 401/403 do not exist (`local-session.mjs` returns no `referenceId`) | **No** | A reference code would distract from the one useful action (the localhost link); AC-17.5 of the C4/C5 plan stays valid |
| 4xx with a closed code (session, CSRF) without id | No | **No** | Nothing to quote |
| Server body or header carries a value that fails `^[A-Za-z0-9_.-]{1,64}$` | Rejected | **No** | Never render unvalidated server text |

If several snapshot requests fail, the first rejection of `Promise.all` is what the provider already receives; its id is the one shown (one failure, one id). Documented, not changed.

### 2.4 Exact text

Existing keys (unchanged, all three catalogs and the fallback): `panel.error.local_load`, `panel.error.read_timeout`, `panel.error.reference`.

New keys (the `panel` catalogs en, es, pt-BR **and** the first-party fallback list in `panel-catalog.mjs`; none takes a placeholder):

| Key | en | es | pt-BR |
|---|---|---|---|
| `panel.error.reference_copy` | Copy reference | Copiar referencia | Copiar referência |
| `panel.error.reference_copied` | Reference copied | Referencia copiada | Referência copiada |
| `panel.error.reference_copy_failed` | Could not copy automatically. Select the code and copy it. | No se pudo copiar automáticamente. Selecciona el código y cópialo. | Não foi possível copiar automaticamente. Selecione o código e copie. |

Optional (not required by the owner decision): a one-line hint "Quote this reference when you ask for support." (es: "Indica esta referencia al pedir soporte."; pt-BR: "Informe esta referência ao pedir suporte."). **Decision: not added**; the label "Reference" is the existing vocabulary and the screen is already dense. Revisit only if `@qa` or the owner finds people do not know what to do with it.

### 2.5 Helper and wiring (for `@dev`, no code written here)

1. Reuse (do not duplicate) the allowlist: one exported `safeReferenceId(error)` helper (a version already exists in `operations-page-content.jsx`; move it to a shared panel-shell module and import it in both places).
2. `panel-provider.jsx`: in the load `.catch`, store `loadErrorReference = wrongHostForPanel() || loadError?.timedOut ? null : safeReferenceId(loadError)` next to `error`; clear it when the load succeeds or restarts.
3. `PanelLoadError` receives `referenceId` and renders the line and button (new small component `ReferenceLine`, also usable by the refresh failure below).
4. Secondary, same helper (SHOULD): the in-page refresh failure (`panel.overview.refresh_failed`, E7 second half) passes the id through the existing `outcome-region.jsx` (`outcome.referenceId`); no new UI there, the text already renders the reference.
5. Never log, store or send the id from the browser; it lives in React state only. No change to API, `client.mjs` or design-system tokens.

## 3. Acceptance criteria (verifiable)

- AC-E7.1 (unit): `safeReferenceId` returns the id for `overview-ref-9`, `a.b_c-1`, 64 characters; returns `null` for 65 characters, empty, spaces, `<script>`, a URL, a number, `null`.
- AC-E7.2 (unit, jsdom): with the load rejected by an error `{ status: 500, referenceId: 'overview-ref-9' }`, the `role="alert"` card contains the generic message **and** "Referência: overview-ref-9" **and** a button named "Copiar referência"; the id sits inside `<code>`.
- AC-E7.3 (unit, jsdom): rejection with `timedOut: true`, with `status: 0`, with an invalid id, and at host `127.0.0.1`: no reference line and no copy button.
- AC-E7.4 (unit, jsdom): clicking the button calls `clipboard.writeText` with exactly the id (not the sentence); the `role="status"` element then contains "Referência copiada"; a rejecting `writeText` and a missing `navigator.clipboard` put the failure text in the `role="alert"` element; focus remains on the button.
- AC-E7.5 (unit, jsdom): the status and alert elements for copy feedback are in the DOM before the click and empty.
- AC-E7.6 (catalog): the three new keys exist in en, es, pt-BR and in the first-party fallback; `npm run validate:localization` passes; a test reads the fallback output and finds the keys and the existing `panel.error.reference`.
- AC-E7.7 (privacy): a test with the 500 body from the E2E fixture (`private server copy`, `secretFrame`, `INTERNAL_ERROR`) proves none of those strings reach the DOM; only the allowlisted id does.
- AC-E7.8 (E2E, `overview-degraded-browser-only.mjs`): the existing `x-error-reference: overview-ref-9` fixture; the card shows the id; the old `boundary('E7', ...)` gap line is removed and replaced by the assertions below.
- AC-E7.9 (a11y, `@qa`): the id is selectable by double-click and triple-click; the button is reachable by Tab, has a visible focus ring and a 44 px target; the contrast of the id text is measured >= 4.5:1.
- AC-E7.10: no reference line and no button after a successful reload (recovery step of the E2E); no new text appears for the timeout case.

## 4. Tests

### 4.1 jsdom (`tests/unit`, next to `wrong-host-panel.test.jsx` and `next-overview-panel.test.jsx`)

A new `overview-load-reference.test.jsx` covers AC-E7.1 to AC-E7.7. Reuse the existing provider test harness; mock `navigator.clipboard` with a spy; use fake timers for the read-timeout case (as the client tests do).

### 4.2 E2E (`tests/e2e/overview-degraded-browser-only.mjs`)

Changes to the existing flow, keeping its structure:

1. After `alert.waitFor`, assert the alert text contains the pt-BR fallback `panel.error.reference` rendered with `overview-ref-9` (build the expected text from the catalog with the id, do not hard-code the sentence).
2. Assert `code` inside the alert has text `overview-ref-9` and the button named by the fallback `panel.error.reference_copy` is visible.
3. Grant clipboard permission in the Playwright context, click the button, read `navigator.clipboard.readText()` and assert it equals `overview-ref-9`; assert the status text appears.
4. Keep the privacy assertion (no `private server copy`, `secretFrame`, `INTERNAL_ERROR`).
5. After recovery (`stateMode = 'ok'` and reload), assert no `code` with the id and no copy button remain.
6. Add a second pass with no header and no body id (fixture without `x-error-reference`): the card shows the generic message with no reference line.
7. Add a third pass for the read timeout using the harness delay option if it exists, otherwise leave it to the jsdom test (AC-E7.3) and note it as a boundary.
8. Remove the `boundary('E7', ...)` gap line and the header comment sentence that says the panel does not render the id.

### 4.3 Suggested mutations (each must make at least one test fail)

| # | Mutation | Expected failing test |
|---|---|---|
| M1 | Drop `loadErrorReference` (never pass it to `PanelLoadError`) | AC-E7.2, E2E step 1 |
| M2 | Remove the allowlist in `safeReferenceId` (render any string) | AC-E7.1, AC-E7.7 |
| M3 | Show a client-made id for `timedOut` or `status: 0` | AC-E7.3 |
| M4 | Show the id also at host `127.0.0.1` | AC-E7.3 |
| M5 | Copy the whole sentence instead of the id | AC-E7.4, E2E step 3 |
| M6 | Render the reference line outside the `role="alert"` card | AC-E7.2 |
| M7 | Create the copy status element only after the click | AC-E7.5 |
| M8 | Swallow a clipboard failure silently (no failure text) | AC-E7.4 |
| M9 | Leave the id after a successful reload (stale state) | AC-E7.10, E2E step 5 |
| M10 | Delete the new keys from the fallback list only | AC-E7.6 |
| M11 | Render `error.message` or `payload.error` next to the id | AC-E7.7 |

## 5. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| The pt-BR fallback is the only language at a failed first load; an English or Spanish reader sees pt-BR labels | Low | Accepted (same as LA-17); the id itself is language-neutral and is the actionable part. Use es/en strings once catalogs load |
| `navigator.clipboard` is unavailable on non-secure contexts or denied | Low | The panel runs on `https://localhost` (secure); failure text plus `user-select: all` is the fallback |
| A person confuses the id with a password/secret | Low | Label "Reference" is the project vocabulary; the id is non-secret, server-made and safe by the allowlist |
| The id wraps badly in a narrow window | Low | `overflow-wrap: anywhere`; AC-E7.9 checks 320 px |
| `Promise.all` shows the id of only one of several failures | Low | One id is enough for support to find the log; documented |
| Server logs may not be reachable by the person helping | Low | Out of scope: this plan only makes the code visible |

## 6. Score

| Item | Score |
|---|---|
| Where/how (single alert card, no focus change) | 9.2 |
| Source and truthfulness (no invented id for timeout/wrong-host; allowlist) | 9.3 |
| Accessibility design (names, live regions, selectable fallback, target size) | 9.0 |
| Trilingual text and fallback coverage | 9.1 |
| Tests and mutations | 9.2 |
| **Overall (static review, planned scope only)** | **9.1** |

Why not higher: contrast of the id on the error card, wrapping at 320 px, real clipboard behavior and screen-reader reading of the id are not measured. Minimum gate is 9.0/10 for the reviewed scope: **met by static review**, with the visual/assistive validation still pending.

## 7. Do not

- Invent or generate a client-side id (timeout, network failure, wrong host).
- Show `error.message`, the server `error` text, the stack, the code `INTERNAL_ERROR` or any other body field.
- Move focus to the id on load, or auto-copy it.
- Open a modal or toast for the id.
- Change the API, `client.mjs` or design-system tokens.

## 8. Static review versus what still needs real validation (`@qa`)

| Check | Type | Status |
|---|---|---|
| Source of the id (client.mjs, API handlers), error table, wiring, catalog keys | Static review | Done in this document |
| Trilingual text and placeholder parity | Static review | Done; `validate:localization` to run |
| jsdom behavior (AC-E7.1 to E7.7) | Unit | Pending `@dev` |
| E2E in a real browser (AC-E7.8, clipboard read) | Real browser | **Pending `@qa`** |
| Contrast of the id on the error card, 320 px wrapping, focus ring (AC-E7.9) | Real browser, pixel/visual | **Pending `@qa`** |
| Screen-reader reading of "message. Reference: id" and copy announcements | Assistive technology | Out of scope here; tracked as LB-05 |
| Mutations M1 to M11 | Test quality | **Pending `@dev`/`@qa`** |

## 9. What `@dev` implements (in this order)

1. Move `safeReferenceId` to a shared panel-shell module; add AC-E7.1 test.
2. Add `loadErrorReference` to `panel-provider.jsx`, pass it to `PanelLoadError`, build `ReferenceLine` (code, copy button, two live regions), minimal CSS in `panel.css` using existing colors.
3. Add the three keys to the catalogs (en, es, pt-BR) and to the fallback list in `panel-catalog.mjs`.
4. Write `overview-load-reference.test.jsx` (AC-E7.2 to E7.7) and update `overview-degraded-browser-only.mjs` (section 4.2).
5. Run the mutations (section 4.3) and record which tests killed each.
6. Update the story checklist and file list; en and pt-BR together.

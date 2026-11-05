# TS-10 — wave note (port of the class-B contracts to the Next panel)

[Português (pt-BR)](../../pt-BR/stories/OPS-15/ts-10-wave-note.md)

**Slice:** TS-10 of [OPS-15](story.md), cutover wave 4 (first half). **Author:** `@dev` (Dex), 2026-11-05. **Validation:** [po-validation-ft-42-ft-43.md](po-validation-ft-42-ft-43.md) (GO 9.0). **No vanilla file was edited or removed** (AC-TS10-8).

## 1. Port map, Red/Green and evidence (AC-TS10-1 to 6)

| AC | Source (vanilla, still present until FT-42) | New Next test | First run | Evidence |
|---|---|---|---|---|
| TS10-1 | `panel-confirmation-contract` "fails closed" | `tests/unit/next-confirmation-contract.test.jsx` (4 cases) | Green (characterization) | Mutations M1-M3 below |
| TS10-2 | `panel-confirmation-contract` "two separate confirmations" | same file (4 cases; challenge, final, cancel at each step, refused challenge) | Green | M2 (skipping the final step) killed it |
| TS10-3 | `reward-dialog-contract` "responsive space" | `tests/e2e/fixtures/dialog-layout.mjs` used by `queue-reward-settings-recovery-browser-only.mjs` and `queue-reward-resolution-browser-only.mjs` (390x844 and 768x900) | **Red**: actions 9 px apart, notices 13 px | Defect D3 fixed in CSS, then Green; 4 mutations killed |
| TS10-3 (close) | `reward-dialog-contract` "explicit close button" | same helper (`type="button"` on the close control) | Green | `type="submit"` mutant killed |
| TS10-4 | `health-status` lines 26 and 42 | `tests/unit/next-health-contract.test.jsx` (3 cases, real pt-BR catalog) | Green | 3 mutants killed |
| TS10-5 | `web-application-setup` (2 cases) | `tests/unit/next-connection-safe-error.test.jsx` (3 cases) | Green | 3 mutants killed |
| TS10-6 | `locale-picker-state` (3 cases) | `tests/unit/next-locale-fallback-contract.test.jsx` (3 cases) | **Red** (2 of 3): fallback showed `en`; chosen locale reverted while saving | Defect D1 fixed, then Green; 3 mutants killed |
| TS10-7 | `panel-localization-contract` | rewritten in place + `tests/e2e/panel-layout-browser-only.mjs` | Case "every key" **Red**: `panel.command.reload` missing | Defect D2 fixed, then Green; 6 mutants killed |
| extra | `panel-confirmation-contract` catalog-only cases | `tests/unit/panel-confirmation-copy.test.js` (4 cases, includes "no `confirm(` in `apps/frontend`") | Green | 3 mutants killed |

Cases of `panel-confirmation-contract` not ported, with reason (R5): "hide/archive removed from controls" and "`await confirmPanelAction` count = 12" read `app.js` only (vanilla markup); the three `requestPanelConfirmation` cases (resolve true/false, focus trap) test a vanilla helper, and the Next panel uses the native `<dialog>` modal whose focus handling is the browser's (the Next dialog keeps Back/Cancel focusable, covered by `next-queue-lifecycle-actions.test.jsx`); "accessible in-app dialog" read `index.html` (the Next dialog has `aria-labelledby`/`aria-describedby`, covered by the same file).

## 2. Next defects found by the ports (AC-TS10-9)

| ID | Defect | Smallest fix | UX note needed? |
|---|---|---|---|
| D1 | A persisted locale without a catalog left the picker on the first option (`en`) instead of pt-BR; the chosen locale flipped back while saving | `apps/frontend/components/ui/language-picker.jsx`: value falls back to pt-BR (then the first option); the user's choice is shown while it saves | Yes, behavior only (no markup change) |
| D2 | `panel.command.reload` is rendered by the commands page but missing from the three catalogs (the raw key would show on a conflict) | key added to `en.tsv`, `es.tsv`, `pt-BR.tsv` | Copy only: "Reload permissions" / "Recarregar permissões" / "Recargar permisos" |
| D3 | Reward settings/resolution dialogs: actions 9 px apart, notice text 13 px (the vanilla contract required 12 px and 14 px) | `apps/frontend/styles/panel.css`: `gap: 12px` on the actions and `font-size: 14px` on `.connection-notice`/`.hint`, scoped to `.reward-resolution-dialog` | Yes, visible CSS (spacing +3 px, text +1 px, inside the two dialogs only) |

All three are small and stayed inside the slice. They need the short `@ux-design-expert` note before the gate (AC-TS10-9).

## 3. Triage of `panel-localization-contract.test.js` (22 cases, AC-TS10-7)

| # | Vanilla case | Decision | Holder |
|---|---|---|---|
| 1 | runtime values kept out of static targets | removed: `index.html` markup | React renders values; no `data-i18n` exists |
| 2 | one locale editor in Settings | removed: `index.html` markup | `next-locale-picker.test.jsx`, `next-locale-fallback-contract.test.jsx` |
| 3 | credential setup before disabled connect | removed: `index.html` markup | `next-connection-page.test.jsx` "blocks authorization until credentials are saved" |
| 4 | empty-state guidance | ported | rewritten file, case 1 (catalogs + Next sources) |
| 5 | command policy stacked on mobile | ported to browser | `panel-layout-browser-only.mjs` (390 and 320 px) |
| 6 | commands grouped by access | ported | rewritten file, case 2 |
| 7 | keyboard focus ring | ported to browser | `panel-layout-browser-only.mjs` (2 px, 3:1 contrast) |
| 8 | native plural selection | ported | rewritten file, case 3 |
| 9 | every static phrase tagged | removed: scans `index.html` | case 12 plus `npm run validate:localization` |
| 10, 11, 12 | queue, widget, form, connection copy marked `data-i18n` | removed: `data-i18n` attributes | case 12 checks every `t()` key used by `apps/frontend`; selected keys kept in cases 4, 7 |
| 13 | catalog-owned queue/entry copy | ported (catalog part) | rewritten file, case 4 |
| 14 | reward without candidates | kept as is | case 5 |
| 15 | OBS widgets labels | kept (only the `data-page-target` line removed) | case 6 |
| 16 | widget selector `data-i18n` | removed | case 12 |
| 17 | remaining dashboard copy | ported (catalog part); the `index.html` id checks removed | case 7 |
| 18 | command IDs to descriptions | ported | case 8 |
| 19 | operations never expose `lastError` | ported to the Next operations files | case 9 |
| 20 | workflow confirmations | kept (the `index.html` `aria-live` line removed) | case 10 |
| 21 | form captured before `await` | ported to `new-queue-form.jsx` | case 11 |
| 22 | first-party key coverage | repointed to every `apps/frontend` source | case 12 (found D2) |

(Rows 10-12 group three cases.) Copy of the vanilla file: `.local/ts10/panel-localization-contract.vanilla.js` (not committed).

## 4. Mutations (AC-TS10-10)

Each mutation was applied to a copy-backed file, the test run, the file restored and `cmp` confirmed. Full log: `.local/ts10/mutations.txt`.

- Confirmation: `ask` runs the action at once (8 killed); skip the final step (2); `onClose` accepts (1).
- Health: ping `null` shown as `0 ms` (2); `retrying` outside the allow list (1); `retrying` marked non-functional (1).
- Safe error: raw message as key (2); secret not cleared (1); credential rejection branch removed (1).
- Locale: fallback to the first option (1); user choice ignored (1); persisted locale ignored (1).
- Localization contract: `event.currentTarget.reset()` (1); `lastError` in the operations model (1); catalog key removed (11).
- Dialog layout (browser): gap 11 px; hint 13 px; dialog 900 px wide; close control `type="submit"`.
- Layout (browser): stacking media rule removed (`2,2,2,2` at 390 px); focus ring 1 px; focus ring colour equal to the surface (contrast 1.01).
- Confirmation copy: `confirm(` in the dialog; "Archive" wording in a catalog; title-only list changed (1 each).

## 5. Limits for `@qa` and `@ux-design-expert`

- `axe-core` is not a project dependency and AC-TS10-8 forbids new ones: no automated axe scan ran. The browser checks use computed styles, geometry and contrast; assistive technology stays with OW-06.
- Browser checks ran against Chromium (`chrome` channel) with intercepted same-origin API fixtures on the Next dev server. They are not a real-stack run.
- New script `npm run test:e2e:panel-layout:browser-only` (16th browser-only script).

# FND-7 UX refinement — OBS widgets

[Português brasileiro](../../pt-BR/stories/FND-7/ux-refinement.md)

**Date:** 2026-10-06
**Owner:** `$aiox-ux-design-expert` (Uma)
**Mode:** YOLO desk research, using the user's standing instruction.
**Status:** UX planning complete; no product UI or usability validation is claimed.

## Research limits

This is a desk-research design brief based on the approved FND-7 requirements, the current panel structure/styles, FND-6's operator UX brief, and official OBS/Streamlabs/StreamElements guidance. No interviews, streamer observation, analytics, or usability test were available. Treat persona and visual choices as design hypotheses until a streamer tries them.

## User and live context

The primary user is the streamer configuring a local overlay between live activities. During a live, attention is split between the game, chat, OBS scenes, and this panel. The job is: select exactly one useful value, make it legible over variable gameplay, copy its URL once, and know how to revoke it if exposed. The highest-cost mistakes are choosing the wrong queue/viewer field, placing the wrong source in OBS, exposing more data than intended, and losing a one-time capability URL before copying it.

A secondary context is a moderator/operator helping maintain queues. Overlay capability URLs remain a streamer-controlled panel concern; chat roles do not grant access to widget management.

## Reference findings

| Reference | Observed pattern | FND-7 application |
| --- | --- | --- |
| OBS Browser Source | URL, viewport dimensions, transparent default CSS, optional unload/reload behavior, refresh control, and configurable Page Permissions. Default permission allows reading OBS status. | Keep dimensions visible in setup help; guide Page Permissions=None; explain that an unloaded hidden source reloads and fetches current state. The overlay itself must need no OBS API. |
| StreamElements Overlay Editor | Users add a widget, select it, edit configurable fields in a side panel, and use a preview; visual editing and code editing are separate. | Use a focused form with constrained controls and a live preview, not an arbitrary-code/CSS editor. |
| Streamlabs widget dashboard | A widget settings page exposes a copy action for its URL, then directs the user to add a Browser Source and set width/height. | Separate one-time URL issuance from ordinary edits; make the copy step explicit and provide concise OBS setup steps beside it. |
| OBS performance guidance | Many Browser Sources and oversized viewports can increase system load. | State that eight active pages is a tested product target, not a recommendation to add unlimited sources; advise the smallest useful viewport. |

Sources: [OBS Browser Source](https://obsproject.com/kb/browser-source), [OBS encoding performance guidance](https://obsproject.com/kb/encoding-performance-troubleshooting), [StreamElements Overlay Editor and widgets](https://docs.streamelements.com/overlays), [StreamElements custom-widget editor](https://docs.streamelements.com/overlays/first-custom-widget), [Streamlabs widget URL guide](https://support.streamlabs.com/hc/en-us/articles/41706358816667-How-to-Locate-and-Use-Streamlabs-Widget-URLs). Documentation reviewed 2026-10-06. FND-7 deliberately does not copy remote-code or cloud-hosted behavior from these services.

## Information architecture

Add **Widgets do OBS** as a dedicated item in the existing panel sidebar, after **Comandos do chat** and before **Configurações**. Keep setup/reconnection, queues, financial recovery, and command policies in their existing pages. The widget page is a management workspace and never a public page.

### Widget library page

- Page title: **Widgets do OBS**; lead explains that each widget displays one selected value in a local OBS Browser Source.
- Primary action: **Criar widget**.
- One card per widget, ordered most recently edited first. Each card shows the selected source and queue when applicable, a small safe text preview, dimension summary, and capability state: **Link ativo**, **Revogado**, or **Widget indisponível**. Do not show the secret URL in the card or in list/state responses.
- Row actions: **Editar**, **Copiar link** only when the URL is newly issued in the current one-time flow (otherwise guide to regenerate), **Regenerar link**, **Revogar**, **Excluir**. Require explicit confirmation for revoke/delete; explain which OBS source will stop displaying data.
- Empty state: explain the benefit in one sentence and show **Criar primeiro widget** plus **Como adicionar ao OBS**.
- Operational notice links to HTTPS/CA troubleshooting and clarifies that OBS and the bot must run on the same computer.

Widget identity: because duplicate source/style combinations are allowed and the requirements do not currently include a persisted widget name, identify cards by source label plus a stable short local ID. For identical source labels, show the ID prominently and include it in accessible names. Do not silently add a name field or schema behavior in UX; if the product owner wants human-assigned names, that is a separate requirement refinement.

### Create/edit flow

Use a single-column form with a persistent preview beside it on desktop and above the form on narrow screens. Keep sections short and progressive:

1. **O que exibir** — select one atomic source: account label; queue name/state/waiting count (then choose exactly one queue); called viewer/name or original waiting position; in-service viewer; fixed text. Clearly label queue selection as required only for queue-scoped fields. For called viewers, explain that multiple outstanding calls resolve to the oldest call; position means the persisted waiting position at the moment of call.
2. **Quando não houver valor** — fallback text, capped at 240 Unicode code points; preview shows fallback distinctly from a live value.
3. **Aparência** — constrained controls only: text color, optional background and opacity, font menu, size, weight, alignment, effect, dimensions, per-side margins, and overflow. Use native color/number/select inputs with inline limits; never show CSS/code fields.
4. **Prévia** — render the actual widget in a transparent/checkerboard canvas with a dark/light background toggle to evaluate contrast. Preview uses inert sample values and clearly labels simulation vs live data; never disclose another viewer's UID. Keyboard users can navigate every control and the preview has a concise accessible description.
5. Save action: **Salvar widget**. Editing source/style does not rotate its link. Show save success without exposing or re-issuing the secret.

Recommended default style (UX proposal): transparent background, white `#FFFFFF` text, `system-ui`, 32px, weight 700, centered, no outline/shadow, 640×100 viewport, 8px margin, wrap overflow. The preview should warn that white text can lose contrast on bright scenes and recommend enabling the bounded dark background at 80% opacity when needed. These are editable defaults, not imposed limits. If a measurement indicates this default is unreadable, keep the selected style and show a specific contrast/readability hint rather than silently changing it.

### One-time link and OBS handoff

After a successful create or regenerate, show a focused dialog titled **Link do widget — copie agora**. It contains the full local HTTPS URL once, a **Copiar link** button, and a clear statement that the secret cannot be shown again. Avoid auto-closing or navigating away before the streamer copies or acknowledges the warning. After dismissal, normal reads never restore the secret; the recovery action is **Regenerar link**, which invalidates the old URL.

Show a short numbered setup card:

1. In OBS, add **Fonte > Navegador (Browser Source)**.
2. Paste the copied HTTPS URL and set width/height to match the preview.
3. Set **Page Permissions** to **None**.
4. Keep certificate validation enabled. If OBS reports a certificate error, follow only the OS/OBS trust steps verified by this project; do not switch to HTTP or bypass the warning.
5. If **Shutdown source when not visible** is enabled, the page reloads when shown again and requests current widget state.

Include buttons to copy the URL and mark setup instructions as read; do not attempt to open OBS or configure it automatically.

## States and microcopy

| State | Overlay rendering | Panel wording/action |
| --- | --- | --- |
| Loading first projection | Neutral, non-sensitive loading state | “Carregando prévia…” |
| Successful value | Selected text only | “Prévia atualizada” |
| Empty successful field | Configured fallback | “Sem valor agora — mostrando o texto alternativo.” |
| Initial transient failure | Neutral unavailable state; no fabricated value | “Não foi possível carregar. Tentaremos novamente.” |
| Transient failure after a value | Last value with visible **Desatualizado** marker | “Conexão temporariamente indisponível. O valor pode estar desatualizado.” |
| Recovery | Latest value; remove stale marker | “Conexão restaurada.” |
| 401/403/404 | Clear displayed value immediately | “Este link não está ativo. Gere um novo link no painel.” Avoid indicating whether another widget exists. |
| Link revoked | No data | “Link revogado. A fonte do OBS não recebe mais dados.” |
| Save conflict/version mismatch | Keep current editor values and preview | “As configurações mudaram em outra tela. Atualize antes de salvar.” |
| CEF certificate trust failure | No insecure fallback | “O OBS não confiou no certificado HTTPS local. Consulte os passos verificados para esta versão.” |

Status never relies on color alone. Do not put technical stack traces, tokens, UID, or certificate secrets in messages. Polling and refresh announcements use a polite live region and never move keyboard focus.

## Visual direction and accessibility

Reuse FND-6's local dark surfaces, restrained purple primary/focus accent, system fonts, borders, and spacing. Keep the overlay preview visually separate from the editor so the streamer understands the preview is an example canvas, not part of the stream panel. Do not add external fonts, images, scripts, or telemetry.

WCAG AA is the target: visible focus, semantic heading order, explicit input labels/units, keyboard-operable source/style controls, status text plus icon/shape, adequate contrast in editor chrome, reduced-motion respect, and a readable error next to the field that needs correction. The overlay's user-selected output style may use intentionally low contrast; warn in preview but do not override it.

## Wireframe

```text
┌ Sidebar ─────────────┐  ┌ Widgets do OBS ───────────────────────────────────────────┐
│ Visão geral          │  │ Cada widget mostra um único dado em uma fonte Browser... │
│ Filas e atendimentos│  │                                      [Criar widget]        │
│ Nova fila            │  ├──────────────────────────────────────────────────────────┤
│ Operações financeiras│ │ Fila: Abismo · Pessoas aguardando        Link ativo       │
│ Comandos do chat     │  │ Prévia: 4 aguardando · 640 × 100                         │
│ Widgets do OBS   ←   │  │ [Editar] [Regenerar link] [Revogar] [Excluir]             │
│ Configurações        │  ├──────────────────────────────────────────────────────────┤
│ Conexão Twitch       │  │ Conta atual · ...                                         │
└──────────────────────┘  └──────────────────────────────────────────────────────────┘

Editor: [Fonte e fila] → [Fallback] → [Aparência] → [Prévia] → [Salvar widget]
After create/regenerate: [one-time secret URL + Copy] → [OBS setup steps]
```

## Decisions for implementation handoff

- Keep the source catalog atomic and all currently approved sources available.
- Use the deterministic called-entry rule in the spec; do not turn the overlay into a multi-person list.
- Keep list/read DTOs secret-free. The full URL appears only in the successful create/regenerate response flow.
- Show the existing HTTPS app URL; FND-7 does not add an HTTP mode or a second runtime service.
- Verify target OS/OBS/CEF before publishing certificate instructions or compatibility statements.
- No visual usability test has been run. Before calling FND-7 complete, ask at least one streamer who did not implement the code to create a widget, copy it, add it to OBS, recognize stale/revoked states, and revoke/regenerate the link; record observed issues without claiming success in advance.

## Implementation gate

This is a design handoff, not product implementation. It completes the UX planning deliverable for FND-7. UI implementation still follows the 24-task plan, test-first behavior increments, real PostgreSQL tests, native OBS HTTPS gates, and the documented accessibility checks.

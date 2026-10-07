# OPS-6 UX Research — Panel clarity and operational guidance

[Português brasileiro](../../pt-BR/stories/OPS-6/ux-research.md)

**Date:** 2026-10-07
**Research mode:** Heuristic review of the running local panel, source inspection, and the streamer's reported task. This is not a multi-participant usability study.

## Research question

Can a streamer quickly tell which product version is running, whether local dependencies are connected, and what action to take during first setup or empty states?

## Evidence collected

- Inspected the running panel in Chrome at `https://localhost:3000/`: overview, queues, new queue, financial operations, chat commands, OBS widgets, settings, and Twitch connection.
- Read-only `GET /health` returned `v0.6.0-b6ccd0f-alpha`, database `connected`, Twitch API `not_configured`, and no ping measurement.
- The visible header showed only “VERSÃO LOCAL”; the overview showed database “Verificando” and Twitch API “Conectando”.
- Source inspection found that `refresh()` sets runtime values and then calls `applyPanelCatalog()`. The translation pass replaces elements carrying `data-i18n`, including the runtime version and health values. This explains the discrepancy without implying an API or container version failure.
- The queue empty state says “Use o formulário acima” although the form is on a separate page. The overview action says “Pronto para a live?” / “Abrir filas” even when the Twitch channel is not connected and no queue exists.
- The locale picker appears both in the global header and Settings. In the command catalog and supporting copy, several labels/helper texts are rendered at 9–11 px in the inspected desktop view.
- The connection page presents a disabled “Conectar com a Twitch” action before the credential form below it, without a prominent explanation of the prerequisite.

## User and task model

The primary user is the streamer operating their own local installation during setup and live operation. They need trustworthy status at a glance, an obvious next step when setup is incomplete, and readable controls while managing queues. No viewer-facing or Twitch behavior change is required for this story.

## Findings and design decisions

1. **Trust comes first:** runtime version and dependency health must remain dynamic after translation and refresh. Use `product_version` from the existing API response; do not infer it from a hard-coded label.
2. **Keep one language control:** retain the editable product locale in Settings and remove the duplicate quick picker from the header. This gives the runtime identity room and leaves one clear source of preference changes.
3. **Make the next step state-dependent:** if no channel is connected, direct to Twitch connection; if connected and eligible with no queues, direct to creating a queue; if connected but ineligible with no queues, direct to channel details; otherwise direct to existing queue operations.
4. **Make empty states actionable and truthful:** queue and financial pages should explain what will appear and link to the relevant next action. Never refer to a form that is not on the page.
5. **Explain prerequisites beside disabled controls:** show why Twitch connection is unavailable and where to configure credentials.
6. **Improve legibility conservatively:** raise small operational labels and helper copy to readable sizes, retain the existing dark/purple visual identity, and check responsive behavior rather than introducing a new visual system.

## Limitations

- One streamer report and one local browser inspection are available. No interviews, surveys, analytics, or moderated usability sessions were performed.
- The original audit used a not-configured installation. A later authorized session provided a connected but ineligible channel for read-only status/UI verification; queue reward creation, redemption processing, chat commands, and writes were not exercised.
- Browser console contained an error from a Chrome extension URL; it was not attributed to the application.

## Follow-up verification context

On 2026-10-07, the streamer connected an authorized channel that is not Affiliate or Partner and explicitly offered it for safe panel testing. A read-only `/health` request returned database `connected`, Twitch `ineligible`, and a 197 ms probe. Chrome confirmed the localized ineligibility explanation and, after the fix, the current product identity, service labels, ping, and a “Review channel connection” next action. The connected/ineligible state was used only for read-only interface verification; no reward, redemption, chat, or OAuth write was performed. This test does not validate manual-only queue/chat behavior planned separately under FND-9.

## Handoff

The OPS-6 story turns these observed issues into testable acceptance criteria. Validation should include the real local panel after implementation and focused tests for state rendering and navigation. The change must not alter API contracts, queue policy, OAuth, or streamer-authored text.

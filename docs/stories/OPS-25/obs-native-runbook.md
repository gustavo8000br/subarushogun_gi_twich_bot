# Native OBS runbook for `@qa` (OPS-25 widget, D-8 live ping, D-6 live) — 2026-11-05

[Português (pt-BR)](../../pt-BR/stories/OPS-25/obs-native-runbook.md)

Scope: the OBS of THIS machine (Linux), as authorized by the owner. **No stream start and no real redemption** (that needs the owner's explicit "pode transmitir"). Never write a widget link in any document, log or screenshot: it is a capability link. Evidence classes stay separate (automated browser, native OBS/CEF, live Twitch); nothing is claimed for Windows or macOS. A defect found becomes its own bug story; no fix is mixed in.

## 0. Before anything

1. Confirm the checkout: `pwd`, `git rev-parse --show-toplevel`, `git branch --show-current`; record `git rev-parse --short HEAD` and the OBS and CEF versions (OBS: Help > About).
2. Start the product the project way (`npm run dev` or the Compose product); open the local panel at `https://localhost:3000`.
3. **Check the channel.** Panel > "Twitch connection": the connected channel must be the owner's **test channel**, not the production channel. If it is not, stop and ask the owner. Record the channel display name only in the run notes, not the token or any ID.

## 1. Get the new widget links

Panel > "OBS widgets". For the account widget use "Generate link" (or "Regenerate link" if one exists; the previous link stops working). The dialog "Copy this link to OBS" shows the link once: use "Copy now", then "Done, I copied the link". It cannot be viewed again; if lost, regenerate. Do the same for every widget currently used in the scenes.

## 2. Back up and edit the OBS scene collection (OBS CLOSED)

1. Close OBS completely (check there is no `obs` process left).
2. Find the collection directory: normally `~/.config/obs-studio/basic/scenes/`; for a Flatpak OBS it is `~/.var/app/com.obsproject.Studio/config/obs-studio/basic/scenes/`. The active collection name is in `../../global.ini` (`SceneCollection=`).
3. **Backup first:** copy the collection `.json` (and its `.json.bak` if present) to a dated name in the same directory, for example `<collection>.json.pre-0.3.0-beta-backup`. Compare with `cmp`.
4. Edit only the `settings.url` of each `"id": "browser_source"` entry whose old URL points at the panel overlay, replacing it with the new link from step 1. Change nothing else (no sizes, filters, other sources). A JSON-aware tool is safer than a text replace; validate the file parses (`node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" <file>`).
5. Reopen OBS, load the collection, and confirm the Browser Source shows (not black).
6. Rollback if anything looks wrong: close OBS and copy the backup over the collection file.

## 3. Widget validation (AC-W-1..5, with screenshots)

Take a screenshot per state (loading, authorized, stale/unavailable, unauthorized) over a transparent and a dark scene, plus one light scene, and check that the small status line is INSIDE the source box (UX risk 1: clipping when the source height equals the label height).

| AC | Do | Record |
|---|---|---|
| AC-W-1 | Select the Browser Source, press "Refresh" and then "Refresh cache of the current page". | The label returns, no black screen or authorization error; the seconds until it shows (proposed bound 5 s; `@qa` fixes it against the first load). |
| AC-W-2 | Repeat the refresh 10 times in a row. | 10 of 10 labels. |
| AC-W-3 | Let the panel session expire (or close the panel tab and wait for expiry) and restart the API (`npm run dev` restart or `docker compose restart` of the project service only); reload the source. | The same link still shows the label. |
| AC-W-4 | Change the current account **in the panel**; do not reload the source. | The label follows within the documented 1 s poll; record the observed delay. (The chat route `!fila conta` is AC-W-8, pending the owner's OK for a real chat message.) |
| AC-W-5 | Revoke the widget in the panel, reload the source, then generate a new link and update the source (repeat step 2). | The safe unauthorized state with no label and no internals; the new link works. |

Then record in the OPS-25 story (en and pt-BR): OBS and CEF versions, date, commit and the URL TYPE ("capability link"), never the link (AC-W-7). `@ux-design-expert` re-scores AC-W-6 from the screenshots in one short addendum.

## 4. Live `ping` (AC-D8-9, owner-gated)

Needs the owner: a real chat message on the test channel (no stream is needed, but it is the owner's call). With the owner present, a moderator or the streamer sends `!fila ping` (the root word follows the product language: `!queue ping` in English, `!cola ping` in Spanish).

- Expected: `Pong 🏓 - v0.3.0-beta - <n>ms.` after the bump (before it, the version has no commit segment, for example `v0.2.1-beta`). Compare `<n>` with `twitch_api_ping_ms` of `GET https://localhost:3000/health` called within 30 s (same shared measurement; they must be equal inside the cache window).
- Failure form to try (optional, with the owner): with the integration disconnected, the reply is `Pong 🏓 - <version> - sem medição da Twitch (TWITCH_NOT_CONNECTED).` (or the language form).
- Record the two numbers, the timestamp and that the channel was the test channel.

## 5. Live D-6 (diagnosis, owner-gated)

Needs the owner's "pode transmitir". Without it, D-6 stays "diagnosable; root cause pending live evidence". When the owner allows it, start the stream and watch the API log JSON for lines with `event: "twitch_integration_degraded"` (and the older `twitch_reconciliation_degraded`) while `/health` shows `twitch_integration: degraded`. The line names `details.reason` (`eventsub_disconnected`, `eventsub_startup_disconnected`, `subscription_revoked` with `type` and `revokeStatus`). Record the reason and the order of the lines; never paste chat text, tokens or IDs. A silent `degraded` (status without any of those lines) is itself a finding to report.

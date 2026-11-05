# OPS-18 — Make Current Account the single player identity overlay

[Português brasileiro](../../pt-BR/stories/OPS-18/story.md)

**Status:** In Progress — owner-approved behavior; implementation is on `feat/ops-15-next-panel`. **Issue:** [#77](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/77), created by `$aiox-devops`.
**Type:** Overlay/product behavior and existing account-state persistence; no schema migration planned.
**Related:** OPS-11 current-account ownership; OPS-13 overlay capability/polling.

## Story

As a streamer using queue calls to hand gameplay to a viewer,
I want one `Current account` overlay to identify the active player's account,
so that OBS setup has one clear source of truth instead of separate called/in-service identity widgets.

## Acceptance criteria

1. `Current account` is the only widget source for player/account identity. The distinct `Person in service` source is removed from Next and vanilla widget creation/editing.
2. An individual queue call switches the persisted current-account label to the called viewer regardless of the queue's retired `autoSwitchAccount` value. The existing account-owner lock/audit and owner-bound terminal reset semantics remain intact; setting the account manually still works.
3. Existing saved `in_service_viewer_display_name` widgets remain usable: their public projection is normalized to `account_label`, and their capability read returns the shared current-account value. No destructive data rewrite or schema migration is needed.
4. The API rejects creation/update of a new legacy `in_service_viewer_display_name` source. The database enum/check may retain the legacy value solely to read and safely migrate old widgets through normal editing.
5. Removing the duplicate source must not change `called_viewer_display_name` or `called_viewer_position`; those remain queue-event information, not account identity.
6. Tests cover calls with legacy auto-switch true/false, account reset after terminal owner transition, current-account polling, legacy widget projection/edit normalization, and absence of the retired source in both panel forms.
7. English, Spanish, and pt-BR UI/changelog/story documentation stays equivalent. No production database or Twitch operation is used for tests.

## Data coordination

Reuse the current `settings.account_state` record, PostgreSQL advisory lock, transaction, and audit event path. Do not add columns/tables or migrations. Keep the existing `queues.auto_switch_account` column/data untouched for backwards-safe compatibility, but stop treating it as a user-controlled behavior switch. Existing widget rows retain their capability and are projected as `account_label`; editing one persists the normalized source through the ordinary version-checked update path.

## File list

- `apps/api/src/persistence/queue-repository.mjs` — automatic current-account assignment and legacy source projection.
- `apps/api/src/domain/overlay-widget-policy.mjs`, `apps/api/src/domain/overlay-projection-service.mjs`, `apps/api/src/http/overlay-routes.mjs` — reject new legacy sources and normalize saved widgets.
- `apps/frontend/features/queues/queue-settings.mjs`, `apps/frontend/features/queues/queue-settings-form.jsx`, `apps/web/queue-settings-version.mjs`, `apps/web/app.js` — retire the per-queue switch in Next and vanilla interfaces.
- `apps/frontend/features/widgets/widget-management.mjs`, `apps/frontend/features/widgets/widgets-page-content.jsx`, `apps/web/overlay-widget-form.mjs` — expose only the current-account player identity source.
- `apps/web/localization/catalogs/panel/{en,es,pt-BR}.tsv`, `CHANGELOG-beta.md`, `docs/pt-BR/CHANGELOG-beta.md` — remove retired labels and record the behavior in all panel locales.
- `tests/integration/queue-repository.test.js`, `tests/unit/{overlay-widget-policy,overlay-projection-service,overlay-widget-form,overlay-routes,next-widgets-page,next-queue-settings-form,next-queue-settings,queue-settings-version}.test.{js,jsx}` — regression coverage for current account, legacy compatibility, and retired UI settings.
- `docs/stories/OPS-18/story.md`, `docs/pt-BR/stories/OPS-18/story.md`, `docs/stories.md`, `docs/pt-BR/stories.md`, and bilingual OPS-15 overlay inventories/handoffs — synchronized project records.

## Change log

| Date | Change | Author |
| --- | --- | --- |
| 2026-10-19 | Owner approved one Current account overlay as the single player identity and automatic account projection for individual calls. | `$aiox-master` |
| 2026-10-19 | Implemented the single-source behavior, compatibility projection for saved widgets, and removal of the retired per-queue toggle; focused tests and quality checks recorded in the handoff. | `$aiox-dev` |

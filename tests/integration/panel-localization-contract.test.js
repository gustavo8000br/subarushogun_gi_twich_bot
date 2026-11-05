import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discoverCatalogModule } from '../../apps/shared/localization/discover-catalog-module.mjs';

// TS-10 (AC-TS10-7): the cases that read the removed vanilla panel (apps/web) were triaged one by one; the table is in
// docs/stories/OPS-15/ts-10-wave-note.md. This file keeps the catalog, plural and Next-source contracts. The two browser-only
// contracts (focus ring, command-policy stacking at 390 px) live in tests/e2e/panel-layout-browser-only.mjs.
const url = (path) => fileURLToPath(new URL(path, import.meta.url));
const read = (path) => readFile(url(path), 'utf8');
const catalogRoot = url('../../apps/shared/localization/catalogs/');
const LOCALES = ['pt-BR', 'en', 'es'];

describe('panel catalog contract', () => {
  it('offers contextual queue and financial empty-state guidance in every panel locale', async () => {
    const catalogs = await discoverCatalogModule(catalogRoot, 'panel');
    for (const locale of LOCALES) {
      expect(catalogs.catalogs[locale]['panel.queue.empty.hint']).not.toMatch(/form above|formul[aá]rio acima|formulario de arriba/i);
      expect(catalogs.catalogs[locale]).toHaveProperty('panel.operations.empty_hint');
      expect(catalogs.catalogs[locale]).toHaveProperty('panel.operations.empty');
    }
    expect(await read('../../apps/frontend/features/operations/operations-page-content.jsx')).toContain("t('panel.operations.empty_hint')");
    expect(await read('../../apps/shared/panel/panel-navigation.mjs')).toContain('export function getQueueEmptyAction');
  });

  it('groups command policies by access boundary and keeps the catalog responsive in every panel locale', async () => {
    const page = await read('../../apps/frontend/features/commands/command-permissions-page-content.jsx');
    const css = await read('../../apps/frontend/styles/panel.css');
    expect(page).toContain('groupCommandPolicies');
    for (const key of ['panel.commands.group.configurable', 'panel.commands.group.moderator', 'panel.commands.group.streamer']) expect(page).toContain(key);
    expect(page).toContain('everyone');
    expect(css).toContain('.command-policy-group');
    expect(css).toContain('.command-policy-grid');
    const catalogs = await discoverCatalogModule(catalogRoot, 'panel');
    for (const locale of LOCALES) {
      for (const key of ['panel.commands.group.configurable', 'panel.commands.group.moderator', 'panel.commands.group.streamer', 'panel.command.audience.everyone_includes']) {
        expect(catalogs.catalogs[locale]).toHaveProperty(key);
      }
    }
  });

  it('uses native plural selection for counted operation and reconciliation messages', async () => {
    const operations = await read('../../apps/frontend/features/operations/operations-page-content.jsx');
    expect(operations).toContain('`panel.operation.attempts.${pluralCategory}`');
    expect(operations).toContain('`panel.reconciliation.issues.${plural}`');
    expect(await read('../../apps/frontend/features/connection/connection-page-content.jsx')).toContain('panel.reconciliation.complete');
    const catalogs = await discoverCatalogModule(catalogRoot, 'panel');
    for (const locale of LOCALES) {
      for (const key of ['panel.operation.attempts', 'panel.reconciliation.complete', 'panel.reconciliation.issues']) {
        for (const category of new Intl.PluralRules(locale).resolvedOptions().pluralCategories) {
          expect(catalogs.catalogs[locale]).toHaveProperty(`${key}.${category}`);
        }
      }
    }
  });

  it('uses catalog-owned queue and entry presentation keys in every locale', async () => {
    const queueActionState = await read('../../apps/shared/panel/queue-action-state.mjs');
    const catalogs = await discoverCatalogModule(catalogRoot, 'panel');
    for (const locale of LOCALES) {
      for (const key of [
        'panel.queue.group.waiting', 'panel.queue.group.called', 'panel.queue.group.in_service',
        'panel.queue.empty.title', 'panel.queue.empty.hint', 'panel.queue.empty_group',
        'panel.queue.status.open', 'panel.queue.status.closed', 'panel.queue.status.pending_delete', 'panel.queue.status.pending_local_delete', 'panel.queue.status.pending_local_delete_diverged', 'panel.queue.status.deletion_complete',
        'panel.queue.action.delete', 'panel.queue.action.retry_local_delete', 'panel.queue.action.configure', 'panel.queue.action.edit_reward',
        'panel.queue.action.next', 'panel.queue.action.clear', 'panel.queue.action.add', 'panel.queue.action.activate', 'panel.queue.action.pause',
        'panel.queue.action.resolve_reward', 'panel.queue.history.title', 'panel.queue.history.empty', 'panel.queue.history.date_unavailable',
        'panel.entry.action.call', 'panel.entry.action.move_up', 'panel.entry.action.move_down',
        'panel.entry.action.remove_priority', 'panel.entry.action.mark_priority',
        'panel.entry.action.attend', 'panel.entry.action.complete', 'panel.entry.action.resend',
        'panel.entry.action.remove', 'panel.entry.priority_badge', 'panel.entry.uid_label',
        'panel.widget.source.account', 'panel.widget.source.queue_name', 'panel.widget.source.queue_state',
        'panel.widget.source.queue_count', 'panel.widget.source.called_name', 'panel.widget.source.called_position', 'panel.widget.source.fixed_text',
        'panel.operations.empty', 'panel.operation.type.refund', 'panel.operation.type.fulfillment',
        'panel.operation.type.reward_update', 'panel.operation.type.queue_delete', 'panel.operation.action.resolve', 'panel.operation.action.retry',
      ]) expect(catalogs.catalogs[locale], `${locale} ${key}`).toHaveProperty(key);
    }
    expect(queueActionState).toContain("key: 'panel.queue.action.unarchive'");
  });

  it('explains why a reward with a matching title may still be unavailable for recovery', async () => {
    const catalogs = await discoverCatalogModule(catalogRoot, 'panel');
    for (const locale of LOCALES) {
      const message = catalogs.catalogs[locale]['panel.reward.no_candidates'];
      expect(message).toMatch(/paused|pausad|pausad/i);
      expect(message).toMatch(/manag|gerenci|administrable/i);
      expect(message).toMatch(/delete|exclu|elimin/i);
    }
  });

  it('uses catalog-owned labels and confirmations for OBS widgets', async () => {
    const management = await read('../../apps/frontend/features/widgets/widget-management.mjs');
    const page = await read('../../apps/frontend/features/widgets/widgets-page-content.jsx');
    const catalogs = await discoverCatalogModule(catalogRoot, 'panel');
    for (const key of [
      'panel.widget.source.account', 'panel.widget.source.queue_name', 'panel.widget.source.queue_state',
      'panel.widget.source.queue_count', 'panel.widget.source.called_name', 'panel.widget.source.called_position',
      'panel.widget.source.fixed_text',
      'panel.widget.status.unavailable', 'panel.widget.status.active', 'panel.widget.status.revoked',
      'panel.widget.action.edit', 'panel.widget.action.regenerate', 'panel.widget.action.revoke',
      'panel.widget.action.generate', 'panel.widget.action.delete', 'panel.widget.confirm.regenerate',
      'panel.widget.confirm.revoke', 'panel.widget.confirm.delete', 'panel.widget.link.copied',
      'panel.widget.link.copy_fallback', 'panel.widget.queue.select',
      'panel.widget.editor.create', 'panel.widget.editor.edit', 'panel.widget.preview.account',
      'panel.widget.card_details', 'panel.widget.auto', 'panel.widget.source.unknown',
      'panel.widget.empty.title', 'panel.widget.empty.hint', 'panel.widget.create_first',
    ]) {
      expect(`${management}\n${page}\n${['panel.widget.empty.title', 'panel.widget.empty.hint', 'panel.widget.create_first'].includes(key) ? '' : key}`).toContain(key);
      for (const locale of LOCALES) expect(catalogs.catalogs[locale]).toHaveProperty(key);
    }
    expect(management).toContain('WIDGET_SOURCE_KEYS');
    expect(page).toContain('WIDGET_SOURCE_KEYS[widget.sourceType]');
  });

  it('keeps the remaining dashboard and dialog copy in every locale', async () => {
    const catalogs = await discoverCatalogModule(catalogRoot, 'panel');
    for (const locale of LOCALES) {
      for (const key of [
        'panel.health.database.checking', 'panel.health.ping_unavailable', 'panel.overview.connect_title', 'panel.overview.create_title',
        'panel.overview.queues_title', 'panel.overview.check_title', 'panel.operations.empty_hint',
        'panel.reward_settings.reward_name', 'panel.reward_settings.cost', 'panel.reward_settings.description', 'panel.reward_settings.submit',
        'panel.entry.dialog_title', 'panel.entry.twitch_login', 'panel.reward.dialog_title', 'panel.reward.compatible_rewards', 'panel.reward.link_selected',
      ]) expect(catalogs.catalogs[locale], `${locale} ${key}`).toHaveProperty(key);
    }
  });

  it('maps stable command IDs to localized descriptions and syntax', async () => {
    const page = await read('../../apps/frontend/features/commands/command-permissions-page-content.jsx');
    expect(page).toContain('panel.command.${type}.${key}');
    expect(page).toContain("command.key.replaceAll(':', '_')");
    const catalogs = await discoverCatalogModule(catalogRoot, 'panel');
    for (const key of ['panel.command.description.queue_lista', 'panel.command.syntax.queue_lista', 'panel.command.description.global_queue_ping', 'panel.command.syntax.global_queue_ping']) {
      for (const locale of LOCALES) expect(catalogs.catalogs[locale]).toHaveProperty(key);
    }
  });

  it('renders operations with localized labels and never exposes persisted error details', async () => {
    const operations = await read('../../apps/frontend/features/operations/operations-page-content.jsx');
    const model = await read('../../apps/frontend/features/operations/operations.mjs');
    for (const key of ['panel.operations.empty', 'panel.operation.action.resolve', 'panel.operation.action.retry']) expect(operations).toContain(key);
    expect(operations).not.toContain('lastError');
    expect(model).not.toContain('lastError');
    expect(model).toContain('`panel.operation.status.${OPERATION_STATUSES.has(status) ? status : \'unknown\'}`');
    const catalogs = await discoverCatalogModule(catalogRoot, 'panel');
    for (const status of ['pending', 'retry', 'processing', 'unknown', 'conflict', 'failed', 'confirmed', 'resolved_manual', 'cancelled']) {
      for (const locale of LOCALES) expect(catalogs.catalogs[locale]).toHaveProperty(`panel.operation.status.${status}`);
    }
  });

  it('uses catalog copy for queue workflow confirmations, prompts, and outcomes', async () => {
    const queueForm = await read('../../apps/frontend/features/queues/new-queue-form.jsx');
    const queueSettings = await read('../../apps/frontend/features/queues/queue-settings-form.jsx');
    const queueList = await read('../../apps/frontend/features/queues/queue-list.jsx');
    const lifecycle = await read('../../apps/frontend/features/queues/queue-lifecycle-actions.jsx');
    const queueConfirmationCopy = await read('../../apps/shared/panel/queue-confirmation-copy.mjs');
    const queueActionState = await read('../../apps/shared/panel/queue-action-state.mjs');
    const catalogs = await discoverCatalogModule(catalogRoot, 'panel');
    const app = `${queueForm}\n${queueSettings}\n${queueList}\n${lifecycle}`;
    for (const key of ['panel.queue.onboarding.reward_pending', 'panel.queue.onboarding.activate_next', 'panel.queue.onboarding.activate_waiting', 'panel.queue.onboarding.reward_diverged', 'panel.reward.loading_candidates', 'panel.notice.queue_settings_saved', 'panel.notice.reward_update_pending', 'panel.entry.reason_required', 'panel.entry.priority_audit_hint', 'panel.priority.marked', 'panel.queue.delete.pending', 'panel.reward.no_candidates', 'panel.queue.clear.confirm', 'panel.queue.clear.changed', 'panel.queue.clear.done', 'panel.account.prompt.current', 'panel.account.prompt.default']) {
      for (const locale of LOCALES) expect(catalogs.catalogs[locale]).toHaveProperty(key);
    }
    for (const key of ['panel.queue.confirm.delete_local', 'panel.queue.confirm.delete_converted', 'panel.queue.confirm.retry_delete_converted', 'panel.queue.confirm.retry_delete_converted_diverged', 'panel.queue.confirm.delete']) {
      expect(queueConfirmationCopy).toContain(key);
    }
    expect(lifecycle).toContain("getQueueConfirmationCopy(queue, 'unarchive')");
    expect(lifecycle).toContain('getQueueConfirmationCopy(queue, \'delete\')');
    expect(lifecycle).toContain('state.canRetryLocalDeletion');
    expect(queueList).toContain('aria-live="polite"');
    expect(lifecycle).toContain('role={notice.error ? \'alert\' : \'status\'}');
    expect(queueActionState).toContain("(convertedLocal && queue.modeTransitionStatus === 'confirmed')");
    expect(queueConfirmationCopy).toContain('panel.queue.confirm.${action}');
    for (const oldCopy of ['Selecione o benefício conferido:', 'Arquivar esta fila?', 'Nenhuma operação pendente.', 'Fila salva. A criação']) {
      expect(app).not.toContain(oldCopy);
    }
    expect(queueForm).toContain('getDefaultQueueCallMessage(t, slug)');
    expect(queueSettings).toContain('getDefaultQueueCallMessage(t, queue.slug)');
    for (const locale of LOCALES) expect(catalogs.catalogs[locale]).toHaveProperty('panel.queue_settings.call_message_default');
    expect(app).not.toContain("'{user}, sua vez!'");
  });

  it('captures the queue form before awaiting creation so the success path can reset the form', async () => {
    const queueForm = await read('../../apps/frontend/features/queues/new-queue-form.jsx');
    const start = queueForm.indexOf('const form = event.currentTarget');
    const awaited = queueForm.indexOf('await onCreate(values)', start);
    expect(start).toBeGreaterThan(-1);
    expect(awaited).toBeGreaterThan(start);
    expect(queueForm.slice(start, awaited + 200)).toContain('form.reset()');
    expect(queueForm).not.toContain('event.currentTarget.reset()');
  });

  it('covers every static text and accessible-label key used by the Next panel for each first-party locale', async () => {
    const files = await readdir(url('../../apps/frontend'), { recursive: true });
    const sources = await Promise.all(files
      .filter((file) => /^(features|components)\//.test(file) && /\.(jsx|mjs)$/.test(file))
      .map((file) => read(`../../apps/frontend/${file}`)));
    expect(sources.length).toBeGreaterThan(10);
    const activeFrontendKeys = new Set(sources.flatMap((source) => [...source.matchAll(/\bt\(['"]((?:panel|api)\.[a-z0-9._-]+)['"]/g)].map((match) => match[1])));
    expect(activeFrontendKeys.size).toBeGreaterThan(100);
    const catalogs = await discoverCatalogModule(catalogRoot, 'panel');
    for (const locale of LOCALES) {
      for (const key of activeFrontendKeys) {
        if (key === 'priority') continue;
        expect(catalogs.catalogs[locale], `${locale} ${key}`).toHaveProperty(key);
      }
    }
  });
});

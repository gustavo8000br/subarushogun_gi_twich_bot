import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discoverCatalogModule } from '../../apps/shared/localization/discover-catalog-module.mjs';

describe('panel catalog contract', () => {
  it('keeps API-driven runtime values out of static localization targets', async () => {
    const html = await readFile(fileURLToPath(new URL('../../apps/web/index.html', import.meta.url)), 'utf8');
    for (const id of ['runtime-version', 'database-health', 'twitch-api-health']) {
      const element = html.match(new RegExp(`<[^>]*\\bid="${id}"[^>]*>`))?.[0];
      expect(element, `Expected #${id} to exist in the static panel`).toBeTruthy();
      expect(element, `#${id} is populated by an API response and must not be reset by data-i18n`).not.toMatch(/\\bdata-i18n=/);
    }
  });

  it('keeps one locale editor in Settings and removes the duplicate header picker', async () => {
    const html = await readFile(fileURLToPath(new URL('../../apps/web/index.html', import.meta.url)), 'utf8');
    expect(html).toContain('id="product-locale-form"');
    expect(html).toContain('id="product-locale"');
    expect(html).not.toContain('id="product-locale-quick-form"');
    expect(html).not.toContain('id="product-locale-quick"');
  });

  it('places credential setup before the disabled Twitch connection action', async () => {
    const html = await readFile(fileURLToPath(new URL('../../apps/web/index.html', import.meta.url)), 'utf8');
    expect(html.indexOf('class="panel credentials-panel"')).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('id="credentials-form"')).toBeLessThan(html.indexOf('id="connection-wizard"'));
    expect(html).toContain('panel.connection.credentials_required');
  });

  it('offers contextual queue and financial empty-state guidance in every panel locale', async () => {
    const catalogRoot = fileURLToPath(new URL('../../apps/web/localization/catalogs/', import.meta.url));
    const catalogs = await discoverCatalogModule(catalogRoot, 'panel');
    for (const locale of ['pt-BR', 'en', 'es']) {
      expect(catalogs.catalogs[locale]['panel.queue.empty.hint']).not.toMatch(/form above|formul[aá]rio acima|formulario de arriba/i);
      expect(catalogs.catalogs[locale]).toHaveProperty('panel.operations.empty_hint');
      expect(catalogs.catalogs[locale]).toHaveProperty('panel.operations.empty');
    }
    const app = await readFile(fileURLToPath(new URL('../../apps/web/app.js', import.meta.url)), 'utf8');
    expect(app).toContain("panelText('panel.operations.empty_hint')");
    expect(app).toContain('getQueueEmptyAction');
  });

  it('stacks command policy content at narrow mobile widths', async () => {
    const css = await readFile(fileURLToPath(new URL('../../apps/web/styles.css', import.meta.url)), 'utf8');
    expect(css).toContain('@media(max-width:680px){.command-policy-card{grid-template-columns:minmax(0,1fr)}}');
  });

  it('keeps a visible keyboard focus ring on panel navigation controls', async () => {
    const css = await readFile(fileURLToPath(new URL('../../apps/web/styles.css', import.meta.url)), 'utf8');
    expect(css).toContain('.panel-navigation button:focus-visible{background:#1b1d25;color:#eee;outline:2px solid #b69aff;outline-offset:2px}');
  });

  it('uses native plural selection for counted operation and reconciliation messages', async () => {
    const app = await readFile(fileURLToPath(new URL('../../apps/web/app.js', import.meta.url)), 'utf8');
    expect(app).toContain('translatePluralCatalog');
    expect(app).toContain("panelTextPlural('panel.operation.attempts'");
    expect(app).toContain("panelTextPlural('panel.reconciliation.complete'");
    expect(app).toContain("panelTextPlural('panel.reconciliation.issues'");
    const catalogRoot = fileURLToPath(new URL('../../apps/web/localization/catalogs/', import.meta.url));
    const catalogs = await discoverCatalogModule(catalogRoot, 'panel');
    for (const locale of ['pt-BR', 'en', 'es']) {
      for (const key of ['panel.operation.attempts', 'panel.reconciliation.complete', 'panel.reconciliation.issues']) {
        for (const category of new Intl.PluralRules(locale).resolvedOptions().pluralCategories) {
          expect(catalogs.catalogs[locale]).toHaveProperty(`${key}.${category}`);
        }
      }
    }
  });
  it('tags every static panel phrase for translation except brand and callback URL', async () => {
    const html = await readFile(fileURLToPath(new URL('../../apps/web/index.html', import.meta.url)), 'utf8');
    const stack = [];
    const unlocalized = [];
    const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
    for (const match of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>|[^<]+/gi)) {
      const token = match[0];
      if (token.startsWith('<!--') || token.startsWith('<!')) continue;
      if (token.startsWith('</')) {
        const tag = token.match(/^<\/([a-z0-9-]+)/i)?.[1]?.toLowerCase();
        const index = stack.map((element) => element.tag).lastIndexOf(tag);
        if (index >= 0) stack.length = index;
        continue;
      }
      if (token.startsWith('<')) {
        const tag = token.match(/^<([a-z0-9-]+)/i)?.[1]?.toLowerCase();
        const attrs = Object.fromEntries([...token.matchAll(/([a-z0-9-]+)\s*=\s*(["'])(.*?)\2/gi)].map((attribute) => [attribute[1].toLowerCase(), attribute[3]]));
        if (!tag) continue;
        stack.push({ tag, localized: Boolean(attrs['data-i18n']) || stack.some((element) => element.localized), brand: attrs.class?.split(/\s+/).includes('brand') || stack.some((element) => element.brand), allowCallback: attrs.id === 'callback-url' || stack.some((element) => element.allowCallback) });
        if (voidTags.has(tag) || token.endsWith('/>')) stack.pop();
        continue;
      }
      if (!/[\p{L}]/u.test(token) || stack.length === 0) continue;
      const current = stack.at(-1);
      if (!current.localized && !current.brand && !current.allowCallback) unlocalized.push(token.trim());
    }
    expect(unlocalized).toEqual([]);
  });

  it('marks queue, widget, and manual-entry action copy for localization', async () => {
    const html = await readFile(fileURLToPath(new URL('../../apps/web/index.html', import.meta.url)), 'utf8');
    for (const key of [
      'panel.form.queue_name',
      'panel.form.create_queue',
      'panel.widget.appearance',
      'panel.widget.save',
      'panel.entry.add',
    ]) expect(html).toMatch(new RegExp(`data-i18n(?:-placeholder)?="${key}"`));
  });

  it('marks queue management and reward form instructions for localization', async () => {
    const html = await readFile(fileURLToPath(new URL('../../apps/web/index.html', import.meta.url)), 'utf8');
    for (const key of [
      'panel.form.command', 'panel.form.aliases', 'panel.form.cost', 'panel.form.max_per_stream',
      'panel.form.max_per_viewer', 'panel.form.cooldown', 'panel.form.twitch_limits_hint',
      'panel.form.reward_description', 'panel.form.reward_prompt_placeholder', 'panel.form.uid_mode',
      'panel.form.uid_hidden', 'panel.form.uid_visible', 'panel.form.call_timeout',
      'panel.queue_settings.title', 'panel.queue_settings.call_deadline', 'panel.queue_settings.call_message',
      'panel.queue_settings.call_placeholders', 'panel.queue_settings.show_uid_list',
      'panel.queue_settings.show_uid_overlay', 'panel.queue_settings.show_uid_call',
      'panel.queue_settings.auto_switch_account', 'panel.queue_settings.refund_removed',
      'panel.queue_settings.refund_no_show', 'panel.queue_settings.refund_viewer_leave',
      'panel.reward_settings.title', 'panel.reward_settings.twitch_limits_hint',
      'panel.entry.priority_audit_hint', 'panel.entry.reason_external', 'panel.entry.reason_bits',
      'panel.entry.reason_sub', 'panel.entry.reason_other', 'panel.reward.manual_association_hint',
    ]) expect(html).toMatch(new RegExp(`data-i18n(?:-placeholder)?="${key}"`));
  });

  it('marks connection, settings, command, and widget screens for localization', async () => {
    const html = await readFile(fileURLToPath(new URL('../../apps/web/index.html', import.meta.url)), 'utf8');
    const app = await readFile(fileURLToPath(new URL('../../apps/web/app.js', import.meta.url)), 'utf8');
    const panelSource = `${html}\n${app}`;
    for (const key of [
      'panel.commands.policy_title', 'panel.commands.policy_help', 'panel.commands.save',
      'panel.widgets.list_eyebrow', 'panel.widgets.list_title', 'panel.widgets.create',
      'panel.widgets.link_help', 'panel.widgets.empty',
      'panel.settings.account_eyebrow', 'panel.settings.edit_account', 'panel.settings.account_help',
      'panel.settings.default_account', 'panel.settings.edit_default',
      'panel.connection.setup_eyebrow', 'panel.connection.connect_channel', 'panel.connection.confidential_app_help',
      'panel.connection.open_console', 'panel.connection.connect', 'panel.connection.authorized_eyebrow',
      'panel.connection.connected_fallback', 'panel.connection.connected', 'panel.connection.reconnect',
      'panel.connection.reconcile', 'panel.credentials.eyebrow', 'panel.credentials.title',
      'panel.credentials.client_id', 'panel.credentials.client_secret', 'panel.credentials.client_id_placeholder',
      'panel.credentials.secret_configured', 'panel.credentials.secret_empty', 'panel.credentials.validate_save',
      'panel.widget.editor_eyebrow', 'panel.widget.source_label', 'panel.widget.queue_label',
      'panel.widget.fallback_label', 'panel.widget.link_lifetime_help', 'panel.widget.copy_link',
      'panel.widget.obs_help', 'panel.widget.close',
    ]) expect(panelSource).toContain(key);
  });

  it('uses catalog-owned copy for queue and entry presentation', async () => {
    const app = await readFile(fileURLToPath(new URL('../../apps/web/app.js', import.meta.url)), 'utf8');
    for (const key of [
      'panel.queue.group.waiting', 'panel.queue.group.called', 'panel.queue.group.in_service',
      'panel.queue.empty.title', 'panel.queue.empty.hint', 'panel.queue.empty_group',
      'panel.queue.status.open', 'panel.queue.status.closed', 'panel.queue.status.pending_delete',
      'panel.queue.action.delete', 'panel.queue.action.configure', 'panel.queue.action.edit_reward',
      'panel.queue.action.unarchive', 'panel.queue.action.next', 'panel.queue.action.clear',
      'panel.queue.action.add', 'panel.queue.action.open', 'panel.queue.action.close',
      'panel.queue.action.archive', 'panel.queue.action.resolve_reward', 'panel.queue.history.title',
      'panel.queue.history.empty', 'panel.queue.history.date_unavailable',
      'panel.entry.action.call', 'panel.entry.action.move_up', 'panel.entry.action.move_down',
      'panel.entry.action.remove_priority', 'panel.entry.action.mark_priority',
      'panel.entry.action.attend', 'panel.entry.action.complete', 'panel.entry.action.resend',
      'panel.entry.action.remove', 'panel.entry.priority_badge', 'panel.entry.uid_label',
    ]) expect(app).toContain(key);
  });

  it('uses catalog-owned labels and confirmations for OBS widgets', async () => {
    const app = await readFile(fileURLToPath(new URL('../../apps/web/app.js', import.meta.url)), 'utf8');
    for (const key of [
      'panel.widget.source.account', 'panel.widget.source.queue_name', 'panel.widget.source.queue_state',
      'panel.widget.source.queue_count', 'panel.widget.source.called_name', 'panel.widget.source.called_position',
      'panel.widget.source.service_name', 'panel.widget.source.fixed_text', 'panel.widget.source.unknown',
      'panel.widget.status.unavailable', 'panel.widget.status.active', 'panel.widget.status.revoked',
      'panel.widget.empty.title', 'panel.widget.empty.hint', 'panel.widget.create_first',
      'panel.widget.action.edit', 'panel.widget.action.regenerate', 'panel.widget.action.revoke',
      'panel.widget.action.generate', 'panel.widget.action.delete', 'panel.widget.confirm.regenerate',
      'panel.widget.confirm.revoke', 'panel.widget.confirm.delete', 'panel.widget.link.copied_once',
      'panel.widget.link.copied', 'panel.widget.link.copy_fallback', 'panel.widget.queue.select',
      'panel.widget.editor.create', 'panel.widget.editor.edit',
      'panel.widget.preview.account', 'panel.widget.card_details', 'panel.widget.auto',
    ]) expect(app).toContain(key);
    expect(app).not.toContain("'Asia 1'");
    expect(app).toContain("panel.widget.preview.account");
  });

  it('marks widget selector choices and field labels for locale changes', async () => {
    const html = await readFile(fileURLToPath(new URL('../../apps/web/index.html', import.meta.url)), 'utf8');
    for (const key of [
      'panel.widget.source.account', 'panel.widget.source.queue_name', 'panel.widget.source.queue_state',
      'panel.widget.source.queue_count', 'panel.widget.source.called_name', 'panel.widget.source.called_position',
      'panel.widget.source.service_name', 'panel.widget.source.fixed_text', 'panel.widget.queue_label',
      'panel.widget.fixed_text_label', 'panel.widget.fallback_label', 'panel.widget.text_color',
      'panel.widget.background_color', 'panel.widget.background_opacity', 'panel.widget.font',
      'panel.widget.alignment', 'panel.widget.effect', 'panel.widget.overflow',
    ]) expect(html).toContain(`data-i18n="${key}"`);
  });

  it('marks remaining dashboard and dialog copy for localization', async () => {
    const html = await readFile(fileURLToPath(new URL('../../apps/web/index.html', import.meta.url)), 'utf8');
    for (const key of [
      'panel.overview.headline', 'panel.overview.lead', 'panel.connection.starting', 'panel.queue.loading',
      'panel.footer.brand', 'panel.queue_settings.local_eyebrow', 'panel.queue_settings.uid_policy_hint',
      'panel.widget.font_size', 'panel.widget.font_weight', 'panel.widget.width', 'panel.widget.height',
      'panel.widget.margin_top', 'panel.widget.margin_right', 'panel.widget.margin_bottom', 'panel.widget.margin_left',
      'panel.widget.outline_width', 'panel.widget.shadow_blur', 'panel.widget.shadow_offset_x', 'panel.widget.shadow_offset_y',
      'panel.reward_settings.reward_name', 'panel.reward_settings.cost', 'panel.reward_settings.description',
      'panel.reward_settings.uid_field', 'panel.reward_settings.no_uid', 'panel.reward_settings.stream_limit',
      'panel.reward_settings.viewer_limit', 'panel.reward_settings.cooldown', 'panel.reward_settings.submit',
      'panel.entry.dialog_eyebrow', 'panel.entry.dialog_title', 'panel.entry.twitch_login', 'panel.entry.uid_optional',
      'panel.entry.benefit', 'panel.reward.dialog_eyebrow', 'panel.reward.dialog_title',
      'panel.reward.compatible_rewards', 'panel.reward.link_selected', 'panel.settings.account_fallback',
      'panel.operations.empty', 'panel.connection.starting_pill',
    ]) expect(html).toContain(`data-i18n="${key}"`);
    for (const id of ['runtime-version', 'database-health', 'twitch-api-health', 'twitch-api-ping', 'overview-next-title', 'overview-next-description', 'overview-next-action']) {
      const element = html.match(new RegExp(`<[^>]*\\bid="${id}"[^>]*>`))?.[0];
      expect(element, `Expected #${id} to be populated from runtime state or a catalog`).toBeTruthy();
      expect(element, `#${id} must not be overwritten by static localization`).not.toMatch(/\\bdata-i18n=/);
    }
    const catalogs = await discoverCatalogModule(fileURLToPath(new URL('../../apps/web/localization/catalogs/', import.meta.url)), 'panel');
    for (const locale of ['pt-BR', 'en', 'es']) {
      for (const key of ['panel.health.database.checking', 'panel.health.ping_unavailable', 'panel.overview.connect_title', 'panel.overview.create_title', 'panel.overview.queues_title', 'panel.overview.check_title', 'panel.operations.empty_hint']) {
        expect(catalogs.catalogs[locale]).toHaveProperty(key);
      }
    }
    for (const key of ['panel.form.queue_name_placeholder', 'panel.entry.login_placeholder', 'panel.entry.uid_placeholder']) {
      expect(html).toContain(`data-i18n-placeholder="${key}"`);
    }
  });

  it('maps stable command IDs to localized descriptions and syntax', async () => {
    const app = await readFile(fileURLToPath(new URL('../../apps/web/app.js', import.meta.url)), 'utf8');
    expect(app).toContain('panel.command.description.${commandKey}');
    expect(app).toContain('panel.command.syntax.${commandKey}');
    const catalogRoot = fileURLToPath(new URL('../../apps/web/localization/catalogs/', import.meta.url));
    const catalogs = await discoverCatalogModule(catalogRoot, 'panel');
    for (const key of ['panel.command.description.queue_lista', 'panel.command.syntax.queue_lista', 'panel.command.description.global_queue_ping', 'panel.command.syntax.global_queue_ping']) {
      for (const locale of ['pt-BR', 'en', 'es']) expect(catalogs.catalogs[locale]).toHaveProperty(key);
    }
  });

  it('renders operations with localized labels and never exposes persisted error details', async () => {
    const app = await readFile(fileURLToPath(new URL('../../apps/web/app.js', import.meta.url)), 'utf8');
    for (const key of [
      'panel.operations.empty', 'panel.operation.type.refund', 'panel.operation.type.fulfillment',
      'panel.operation.type.reward_update', 'panel.operation.type.queue_delete',
      'panel.operation.action.resolve', 'panel.operation.action.retry',
    ]) expect(app).toContain(key);
    expect(app).not.toContain('operation.lastError');
    expect(app).toContain('const statusKey = `panel.operation.status.${operation.status}`');
    const catalogRoot = fileURLToPath(new URL('../../apps/web/localization/catalogs/', import.meta.url));
    const catalogs = await discoverCatalogModule(catalogRoot, 'panel');
    for (const status of ['pending', 'retry', 'processing', 'unknown', 'conflict', 'failed', 'confirmed', 'resolved_manual', 'cancelled']) {
      for (const locale of ['pt-BR', 'en', 'es']) expect(catalogs.catalogs[locale]).toHaveProperty(`panel.operation.status.${status}`);
    }
  });

  it('uses catalog copy for queue workflow confirmations, prompts, and outcomes', async () => {
    const app = await readFile(fileURLToPath(new URL('../../apps/web/app.js', import.meta.url)), 'utf8');
    for (const key of [
      'panel.notice.queue_created', 'panel.notice.queue_settings_saved', 'panel.notice.reward_update_pending',
      'panel.priority.reason_prompt', 'panel.priority.invalid_reason', 'panel.priority.marked',
      'panel.queue.confirm.archive', 'panel.queue.confirm.unarchive', 'panel.queue.confirm.delete',
      'panel.queue.delete.pending', 'panel.reward.no_candidates', 'panel.queue.clear.confirm',
      'panel.queue.clear.changed', 'panel.queue.clear.done', 'panel.account.prompt.current',
      'panel.account.prompt.default',
    ]) expect(app).toContain(key);
    for (const oldCopy of ['Selecione o benefício conferido:', 'Arquivar esta fila?', 'Nenhuma operação pendente.', 'Fila salva. A criação']) {
      expect(app).not.toContain(oldCopy);
    }
    expect(app).toContain('panel.queue_settings.call_message_default');
    expect(app).not.toContain("'{user}, sua vez!'");
    expect(app).not.toContain("?? 'Streamer'");
  });

  it('covers every static text and accessible-label key in the panel for each first-party locale', async () => {
    const htmlPath = fileURLToPath(new URL('../../apps/web/index.html', import.meta.url));
    const catalogRoot = fileURLToPath(new URL('../../apps/web/localization/catalogs/', import.meta.url));
    const html = await readFile(htmlPath, 'utf8');
    const catalogs = await discoverCatalogModule(catalogRoot, 'panel');
    const keys = [...html.matchAll(/data-i18n(?:-[a-z-]+)?="([a-z0-9._-]+)"/g)].map((match) => match[1]);
    expect(keys.length).toBeGreaterThan(0);
    for (const locale of ['pt-BR', 'en', 'es']) {
      for (const key of keys) expect(catalogs.catalogs[locale]).toHaveProperty(key);
    }
  });
});

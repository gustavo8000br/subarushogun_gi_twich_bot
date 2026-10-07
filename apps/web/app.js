import { createApplicationSetupSubmitHandler } from './application-setup.mjs';
import { resendCallNotification } from './call-notification-actions.mjs';
import { twitchEligibilityMessage, twitchStatusLabel, twitchStatusState } from './setup-messages.mjs';
import { formatHealthStatus } from './health-status.mjs';
import { getInitialPanelPage, selectPanelPage } from './panel-navigation.mjs';
import { collectCommandPolicies, mergeCommandPolicyState, projectCommandCatalog } from './command-catalog-view.mjs';
import { buildOverlayWidgetPayload, countOverlayTextCodePoints } from './overlay-widget-form.mjs';
import { resolveLocaleSelection } from './locale-picker-state.mjs';
import { applyPanelTranslations } from './dom-localization.mjs';
import { presentPanelError } from './panel-error-presentation.mjs';
import { translateCatalog, translatePluralCatalog } from '../shared/browser/translate-catalog.mjs';

const $ = (selector) => document.querySelector(selector);
const optionalLimit = (value) => String(value ?? '').trim() ? Number(value) : null;
const state = { csrfToken: null, queues: [], productVersion: '—', initialPageSelected: false, twitchConnected: null, productLocale: { locale: 'pt-BR', revision: 1 }, localizationCatalogs: null };
const commandRoleKeys = { everyone: 'panel.command.role.everyone', subscriber: 'panel.command.role.subscriber', vip: 'panel.command.role.vip', moderator: 'panel.command.role.moderator' };
const panelPlaceholders = Object.freeze({
  'panel.operation.attempts': ['count'], 'panel.reconciliation.complete': ['count'], 'panel.reconciliation.issues': ['count'],
  'panel.queue.confirm.delete': ['title', 'count'], 'panel.queue.clear.confirm': ['title', 'count', 'refunds'],
  'panel.queue.clear.changed': ['count'], 'panel.queue.clear.done': ['count', 'refunds'],
  'panel.widget.card_details': ['queue', 'width', 'height', 'id'],
});
let commandCatalog = null;
let overlayWidgetsLoaded = false;

const overlaySourceKeys = {
  account_label: 'panel.widget.source.account', queue_name: 'panel.widget.source.queue_name',
  queue_state: 'panel.widget.source.queue_state', queue_waiting_count: 'panel.widget.source.queue_count',
  called_viewer_display_name: 'panel.widget.source.called_name', called_viewer_position: 'panel.widget.source.called_position',
  in_service_viewer_display_name: 'panel.widget.source.service_name', fixed_text: 'panel.widget.source.fixed_text',
};
const overlayStyleFields = ['textColor', 'backgroundColor', 'backgroundOpacity', 'fontFamily', 'fontSize', 'fontWeight', 'alignment', 'effect', 'outlineWidth', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'width', 'height', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'overflow'];
const queueScopedOverlaySources = new Set(['queue_name', 'queue_state', 'queue_waiting_count']);

function showPanelPage(pageId) {
  const navigationItems = /** @type {HTMLButtonElement[]} */ ([...document.querySelectorAll('.panel-navigation [data-page-target]')]);
  const pages = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('[data-panel-page]')]);
  return selectPanelPage(pageId, { navigationItems, pages });
}

async function request(url, options = {}) {
  const mutating = options.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method);
  const { idempotencyKey, ...fetchOptions } = options;
  const headers = { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(mutating ? { 'x-csrf-token': state.csrfToken, 'idempotency-key': idempotencyKey ?? globalThis.crypto.randomUUID() } : {}), ...options.headers };
  const response = await fetch(url, { credentials: 'same-origin', ...fetchOptions, headers });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(''), { code: payload?.code });
  return payload;
}

function panelError(error) {
  return presentPanelError(error, activeProductLocale(), state.localizationCatalogs?.modules?.panel?.catalogs);
}

function activeProductLocale() {
  const locale = state.productLocale.locale;
  return state.localizationCatalogs?.locales?.includes(locale) ? locale : 'pt-BR';
}

function applyPanelCatalog() {
  const catalogs = state.localizationCatalogs?.modules?.panel?.catalogs;
  if (catalogs) applyPanelTranslations(document, activeProductLocale(), catalogs);
}

function panelText(key, values = {}) {
  const catalogs = state.localizationCatalogs?.modules?.panel?.catalogs ?? {};
  return translateCatalog(catalogs, activeProductLocale(), key, { values, placeholders: panelPlaceholders });
}

function panelTextPlural(key, count) {
  const catalogs = state.localizationCatalogs?.modules?.panel?.catalogs ?? {};
  return translatePluralCatalog(catalogs, activeProductLocale(), key, count, { placeholders: panelPlaceholders });
}

function commandRoleLabel(role) {
  const key = commandRoleKeys[role];
  return key ? panelText(key) : role;
}

function priorityReasonLabel(reason) {
  const key = {
    external_payment: 'panel.entry.reason.external', bits: 'panel.entry.reason.bits',
    subscription: 'panel.entry.reason.sub', operator_override: 'panel.entry.reason.other',
  }[reason];
  return key ? panelText(key) : panelText('translation.unavailable');
}

function queueSyncLabel(status) {
  const key = {
    synced: 'panel.queue.sync.synced', synced_manual: 'panel.queue.sync.manual',
    pending_update: 'panel.queue.sync.pending', pending_open: 'panel.queue.sync.pending',
    pending_close: 'panel.queue.sync.pending', update_unknown: 'panel.queue.sync.unknown',
    create_unknown: 'panel.queue.sync.unknown', update_failed: 'panel.queue.sync.failed',
  }[status];
  return key ? panelText(key) : panelText('panel.queue.sync.not_synced');
}

function renderProductLocalePicker() {
  const selects = /** @type {HTMLSelectElement[]} */ ([...document.querySelectorAll('#product-locale, #product-locale-quick')]);
  const locales = state.localizationCatalogs?.locales ?? [];
  for (const select of selects) {
    const save = /** @type {HTMLButtonElement|null} */ (document.querySelector(`#save-${select.id}`));
    if (!save) continue;
    const pendingSelection = select.value;
    select.replaceChildren();
    for (const locale of locales) {
      const option = document.createElement('option');
      option.value = locale;
      let displayName = locale;
      try { displayName = new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale; } catch { /* The validated locale code remains a safe label. */ }
      option.textContent = `${displayName} (${locale})`;
      select.append(option);
    }
    select.disabled = locales.length === 0;
    select.value = resolveLocaleSelection(locales, state.productLocale.locale, pendingSelection, document.activeElement === select);
    save.disabled = select.disabled || select.value === state.productLocale.locale;
  }
  $('#product-locale-notice').textContent = !locales.includes(state.productLocale.locale)
    ? panelText('panel.locale.incomplete') : '';
}

async function refreshLocalizationCatalogs() {
  try {
    const catalogs = await request('/api/localization/catalogs');
    if (Array.isArray(catalogs?.locales) && catalogs.modules && typeof catalogs.modules === 'object') {
      state.localizationCatalogs = catalogs;
      renderProductLocalePicker();
      applyPanelCatalog();
    }
  } catch { /* Keep the last valid local catalog snapshot while files are repaired. */ }
}

async function saveProductLocale(event) {
  event.preventDefault();
  const select = /** @type {HTMLSelectElement} */ (event.currentTarget.querySelector('select'));
  const notice = event.currentTarget.id === 'product-locale-quick-form' ? $('#product-locale-quick-notice') : $('#product-locale-notice');
  try {
    state.productLocale = await request('/api/localization/locale', {
      method: 'PATCH',
      body: JSON.stringify({ locale: select.value, expectedRevision: state.productLocale.revision }),
    });
    notice.textContent = panelText('panel.locale.updated');
    renderProductLocalePicker();
    await refresh();
  } catch (error) { notice.textContent = panelError(error); }
}

function toast(message) {
  const node = $('#toast'); node.textContent = message; node.classList.add('show');
  window.setTimeout(() => node.classList.remove('show'), 3200);
}

function text(tag, value, className) {
  const node = document.createElement(tag); node.textContent = value ?? '';
  if (className) node.className = className;
  return node;
}

function action(label, actionName, entryId, queueId) {
  const button = text('button', label, 'small-action'); button.type = 'button';
  button.dataset.action = actionName; button.dataset.entryId = entryId; button.dataset.queueId = queueId;
  return button;
}

function renderEntryGroup(title, entries, queue, group) {
  const section = document.createElement('section'); section.className = 'entry-group';
  section.append(text('h3', `${title} · ${entries.length}`));
  if (!entries.length) section.append(text('div', panelText('panel.queue.empty_group'), 'entry-empty'));
  for (const entry of entries) {
    const row = document.createElement('div'); row.className = 'entry-row';
    if (entry.position) row.append(text('span', String(entry.position).padStart(2, '0'), 'position'));
    row.append(text('span', entry.displayName || `@${entry.userLogin}`));
    if (group === 'waiting' && entry.priorityClass === 'priority') row.append(text('small', `${panelText('panel.entry.priority_badge')} (${priorityReasonLabel(entry.priorityReason)})`, 'priority-badge'));
    if (queue.uidMode === 'visible' && entry.uid && (group === 'waiting' ? queue.showUidInList : queue.showUidOnCall)) row.append(text('small', `${panelText('panel.entry.uid_label')} ${entry.uid}`));
    const buttons = document.createElement('span'); buttons.className = 'entry-buttons';
    if (group === 'waiting') {
      buttons.append(action(panelText('panel.entry.action.call'), 'call-one', entry.id, queue.id));
      const lane = (queue.entries ?? []).filter((item) => item.status === 'waiting' && (item.priorityClass ?? 'standard') === (entry.priorityClass ?? 'standard'));
      const lanePosition = lane.findIndex((item) => item.id === entry.id) + 1;
      const moveUp = action(panelText('panel.entry.action.move_up'), 'move-up', entry.id, queue.id); moveUp.disabled = lanePosition <= 1; buttons.append(moveUp);
      const moveDown = action(panelText('panel.entry.action.move_down'), 'move-down', entry.id, queue.id); moveDown.disabled = lanePosition >= lane.length; buttons.append(moveDown);
      buttons.append(action(panelText(entry.priorityClass === 'priority' ? 'panel.entry.action.remove_priority' : 'panel.entry.action.mark_priority'), 'toggle-priority', entry.id, queue.id));
    }
    if (group === 'called') buttons.append(action(panelText('panel.entry.action.attend'), 'in_progress', entry.id, queue.id), action(panelText('panel.entry.action.complete'), 'completed', entry.id, queue.id), action(panelText('panel.entry.action.resend'), 'resend-call', entry.id, queue.id));
    if (group === 'in_progress') buttons.append(action(panelText('panel.entry.action.complete'), 'completed', entry.id, queue.id));
    buttons.append(action(panelText('panel.entry.action.remove'), 'removed', entry.id, queue.id)); row.append(buttons); section.append(row);
  }
  return section;
}

function renderQueues(queues) {
  const container = $('#queue-list'); container.replaceChildren();
  if (!queues.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state'; empty.append(text('span', '◌'), text('strong', panelText('panel.queue.empty.title')), text('small', panelText('panel.queue.empty.hint')));
    container.append(empty); return;
  }
  for (const queue of queues) {
    const card = document.createElement('article'); card.className = 'queue-card';
    const head = document.createElement('div'); head.className = 'queue-card-head';
    head.append(text('span', queue.title?.slice(0, 1)?.toUpperCase() || 'Q', 'queue-symbol'));
    const meta = document.createElement('div'); meta.className = 'queue-meta'; meta.append(text('strong', queue.title)); meta.append(text('small', `!${queue.slug} · ${Number(queue.cost).toLocaleString(activeProductLocale())} ${panelText('panel.queue.points')} · ${panelText(queue.isOpen ? 'panel.queue.status.open' : 'panel.queue.status.closed')} · ${queueSyncLabel(queue.remoteSyncStatus)}`)); head.append(meta);
    const active = queue.entries || [];
    const controls = document.createElement('div'); controls.className = 'queue-actions';
    if (queue.lifecycleStatus === 'deleting') {
      controls.append(text('span', panelText('panel.queue.status.pending_delete'), 'muted'));
    } else {
      controls.append(action(panelText('panel.queue.action.delete'), 'delete-queue', '', queue.id));
      controls.append(action(panelText('panel.queue.action.configure'), 'edit-settings', '', queue.id));
      if (['synced', 'synced_manual'].includes(queue.remoteSyncStatus)) controls.append(action(panelText('panel.queue.action.edit_reward'), 'edit-reward-settings', '', queue.id));
    }
    if (queue.lifecycleStatus === 'deleting') {
      // Queue mutation controls stay disabled while the durable deletion workflow is pending.
    } else if (queue.isArchived) {
      controls.append(action(panelText('panel.queue.action.unarchive'), 'unarchive-queue', '', queue.id));
      if (active.some((entry) => entry.status === 'waiting')) controls.append(action(panelText('panel.queue.action.next'), 'call-next', '', queue.id));
      controls.append(action(panelText('panel.queue.action.clear'), 'clear-queue', '', queue.id));
    } else {
      controls.append(action(panelText('panel.queue.action.add'), 'add-entry', '', queue.id), action(panelText('panel.queue.action.next'), 'call-next', '', queue.id));
      if (['synced', 'synced_manual'].includes(queue.remoteSyncStatus)) controls.append(action(panelText(queue.isOpen ? 'panel.queue.action.close' : 'panel.queue.action.open'), queue.isOpen ? 'close-queue' : 'open-queue', '', queue.id), action(panelText('panel.queue.action.archive'), 'archive-queue', '', queue.id));
      controls.append(action(panelText('panel.queue.action.clear'), 'clear-queue', '', queue.id));
    }
    if (queue.remoteSyncStatus === 'create_unknown') controls.append(action(panelText('panel.queue.action.resolve_reward'), 'resolve-reward', '', queue.id));
    head.append(controls); card.append(head);
    card.append(renderEntryGroup(panelText('panel.queue.group.waiting'), active.filter((entry) => entry.status === 'waiting'), queue, 'waiting'));
    card.append(renderEntryGroup(panelText('panel.queue.group.called'), active.filter((entry) => entry.status === 'called'), queue, 'called'));
    card.append(renderEntryGroup(panelText('panel.queue.group.in_service'), active.filter((entry) => entry.status === 'in_progress'), queue, 'in_progress'));
    const history = document.createElement('details'); history.className = 'queue-history';
    history.append(text('summary', panelText('panel.queue.history.title')));
    const historyContent = document.createElement('div'); historyContent.className = 'history-content';
    history.addEventListener('toggle', async () => {
      if (!history.open || history.dataset.loaded === 'true') return;
      try {
        const entries = await request(`/api/queues/${queue.id}/history`);
        historyContent.replaceChildren();
        if (!entries.length) historyContent.append(text('p', panelText('panel.queue.history.empty'), 'muted'));
        for (const entry of entries) {
          const date = entry.finishedAt ? new Intl.DateTimeFormat(activeProductLocale(), { dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.finishedAt)) : panelText('panel.queue.history.date_unavailable');
          const status = panelText(`panel.entry.status.${entry.status}`);
          historyContent.append(text('p', `${entry.displayName || `@${entry.userLogin}`} · ${status} · ${date}`, 'history-entry'));
        }
        history.dataset.loaded = 'true';
      } catch (error) { historyContent.replaceChildren(text('p', panelError(error), 'muted')); }
    });
    history.append(historyContent); card.append(history);
    container.append(card);
  }
}

function renderCommandCatalog(catalog) {
  const container = $('#command-catalog'); container.replaceChildren();
  if (!catalog?.commands?.length) { container.append(text('p', panelText('panel.commands.unavailable'), 'muted')); return; }
  commandCatalog = catalog;
  for (const command of projectCommandCatalog(catalog)) {
    const card = document.createElement('article'); card.className = 'command-policy-card';
    const description = document.createElement('div');
    const commandKey = command.key.replaceAll(':', '_');
    const syntax = panelText(`panel.command.syntax.${commandKey}`);
    description.append(text('h2', panelText(`panel.command.description.${commandKey}`)));
    description.append(text('code', syntax, 'command-policy-syntax'));
    const roles = document.createElement('fieldset'); roles.className = 'command-policy-roles';
    roles.setAttribute('aria-label', `${panelText('panel.command.roles_for')} ${syntax}`);
    const selected = new Set(command.roles);
    for (const role of catalog.configurableRoles) {
      const label = document.createElement('label');
      if (command.locked) label.classList.add('locked-role');
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = role;
      checkbox.checked = selected.has(role); checkbox.disabled = command.locked;
      label.append(checkbox, document.createTextNode(commandRoleLabel(role))); roles.append(label);
    }
    const status = text('p', command.locked ? `${panelText('panel.command.access_fixed')} ${(command.immutableRoles ?? command.roles).map((role) => role === 'streamer' ? panelText('panel.command.role.streamer') : commandRoleLabel(role)).join(` ${panelText('panel.command.role_join')} `)}.` : panelText('panel.command.marked_roles'), 'muted');
    description.append(status); card.append(description, roles); card.dataset.commandKey = command.key; container.append(card);
  }
}

async function loadCommandCatalog() {
  try {
    commandCatalog = await request('/api/command-catalog');
    renderCommandCatalog(commandCatalog);
    $('#command-catalog-notice').textContent = '';
  } catch (error) { $('#command-catalog').replaceChildren(text('p', panelError(error), 'muted')); }
}

async function saveCommandPolicies(event) {
  event.preventDefault();
  if (!commandCatalog) return;
  const policies = collectCommandPolicies(commandCatalog.commands, [...$('#command-catalog').children]);
  try {
    const result = await request('/api/command-policies', { method: 'PATCH', body: JSON.stringify({ expectedVersion: commandCatalog.version, policies }) });
    commandCatalog = mergeCommandPolicyState(commandCatalog, result);
    renderCommandCatalog(commandCatalog);
    $('#command-catalog-notice').textContent = panelText('panel.commands.saved');
  } catch (error) { $('#command-catalog-notice').textContent = panelError(error); }
}

function updateOverlayPreview() {
  const form = $('#overlay-editor-form');
  const preview = $('#overlay-preview-text');
  if (!form || !preview) return;
  const values = new FormData(form);
  const sourceType = String(values.get('sourceType') ?? 'account_label');
  const fixedText = String(values.get('fixedText') ?? '').trim();
  const fixedCount = $('#overlay-fixed-count');
  const fallbackCount = $('#overlay-fallback-count');
  if (fixedCount) fixedCount.textContent = `${countOverlayTextCodePoints(values.get('fixedText'))}/240`;
  if (fallbackCount) fallbackCount.textContent = `${countOverlayTextCodePoints(values.get('fallbackText'))}/240`;
  const sample = sourceType === 'fixed_text' ? fixedText || panelText('panel.widget.preview_example')
    : sourceType === 'queue_waiting_count' ? panelText('panel.widget.preview.waiting')
      : sourceType === 'queue_state' ? panelText('panel.widget.preview.open') : sourceType === 'account_label' ? panelText('panel.widget.preview.account')
        : sourceType.includes('called') ? panelText('panel.widget.preview.called') : sourceType.includes('in_service') ? panelText('panel.widget.preview.in_service')
          : String($('#overlay-queue-field select')?.selectedOptions?.[0]?.textContent ?? panelText('panel.widget.queue_label'));
  preview.textContent = sample;
  const color = String(values.get('textColor') || '#ffffff');
  const background = String(values.get('backgroundColor') || '#000000');
  const opacity = Math.max(0, Math.min(100, Number(values.get('backgroundOpacity') || 0))) / 100;
  preview.style.color = color;
  preview.style.backgroundColor = `rgba(${Number.parseInt(background.slice(1, 3), 16)}, ${Number.parseInt(background.slice(3, 5), 16)}, ${Number.parseInt(background.slice(5, 7), 16)}, ${opacity})`;
  preview.style.fontFamily = String(values.get('fontFamily') || 'system-ui');
  preview.style.fontSize = `${Number(values.get('fontSize') || 32)}px`;
  preview.style.fontWeight = String(values.get('fontWeight') || 700);
  preview.style.textAlign = String(values.get('alignment') || 'center');
  const effect = String(values.get('effect') || 'none');
  preview.style.webkitTextStroke = effect === 'outline' ? `${Number(values.get('outlineWidth') || 1)}px ${color}` : '';
  preview.style.textShadow = effect === 'shadow' ? `${Number(values.get('shadowOffsetX') || 0)}px ${Number(values.get('shadowOffsetY') || 0)}px ${Number(values.get('shadowBlur') || 0)}px #000000` : '';
  preview.style.width = values.get('width') === 'auto' ? 'auto' : `${Number(values.get('width') || 640)}px`;
  preview.style.minHeight = values.get('height') === 'auto' ? 'auto' : `${Number(values.get('height') || 100)}px`;
  preview.style.margin = `${Number(values.get('marginTop') || 0)}px ${Number(values.get('marginRight') || 0)}px ${Number(values.get('marginBottom') || 0)}px ${Number(values.get('marginLeft') || 0)}px`;
  preview.style.whiteSpace = values.get('overflow') === 'ellipsis' ? 'nowrap' : '';
  preview.style.overflow = ['clip', 'ellipsis'].includes(String(values.get('overflow'))) ? 'hidden' : '';
  preview.style.textOverflow = values.get('overflow') === 'ellipsis' ? 'ellipsis' : '';
  preview.style.overflowWrap = values.get('overflow') === 'wrap' ? 'anywhere' : '';
}

function populateOverlayQueueOptions(selectedId = '') {
  const select = /** @type {HTMLSelectElement} */ ($('#overlay-queue-field select'));
  const placeholder = document.createElement('option'); placeholder.textContent = panelText('panel.widget.queue.select'); placeholder.value = '';
  select.replaceChildren(placeholder);
  for (const queue of state.queues.filter((item) => (item.id === selectedId || !item.isArchived) && item.lifecycleStatus !== 'deleting' && item.lifecycleStatus !== 'deleted')) {
    const option = document.createElement('option'); option.textContent = queue.title; option.value = queue.id; select.append(option);
  }
  select.value = selectedId;
}

function showOneTimeOverlayLink(url) {
  $('#overlay-link-value').value = url;
  $('#overlay-link-notice').textContent = panelText('panel.widget.link.copied_once');
  $('#overlay-link-dialog').showModal();
}

function overlayAction(label, handler, danger = false) {
  const button = text('button', label, danger ? 'button button-danger' : 'button button-secondary');
  button.type = 'button'; button.addEventListener('click', handler); return button;
}

function renderOverlayWidgets(widgets) {
  const container = $('#overlay-widget-list'); container.replaceChildren();
  if (!widgets.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state';
    empty.append(text('span', '◌'), text('strong', panelText('panel.widget.empty.title')), text('small', panelText('panel.widget.empty.hint')));
    const create = overlayAction(panelText('panel.widget.create_first'), () => openOverlayEditor()); create.classList.add('button-primary'); empty.append(create); container.append(empty); return;
  }
  for (const widget of widgets) {
    const card = document.createElement('article'); card.className = 'overlay-widget-card';
    const heading = document.createElement('div'); heading.className = 'overlay-widget-heading';
    const title = text('h3', panelText(overlaySourceKeys[widget.sourceType] ?? 'panel.widget.source.unknown'));
    const queue = state.queues.find((item) => item.id === widget.queueId);
    const status = panelText(widget.deleted ? 'panel.widget.status.unavailable' : widget.capabilityActive ? 'panel.widget.status.active' : 'panel.widget.status.revoked');
    heading.append(title, text('span', status, widget.capabilityActive ? 'status-pill status-connected' : 'status-pill'));
    const details = text('p', panelText('panel.widget.card_details', {
      queue: queue ? `${queue.title} · ` : '',
      width: widget.style?.width ?? panelText('panel.widget.auto'),
      height: widget.style?.height ?? panelText('panel.widget.auto'),
      id: widget.id.slice(0, 8),
    }), 'muted');
    const preview = text('p', widget.sourceType === 'fixed_text' ? widget.fixedText : widget.fallbackText || panelText('panel.widget.preview_example'), 'overlay-card-preview');
    const actions = document.createElement('div'); actions.className = 'overlay-widget-actions';
    actions.append(overlayAction(panelText('panel.widget.action.edit'), () => openOverlayEditor(widget)));
    if (widget.capabilityActive) {
      actions.append(overlayAction(panelText('panel.widget.action.regenerate'), async () => {
        if (!window.confirm(panelText('panel.widget.confirm.regenerate'))) return;
        try { const result = await request(`/api/overlay-widgets/${widget.id}/regenerate`, { method: 'POST', body: JSON.stringify({ expectedVersion: widget.version }) }); showOneTimeOverlayLink(result.capabilityUrl); await loadOverlayWidgets(); }
        catch (error) { toast(panelError(error)); }
      }));
      actions.append(overlayAction(panelText('panel.widget.action.revoke'), async () => {
        if (!window.confirm(panelText('panel.widget.confirm.revoke'))) return;
        try { await request(`/api/overlay-widgets/${widget.id}/revoke`, { method: 'POST', body: JSON.stringify({ expectedVersion: widget.version }) }); await loadOverlayWidgets(); }
        catch (error) { toast(panelError(error)); }
      }, true));
    } else if (!widget.deleted) {
      actions.append(overlayAction(panelText('panel.widget.action.generate'), async () => {
        try { const result = await request(`/api/overlay-widgets/${widget.id}/regenerate`, { method: 'POST', body: JSON.stringify({ expectedVersion: widget.version }) }); showOneTimeOverlayLink(result.capabilityUrl); await loadOverlayWidgets(); }
        catch (error) { toast(panelError(error)); }
      }));
    }
    actions.append(overlayAction(panelText('panel.widget.action.delete'), async () => {
      if (!window.confirm(panelText('panel.widget.confirm.delete'))) return;
      try { await request(`/api/overlay-widgets/${widget.id}`, { method: 'DELETE', body: JSON.stringify({ expectedVersion: widget.version }) }); await loadOverlayWidgets(); }
      catch (error) { toast(panelError(error)); }
    }, true));
    card.append(heading, details, preview, actions); container.append(card);
  }
}

async function loadOverlayWidgets() {
  try { const widgets = await request('/api/overlay-widgets'); renderOverlayWidgets(widgets); overlayWidgetsLoaded = true; }
  catch (error) { $('#overlay-widget-list').replaceChildren(text('p', panelError(error), 'muted')); }
}

function openOverlayEditor(widget = null) {
  const form = /** @type {HTMLFormElement} */ ($('#overlay-editor-form'));
  form.reset();
  populateOverlayQueueOptions(widget?.queueId ?? '');
  const setValue = (name, value) => { const field = /** @type {HTMLInputElement|null} */ (form.elements.namedItem(name)); if (field) field.value = String(value ?? ''); };
  setValue('id', widget?.id ?? ''); setValue('version', widget?.version ?? '');
  setValue('sourceType', widget?.sourceType ?? 'account_label'); setValue('fixedText', widget?.fixedText ?? '');
  setValue('fallbackText', widget?.fallbackText ?? '');
  const defaults = { textColor: '#FFFFFF', backgroundColor: '#000000', backgroundOpacity: 0, fontFamily: 'system-ui', fontSize: 32, fontWeight: 700, alignment: 'center', effect: 'none', outlineWidth: 1, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, width: 640, height: 100, marginTop: 8, marginRight: 8, marginBottom: 8, marginLeft: 8, overflow: 'wrap' };
  for (const field of overlayStyleFields) setValue(field, widget?.style?.[field] ?? defaults[field]);
  $('#overlay-editor-title').textContent = panelText(widget ? 'panel.widget.editor.edit' : 'panel.widget.editor.create');
  $('#overlay-editor-notice').textContent = '';
  const sourceType = /** @type {HTMLSelectElement} */ (form.elements.namedItem('sourceType')).value;
  $('#overlay-queue-field').hidden = !queueScopedOverlaySources.has(sourceType);
  $('#overlay-fixed-field').hidden = sourceType !== 'fixed_text';
  updateOverlayPreview();
  $('#overlay-editor-dialog').showModal();
}

async function saveOverlayWidget(event) {
  event.preventDefault();
  const form = /** @type {HTMLFormElement} */ (event.currentTarget);
  let payload;
  try { payload = buildOverlayWidgetPayload(new FormData(form)); }
  catch (error) { $('#overlay-editor-notice').textContent = panelError(error); return; }
  const id = String(new FormData(form).get('id') ?? '');
  try {
    const result = id
      ? await request(`/api/overlay-widgets/${id}`, { method: 'PATCH', body: JSON.stringify({ expectedVersion: Number(new FormData(form).get('version')), changes: payload }) })
      : await request('/api/overlay-widgets', { method: 'POST', body: JSON.stringify(payload) });
    $('#overlay-editor-dialog').close();
    if (result.capabilityUrl) showOneTimeOverlayLink(result.capabilityUrl);
    await loadOverlayWidgets();
  } catch (error) { $('#overlay-editor-notice').textContent = panelError(error); }
}

async function copyOverlayLink() {
  const input = /** @type {HTMLInputElement} */ ($('#overlay-link-value'));
  try { await window.navigator.clipboard.writeText(input.value); $('#overlay-link-notice').textContent = panelText('panel.widget.link.copied'); }
  catch { input.select(); $('#overlay-link-notice').textContent = panelText('panel.widget.link.copy_fallback'); }
}

async function refresh() {
  try {
    const [apiState, setup, health] = await Promise.all([
      request('/api/state'), request('/api/setup'),
      request('/health').catch(() => ({ status: 'unavailable', dependencies: { database: 'unavailable', twitch_api: 'unknown', twitch_api_ping_ms: null } })),
    ]);
    const healthStatus = formatHealthStatus(health, activeProductLocale(), state.localizationCatalogs);
    $('#database-health').textContent = healthStatus.database;
    $('#twitch-api-health').textContent = healthStatus.twitch;
    $('#twitch-api-ping').textContent = healthStatus.ping;
    state.productVersion = apiState.product_version; $('#runtime-version').textContent = apiState.product_version;
    state.productLocale = apiState.product_locale ?? { locale: 'pt-BR', revision: 1 };
    renderProductLocalePicker();
    applyPanelCatalog();
    $('#account-label').textContent = apiState.account?.label ?? panelText('panel.settings.account_fallback');
    state.accountDefaultLabel = apiState.account?.defaultLabel ?? panelText('panel.settings.account_fallback');
    $('#edit-default-account').title = `${panelText('panel.settings.current_default')}: ${state.accountDefaultLabel}`;
    $('#callback-url').textContent = setup.callbackUrl;
    $('#channel-name').textContent = setup.connected
      ? `${panelText('panel.connection.channel_connected')} · ${setup.broadcasterId}`
      : panelText('panel.connection.channel_not_connected');
    $('#twitch-status').textContent = twitchEligibilityMessage(setup, activeProductLocale(), state.localizationCatalogs);
    $('#twitch-pill').textContent = twitchStatusLabel(setup, activeProductLocale(), state.localizationCatalogs); $('#twitch-pill').dataset.state = twitchStatusState(setup);
    $('#secret-state').textContent = panelText(setup.secretConfigured ? 'panel.credentials.secret_configured' : 'panel.credentials.secret_empty');
    $('#connection-wizard').hidden = setup.connected === true;
    $('#connection-summary').hidden = setup.connected !== true;
    $('#connected-channel-name').textContent = setup.connected
      ? `${panelText('panel.connection.channel_connected')} · ${setup.broadcasterId}`
      : panelText('panel.connection.channel_disconnected');
    $('#connection-pill').textContent = setup.connected ? panelText('panel.connection.pill_connected') : panelText('panel.connection.pill_reconnect');
    $('#connection-status-copy').textContent = twitchEligibilityMessage(setup, activeProductLocale(), state.localizationCatalogs);
    if (setup.clientId) $('#credentials-form [name=clientId]').value = setup.clientId;
    $('#connect-button').disabled = !setup.secretConfigured;
    if (!state.initialPageSelected) {
      showPanelPage(getInitialPanelPage(setup));
      state.initialPageSelected = true;
    } else if (state.twitchConnected === true && setup.connected !== true) {
      showPanelPage('connection');
    }
    state.twitchConnected = setup.connected === true;
    state.queues = await request('/api/queues'); renderQueues(state.queues);
    $('#summary-queues').textContent = String(state.queues.length);
    $('#summary-waiting').textContent = String(state.queues.reduce((total, queue) => total + (queue.entries ?? []).filter((entry) => entry.status === 'waiting').length, 0));
    $('#summary-active').textContent = String(state.queues.reduce((total, queue) => total + (queue.entries ?? []).filter((entry) => ['called', 'in_progress'].includes(entry.status)).length, 0));
    const operations = await request('/api/operations');
    const operationList = $('#operation-list'); operationList.replaceChildren();
    if (!operations.length) operationList.append(text('p', panelText('panel.operations.empty'), 'muted'));
    for (const operation of operations) {
      const row = document.createElement('div'); row.className = 'operation-row'; row.dataset.status = operation.status;
      const typeKey = {
        'redemption.cancel': 'panel.operation.type.refund', 'redemption.fulfill': 'panel.operation.type.fulfillment',
        'reward.update': 'panel.operation.type.reward_update', 'reward.delete': 'panel.operation.type.queue_delete',
      }[operation.type] ?? 'panel.operation.type.other';
      const statusKey = `panel.operation.status.${operation.status}`;
      row.append(text('strong', panelText(typeKey)));
      const statusLabel = panelText(statusKey);
      row.append(text('small', `${operation.redemptionId ?? operation.entityId ?? ''} · ${statusLabel} · ${panelTextPlural('panel.operation.attempts', operation.attempts)}`));
      if (operation.status === 'unknown' && operation.type.startsWith('redemption.')) {
        const button = text('button', panelText('panel.operation.action.resolve')); button.type = 'button';
        button.addEventListener('click', async () => {
          const accepted = window.confirm(panelText('panel.operation.confirm.resolve'));
          if (!accepted) return;
          try { await request(`/api/operations/${operation.id}/resolve-unknown`, { method: 'POST', body: '{}' }); await refresh(); }
          catch (error) { toast(panelError(error)); }
        });
        row.append(button);
      }
      if (['unknown', 'conflict', 'failed'].includes(operation.status)) {
        const button = text('button', panelText('panel.operation.action.retry')); button.type = 'button';
        button.addEventListener('click', async () => { try { await request(`/api/operations/${operation.id}/retry`, { method: 'POST', body: '{}' }); await refresh(); } catch (error) { toast(panelError(error)); } });
        row.append(button);
      }
      operationList.append(row);
    }
    $('#last-refresh').textContent = `${panelText('panel.runtime.refreshed')} ${new Intl.DateTimeFormat(activeProductLocale(), { timeStyle: 'short' }).format(new Date())}`;
  } catch (error) { toast(panelError(error)); }
}

async function boot() {
  const session = await request('/api/session'); state.csrfToken = session.csrfToken;
  await refreshLocalizationCatalogs();
  document.addEventListener('click', (event) => {
    const eventTarget = /** @type {Element|null} */ (event.target);
    const target = /** @type {HTMLElement|null} */ (eventTarget?.closest('[data-page-target]') ?? null);
    if (target) {
      showPanelPage(target.dataset.pageTarget);
      if (target.dataset.pageTarget === 'commands' && !commandCatalog) void loadCommandCatalog();
      if (target.dataset.pageTarget === 'widgets' && !overlayWidgetsLoaded) void loadOverlayWidgets();
    }
    const closeButton = /** @type {HTMLElement|null} */ (eventTarget?.closest('[data-close-dialog]') ?? null);
    if (closeButton) (/** @type {HTMLDialogElement|null} */ (document.getElementById(closeButton.dataset.closeDialog)))?.close();
  });
  $('#command-catalog-form').addEventListener('submit', saveCommandPolicies);
  $('#create-overlay-widget').addEventListener('click', () => openOverlayEditor());
  $('#overlay-editor-form').addEventListener('submit', saveOverlayWidget);
  $('#overlay-editor-form').addEventListener('input', updateOverlayPreview);
  $('#overlay-editor-form').addEventListener('change', (event) => {
    if (event.target?.name === 'sourceType') {
      const sourceType = event.target.value;
      $('#overlay-queue-field').hidden = !queueScopedOverlaySources.has(sourceType);
      $('#overlay-fixed-field').hidden = sourceType !== 'fixed_text';
    }
    updateOverlayPreview();
  });
  $('#copy-overlay-link').addEventListener('click', copyOverlayLink);
  $('#overlay-link-dialog').addEventListener('close', () => { $('#overlay-link-value').value = ''; $('#overlay-link-notice').textContent = ''; });
  $('#credentials-form').addEventListener('submit', createApplicationSetupSubmitHandler({
    request, notice: $('#credentials-notice'), refresh, presentError: panelError,
  }));
  const connectWithTwitch = async () => {
    try { const result = await request('/api/setup/connect', { method: 'POST', body: '{}' }); window.location.assign(result.authorizationUrl); }
    catch (error) { $('#setup-notice').textContent = panelError(error); }
  };
  $('#connect-button').addEventListener('click', connectWithTwitch);
  $('#reconnect-button').addEventListener('click', connectWithTwitch);
  $('#reconcile-now').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    $('#reconciliation-notice').textContent = panelText('panel.reconciliation.running');
    try {
      const result = await request('/api/reconciliation', { method: 'POST', body: JSON.stringify({}) });
      $('#reconciliation-notice').textContent = result.status === 'complete'
        ? panelTextPlural('panel.reconciliation.complete', result.imported ?? 0)
        : panelTextPlural('panel.reconciliation.issues', result.issues?.length ?? 0);
      await refresh();
    } catch (error) {
      $('#reconciliation-notice').textContent = panelError(error);
    } finally { button.disabled = false; }
  });
  $('#queue-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    const aliases = String(values.get('aliases') || '').split(',').map((value) => value.trim()).filter(Boolean);
    const body = { title: values.get('title'), slug: values.get('slug'), aliases, cost: Number(values.get('cost')), rewardPrompt: values.get('rewardPrompt'), uidMode: values.get('uidMode'), callTimeoutMin: Number(values.get('callTimeoutMin')), maxRedemptionsPerStream: optionalLimit(values.get('maxRedemptionsPerStream')), maxRedemptionsPerUserPerStream: optionalLimit(values.get('maxRedemptionsPerUserPerStream')), globalCooldownSeconds: optionalLimit(values.get('globalCooldownSeconds')) };
    try { await request('/api/queues', { method: 'POST', body: JSON.stringify(body) }); $('#queue-notice').textContent = panelText('panel.notice.queue_created'); event.currentTarget.reset(); await refresh(); }
    catch (error) { $('#queue-notice').textContent = panelError(error); }
  });
  $('#queue-settings-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    const timeout = String(values.get('callTimeoutMin') ?? '').trim();
    const body = { expectedVersion: Number(values.get('expectedVersion')), callTimeoutMin: timeout ? Number(timeout) : null, callMessage: values.get('callMessage') };
    for (const name of ['showUidInList', 'showUidInOverlay', 'showUidOnCall', 'autoSwitchAccount', 'refundIfRemovedWhileCalled', 'refundOnNoShow', 'refundIfViewerLeavesCalled']) body[name] = values.get(name) === 'on';
    try {
      await request(`/api/queues/${values.get('queueId')}/settings`, { method: 'PATCH', body: JSON.stringify(body) });
      $('#queue-settings-dialog').close(); await refresh(); toast(panelText('panel.notice.queue_settings_saved'));
    } catch (error) { $('#queue-settings-notice').textContent = panelError(error); }
  });
  $('#reward-settings-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    const body = {
      expectedVersion: Number(values.get('expectedVersion')), title: values.get('title'), cost: Number(values.get('cost')),
      rewardPrompt: values.get('rewardPrompt'), uidMode: values.get('uidMode'),
      maxRedemptionsPerStream: optionalLimit(values.get('maxRedemptionsPerStream')),
      maxRedemptionsPerUserPerStream: optionalLimit(values.get('maxRedemptionsPerUserPerStream')),
      globalCooldownSeconds: optionalLimit(values.get('globalCooldownSeconds')),
    };
    try {
      await request(`/api/queues/${values.get('queueId')}/reward-settings`, { method: 'PATCH', body: JSON.stringify(body) });
      $('#reward-settings-dialog').close(); await refresh(); toast(panelText('panel.notice.reward_update_pending'));
    } catch (error) { $('#reward-settings-notice').textContent = panelError(error); }
  });
  $('#queue-list').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]'); if (!button) return;
    const { action: actionName, entryId, queueId } = button.dataset;
    try {
      if (actionName === 'add-entry') { $('#entry-form [name=queueId]').value = queueId; $('#entry-dialog').showModal(); return; }
      if (actionName === 'edit-settings') {
        const queue = state.queues.find((item) => item.id === queueId);
        if (!queue) return;
        const form = $('#queue-settings-form');
        form.elements.namedItem('queueId').value = queue.id;
        form.elements.namedItem('expectedVersion').value = String(queue.version);
        form.elements.namedItem('callTimeoutMin').value = queue.callTimeoutMin ?? '';
        form.elements.namedItem('callMessage').value = queue.callMessage ?? panelText('panel.queue_settings.call_message_default');
        for (const name of ['showUidInList', 'showUidInOverlay', 'showUidOnCall', 'autoSwitchAccount', 'refundIfRemovedWhileCalled', 'refundOnNoShow', 'refundIfViewerLeavesCalled']) form.elements.namedItem(name).checked = queue[name] === true;
        $('#queue-settings-notice').textContent = '';
        $('#queue-settings-dialog').showModal(); return;
      }
      if (actionName === 'edit-reward-settings') {
        const queue = state.queues.find((item) => item.id === queueId);
        if (!queue) return;
        const form = $('#reward-settings-form');
        for (const [name, value] of Object.entries({ queueId: queue.id, expectedVersion: queue.version, title: queue.title, cost: queue.cost, rewardPrompt: queue.rewardPrompt ?? '', uidMode: queue.uidMode, maxRedemptionsPerStream: queue.maxRedemptionsPerStream ?? '', maxRedemptionsPerUserPerStream: queue.maxRedemptionsPerUserPerStream ?? '', globalCooldownSeconds: queue.globalCooldownSeconds ?? '' })) form.elements.namedItem(name).value = String(value);
        $('#reward-settings-notice').textContent = '';
        $('#reward-settings-dialog').showModal(); return;
      }
      if (actionName === 'resend-call') {
        const result = await resendCallNotification({ request, refresh, entryId });
        toast(panelText(result.status === 'already_queued' ? 'panel.notice.call_already_queued' : 'panel.notice.call_resent'));
        return;
      }
      if (actionName === 'move-up' || actionName === 'move-down') {
        const queue = state.queues.find((item) => item.id === queueId);
        const entry = queue?.entries.find((item) => item.id === entryId);
        if (!entry) return;
        const lane = queue.entries.filter((item) => item.status === 'waiting' && (item.priorityClass ?? 'standard') === (entry.priorityClass ?? 'standard'));
        const position = lane.findIndex((item) => item.id === entryId) + 1 + (actionName === 'move-up' ? -1 : 1);
        await request(`/api/queues/${queueId}/move`, { method: 'POST', body: JSON.stringify({ entryId, position }) });
        await refresh(); return;
      }
      if (actionName === 'toggle-priority') {
        const queue = state.queues.find((item) => item.id === queueId);
        const entry = queue?.entries.find((item) => item.id === entryId);
        if (!entry) return;
        const priority = entry.priorityClass !== 'priority';
        let reason = entry.priorityReason;
        if (priority) {
          const selection = window.prompt(panelText('panel.priority.reason_prompt'), '3');
          if (selection === null) return;
          reason = ({ '1': 'subscription', '2': 'bits', '3': 'external_payment', '4': 'operator_override' })[selection.trim()];
          if (!reason) { toast(panelText('panel.priority.invalid_reason')); return; }
        }
        await request(`/api/entries/${entryId}/priority`, { method: 'POST', body: JSON.stringify({ priority, reason }) });
        toast(panelText(priority ? 'panel.priority.marked' : 'panel.priority.removed'));
        await refresh(); return;
      }
      if (actionName === 'archive-queue' || actionName === 'unarchive-queue') {
        const archiving = actionName === 'archive-queue';
        if (!window.confirm(panelText(archiving ? 'panel.queue.confirm.archive' : 'panel.queue.confirm.unarchive'))) return;
        const result = await request(`/api/queues/${queueId}/${archiving ? 'archive' : 'unarchive'}`, { method: 'POST', body: '{}' });
        toast(panelText(archiving ? (result.status === 'pending' ? 'panel.queue.archive.pending' : 'panel.queue.archive.done') : 'panel.queue.unarchive.done'));
        await refresh(); return;
      }
      if (actionName === 'delete-queue') {
        const queue = state.queues.find((item) => item.id === queueId);
        const activeCount = (queue?.entries ?? []).filter((entry) => ['waiting', 'called', 'in_progress'].includes(entry.status)).length;
        const accepted = window.confirm(panelText('panel.queue.confirm.delete', { title: queue?.title ?? '', count: activeCount }));
        if (!accepted) return;
        const result = await request(`/api/queues/${queueId}/delete`, { method: 'POST', body: JSON.stringify({ confirm: true }) });
        toast(panelText(result.status === 'pending' ? 'panel.queue.delete.pending' : 'panel.queue.delete.done'));
        await refresh(); return;
      }
      if (actionName === 'resolve-reward') {
        const candidates = await request(`/api/queues/${queueId}/reward-candidates`);
        if (!candidates.length) { toast(panelText('panel.reward.no_candidates')); return; }
        const form = $('#reward-form'); const select = form.elements.namedItem('rewardId');
        form.elements.namedItem('queueId').value = queueId; select.replaceChildren();
        for (const candidate of candidates) {
          const option = text('option', `${candidate.title} · ${candidate.cost} ${panelText('panel.queue.points')} · ${candidate.id}`);
          option.value = candidate.id; select.append(option);
        }
        $('#reward-notice').textContent = ''; $('#reward-dialog').showModal(); return;
      }
      if (actionName === 'clear-queue') {
        const preview = await request(`/api/queues/${queueId}/clear-preview`, { method: 'POST', body: '{}' });
        if (preview.status === 'empty') { toast(panelText('panel.queue.clear.empty')); return; }
        const queue = state.queues.find((item) => item.id === queueId);
        const accepted = window.confirm(panelText('panel.queue.clear.confirm', { title: queue?.title ?? '', count: preview.count, refunds: preview.refundsRequested }));
        if (!accepted) return;
        const result = await request(`/api/queues/${queueId}/clear-confirm`, { method: 'POST', body: '{}' });
        if (result.status === 'confirmation_required') toast(panelText('panel.queue.clear.changed', { count: result.count }));
        else toast(panelText('panel.queue.clear.done', { count: result.count, refunds: result.refundsRequested }));
        await refresh(); return;
      }
      if (actionName === 'call-next' || actionName === 'call-one') await request(`/api/queues/${queueId}/call`, { method: 'POST', body: JSON.stringify({ count: 1, entryId }) });
      else if (actionName === 'open-queue' || actionName === 'close-queue') await request(`/api/queues/${queueId}/open-state`, { method: 'POST', body: JSON.stringify({ isOpen: actionName === 'open-queue' }) });
      else await request(`/api/entries/${entryId}/transitions`, { method: 'POST', body: JSON.stringify({ to: actionName, reason: actionName === 'in_progress' ? 'service_started' : actionName === 'completed' ? 'service_completed' : 'operator_removed' }) });
      await refresh();
    } catch (error) { toast(panelError(error)); }
  });
  $('#entry-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    const priority = values.get('priority') === 'on';
    try { await request(`/api/queues/${values.get('queueId')}/manual-entries`, { method: 'POST', body: JSON.stringify({ login: values.get('login'), uid: values.get('uid') || undefined, priority, ...(priority ? { priorityReason: values.get('priorityReason') } : {}) }) }); $('#entry-dialog').close(); event.currentTarget.reset(); await refresh(); }
    catch (error) { $('#entry-notice').textContent = panelError(error); }
  });
  $('#reward-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    try {
      await request(`/api/queues/${values.get('queueId')}/resolve-reward`, { method: 'POST', body: JSON.stringify({ rewardId: values.get('rewardId') }) });
      $('#reward-dialog').close(); await refresh();
    } catch (error) { $('#reward-notice').textContent = panelError(error); }
  });
  $('#edit-account').addEventListener('click', async () => {
    const current = $('#account-label').textContent; const value = window.prompt(panelText('panel.account.prompt.current'), current);
    if (value === null) return;
    try { await request('/api/account', { method: 'POST', body: JSON.stringify({ label: value }) }); await refresh(); }
    catch (error) { toast(panelError(error)); }
  });
  $('#edit-default-account').addEventListener('click', async () => {
    const fallback = state.accountDefaultLabel ?? panelText('panel.settings.account_fallback');
    const value = window.prompt(panelText('panel.account.prompt.default'), fallback);
    if (value === null) return;
    try { await request('/api/account/default', { method: 'POST', body: JSON.stringify({ label: value }) }); await refresh(); }
    catch (error) { toast(panelError(error)); }
  });
  $('#product-locale-form').addEventListener('submit', saveProductLocale);
  $('#product-locale-quick-form').addEventListener('submit', saveProductLocale);
  document.querySelectorAll('#product-locale, #product-locale-quick').forEach((select) => select.addEventListener('change', renderProductLocalePicker));
  await refresh(); window.setInterval(refresh, 5000); window.setInterval(refreshLocalizationCatalogs, 30000);
}

boot().catch((error) => toast(panelError(error)));

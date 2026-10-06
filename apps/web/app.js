import { createApplicationSetupSubmitHandler } from './application-setup.mjs';
import { resendCallNotification } from './call-notification-actions.mjs';
import { twitchEligibilityMessage, twitchStatusLabel } from './setup-messages.mjs';
import { formatHealthStatus } from './health-status.mjs';
import { priorityBenefitLabel } from './priority-labels.mjs';
import { getInitialPanelPage, selectPanelPage } from './panel-navigation.mjs';
import { collectCommandPolicies, mergeCommandPolicyState, projectCommandCatalog } from './command-catalog-view.mjs';
import { buildOverlayWidgetPayload, countOverlayTextCodePoints } from './overlay-widget-form.mjs';

const $ = (selector) => document.querySelector(selector);
const optionalLimit = (value) => String(value ?? '').trim() ? Number(value) : null;
const state = { csrfToken: null, queues: [], productVersion: '—', initialPageSelected: false, twitchConnected: null };
const commandRoleLabels = { everyone: 'Todos', subscriber: 'Inscritos', vip: 'VIPs', moderator: 'Moderadores' };
let commandCatalog = null;
let overlayWidgetsLoaded = false;

const overlaySourceLabels = {
  account_label: 'Conta atual', queue_name: 'Nome da fila', queue_state: 'Estado da fila',
  queue_waiting_count: 'Pessoas aguardando', called_viewer_display_name: 'Pessoa chamada',
  called_viewer_position: 'Posição original da pessoa chamada', in_service_viewer_display_name: 'Pessoa em atendimento', fixed_text: 'Texto fixo',
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
  if (!response.ok) throw new Error(payload?.error || 'Não foi possível concluir a operação.');
  return payload;
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
  if (!entries.length) section.append(text('div', 'Ninguém no momento', 'entry-empty'));
  for (const entry of entries) {
    const row = document.createElement('div'); row.className = 'entry-row';
    if (entry.position) row.append(text('span', String(entry.position).padStart(2, '0'), 'position'));
    row.append(text('span', entry.displayName || `@${entry.userLogin}`));
    if (group === 'waiting' && entry.priorityClass === 'priority') row.append(text('small', `Prioritária · conferida pelo operador (${priorityBenefitLabel(entry.priorityReason)})`, 'priority-badge'));
    if (queue.uidMode === 'visible' && entry.uid && (group === 'waiting' ? queue.showUidInList : queue.showUidOnCall)) row.append(text('small', `UID ${entry.uid}`));
    const buttons = document.createElement('span'); buttons.className = 'entry-buttons';
    if (group === 'waiting') {
      buttons.append(action('chamar', 'call-one', entry.id, queue.id));
      const lane = (queue.entries ?? []).filter((item) => item.status === 'waiting' && (item.priorityClass ?? 'standard') === (entry.priorityClass ?? 'standard'));
      const lanePosition = lane.findIndex((item) => item.id === entry.id) + 1;
      const moveUp = action('Mover ↑', 'move-up', entry.id, queue.id); moveUp.disabled = lanePosition <= 1; buttons.append(moveUp);
      const moveDown = action('Mover ↓', 'move-down', entry.id, queue.id); moveDown.disabled = lanePosition >= lane.length; buttons.append(moveDown);
      buttons.append(action(entry.priorityClass === 'priority' ? 'Remover prioridade' : 'Marcar prioritária', 'toggle-priority', entry.id, queue.id));
    }
    if (group === 'called') buttons.append(action('atender', 'in_progress', entry.id, queue.id), action('concluir', 'completed', entry.id, queue.id), action('Reenviar chamada', 'resend-call', entry.id, queue.id));
    if (group === 'in_progress') buttons.append(action('concluir', 'completed', entry.id, queue.id));
    buttons.append(action('remover', 'removed', entry.id, queue.id)); row.append(buttons); section.append(row);
  }
  return section;
}

function renderQueues(queues) {
  const container = $('#queue-list'); container.replaceChildren();
  if (!queues.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state'; empty.append(text('span', '◌'), text('strong', 'Nenhuma fila criada'), text('small', 'Use o formulário acima para criar sua primeira fila.'));
    container.append(empty); return;
  }
  for (const queue of queues) {
    const card = document.createElement('article'); card.className = 'queue-card';
    const head = document.createElement('div'); head.className = 'queue-card-head';
    head.append(text('span', queue.title?.slice(0, 1)?.toUpperCase() || 'Q', 'queue-symbol'));
    const meta = document.createElement('div'); meta.className = 'queue-meta'; meta.append(text('strong', queue.title)); meta.append(text('small', `!${queue.slug} · ${Number(queue.cost).toLocaleString('pt-BR')} pontos · ${queue.isOpen ? 'ABERTA' : 'FECHADA'} · ${queue.remoteSyncStatus || 'sem sincronização'}`)); head.append(meta);
    const active = queue.entries || [];
    const controls = document.createElement('div'); controls.className = 'queue-actions';
    if (queue.lifecycleStatus === 'deleting') {
      controls.append(text('span', 'Exclusão pendente: aguardando confirmação dos cancelamentos e da recompensa.', 'muted'));
    } else {
      controls.append(action('Excluir fila', 'delete-queue', '', queue.id));
      controls.append(action('Configurar', 'edit-settings', '', queue.id));
      if (['synced', 'synced_manual'].includes(queue.remoteSyncStatus)) controls.append(action('Editar recompensa', 'edit-reward-settings', '', queue.id));
    }
    if (queue.lifecycleStatus === 'deleting') {
      // Queue mutation controls stay disabled while the durable deletion workflow is pending.
    } else if (queue.isArchived) {
      controls.append(action('Desarquivar', 'unarchive-queue', '', queue.id));
      if (active.some((entry) => entry.status === 'waiting')) controls.append(action('Próximo', 'call-next', '', queue.id));
      controls.append(action('Limpar fila', 'clear-queue', '', queue.id));
    } else {
      controls.append(action('Adicionar', 'add-entry', '', queue.id), action('Próximo', 'call-next', '', queue.id));
      if (['synced', 'synced_manual'].includes(queue.remoteSyncStatus)) controls.append(action(queue.isOpen ? 'Fechar' : 'Abrir', queue.isOpen ? 'close-queue' : 'open-queue', '', queue.id), action('Arquivar', 'archive-queue', '', queue.id));
      controls.append(action('Limpar fila', 'clear-queue', '', queue.id));
    }
    if (queue.remoteSyncStatus === 'create_unknown') controls.append(action('Vincular recompensa', 'resolve-reward', '', queue.id));
    head.append(controls); card.append(head);
    card.append(renderEntryGroup('Aguardando', active.filter((entry) => entry.status === 'waiting'), queue, 'waiting'));
    card.append(renderEntryGroup('Chamados', active.filter((entry) => entry.status === 'called'), queue, 'called'));
    card.append(renderEntryGroup('Em atendimento', active.filter((entry) => entry.status === 'in_progress'), queue, 'in_progress'));
    const history = document.createElement('details'); history.className = 'queue-history';
    history.append(text('summary', 'Histórico recente'));
    const historyContent = document.createElement('div'); historyContent.className = 'history-content';
    history.addEventListener('toggle', async () => {
      if (!history.open || history.dataset.loaded === 'true') return;
      try {
        const entries = await request(`/api/queues/${queue.id}/history`);
        historyContent.replaceChildren();
        if (!entries.length) historyContent.append(text('p', 'Ainda não há atendimentos encerrados.', 'muted'));
        for (const entry of entries) {
          const date = entry.finishedAt ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.finishedAt)) : 'Data indisponível';
          const status = { completed: 'Concluído', removed: 'Removido', no_show: 'Ausente' }[entry.status] ?? 'Encerrado';
          historyContent.append(text('p', `${entry.displayName || `@${entry.userLogin}`} · ${status} · ${date}`, 'history-entry'));
        }
        history.dataset.loaded = 'true';
      } catch (error) { historyContent.replaceChildren(text('p', error.message, 'muted')); }
    });
    history.append(historyContent); card.append(history);
    container.append(card);
  }
}

function renderCommandCatalog(catalog) {
  const container = $('#command-catalog'); container.replaceChildren();
  if (!catalog?.commands?.length) { container.append(text('p', 'O catálogo ainda não está disponível.', 'muted')); return; }
  commandCatalog = catalog;
  for (const command of projectCommandCatalog(catalog)) {
    const card = document.createElement('article'); card.className = 'command-policy-card';
    const description = document.createElement('div');
    description.append(text('h2', command.description));
    description.append(text('code', command.syntax, 'command-policy-syntax'));
    const roles = document.createElement('fieldset'); roles.className = 'command-policy-roles';
    roles.setAttribute('aria-label', `Cargos de ${command.syntax}`);
    const selected = new Set(command.roles);
    for (const role of catalog.configurableRoles) {
      const label = document.createElement('label');
      if (command.locked) label.classList.add('locked-role');
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = role;
      checkbox.checked = selected.has(role); checkbox.disabled = command.locked;
      label.append(checkbox, document.createTextNode(commandRoleLabels[role] ?? role)); roles.append(label);
    }
    const status = text('p', command.locked ? `Acesso fixo: ${(command.immutableRoles ?? command.roles).map((role) => role === 'streamer' ? 'streamer' : commandRoleLabels[role] ?? role).join(' e ')}.` : 'Qualquer cargo marcado pode usar este comando.', 'muted');
    description.append(status); card.append(description, roles); card.dataset.commandKey = command.key; container.append(card);
  }
}

async function loadCommandCatalog() {
  try {
    commandCatalog = await request('/api/command-catalog');
    renderCommandCatalog(commandCatalog);
    $('#command-catalog-notice').textContent = '';
  } catch (error) { $('#command-catalog').replaceChildren(text('p', error.message, 'muted')); }
}

async function saveCommandPolicies(event) {
  event.preventDefault();
  if (!commandCatalog) return;
  const policies = collectCommandPolicies(commandCatalog.commands, [...$('#command-catalog').children]);
  try {
    const result = await request('/api/command-policies', { method: 'PATCH', body: JSON.stringify({ expectedVersion: commandCatalog.version, policies }) });
    commandCatalog = mergeCommandPolicyState(commandCatalog, result);
    renderCommandCatalog(commandCatalog);
    $('#command-catalog-notice').textContent = 'Permissões dos comandos atualizadas.';
  } catch (error) { $('#command-catalog-notice').textContent = error.message; }
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
  const sample = sourceType === 'fixed_text' ? fixedText || 'Exemplo do widget'
    : sourceType === 'queue_waiting_count' ? '4 aguardando'
      : sourceType === 'queue_state' ? 'Aberta' : sourceType === 'account_label' ? 'Asia 1'
        : sourceType.includes('called') ? 'Viewer chamado' : sourceType.includes('in_service') ? 'Viewer em atendimento'
          : String($('#overlay-queue-field select')?.selectedOptions?.[0]?.textContent ?? 'Nome da fila');
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
  const placeholder = document.createElement('option'); placeholder.textContent = 'Selecione uma fila'; placeholder.value = '';
  select.replaceChildren(placeholder);
  for (const queue of state.queues.filter((item) => (item.id === selectedId || !item.isArchived) && item.lifecycleStatus !== 'deleting' && item.lifecycleStatus !== 'deleted')) {
    const option = document.createElement('option'); option.textContent = queue.title; option.value = queue.id; select.append(option);
  }
  select.value = selectedId;
}

function showOneTimeOverlayLink(url) {
  $('#overlay-link-value').value = url;
  $('#overlay-link-notice').textContent = 'Copie agora. O link não será exibido novamente.';
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
    empty.append(text('span', '◌'), text('strong', 'Nenhum widget criado'), text('small', 'Crie uma fonte com um único dado da sua live para adicionar ao OBS.'));
    const create = overlayAction('Criar primeiro widget', () => openOverlayEditor()); create.classList.add('button-primary'); empty.append(create); container.append(empty); return;
  }
  for (const widget of widgets) {
    const card = document.createElement('article'); card.className = 'overlay-widget-card';
    const heading = document.createElement('div'); heading.className = 'overlay-widget-heading';
    const title = text('h3', overlaySourceLabels[widget.sourceType] ?? 'Widget');
    const queue = state.queues.find((item) => item.id === widget.queueId);
    const status = widget.deleted ? 'Widget indisponível' : widget.capabilityActive ? 'Link ativo' : 'Revogado';
    heading.append(title, text('span', status, widget.capabilityActive ? 'status-pill status-connected' : 'status-pill'));
    const details = text('p', `${queue ? `${queue.title} · ` : ''}${widget.style?.width ?? 'auto'} × ${widget.style?.height ?? 'auto'} · Widget ${widget.id.slice(0, 8)}`, 'muted');
    const preview = text('p', widget.sourceType === 'fixed_text' ? widget.fixedText : widget.fallbackText || 'Prévia simulada', 'overlay-card-preview');
    const actions = document.createElement('div'); actions.className = 'overlay-widget-actions';
    actions.append(overlayAction('Editar', () => openOverlayEditor(widget)));
    if (widget.capabilityActive) {
      actions.append(overlayAction('Regenerar link', async () => {
        if (!window.confirm('O link atual deixará de funcionar. Gerar um novo link agora?')) return;
        try { const result = await request(`/api/overlay-widgets/${widget.id}/regenerate`, { method: 'POST', body: JSON.stringify({ expectedVersion: widget.version }) }); showOneTimeOverlayLink(result.capabilityUrl); await loadOverlayWidgets(); }
        catch (error) { toast(error.message); }
      }));
      actions.append(overlayAction('Revogar', async () => {
        if (!window.confirm('A fonte do OBS deixará de receber dados. Revogar este link?')) return;
        try { await request(`/api/overlay-widgets/${widget.id}/revoke`, { method: 'POST', body: JSON.stringify({ expectedVersion: widget.version }) }); await loadOverlayWidgets(); }
        catch (error) { toast(error.message); }
      }, true));
    } else if (!widget.deleted) {
      actions.append(overlayAction('Gerar link', async () => {
        try { const result = await request(`/api/overlay-widgets/${widget.id}/regenerate`, { method: 'POST', body: JSON.stringify({ expectedVersion: widget.version }) }); showOneTimeOverlayLink(result.capabilityUrl); await loadOverlayWidgets(); }
        catch (error) { toast(error.message); }
      }));
    }
    actions.append(overlayAction('Excluir', async () => {
      if (!window.confirm('Excluir este widget? A URL atual será invalidada e não poderá ser recuperada.')) return;
      try { await request(`/api/overlay-widgets/${widget.id}`, { method: 'DELETE', body: JSON.stringify({ expectedVersion: widget.version }) }); await loadOverlayWidgets(); }
      catch (error) { toast(error.message); }
    }, true));
    card.append(heading, details, preview, actions); container.append(card);
  }
}

async function loadOverlayWidgets() {
  try { const widgets = await request('/api/overlay-widgets'); renderOverlayWidgets(widgets); overlayWidgetsLoaded = true; }
  catch (error) { $('#overlay-widget-list').replaceChildren(text('p', error.message, 'muted')); }
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
  $('#overlay-editor-title').textContent = widget ? 'Editar widget' : 'Criar widget';
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
  catch (error) { $('#overlay-editor-notice').textContent = error.message; return; }
  const id = String(new FormData(form).get('id') ?? '');
  try {
    const result = id
      ? await request(`/api/overlay-widgets/${id}`, { method: 'PATCH', body: JSON.stringify({ expectedVersion: Number(new FormData(form).get('version')), changes: payload }) })
      : await request('/api/overlay-widgets', { method: 'POST', body: JSON.stringify(payload) });
    $('#overlay-editor-dialog').close();
    if (result.capabilityUrl) showOneTimeOverlayLink(result.capabilityUrl);
    await loadOverlayWidgets();
  } catch (error) { $('#overlay-editor-notice').textContent = error.message; }
}

async function copyOverlayLink() {
  const input = /** @type {HTMLInputElement} */ ($('#overlay-link-value'));
  try { await window.navigator.clipboard.writeText(input.value); $('#overlay-link-notice').textContent = 'Link copiado.'; }
  catch { input.select(); $('#overlay-link-notice').textContent = 'Selecione e copie o link. Ele não será exibido novamente ao fechar.'; }
}

async function refresh() {
  try {
    const [apiState, setup, health] = await Promise.all([
      request('/api/state'), request('/api/setup'),
      request('/health').catch(() => ({ status: 'unavailable', dependencies: { database: 'unavailable', twitch_api: 'unknown', twitch_api_ping_ms: null } })),
    ]);
    const healthStatus = formatHealthStatus(health);
    $('#database-health').textContent = healthStatus.database;
    $('#twitch-api-health').textContent = healthStatus.twitch;
    $('#twitch-api-ping').textContent = healthStatus.ping;
    state.productVersion = apiState.product_version; $('#runtime-version').textContent = apiState.product_version;
    $('#account-label').textContent = apiState.account?.label ?? 'Streamer';
    state.accountDefaultLabel = apiState.account?.defaultLabel ?? 'Streamer';
    $('#edit-default-account').title = `Padrão atual: ${state.accountDefaultLabel}`;
    $('#callback-url').textContent = setup.callbackUrl;
    $('#channel-name').textContent = setup.connected ? `Canal conectado · ${setup.broadcasterId}` : 'Twitch ainda não conectada';
    $('#twitch-status').textContent = twitchEligibilityMessage(setup);
    $('#twitch-pill').textContent = twitchStatusLabel(setup); $('#twitch-pill').dataset.state = setup.connected ? 'connected' : setup.status === 'ineligible' ? 'ineligible' : 'inactive';
    $('#secret-state').textContent = setup.secretConfigured ? 'Secret configurado. Para substituir, informe um novo Secret e valide antes de salvar.' : 'O Secret fica guardado localmente e nunca será exibido novamente.';
    $('#connection-wizard').hidden = setup.connected === true;
    $('#connection-summary').hidden = setup.connected !== true;
    $('#connected-channel-name').textContent = setup.connected ? `Canal conectado · ${setup.broadcasterId}` : 'Canal desconectado';
    $('#connection-pill').textContent = setup.connected ? 'CONECTADA' : 'RECONEXÃO';
    $('#connection-status-copy').textContent = twitchEligibilityMessage(setup);
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
    if (!operations.length) operationList.append(text('p', 'Nenhuma operação pendente.', 'muted'));
    for (const operation of operations) {
      const row = document.createElement('div'); row.className = 'operation-row'; row.dataset.status = operation.status;
      row.append(text('strong', operation.type === 'redemption.cancel' ? 'REEMBOLSO' : operation.type === 'redemption.fulfill' ? 'CONSUMO' : operation.type === 'reward.update' ? 'ATUALIZAÇÃO DE RECOMPENSA' : 'EXCLUSÃO DE FILA'));
      const statusLabel = operation.status === 'resolved_manual' ? 'resolvido manualmente · Twitch não confirmou' : operation.status;
      row.append(text('small', `${operation.redemptionId ?? operation.entityId ?? ''} · ${statusLabel} · ${operation.attempts} tentativas${operation.lastError ? ` · ${operation.lastError}` : ''}`));
      if (operation.status === 'unknown' && operation.type.startsWith('redemption.')) {
        const button = text('button', 'Registrar resolução manual'); button.type = 'button';
        button.addEventListener('click', async () => {
          const accepted = window.confirm('O estado dos pontos não pôde ser confirmado pela Twitch. Registrar que você revisou e encerrou o acompanhamento automático? Isso não confirma reembolso nem consumo e não haverá novas tentativas automáticas.');
          if (!accepted) return;
          try { await request(`/api/operations/${operation.id}/resolve-unknown`, { method: 'POST', body: '{}' }); await refresh(); }
          catch (error) { toast(error.message); }
        });
        row.append(button);
      }
      if (['unknown', 'conflict', 'failed'].includes(operation.status)) {
        const button = text('button', 'Reconciliar / tentar novamente'); button.type = 'button';
        button.addEventListener('click', async () => { try { await request(`/api/operations/${operation.id}/retry`, { method: 'POST', body: '{}' }); await refresh(); } catch (error) { toast(error.message); } });
        row.append(button);
      }
      operationList.append(row);
    }
    $('#last-refresh').textContent = `Atualizado ${new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date())}`;
  } catch (error) { toast(error.message); }
}

async function boot() {
  const session = await request('/api/session'); state.csrfToken = session.csrfToken;
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
    request, notice: $('#credentials-notice'), refresh,
  }));
  const connectWithTwitch = async () => {
    try { const result = await request('/api/setup/connect', { method: 'POST', body: '{}' }); window.location.assign(result.authorizationUrl); }
    catch (error) { $('#setup-notice').textContent = error.message; }
  };
  $('#connect-button').addEventListener('click', connectWithTwitch);
  $('#reconnect-button').addEventListener('click', connectWithTwitch);
  $('#reconcile-now').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    $('#reconciliation-notice').textContent = 'Sincronização em andamento…';
    try {
      const result = await request('/api/reconciliation', { method: 'POST', body: JSON.stringify({}) });
      $('#reconciliation-notice').textContent = result.status === 'complete'
        ? `Sincronização concluída. ${result.imported ?? 0} resgate(s) importado(s).`
        : `Sincronização concluída com pendências: ${result.issues?.length ?? 0}. Revise os avisos e operações.`;
      await refresh();
    } catch (error) {
      $('#reconciliation-notice').textContent = error.message;
    } finally { button.disabled = false; }
  });
  $('#queue-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    const aliases = String(values.get('aliases') || '').split(',').map((value) => value.trim()).filter(Boolean);
    const body = { title: values.get('title'), slug: values.get('slug'), aliases, cost: Number(values.get('cost')), rewardPrompt: values.get('rewardPrompt'), uidMode: values.get('uidMode'), callTimeoutMin: Number(values.get('callTimeoutMin')), maxRedemptionsPerStream: optionalLimit(values.get('maxRedemptionsPerStream')), maxRedemptionsPerUserPerStream: optionalLimit(values.get('maxRedemptionsPerUserPerStream')), globalCooldownSeconds: optionalLimit(values.get('globalCooldownSeconds')) };
    try { await request('/api/queues', { method: 'POST', body: JSON.stringify(body) }); $('#queue-notice').textContent = 'Fila salva. A criação da recompensa Twitch está pendente; acompanhe o estado abaixo.'; event.currentTarget.reset(); await refresh(); }
    catch (error) { $('#queue-notice').textContent = error.message; }
  });
  $('#queue-settings-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    const timeout = String(values.get('callTimeoutMin') ?? '').trim();
    const body = { expectedVersion: Number(values.get('expectedVersion')), callTimeoutMin: timeout ? Number(timeout) : null, callMessage: values.get('callMessage') };
    for (const name of ['showUidInList', 'showUidInOverlay', 'showUidOnCall', 'autoSwitchAccount', 'refundIfRemovedWhileCalled', 'refundOnNoShow', 'refundIfViewerLeavesCalled']) body[name] = values.get(name) === 'on';
    try {
      await request(`/api/queues/${values.get('queueId')}/settings`, { method: 'PATCH', body: JSON.stringify(body) });
      $('#queue-settings-dialog').close(); await refresh(); toast('Configurações da fila salvas.');
    } catch (error) { $('#queue-settings-notice').textContent = error.message; }
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
      $('#reward-settings-dialog').close(); await refresh(); toast('Alteração solicitada. A fila mostrará “pending_update” até a confirmação da Twitch.');
    } catch (error) { $('#reward-settings-notice').textContent = error.message; }
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
        form.elements.namedItem('callMessage').value = queue.callMessage ?? '{user}, sua vez!';
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
        toast(result.status === 'already_queued' ? 'A chamada já está na fila de envio.' : 'Reenvio solicitado. O prazo de ausência foi mantido.');
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
          const selection = window.prompt('Selecione o benefício conferido: 1 inscrição, 2 Bits, 3 pagamento externo (ex.: PIX), 4 outro.', '3');
          if (selection === null) return;
          reason = ({ '1': 'subscription', '2': 'bits', '3': 'external_payment', '4': 'operator_override' })[selection.trim()];
          if (!reason) { toast('Selecione uma opção de 1 a 4.'); return; }
        }
        await request(`/api/entries/${entryId}/priority`, { method: 'POST', body: JSON.stringify({ priority, reason }) });
        toast(priority ? 'Prioridade registrada e auditada. A conferência foi feita pelo operador.' : 'Prioridade removida.');
        await refresh(); return;
      }
      if (actionName === 'archive-queue' || actionName === 'unarchive-queue') {
        const archiving = actionName === 'archive-queue';
        if (!window.confirm(archiving ? 'Arquivar esta fila? Ela deixará de aparecer em !filas, mas as entradas existentes serão preservadas. A recompensa será pausada.' : 'Desarquivar esta fila? Ela continuará fechada até você abri-la.')) return;
        const result = await request(`/api/queues/${queueId}/${archiving ? 'archive' : 'unarchive'}`, { method: 'POST', body: '{}' });
        toast(archiving && result.status === 'pending' ? 'Arquivamento solicitado; aguardando confirmação da Twitch.' : archiving ? 'Fila arquivada.' : 'Fila desarquivada e continua fechada.');
        await refresh(); return;
      }
      if (actionName === 'delete-queue') {
        const queue = state.queues.find((item) => item.id === queueId);
        const activeCount = (queue?.entries ?? []).filter((entry) => ['waiting', 'called', 'in_progress'].includes(entry.status)).length;
        const accepted = window.confirm(`Excluir a fila “${queue?.title ?? ''}” e sua recompensa Twitch? ${activeCount} entradas ativas serão removidas e seus resgates terão cancelamento solicitado. A recompensa só será excluída depois da confirmação de todos os cancelamentos. A operação pode permanecer pendente se a Twitch não confirmar.`);
        if (!accepted) return;
        const result = await request(`/api/queues/${queueId}/delete`, { method: 'POST', body: JSON.stringify({ confirm: true }) });
        toast(result.status === 'pending' ? 'Exclusão iniciada. A fila ficará pendente até a Twitch confirmar os cancelamentos e a exclusão da recompensa.' : 'A exclusão já estava concluída.');
        await refresh(); return;
      }
      if (actionName === 'resolve-reward') {
        const candidates = await request(`/api/queues/${queueId}/reward-candidates`);
        if (!candidates.length) { toast('Nenhuma recompensa Twitch compatível foi encontrada. Revise a fila e as recompensas gerenciáveis no console Twitch.'); return; }
        const form = $('#reward-form'); const select = form.elements.namedItem('rewardId');
        form.elements.namedItem('queueId').value = queueId; select.replaceChildren();
        for (const candidate of candidates) {
          const option = text('option', `${candidate.title} · ${candidate.cost} pontos · ${candidate.id}`);
          option.value = candidate.id; select.append(option);
        }
        $('#reward-notice').textContent = ''; $('#reward-dialog').showModal(); return;
      }
      if (actionName === 'clear-queue') {
        const preview = await request(`/api/queues/${queueId}/clear-preview`, { method: 'POST', body: '{}' });
        if (preview.status === 'empty') { toast('A fila já está vazia.'); return; }
        const queue = state.queues.find((item) => item.id === queueId);
        const accepted = window.confirm(`Limpar a fila ${queue?.title ?? ''}? ${preview.count} pessoas serão removidas e ${preview.refundsRequested} reembolsos serão solicitados. Confirmação válida por 15 segundos.`);
        if (!accepted) return;
        const result = await request(`/api/queues/${queueId}/clear-confirm`, { method: 'POST', body: '{}' });
        if (result.status === 'confirmation_required') toast(`A fila mudou. Revise a nova confirmação para ${result.count} pessoas.`);
        else toast(`${result.count} pessoas removidas; ${result.refundsRequested} reembolsos solicitados.`);
        await refresh(); return;
      }
      if (actionName === 'call-next' || actionName === 'call-one') await request(`/api/queues/${queueId}/call`, { method: 'POST', body: JSON.stringify({ count: 1, entryId }) });
      else if (actionName === 'open-queue' || actionName === 'close-queue') await request(`/api/queues/${queueId}/open-state`, { method: 'POST', body: JSON.stringify({ isOpen: actionName === 'open-queue' }) });
      else await request(`/api/entries/${entryId}/transitions`, { method: 'POST', body: JSON.stringify({ to: actionName, reason: actionName === 'in_progress' ? 'service_started' : actionName === 'completed' ? 'service_completed' : 'operator_removed' }) });
      await refresh();
    } catch (error) { toast(error.message); }
  });
  $('#entry-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    const priority = values.get('priority') === 'on';
    try { await request(`/api/queues/${values.get('queueId')}/manual-entries`, { method: 'POST', body: JSON.stringify({ login: values.get('login'), uid: values.get('uid') || undefined, priority, ...(priority ? { priorityReason: values.get('priorityReason') } : {}) }) }); $('#entry-dialog').close(); event.currentTarget.reset(); await refresh(); }
    catch (error) { $('#entry-notice').textContent = error.message; }
  });
  $('#reward-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    try {
      await request(`/api/queues/${values.get('queueId')}/resolve-reward`, { method: 'POST', body: JSON.stringify({ rewardId: values.get('rewardId') }) });
      $('#reward-dialog').close(); await refresh();
    } catch (error) { $('#reward-notice').textContent = error.message; }
  });
  $('#edit-account').addEventListener('click', async () => {
    const current = $('#account-label').textContent; const value = window.prompt('Nome da conta atual na live (até 60 caracteres):', current);
    if (value === null) return;
    try { await request('/api/account', { method: 'POST', body: JSON.stringify({ label: value }) }); await refresh(); }
    catch (error) { toast(error.message); }
  });
  $('#edit-default-account').addEventListener('click', async () => {
    const fallback = state.accountDefaultLabel ?? 'Streamer';
    const value = window.prompt('Nome padrão da conta (até 60 caracteres):', fallback);
    if (value === null) return;
    try { await request('/api/account/default', { method: 'POST', body: JSON.stringify({ label: value }) }); await refresh(); }
    catch (error) { toast(error.message); }
  });
  await refresh(); window.setInterval(refresh, 5000);
}

boot().catch((error) => toast(error.message));

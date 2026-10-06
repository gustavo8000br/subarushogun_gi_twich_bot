import { createApplicationSetupSubmitHandler } from './application-setup.mjs';
import { resendCallNotification } from './call-notification-actions.mjs';
import { twitchEligibilityMessage, twitchStatusLabel } from './setup-messages.mjs';

const $ = (selector) => document.querySelector(selector);
const state = { csrfToken: null, queues: [], productVersion: '—' };

async function request(url, options = {}) {
  const headers = { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.method && options.method !== 'GET' ? { 'x-csrf-token': state.csrfToken } : {}), ...options.headers };
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
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
    if (queue.uidMode === 'visible' && entry.uid && (group === 'waiting' ? queue.showUidInList : queue.showUidOnCall)) row.append(text('small', `UID ${entry.uid}`));
    const buttons = document.createElement('span'); buttons.className = 'entry-buttons';
    if (group === 'waiting') buttons.append(action('chamar', 'call-one', entry.id, queue.id));
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
    container.append(card);
  }
}

async function refresh() {
  try {
    const [apiState, setup] = await Promise.all([request('/api/state'), request('/api/setup')]);
    state.productVersion = apiState.product_version; $('#runtime-version').textContent = apiState.product_version;
    $('#account-label').textContent = apiState.account?.label ?? 'Streamer';
    state.accountDefaultLabel = apiState.account?.defaultLabel ?? 'Streamer';
    $('#edit-default-account').title = `Padrão atual: ${state.accountDefaultLabel}`;
    $('#callback-url').textContent = setup.callbackUrl;
    $('#channel-name').textContent = setup.connected ? `Canal conectado · ${setup.broadcasterId}` : 'Twitch ainda não conectada';
    $('#twitch-status').textContent = twitchEligibilityMessage(setup);
    $('#twitch-pill').textContent = twitchStatusLabel(setup); $('#twitch-pill').dataset.state = setup.connected ? 'connected' : setup.status === 'ineligible' ? 'ineligible' : 'inactive';
    $('#secret-state').textContent = setup.secretConfigured ? 'Secret configurado. Para substituir, informe um novo Secret e valide antes de salvar.' : 'O Secret fica guardado localmente e nunca será exibido novamente.';
    if (setup.clientId) $('#credentials-form [name=clientId]').value = setup.clientId;
    $('#connect-button').disabled = !setup.secretConfigured;
    state.queues = await request('/api/queues'); renderQueues(state.queues);
    const operations = await request('/api/operations');
    const operationList = $('#operation-list'); operationList.replaceChildren();
    if (!operations.length) operationList.append(text('p', 'Nenhuma operação pendente.', 'muted'));
    for (const operation of operations) {
      const row = document.createElement('div'); row.className = 'operation-row'; row.dataset.status = operation.status;
      row.append(text('strong', operation.type === 'redemption.cancel' ? 'REEMBOLSO' : operation.type === 'redemption.fulfill' ? 'CONSUMO' : 'EXCLUSÃO DE FILA'));
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
  $('#credentials-form').addEventListener('submit', createApplicationSetupSubmitHandler({
    request, notice: $('#setup-notice'), refresh,
  }));
  $('#connect-button').addEventListener('click', async () => {
    try { const result = await request('/api/setup/connect', { method: 'POST', body: '{}' }); window.location.assign(result.authorizationUrl); }
    catch (error) { $('#setup-notice').textContent = error.message; }
  });
  $('#queue-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    const aliases = String(values.get('aliases') || '').split(',').map((value) => value.trim()).filter(Boolean);
    const body = { title: values.get('title'), slug: values.get('slug'), aliases, cost: Number(values.get('cost')), rewardPrompt: values.get('rewardPrompt'), uidMode: values.get('uidMode'), callTimeoutMin: Number(values.get('callTimeoutMin')) };
    try { await request('/api/queues', { method: 'POST', body: JSON.stringify(body) }); $('#queue-notice').textContent = 'Fila salva. A criação da recompensa Twitch está pendente; acompanhe o estado abaixo.'; event.currentTarget.reset(); await refresh(); }
    catch (error) { $('#queue-notice').textContent = error.message; }
  });
  $('#queue-list').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]'); if (!button) return;
    const { action: actionName, entryId, queueId } = button.dataset;
    try {
      if (actionName === 'add-entry') { $('#entry-form [name=queueId]').value = queueId; $('#entry-dialog').showModal(); return; }
      if (actionName === 'resend-call') {
        const result = await resendCallNotification({ request, refresh, entryId });
        toast(result.status === 'already_queued' ? 'A chamada já está na fila de envio.' : 'Reenvio solicitado. O prazo de ausência foi mantido.');
        return;
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
    try { await request(`/api/queues/${values.get('queueId')}/manual-entries`, { method: 'POST', body: JSON.stringify({ login: values.get('login'), uid: values.get('uid') || undefined }) }); $('#entry-dialog').close(); event.currentTarget.reset(); await refresh(); }
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

import { authorizeCommand } from './authorization.mjs';
import { parseChatCommand } from './parser.mjs';
import { getCommandDefinition } from './catalog.mjs';
import { renderGlobalCommandHelp, renderPingResponse, renderQueueCommandHelp } from './help.mjs';
import { translateCatalog, translatePluralCatalog } from '../../../shared/browser/translate-catalog.mjs';

const seenMessages = new Map();
const cooldowns = new Map();
const cooldownMs = 5_000;
const CHAT_FALLBACKS = Object.freeze({
  'chat.command.root': 'fila',
  'chat.command.global.commands': 'comandos',
  'chat.command.global.ping': 'ping',
  'chat.command.global.queues': 'filas',
  'chat.command.global.account': 'conta',
  'chat.command.global.account_reset': 'reset',
  'chat.command.queue.lista': 'lista',
  'chat.command.queue.comandos': 'comandos',
  'chat.command.queue.posicao': 'posicao',
  'chat.command.queue.sair': 'sair',
  'chat.command.queue.add': 'add',
  'chat.command.queue.remover': 'remover',
  'chat.command.queue.proximo': 'proximo',
  'chat.command.queue.atender': 'atender',
  'chat.command.queue.concluir': 'concluir',
  'chat.command.queue.mover': 'mover',
  'chat.command.queue.abrir': 'abrir',
  'chat.command.queue.fechar': 'fechar',
  'chat.command.queue.limpar': 'limpar',
  'chat.command.queue.confirmar': 'confirmar',
  'chat.syntax.user': 'usuário',
  'chat.syntax.position': 'posição',
  'chat.syntax.name': '<nome>',
  'chat.syntax.queue': '<fila>',
  'chat.help.streamer': 'Streamer, consulte o catálogo completo e configure os comandos na página “Comandos” do painel local.',
  'chat.help.none': 'Não há comandos disponíveis para seu cargo. Consulte o streamer.',
  'chat.help.global_heading': 'Gerais',
  'chat.help.queue_heading': 'Em cada fila',
  'chat.help.panel_suffix': 'Catálogo completo no painel.',
  'chat.help.queue_none': 'Não há comandos disponíveis para seu cargo nesta fila.',
  'chat.help.queue_for': 'Comandos de',
  'chat.queues.title': 'Filas disponíveis',
  'chat.queues.empty': 'Não há filas disponíveis no momento.',
  'chat.queues.closed': 'fechada',
  'chat.account.current': 'Conta atual: {label}.',
  'chat.account.invalid_label': 'Use um nome de conta com até 60 caracteres e sem quebras de linha.',
  'chat.ping.unavailable': 'latência indisponível',
  'chat.ping.response': 'Pong 🏓 Bot ativo · {version} · Twitch: {latency}',
  'chat.queue.position': '@{user}, você está na posição {position}.',
  'chat.queue.viewer_called': '@{user}, você foi chamado.',
  'chat.queue.viewer_in_progress': '@{user}, você está em atendimento.',
  'chat.queue.state.open': 'aberta',
  'chat.queue.state.closed': 'fechada',
  'chat.queue.state.pending_open': 'abertura pendente',
  'chat.queue.state.pending_close': 'fechamento pendente',
  'chat.queue.state.open_unknown': 'abertura sem confirmação',
  'chat.queue.state.close_unknown': 'fechamento sem confirmação',
  'chat.queue.state.unavailable': 'recompensa indisponível',
  'chat.queue.not_found': 'Essa fila não foi encontrada.',
  'chat.queue.waiting': 'Aguardando',
  'chat.queue.called': 'Chamados',
  'chat.queue.in_progress': 'Em atendimento',
  'chat.queue.no_one': 'ninguém',
  'chat.queue.more': ' e mais {count}',
  'chat.queue.not_active': 'Você não está nesta fila.',
  'chat.queue.exit_pending': 'Você saiu da fila. O reembolso foi solicitado e está pendente de confirmação.',
  'chat.queue.exit_done': 'Você saiu da fila.',
  'chat.queue.invalid_count': 'Use um número de 1 a 10.',
  'chat.queue.nobody_waiting': 'Não há pessoas aguardando.',
  'chat.queue.called_one': '1 pessoa chamada.',
  'chat.queue.called_many': '{count} pessoas chamadas.',
  'chat.user.not_found': 'Esse usuário da Twitch não foi encontrado.',
  'chat.queue.select_user': 'Informe o usuário porque há mais de uma pessoa possível.',
  'chat.queue.person_not_active': 'Essa pessoa não está ativa nesta fila.',
  'chat.queue.complete_pending': 'Atendimento concluído. O consumo dos pontos está pendente de confirmação.',
  'chat.queue.service_started': 'Atendimento iniciado.',
  'chat.queue.service_completed': 'Atendimento concluído.',
  'chat.queue.move_failed': 'Não foi possível mover essa pessoa.',
  'chat.queue.move_done': 'Posição atualizada.',
  'chat.queue.remove_pending': 'Pessoa removida. O reembolso está pendente de confirmação.',
  'chat.queue.remove_done': 'Pessoa removida.',
  'chat.queue.added': '@{user} adicionado à fila.',
  'chat.queue.duplicate': 'Essa pessoa já está ativa nesta fila.',
  'chat.queue.clear_unavailable': 'A confirmação de limpeza não está disponível no momento.',
  'chat.queue.empty': 'A fila já está vazia.',
  'chat.queue.clear_confirm': 'Confirme em até 15 segundos com !{queue} {clear_command} {confirm_command}: {count} pessoas serão removidas; {refunds} reembolsos serão solicitados.',
  'chat.queue.clear_done': 'Fila limpa: {count} pessoas removidas; {refunds} reembolsos solicitados e pendentes de confirmação.',
  'chat.queue.change_pending': 'Alteração solicitada. A recompensa ainda aguarda confirmação da Twitch.',
  'chat.queue.open_done': 'Fila aberta e recompensa confirmada.',
  'chat.queue.close_done': 'Fila fechada e recompensa pausada.',
  'chat.commands.validation_failed': 'Não foi possível validar os comandos agora. Tente novamente em instantes.',
  'chat.command.validation_failed': 'Não foi possível validar este comando. Tente novamente em instantes.',
  'chat.command.failed': 'Não foi possível concluir o comando. Consulte o painel local.',
});
const CHAT_PLACEHOLDERS = Object.freeze({
  'chat.account.current': ['label'],
  'chat.ping.response': ['version', 'latency'],
  'chat.queue.position': ['user', 'position'],
  'chat.queue.viewer_called': ['user'],
  'chat.queue.viewer_in_progress': ['user'],
  'chat.queue.more': ['count'],
  'chat.queue.called_many': ['count'],
  'chat.queue.added': ['user'],
  'chat.queue.clear_confirm': ['queue', 'clear_command', 'confirm_command', 'count', 'refunds'],
  'chat.queue.clear_done': ['count', 'refunds'],
});

function safeMessage(text) { return Array.from(String(text), (char) => char.charCodeAt(0) < 32 ? ' ' : char).join('').slice(0, 500); }
function normalizedLogin(value) { return String(value ?? '').replace(/^@/, '').toLowerCase(); }
function queueOpenLabel(queue, t) {
  if (queue.remoteSyncStatus === 'pending_open') return t('chat.queue.state.pending_open');
  if (queue.remoteSyncStatus === 'pending_close') return t('chat.queue.state.pending_close');
  if (queue.remoteSyncStatus === 'open_unknown') return t('chat.queue.state.open_unknown');
  if (queue.remoteSyncStatus === 'close_unknown') return t('chat.queue.state.close_unknown');
  if (queue.remoteSyncStatus && !['synced', 'synced_manual'].includes(queue.remoteSyncStatus)) return t('chat.queue.state.unavailable');
  return queue.isOpen ? t('chat.queue.state.open') : t('chat.queue.state.closed');
}
function queueOpenSuffix(queue, t) {
  const label = queueOpenLabel(queue, t);
  return label === t('chat.queue.state.open') ? '' : ` (${label})`;
}
function mention(entry, showUid) {
  const uid = showUid && entry.uid ? ` · UID ${entry.uid}` : '';
  return `@${entry.userLogin}${uid}`;
}

/** @param {{repository: any, domainService?: any, twitch: any, settings?: any, clearConfirmation?: any, broadcasterId: string, allowVipManagement?: boolean, productVersion?:string, getTwitchHealth?:()=>any, getChatCatalogs?:()=>Promise<Record<string,Record<string,string>>>, onError?: (code: string) => unknown}} dependencies */
export function createChatCommandHandler({ repository, domainService = repository, twitch, settings = {}, clearConfirmation = null, broadcasterId, allowVipManagement = false, productVersion = 'unknown', getTwitchHealth = () => null, getChatCatalogs = async () => ({}), onError = () => undefined }) {
  function reply(message, text) {
    const body = safeMessage(text);
    if (!body) return;
    void twitch.sendChatMessage(body).catch(() => onError('chat_send_failed'));
    return body;
  }

  async function queueAction(message, parsed, authorized, policies, t, tPlural, locale) {
    const queue = await repository.getQueueByKey(parsed.queueKey);
    if (!queue) return reply(message, t('chat.queue.not_found'));
    const args = parsed.args;
    const ownEntry = () => repository.getActiveEntryForUser(queue.id, message.userId);
    switch (parsed.command) {
      case 'lista': {
        const snapshot = await repository.listQueueChatEntries(queue.id);
        const waiting = snapshot.waiting.slice(0, 5).map((entry) => `${entry.position}. ${mention(entry, queue.uidMode === 'visible' && queue.showUidInList)}`);
        const rest = Math.max(0, snapshot.totalWaiting - waiting.length);
        const called = snapshot.called.map((entry) => mention(entry, queue.uidMode === 'visible' && queue.showUidInList));
        const playing = snapshot.inProgress.map((entry) => mention(entry, queue.uidMode === 'visible' && queue.showUidInList));
        return reply(message, `${queue.title}${queueOpenSuffix(queue, t)} · ${t('chat.queue.waiting')}: ${waiting.join(', ') || t('chat.queue.no_one')}${rest ? t('chat.queue.more', { count: rest }) : ''}${called.length ? ` · ${t('chat.queue.called')}: ${called.join(', ')}` : ''}${playing.length ? ` · ${t('chat.queue.in_progress')}: ${playing.join(', ')}` : ''}`);
      }
      case 'comandos': {
        return reply(message, renderQueueCommandHelp({ queueSlug: queue.slug, roles: authorized.roles, policies, allowVipManagement, locale, translate: t }));
      }
      case 'posicao': {
        const entry = await ownEntry();
        if (!entry) return reply(message, t('chat.queue.not_active'));
        return reply(message, entry.status === 'waiting'
          ? t('chat.queue.position', { user: message.userLogin, position: entry.position })
          : t(entry.status === 'called' ? 'chat.queue.viewer_called' : 'chat.queue.viewer_in_progress', { user: message.userLogin }));
      }
      case 'sair': {
        const entry = await ownEntry();
        if (!entry) return reply(message, t('chat.queue.not_active'));
        const result = await domainService.transitionEntry({ entryId: entry.id, to: 'removed', origin: 'viewer', actorId: message.userId, reason: 'viewer_left' });
        return reply(message, result.financialDecision === 'request_cancel' ? t('chat.queue.exit_pending') : t('chat.queue.exit_done'));
      }
      case 'proximo': {
        const requested = args[0] === undefined ? 1 : Number(args[0]);
        if (!Number.isInteger(requested) || requested < 1 || requested > 10) return reply(message, t('chat.queue.invalid_count'));
        const selected = await domainService.callNext({ queueId: queue.id, count: requested, actorId: authorized.actorId });
        if (!selected.length) return reply(message, t('chat.queue.nobody_waiting'));
        for (const entry of selected) {
          const uid = queue.uidMode === 'visible' && queue.showUidOnCall && entry.uid ? ` · UID ${entry.uid}` : '';
          const messageText = (queue.callMessage || '{user}, sua vez!').replaceAll('{user}', `@${entry.userLogin}`).replaceAll('{queue}', queue.title).replaceAll('{position}', String(entry.previousPosition)).replaceAll('{uid}', uid).replaceAll('{account}', (await settings.getAccount?.())?.label ?? 'Streamer');
          await repository.enqueueCallNotification?.({ entryId: entry.id, queueId: queue.id, message: messageText });
        }
        return reply(message, selected.length === 1 ? t('chat.queue.called_one') : tPlural('chat.queue.called_many', selected.length));
      }
      case 'atender':
      case 'concluir': {
        let entry;
        if (args[0]) {
          const user = await twitch.getUserByLogin(normalizedLogin(args[0]));
          if (!user) return reply(message, t('chat.user.not_found'));
          entry = await repository.getActiveEntryForUser(queue.id, user.id);
        } else {
          const eligible = await repository.listEntriesByStatus(queue.id, parsed.command === 'atender' ? ['called'] : ['called', 'in_progress']);
          if (eligible.length !== 1) return reply(message, t('chat.queue.select_user'));
          [entry] = eligible;
        }
        if (!entry) return reply(message, t('chat.queue.person_not_active'));
        const to = parsed.command === 'atender' ? 'in_progress' : 'completed';
        const result = await domainService.transitionEntry({ entryId: entry.id, to, origin: 'chat', actorId: authorized.actorId, reason: parsed.command === 'atender' ? 'service_started' : 'service_completed' });
        return reply(message, result.financialDecision === 'request_fulfill' ? t('chat.queue.complete_pending') : parsed.command === 'atender' ? t('chat.queue.service_started') : t('chat.queue.service_completed'));
      }
      case 'mover': {
        const user = await twitch.getUserByLogin(normalizedLogin(args[0]));
        if (!user) return reply(message, t('chat.user.not_found'));
        const entry = await repository.getActiveEntryForUser(queue.id, user.id);
        if (!entry) return reply(message, t('chat.queue.move_failed'));
        const waiting = await repository.listWaiting(queue.id);
        const current = waiting.find(({ id }) => id === entry.id);
        const displayedPosition = Number(args[1]);
        if (!current || !Number.isInteger(displayedPosition)) return reply(message, t('chat.queue.move_failed'));
        const priorityCount = waiting.filter(({ priorityClass }) => priorityClass === 'priority').length;
        const currentIsPriority = current.priorityClass === 'priority';
        const minPosition = currentIsPriority ? 1 : priorityCount + 1;
        const maxPosition = currentIsPriority ? priorityCount : waiting.length;
        if (displayedPosition < minPosition || displayedPosition > maxPosition) return reply(message, t('chat.queue.move_failed'));
        const lanePosition = currentIsPriority ? displayedPosition : displayedPosition - priorityCount;
        const result = await repository.moveWaitingEntry({ queueId: queue.id, entryId: entry.id, position: lanePosition });
        return reply(message, result?.status === 'moved' ? t('chat.queue.move_done') : t('chat.queue.move_failed'));
      }
      case 'remover': {
        const user = await twitch.getUserByLogin(normalizedLogin(args[0]));
        if (!user) return reply(message, t('chat.user.not_found'));
        const entry = await repository.getActiveEntryForUser(queue.id, user.id);
        if (!entry) return reply(message, t('chat.queue.person_not_active'));
        const result = await domainService.transitionEntry({ entryId: entry.id, to: 'removed', origin: 'moderator', actorId: authorized.actorId, reason: 'operator_removed' });
        return reply(message, result.financialDecision === 'request_cancel' ? t('chat.queue.remove_pending') : t('chat.queue.remove_done'));
      }
      case 'add': {
        const user = await twitch.getUserByLogin(normalizedLogin(args[0]));
        if (!user) return reply(message, t('chat.user.not_found'));
        const result = await repository.addManualEntry({ queueId: queue.id, twitchUserId: user.id, userLogin: user.login, displayName: user.displayName, uid: args[1], actorId: authorized.actorId, origin: 'chat' });
        return reply(message, result.status === 'created' ? t('chat.queue.added', { user: user.login }) : t('chat.queue.duplicate'));
      }
      case 'limpar': {
        if (!clearConfirmation) return reply(message, t('chat.queue.clear_unavailable'));
        const input = { actorId: authorized.actorId, channelId: message.channelId, queueId: queue.id, origin: 'chat' };
        const result = args[0] === 'confirmar'
          ? await clearConfirmation.confirm(input)
          : await clearConfirmation.request(input);
        if (result.status === 'empty') return reply(message, t('chat.queue.empty'));
        if (result.status === 'confirmation_required') return reply(message, t('chat.queue.clear_confirm', {
          queue: queue.slug, clear_command: t('chat.command.queue.limpar'), confirm_command: t('chat.command.queue.confirmar'),
          count: result.count, refunds: result.refundsRequested,
        }));
        return reply(message, t('chat.queue.clear_done', { count: result.count, refunds: result.refundsRequested }));
      }
      case 'abrir':
      case 'fechar': {
        const result = await repository.setQueueOpen(queue.id, parsed.command === 'abrir', authorized.actorId, 'chat');
        if (result.status !== 'confirmed') return reply(message, t('chat.queue.change_pending'));
        return reply(message, parsed.command === 'abrir' ? t('chat.queue.open_done') : t('chat.queue.close_done'));
      }
      default: return undefined;
    }
  }

  return async function handleChatMessage(message) {
    if (!message || typeof message.id !== 'string' || typeof message.text !== 'string' || message.channelId !== broadcasterId
      || (message.sourceChannelId && message.sourceChannelId !== broadcasterId)) return;
    let productLocale = 'pt-BR';
    if (typeof repository.getProductLocale === 'function') {
      try { productLocale = (await repository.getProductLocale())?.locale ?? productLocale; } catch {
        onError('product_locale_read_failed');
        return;
      }
    }
    let chatCatalogs = {};
    if (message.text.trimStart().startsWith('!')) {
      try { chatCatalogs = await getChatCatalogs(); } catch { onError('chat_catalog_read_failed'); }
    }
    const selectedCatalog = chatCatalogs[productLocale] ?? chatCatalogs['pt-BR'] ?? {};
    const commandLabels = {};
    for (const [key, value] of Object.entries(selectedCatalog)) {
      if (!key.startsWith('chat.command.')) continue;
      const labelKey = key.slice('chat.command.'.length);
      if (labelKey === 'root') commandLabels.root = value;
      else if (labelKey.startsWith('global.')) commandLabels[labelKey] = value;
      else if (labelKey.startsWith('queue.')) commandLabels[labelKey.slice('queue.'.length)] = value;
    }
    const parsed = parseChatCommand(message.text, { locale: productLocale, labels: commandLabels });
    if (parsed.kind !== 'command') return;
    const catalogsWithFallback = {
      ...chatCatalogs,
      'pt-BR': { ...CHAT_FALLBACKS, ...(chatCatalogs['pt-BR'] ?? {}) },
    };
    const t = (key, values = {}) => translateCatalog(catalogsWithFallback, productLocale, key, { values, placeholders: CHAT_PLACEHOLDERS });
    const tPlural = (key, count) => translatePluralCatalog(catalogsWithFallback, productLocale, key, count, { placeholders: CHAT_PLACEHOLDERS });
    const definition = getCommandDefinition(parsed);
    let policies = {};
    if (definition && !definition.immutableRoles) {
      try { policies = await repository.getCommandPolicies?.() ?? {}; } catch {
        onError('command_policy_read_failed');
        return reply(message, t('chat.commands.validation_failed'));
      }
    }
    const authorized = authorizeCommand({ broadcasterId, message, command: parsed, allowVipManagement, policies });
    if (!authorized.allowed) return;
    const cooldownExempt = parsed.scope === 'global' && parsed.rootAction === 'account_read';
    if (typeof repository.claimChatCommand === 'function') {
      try {
        const claim = await repository.claimChatCommand({
          messageId: message.id,
          channelId: message.channelId,
          userId: message.userId,
          role: authorized.role,
          cooldownExempt,
        });
        if (claim.status !== 'accepted') return;
      } catch {
        onError('chat_command_claim_failed');
        return reply(message, t('chat.command.validation_failed'));
      }
    } else {
      const now = Date.now();
      if (seenMessages.has(message.id)) return;
      seenMessages.set(message.id, now);
      for (const [id, stamp] of seenMessages) if (now - stamp > 60 * 60 * 1000) seenMessages.delete(id);
      if (authorized.role === 'viewer' && !cooldownExempt) {
        const key = `${message.channelId}:${message.userId}`;
        const previous = cooldowns.get(key) ?? 0;
        if (now - previous < cooldownMs) return;
        cooldowns.set(key, now);
      }
    }
    try {
      if (parsed.scope === 'queue') return await queueAction(message, parsed, authorized, policies, t, tPlural, productLocale);
      if (parsed.command === 'queue' && parsed.rootAction === 'queues') {
        const queues = (await repository.listQueueProjection?.() ?? []).filter((queue) => !queue.isArchived && queue.lifecycleStatus !== 'deleting');
        const visible = queues.map((queue) => `${queue.slug}${queue.isOpen ? '' : ` (${t('chat.queues.closed')})`}`);
        return reply(message, visible.length ? `${t('chat.queues.title')}: ${visible.join(', ')}.` : t('chat.queues.empty'));
      }
      if (parsed.command === 'queue' && ['account_read', 'account_set', 'account_reset'].includes(parsed.rootAction)) {
        if (parsed.rootAction === 'account_read') {
          const account = await settings.getAccount?.();
          return reply(message, t('chat.account.current', { label: account?.label ?? 'Streamer' }));
        }
        if (parsed.rootAction === 'account_set') {
          const label = parsed.args.join(' ').trim();
          if (!label || label.length > 60 || Array.from(label).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return reply(message, t('chat.account.invalid_label'));
          const account = await settings.setAccount?.(label, authorized.actorId);
          return reply(message, t('chat.account.current', { label: account?.label ?? label }));
        }
        const account = await settings.resetAccount?.(authorized.actorId);
        return reply(message, t('chat.account.current', { label: account?.label ?? 'Streamer' }));
      }
      if (parsed.command === 'queue' && parsed.rootAction === 'ping') {
        return reply(message, renderPingResponse({ productVersion, twitchHealth: getTwitchHealth(), translate: t }));
      }
      if (parsed.command === 'queue' && parsed.rootAction === 'commands') {
        return reply(message, renderGlobalCommandHelp({ roles: authorized.roles, locale: productLocale, policies, allowVipManagement, translate: t }));
      }
    } catch {
      onError('chat_command_failed');
      return reply(message, t('chat.command.failed'));
    }
  };
}

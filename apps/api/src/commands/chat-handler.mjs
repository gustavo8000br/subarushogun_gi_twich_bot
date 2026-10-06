import { authorizeCommand } from './authorization.mjs';
import { parseChatCommand } from './parser.mjs';

const seenMessages = new Map();
const cooldowns = new Map();
const cooldownMs = 5_000;

function safeMessage(text) { return Array.from(String(text), (char) => char.charCodeAt(0) < 32 ? ' ' : char).join('').slice(0, 500); }
function normalizedLogin(value) { return String(value ?? '').replace(/^@/, '').toLowerCase(); }
function queueOpenLabel(queue) {
  if (queue.remoteSyncStatus === 'pending_open') return 'abertura pendente';
  if (queue.remoteSyncStatus === 'pending_close') return 'fechamento pendente';
  if (queue.remoteSyncStatus === 'open_unknown') return 'abertura sem confirmação';
  if (queue.remoteSyncStatus === 'close_unknown') return 'fechamento sem confirmação';
  if (queue.remoteSyncStatus && !['synced', 'synced_manual'].includes(queue.remoteSyncStatus)) return 'recompensa indisponível';
  return queue.isOpen ? 'aberta' : 'fechada';
}
function queueOpenSuffix(queue) {
  const label = queueOpenLabel(queue);
  return label === 'aberta' ? '' : ` (${label})`;
}
function mention(entry, showUid) {
  const uid = showUid && entry.uid ? ` · UID ${entry.uid}` : '';
  return `@${entry.userLogin}${uid}`;
}

/** @param {{repository: any, domainService?: any, twitch: any, settings?: any, clearConfirmation?: any, broadcasterId: string, allowVipManagement?: boolean, onError?: (code: string) => unknown}} dependencies */
export function createChatCommandHandler({ repository, domainService = repository, twitch, settings = {}, clearConfirmation = null, broadcasterId, allowVipManagement = false, onError = () => undefined }) {
  function reply(message, text) {
    const body = safeMessage(text);
    if (!body) return;
    void twitch.sendChatMessage(body).catch(() => onError('chat_send_failed'));
    return body;
  }

  async function queueAction(message, parsed, authorized) {
    const queue = await repository.getQueueByKey(parsed.queueKey);
    if (!queue) return reply(message, 'Essa fila não foi encontrada.');
    const args = parsed.args;
    const ownEntry = () => repository.getActiveEntryForUser(queue.id, message.userId);
    switch (parsed.command) {
      case 'lista': {
        const snapshot = await repository.listQueueChatEntries(queue.id);
        const waiting = snapshot.waiting.slice(0, 5).map((entry) => `${entry.position}. ${mention(entry, queue.uidMode === 'visible' && queue.showUidInList)}`);
        const rest = Math.max(0, snapshot.totalWaiting - waiting.length);
        const called = snapshot.called.map((entry) => mention(entry, queue.uidMode === 'visible' && queue.showUidInList));
        const playing = snapshot.inProgress.map((entry) => mention(entry, queue.uidMode === 'visible' && queue.showUidInList));
        return reply(message, `${queue.title}${queueOpenSuffix(queue)} · Aguardando: ${waiting.join(', ') || 'ninguém'}${rest ? ` e mais ${rest}` : ''}${called.length ? ` · Chamados: ${called.join(', ')}` : ''}${playing.length ? ` · Em atendimento: ${playing.join(', ')}` : ''}`);
      }
      case 'posicao': {
        const entry = await ownEntry();
        if (!entry) return reply(message, 'Você não está nesta fila.');
        const state = entry.status === 'waiting' ? `posição ${entry.position}` : entry.status === 'called' ? 'foi chamado' : 'está em atendimento';
        return reply(message, `@${message.userLogin}, você ${state}.`);
      }
      case 'sair': {
        const entry = await ownEntry();
        if (!entry) return reply(message, 'Você não está nesta fila.');
        const result = await domainService.transitionEntry({ entryId: entry.id, to: 'removed', origin: 'viewer', actorId: message.userId, reason: 'viewer_left' });
        return reply(message, result.financialDecision === 'request_cancel' ? 'Você saiu da fila. O reembolso foi solicitado e está pendente de confirmação.' : 'Você saiu da fila.');
      }
      case 'proximo': {
        const requested = args[0] === undefined ? 1 : Number(args[0]);
        if (!Number.isInteger(requested) || requested < 1 || requested > 10) return reply(message, 'Use um número de 1 a 10.');
        const selected = await domainService.callNext({ queueId: queue.id, count: requested, actorId: authorized.actorId });
        if (!selected.length) return reply(message, 'Não há pessoas aguardando.');
        for (const entry of selected) {
          const uid = queue.uidMode === 'visible' && queue.showUidOnCall && entry.uid ? ` · UID ${entry.uid}` : '';
          const messageText = (queue.callMessage || '{user}, sua vez!').replaceAll('{user}', `@${entry.userLogin}`).replaceAll('{queue}', queue.title).replaceAll('{position}', String(entry.previousPosition)).replaceAll('{uid}', uid).replaceAll('{account}', (await settings.getAccount?.())?.label ?? 'Streamer');
          await repository.enqueueCallNotification?.({ entryId: entry.id, queueId: queue.id, message: messageText });
        }
        return reply(message, `${selected.length} ${selected.length === 1 ? 'pessoa chamada' : 'pessoas chamadas'}.`);
      }
      case 'atender':
      case 'concluir': {
        let entry;
        if (args[0]) {
          const user = await twitch.getUserByLogin(normalizedLogin(args[0]));
          if (!user) return reply(message, 'Esse usuário da Twitch não foi encontrado.');
          entry = await repository.getActiveEntryForUser(queue.id, user.id);
        } else {
          const eligible = await repository.listEntriesByStatus(queue.id, parsed.command === 'atender' ? ['called'] : ['called', 'in_progress']);
          if (eligible.length !== 1) return reply(message, 'Informe o usuário porque há mais de uma pessoa possível.');
          [entry] = eligible;
        }
        if (!entry) return reply(message, 'Essa pessoa não está ativa nesta fila.');
        const to = parsed.command === 'atender' ? 'in_progress' : 'completed';
        const result = await domainService.transitionEntry({ entryId: entry.id, to, origin: 'chat', actorId: authorized.actorId, reason: parsed.command === 'atender' ? 'service_started' : 'service_completed' });
        return reply(message, result.financialDecision === 'request_fulfill' ? 'Atendimento concluído. O consumo dos pontos está pendente de confirmação.' : parsed.command === 'atender' ? 'Atendimento iniciado.' : 'Atendimento concluído.');
      }
      case 'mover': {
        const user = await twitch.getUserByLogin(normalizedLogin(args[0]));
        if (!user) return reply(message, 'Esse usuário da Twitch não foi encontrado.');
        const entry = await repository.getActiveEntryForUser(queue.id, user.id);
        if (!entry) return reply(message, 'Não foi possível mover essa pessoa.');
        const waiting = await repository.listWaiting(queue.id);
        const current = waiting.find(({ id }) => id === entry.id);
        const displayedPosition = Number(args[1]);
        if (!current || !Number.isInteger(displayedPosition)) return reply(message, 'Não foi possível mover essa pessoa.');
        const priorityCount = waiting.filter(({ priorityClass }) => priorityClass === 'priority').length;
        const currentIsPriority = current.priorityClass === 'priority';
        const minPosition = currentIsPriority ? 1 : priorityCount + 1;
        const maxPosition = currentIsPriority ? priorityCount : waiting.length;
        if (displayedPosition < minPosition || displayedPosition > maxPosition) return reply(message, 'Não foi possível mover essa pessoa.');
        const lanePosition = currentIsPriority ? displayedPosition : displayedPosition - priorityCount;
        const result = await repository.moveWaitingEntry({ queueId: queue.id, entryId: entry.id, position: lanePosition });
        return reply(message, result?.status === 'moved' ? 'Posição atualizada.' : 'Não foi possível mover essa pessoa.');
      }
      case 'remover': {
        const user = await twitch.getUserByLogin(normalizedLogin(args[0]));
        if (!user) return reply(message, 'Esse usuário da Twitch não foi encontrado.');
        const entry = await repository.getActiveEntryForUser(queue.id, user.id);
        if (!entry) return reply(message, 'Essa pessoa não está ativa nesta fila.');
        const result = await domainService.transitionEntry({ entryId: entry.id, to: 'removed', origin: 'moderator', actorId: authorized.actorId, reason: 'operator_removed' });
        return reply(message, result.financialDecision === 'request_cancel' ? 'Pessoa removida. O reembolso está pendente de confirmação.' : 'Pessoa removida.');
      }
      case 'add': {
        const user = await twitch.getUserByLogin(normalizedLogin(args[0]));
        if (!user) return reply(message, 'Esse usuário da Twitch não foi encontrado.');
        const result = await repository.addManualEntry({ queueId: queue.id, twitchUserId: user.id, userLogin: user.login, displayName: user.displayName, uid: args[1], actorId: authorized.actorId, origin: 'chat' });
        return reply(message, result.status === 'created' ? `@${user.login} adicionado à fila.` : 'Essa pessoa já está ativa nesta fila.');
      }
      case 'limpar': {
        if (!clearConfirmation) return reply(message, 'A confirmação de limpeza não está disponível no momento.');
        const input = { actorId: authorized.actorId, channelId: message.channelId, queueId: queue.id, origin: 'chat' };
        const result = args[0] === 'confirmar'
          ? await clearConfirmation.confirm(input)
          : await clearConfirmation.request(input);
        if (result.status === 'empty') return reply(message, 'A fila já está vazia.');
        if (result.status === 'confirmation_required') return reply(message, `Confirme em até 15 segundos com !${queue.slug} limpar confirmar: ${result.count} pessoas serão removidas; ${result.refundsRequested} reembolsos serão solicitados.`);
        return reply(message, `Fila limpa: ${result.count} pessoas removidas; ${result.refundsRequested} reembolsos solicitados e pendentes de confirmação.`);
      }
      case 'abrir':
      case 'fechar': {
        const result = await repository.setQueueOpen(queue.id, parsed.command === 'abrir', authorized.actorId, 'chat');
        if (result.status !== 'confirmed') return reply(message, 'Alteração solicitada. A recompensa ainda aguarda confirmação da Twitch.');
        return reply(message, parsed.command === 'abrir' ? 'Fila aberta e recompensa confirmada.' : 'Fila fechada e recompensa pausada.');
      }
      default: return undefined;
    }
  }

  return async function handleChatMessage(message) {
    if (!message || typeof message.id !== 'string' || typeof message.text !== 'string' || message.channelId !== broadcasterId
      || (message.sourceChannelId && message.sourceChannelId !== broadcasterId)) return;
    const parsed = parseChatCommand(message.text);
    if (parsed.kind !== 'command') return;
    const authorized = authorizeCommand({ broadcasterId, message, command: parsed, allowVipManagement });
    if (!authorized.allowed) return;
    const cooldownExempt = parsed.scope === 'global' && parsed.command === 'conta' && parsed.args.length === 0;
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
        return reply(message, 'Não foi possível validar este comando. Tente novamente em instantes.');
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
      if (parsed.scope === 'queue') return await queueAction(message, parsed, authorized);
      if (parsed.command === 'filas') {
        const queues = await repository.listQueueProjection();
        return reply(message, queues.filter((queue) => !queue.isArchived && queue.lifecycleStatus === 'active').map((queue) => `${queue.slug}${queueOpenSuffix(queue)}`).join(' · ') || 'Não há filas disponíveis.');
      }
      if (parsed.command === 'conta') {
        if (!parsed.args.length) return reply(message, `Conta atual: ${(await settings.getAccount?.())?.label ?? 'Streamer'}.`);
        const result = parsed.args[0].toLowerCase() === 'reset' ? await settings.resetAccount?.(authorized.actorId) : await settings.setAccount?.(parsed.args.join(' '), authorized.actorId);
        return reply(message, `Conta atual: ${result?.label ?? 'Streamer'}.`);
      }
    } catch {
      onError('chat_command_failed');
      return reply(message, 'Não foi possível concluir o comando. Consulte o painel local.');
    }
  };
}

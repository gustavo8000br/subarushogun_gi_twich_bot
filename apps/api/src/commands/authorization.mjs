/** @typedef {{allowed: boolean, role: string|null, actorId: string|null, reason: string}} AuthorizationDecision */

const viewerQueueCommands = new Set(['lista', 'posicao', 'sair']);
const managementQueueCommands = new Set([
  'add', 'remover', 'proximo', 'atender', 'concluir', 'mover', 'abrir', 'fechar', 'limpar',
]);

function hasBadge(message, badgeName) {
  if (!Array.isArray(message.badges)) return false;
  return message.badges.some((badge) => {
    if (typeof badge === 'string') return badge === badgeName;
    if (!badge || typeof badge !== 'object') return false;
    return badge.setId === badgeName || badge.set_id === badgeName;
  });
}

function decision(allowed, role, actorId, reason) {
  return { allowed, role, actorId, reason };
}

/** @param {{broadcasterId: unknown, message: Record<string, any>, command: Record<string, any>, allowVipManagement?: boolean}} input @returns {AuthorizationDecision} */
export function authorizeCommand(input) {
  const { broadcasterId, message, command, allowVipManagement = false } = input;
  if (typeof broadcasterId !== 'string' || !message || typeof message !== 'object'
      || typeof message.userId !== 'string' || typeof message.channelId !== 'string'
      || !command || typeof command.command !== 'string' || !Array.isArray(command.args)) {
    return decision(false, null, null, 'invalid_message');
  }
  if (message.channelId !== broadcasterId
      || (message.sourceChannelId && message.sourceChannelId !== broadcasterId)) {
    return decision(false, null, message.userId, 'wrong_channel');
  }

  const isStreamer = message.userId === broadcasterId;
  const isModerator = hasBadge(message, 'moderator');
  const isVip = allowVipManagement === true && hasBadge(message, 'vip');
  const role = isStreamer ? 'streamer' : isModerator ? 'moderator' : isVip ? 'vip' : 'viewer';
  const isManager = role !== 'viewer';

  if (command.scope === 'queue' && viewerQueueCommands.has(command.command)) {
    if (['posicao', 'sair'].includes(command.command) && command.args.length > 0) {
      return decision(false, role, message.userId, 'viewer_identity_required');
    }
    return decision(true, role, message.userId, 'allowed');
  }
  if (command.scope === 'global' && command.command === 'filas' && command.args.length === 0) {
    return decision(true, role, message.userId, 'allowed');
  }
  if (command.scope === 'global' && command.command === 'conta') {
    if (command.args.length === 0) return decision(true, role, message.userId, 'allowed');
    if (isManager) return decision(true, role, message.userId, 'allowed');
    return decision(false, role, message.userId, 'management_required');
  }
  if (command.scope === 'queue' && managementQueueCommands.has(command.command)) {
    return isManager
      ? decision(true, role, message.userId, 'allowed')
      : decision(false, role, message.userId, 'management_required');
  }
  return decision(false, role, message.userId, 'unknown_command');
}

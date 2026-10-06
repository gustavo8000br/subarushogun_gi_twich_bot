import { getCommandDefinition, resolveAllowedRoles, resolveCommandAccess } from './catalog.mjs';

/** @typedef {{allowed: boolean, role: string|null, roles: string[], actorId: string|null, reason: string}} AuthorizationDecision */

function hasBadge(message, badgeName) {
  const { badges } = message;
  if (Array.isArray(badges)) {
    return badges.some((badge) => {
      if (typeof badge === 'string') return badge === badgeName;
      if (!badge || typeof badge !== 'object') return false;
      return badge.setId === badgeName || badge.set_id === badgeName;
    });
  }
  // Twurple's EventSub chat event exposes badges as { set_id: version }.
  return Boolean(badges && typeof badges === 'object' && Object.hasOwn(badges, badgeName));
}

function decision(allowed, role, actorId, reason, roles = []) {
  return { allowed, role, roles, actorId, reason };
}

/** @param {{broadcasterId: unknown, message: Record<string, any>, command: {scope:string,command:string,args:string[]}, policies?:Record<string,string[]>, allowVipManagement?: boolean}} input @returns {AuthorizationDecision} */
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
  const roles = [];
  if (isStreamer) roles.push('streamer');
  if (hasBadge(message, 'moderator')) roles.push('moderator');
  if (allowVipManagement === true && hasBadge(message, 'vip')) roles.push('vip');
  if (hasBadge(message, 'subscriber')) roles.push('subscriber');
  if (!isStreamer && !roles.length) roles.push('viewer');
  const role = roles[0] ?? 'viewer';
  const definition = getCommandDefinition(command);
  if (!definition) return decision(false, role, message.userId, 'unknown_command', roles);
  const allowedRoles = resolveAllowedRoles(definition, input.policies);
  const access = resolveCommandAccess({ definition, allowedRoles, roles, allowVipManagement });

  if (command.scope === 'queue' && ['posicao', 'sair'].includes(command.command) && command.args.length > 0) {
    return decision(false, role, message.userId, 'viewer_identity_required', roles);
  }
  return decision(access.allowed, role, message.userId, access.reason, roles);
}

import { describe, expect, it } from 'vitest';
import { CHAT_COMMANDS, getCommandDefinition, resolveCommandAccess, resolveCommandPolicy } from '../../apps/api/src/commands/catalog.mjs';

describe('canonical chat command access contract', () => {
  it('defines every command with a configurable or fixed minimum role', () => {
    expect(CHAT_COMMANDS.every(({ access }) => access && ['configurable', 'fixed'].includes(access.kind)
      && ['everyone', 'follower', 'subscriber', 'vip', 'moderator', 'streamer'].includes(access.minimumRole))).toBe(true);
    for (const key of ['queue:add', 'queue:remover', 'queue:proximo', 'queue:atender', 'queue:concluir', 'queue:mover', 'queue:abrir', 'queue:fechar', 'queue:limpar', 'global:queue:ping']) {
      expect(CHAT_COMMANDS.find((command) => command.key === key).access).toEqual({ kind: 'fixed', minimumRole: 'moderator' });
    }
    for (const key of ['global:conta:set', 'global:conta:reset']) {
      expect(CHAT_COMMANDS.find((command) => command.key === key).access).toEqual({ kind: 'fixed', minimumRole: 'streamer' });
    }
  });

  it('applies inherited group rank from the configured threshold', () => {
    const definition = getCommandDefinition({ scope: 'queue', command: 'posicao' });
    const policy = { minimumRole: 'subscriber' };
    expect(resolveCommandAccess({ definition, policy, roles: ['follower'] }).allowed).toBe(false);
    for (const role of ['subscriber', 'vip', 'moderator', 'streamer']) {
      expect(resolveCommandAccess({ definition, policy, roles: [role], allowVipManagement: true }).allowed).toBe(true);
    }
  });

  it('keeps VIP authorization behind the global toggle', () => {
    const definition = getCommandDefinition({ scope: 'queue', command: 'lista' });
    const policy = { minimumRole: 'vip' };
    expect(resolveCommandAccess({ definition, policy, roles: ['vip'] }).allowed).toBe(false);
    expect(resolveCommandAccess({ definition, policy, roles: ['vip'], allowVipManagement: true }).allowed).toBe(true);
  });

  it('denies access when a stored configurable threshold is malformed', () => {
    const definition = getCommandDefinition({ scope: 'queue', command: 'lista' });
    expect(resolveCommandPolicy(definition, { [definition.key]: { minimumRole: ['subscriber'] } }).kind).toBe('invalid');
    expect(resolveCommandAccess({ definition, policy: { minimumRole: ['subscriber'] }, roles: ['streamer'] }).allowed).toBe(false);
  });
});

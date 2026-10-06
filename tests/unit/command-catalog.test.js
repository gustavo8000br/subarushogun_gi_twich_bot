import { describe, expect, it } from 'vitest';
import {
  CHAT_COMMANDS,
  getCommandDefinition,
  resolveAllowedRoles,
  resolveCommandAccess,
} from '../../apps/api/src/commands/catalog.mjs';

describe('canonical chat command catalog and access policy', () => {
  it('catalogs every implemented global and queue command with syntax and purpose', () => {
    const keys = new Set(CHAT_COMMANDS.map(({ key }) => key));
    for (const key of [
      'queue:lista', 'queue:comandos', 'queue:posicao', 'queue:sair', 'queue:add',
      'queue:remover', 'queue:proximo', 'queue:atender', 'queue:concluir', 'queue:mover',
      'queue:abrir', 'queue:fechar', 'queue:limpar', 'global:filas', 'global:conta:read',
      'global:conta:set', 'global:conta:reset', 'global:queue:comandos', 'global:queue:ping',
    ]) expect(keys.has(key), `${key} is cataloged`).toBe(true);
    expect(CHAT_COMMANDS.every((entry) => entry.syntax && entry.description && entry.defaultRoles)).toBe(true);
  });

  it('uses explicit OR matching and treats everyone as an allow-all role', () => {
    const definition = getCommandDefinition({ scope: 'queue', command: 'add', args: [] });
    expect(resolveCommandAccess({ definition, allowedRoles: ['subscriber', 'moderator'], roles: ['moderator'], allowVipManagement: false }).allowed).toBe(true);
    expect(resolveCommandAccess({ definition, allowedRoles: ['subscriber'], roles: ['viewer'], allowVipManagement: false }).allowed).toBe(false);
    expect(resolveCommandAccess({ definition, allowedRoles: ['everyone'], roles: ['viewer'], allowVipManagement: false }).allowed).toBe(true);
  });

  it('keeps VIP behind the global toggle even when the command allowlist includes VIP', () => {
    const definition = getCommandDefinition({ scope: 'queue', command: 'proximo', args: [] });
    expect(resolveCommandAccess({ definition, allowedRoles: ['vip'], roles: ['vip'], allowVipManagement: false }).allowed).toBe(false);
    expect(resolveCommandAccess({ definition, allowedRoles: ['vip'], roles: ['vip'], allowVipManagement: true }).allowed).toBe(true);
  });

  it('does not allow policy edits to broaden account mutations beyond streamer', () => {
    const setName = getCommandDefinition({ scope: 'global', command: 'conta', args: ['nome'] });
    const reset = getCommandDefinition({ scope: 'global', command: 'conta', args: ['reset'] });
    expect(setName.immutableRoles).toEqual(['streamer']);
    expect(reset.immutableRoles).toEqual(['streamer']);
    expect(resolveAllowedRoles(setName, ['everyone'])).toEqual(['streamer']);
    expect(resolveAllowedRoles(reset, ['moderator'])).toEqual(['streamer']);
  });

  it('grants streamer identity access to mutable commands regardless of configurable roles', () => {
    const definition = getCommandDefinition({ scope: 'queue', command: 'remover', args: [] });
    expect(resolveCommandAccess({ definition, allowedRoles: ['subscriber'], roles: ['streamer'], allowVipManagement: false }).allowed).toBe(true);
  });

  it('keeps global ping immutable to streamer and moderator even if policy requests everyone', () => {
    const definition = getCommandDefinition({ scope: 'global', command: 'queue', args: ['ping'] });
    expect(definition.immutableRoles).toEqual(['streamer', 'moderator']);
    expect(resolveAllowedRoles(definition, { [definition.key]: ['everyone'] })).toEqual(['streamer', 'moderator']);
    expect(resolveCommandAccess({ definition, roles: ['subscriber'], allowVipManagement: false }).allowed).toBe(false);
    expect(resolveCommandAccess({ definition, roles: ['moderator'], allowVipManagement: false }).allowed).toBe(true);
  });

  it('fails closed when a persisted mutable-command policy is malformed', () => {
    const definition = getCommandDefinition({ scope: 'queue', command: 'add', args: [] });
    const malformed = resolveAllowedRoles(definition, { [definition.key]: 'everyone' });
    expect(malformed).toEqual([]);
    expect(resolveCommandAccess({ definition, allowedRoles: malformed, roles: ['moderator'], allowVipManagement: true }).allowed).toBe(false);
  });

});

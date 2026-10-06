import { describe, expect, it } from 'vitest';
import { projectCommandCatalog, collectCommandPolicies, mergeCommandPolicyState } from '../../apps/web/command-catalog-view.mjs';

describe('command catalog view contract', () => {
  it('projects effective roles and immutable metadata from the API contract', () => {
    const projected = projectCommandCatalog({
      version: 3,
      configurableRoles: ['moderator', 'vip', 'subscriber', 'everyone'],
      commands: [
        { key: 'queue:add', syntax: '!<fila> add <usuario>', description: 'Adicionar', allowedRoles: ['moderator'], immutableRoles: null, configurable: true },
        { key: 'global:queue:ping', syntax: '!queue ping', description: 'Ping', allowedRoles: ['streamer', 'moderator'], immutableRoles: ['streamer', 'moderator'], configurable: false },
      ],
    });
    expect(projected[0].roles).toEqual(['moderator']);
    expect(projected[0].locked).toBe(false);
    expect(projected[1].roles).toEqual(['streamer', 'moderator']);
    expect(projected[1].locked).toBe(true);
    expect(projected[0].description).toBe('Adicionar');
    expect(projected[0].syntax).toBe('!<fila> add <usuario>');
  });

  it('collects only checked configurable roles and omits immutable commands', () => {
    const catalog = [
      { key: 'queue:add', configurable: true },
      { key: 'global:queue:ping', configurable: false },
    ];
    const selections = [
      { dataset: { commandKey: 'queue:add' }, querySelectorAll: () => [{ value: 'moderator' }, { value: 'subscriber' }] },
      { dataset: { commandKey: 'global:queue:ping' }, querySelectorAll: () => [{ value: 'everyone' }] },
    ];
    expect(collectCommandPolicies(catalog, selections)).toEqual({ 'queue:add': ['moderator', 'subscriber'] });
  });

  it('keeps the panel catalog projection after a successful policy update response', () => {
    const initial = {
      version: 3,
      configurableRoles: ['moderator', 'vip', 'subscriber', 'everyone'],
      commands: [
        { key: 'queue:add', syntax: '!<fila> add <usuario>', description: 'Adicionar', allowedRoles: ['moderator'], configurable: true },
        { key: 'global:queue:ping', syntax: '!queue ping', description: 'Ping', allowedRoles: ['streamer', 'moderator'], immutableRoles: ['streamer', 'moderator'], configurable: false },
      ],
    };
    const displayed = projectCommandCatalog(mergeCommandPolicyState(initial, { version: 4, policies: { 'queue:add': ['subscriber'] } }));
    expect(displayed).toHaveLength(2);
    expect(displayed[0].roles).toEqual(['subscriber']);
    expect(displayed[0].locked).toBe(false);
    expect(displayed[1].roles).toEqual(['streamer', 'moderator']);
  });
});

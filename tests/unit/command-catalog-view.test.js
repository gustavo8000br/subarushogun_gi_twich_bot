import { describe, expect, it } from 'vitest';
import { projectCommandCatalog, collectCommandPolicies, mergeCommandPolicyState, followerAuthorizationRequest } from '../../apps/web/command-catalog-view.mjs';

describe('command catalog view contract', () => {
  it('projects threshold and legacy review state and submits only explicitly changed selections', () => {
    const catalog = projectCommandCatalog({
      version: 8,
      configurableRoles: ['everyone', 'follower', 'subscriber', 'vip', 'moderator'],
      commands: [
        { key: 'queue:lista', configurable: true, policy: { mode: 'minimum_role', minimumRole: 'subscriber' }, allowedRoles: ['subscriber', 'vip', 'moderator'] },
        { key: 'queue:posicao', configurable: true, policy: { mode: 'legacy_exact', allowedRoles: ['subscriber', 'moderator'] }, allowedRoles: ['subscriber', 'moderator'] },
      ],
    });
    expect(catalog[0]).toMatchObject({ minimumRole: 'subscriber', legacyReviewRequired: false, inheritedRoles: ['subscriber', 'vip', 'moderator', 'streamer'] });
    expect(catalog[1]).toMatchObject({ minimumRole: '', legacyReviewRequired: true, currentLegacyRoles: ['subscriber', 'moderator'] });

    const cards = [
      { dataset: { commandKey: 'queue:lista' }, querySelector: () => ({ value: 'subscriber', dataset: { dirty: 'false' } }) },
      { dataset: { commandKey: 'queue:posicao' }, querySelector: () => ({ value: 'vip', dataset: { dirty: 'true' } }) },
    ];
    expect(collectCommandPolicies(catalog, cards)).toEqual({
      'queue:posicao': { mode: 'minimum_role', minimumRole: 'vip' },
    });
  });

  it('offers reauthorization using saved follower policies without requiring a policy edit', () => {
    const request = followerAuthorizationRequest({
      version: 9, followerScopeReady: false, commands: [
        { key: 'queue:lista', configurable: true, policy: { mode: 'minimum_role', minimumRole: 'follower' } },
        { key: 'queue:posicao', configurable: true, policy: { mode: 'minimum_role', minimumRole: 'subscriber' } },
        { key: 'queue:add', configurable: false, policy: { mode: 'minimum_role', minimumRole: 'follower' } },
      ],
    });
    expect(request).toEqual({ expectedVersion: 9, policies: { 'queue:lista': { mode: 'minimum_role', minimumRole: 'follower' } } });
    expect(followerAuthorizationRequest({ version: 9, followerScopeReady: true, commands: [] })).toBeNull();
    expect(followerAuthorizationRequest({ version: 9, followerScopeReady: false, commands: [] })).toBeNull();
  });

  it('projects effective roles and immutable metadata from the API contract', () => {
    const projected = projectCommandCatalog({
      version: 3,
      configurableRoles: ['moderator', 'vip', 'subscriber', 'everyone'],
      commands: [
        { key: 'queue:add', syntax: '!<fila> add <usuario>', description: 'Adicionar', allowedRoles: ['streamer', 'moderator'], immutableRoles: ['streamer', 'moderator'], configurable: false },
        { key: 'global:conta:set', syntax: '!conta <nome>', description: 'Definir conta', allowedRoles: ['streamer', 'moderator'], immutableRoles: ['streamer', 'moderator'], configurable: false },
        { key: 'global:queue:ping', syntax: '!queue ping', description: 'Ping', allowedRoles: ['streamer', 'moderator'], immutableRoles: ['streamer', 'moderator'], configurable: false },
      ],
    });
    expect(projected[0].roles).toEqual(['streamer', 'moderator']);
    expect(projected[0].locked).toBe(true);
    expect(projected[1].roles).toEqual(['streamer', 'moderator']);
    expect(projected[1].locked).toBe(true);
    expect(projected[0].description).toBe('Adicionar');
    expect(projected[0].syntax).toBe('!<fila> add <usuario>');
    expect(projected[2].roles).toEqual(['streamer', 'moderator']);
  });

  it('collects only checked configurable roles and omits immutable commands', () => {
    const catalog = [
      { key: 'queue:add', configurable: false },
      { key: 'global:queue:ping', configurable: false },
    ];
    const selections = [
      { dataset: { commandKey: 'queue:add' }, querySelectorAll: () => [{ value: 'everyone' }] },
      { dataset: { commandKey: 'global:queue:ping' }, querySelectorAll: () => [{ value: 'everyone' }] },
    ];
    expect(collectCommandPolicies(catalog, selections)).toEqual({});
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
    const displayed = projectCommandCatalog(mergeCommandPolicyState(initial, { schemaVersion: 2, version: 4, policies: { 'queue:add': { mode: 'minimum_role', minimumRole: 'subscriber' } } }));
    expect(displayed).toHaveLength(2);
    expect(displayed[0].roles).toEqual(['subscriber', 'vip', 'moderator']);
    expect(displayed[0].locked).toBe(false);
    expect(displayed[1].roles).toEqual(['streamer', 'moderator']);
  });
});

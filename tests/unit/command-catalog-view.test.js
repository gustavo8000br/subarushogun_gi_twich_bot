import { describe, expect, it } from 'vitest';
import { projectMinimumRoleAudience, projectCommandCatalog, collectCommandPolicies, mergeCommandPolicyState, followerAuthorizationRequest, groupCommandPolicies } from '../../apps/web/command-catalog-view.mjs';

describe('command catalog view contract', () => {
  it('projects the complete inherited audience for each configurable threshold', () => {
    expect(projectMinimumRoleAudience('subscriber')).toEqual(['subscriber', 'vip', 'moderator', 'streamer']);
    expect(projectMinimumRoleAudience('everyone')).toEqual(['everyone', 'follower', 'subscriber', 'vip', 'moderator', 'streamer']);
    expect(projectMinimumRoleAudience('unknown')).toEqual([]);
  });

  it('groups configurable, moderator-floor, and streamer-floor commands', () => {
    const groups = groupCommandPolicies([
      { key: 'queue:list', access: { kind: 'configurable', minimumRole: 'everyone' } },
      { key: 'queue:add', access: { kind: 'fixed', minimumRole: 'moderator' } },
      { key: 'account:set', access: { kind: 'fixed', minimumRole: 'streamer' } },
    ]);
    expect(groups.map(({ key, commands }) => [key, commands.map(({ key: command }) => command)])).toEqual([
      ['configurable', ['queue:list']], ['moderator', ['queue:add']], ['streamer', ['account:set']],
    ]);
  });

  it('keeps fixed commands with non-management roles visible in a fixed group', () => {
    expect(groupCommandPolicies([{ key: 'queue:presente', access: { kind: 'fixed', minimumRole: 'everyone' } }]))
      .toEqual([{ key: 'fixed', commands: [{ key: 'queue:presente', access: { kind: 'fixed', minimumRole: 'everyone' } }] }]);
  });

  it('projects one minimum threshold and submits only changed configurable policies', () => {
    const catalog = projectCommandCatalog({
      version: 8, configurableRoles: ['everyone', 'follower', 'subscriber', 'vip', 'moderator'],
      commands: [
        { key: 'queue:lista', access: { kind: 'configurable', minimumRole: 'everyone' }, policy: { minimumRole: 'subscriber' } },
        { key: 'queue:add', access: { kind: 'fixed', minimumRole: 'moderator' }, policy: { minimumRole: 'moderator' } },
      ],
    });
    expect(catalog[0]).toMatchObject({ minimumRole: 'subscriber', locked: false, inheritedRoles: ['subscriber', 'vip', 'moderator', 'streamer'] });
    expect(catalog[1]).toMatchObject({ minimumRole: 'moderator', locked: true });
    const cards = [{ dataset: { commandKey: 'queue:lista' }, querySelector: () => ({ value: 'vip', dataset: { dirty: 'true' } }) }];
    expect(collectCommandPolicies(catalog, cards)).toEqual({ 'queue:lista': { minimumRole: 'vip' } });
  });

  it('collects dirty policies from cards nested inside the rendered command sections', () => {
    const catalog = projectCommandCatalog({
      version: 8, configurableRoles: ['everyone', 'follower', 'subscriber', 'vip', 'moderator'],
      commands: [{ key: 'queue:lista', access: { kind: 'configurable', minimumRole: 'everyone' }, policy: { minimumRole: 'subscriber' } }],
    });
    const card = {
      dataset: { commandKey: 'queue:lista' },
      querySelector: () => ({ value: 'vip', dataset: { dirty: 'true' } }),
    };
    const section = { querySelectorAll: (selector) => selector === '.command-policy-card' ? [card] : [] };

    expect(collectCommandPolicies(catalog, [section])).toEqual({ 'queue:lista': { minimumRole: 'vip' } });
  });

  it('requests follower scope consent without materializing implicit policy defaults', () => {
    const request = followerAuthorizationRequest({ version: 9, followerScopeReady: false, commands: [
      { key: 'queue:lista', access: { kind: 'configurable' }, policy: { minimumRole: 'follower' }, policyOverridden: true },
      { key: 'queue:posicao', access: { kind: 'configurable' }, policy: { minimumRole: 'follower' }, policyOverridden: false },
    ] });
    expect(request).toEqual({ expectedVersion: 9, policies: {}, scopeOnly: true });
    expect(followerAuthorizationRequest({ version: 9, followerScopeReady: true, commands: [] })).toBeNull();
  });

  it('keeps the effective threshold after a successful policy update', () => {
    const initial = { version: 3, commands: [
      { key: 'queue:lista', access: { kind: 'configurable', minimumRole: 'everyone' }, policy: { minimumRole: 'everyone' } },
      { key: 'global:queue:ping', access: { kind: 'fixed', minimumRole: 'moderator' }, policy: { minimumRole: 'moderator' } },
    ] };
    const projected = projectCommandCatalog(mergeCommandPolicyState(initial, {
      schemaVersion: 3, version: 4, policies: { 'queue:lista': { minimumRole: 'subscriber' } },
    }));
    expect(projected[0]).toMatchObject({ minimumRole: 'subscriber', locked: false });
    expect(projected[1]).toMatchObject({ minimumRole: 'moderator', locked: true });
  });
});

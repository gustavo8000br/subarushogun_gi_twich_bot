import { describe, expect, it } from 'vitest';
import { resolveAllowedRoles, resolveCommandAccess } from '../../apps/api/src/commands/catalog.mjs';

const definition = { key: 'queue:lista', defaultRoles: [], minimumRole: 'subscriber' };

describe('hierarchical command policy', () => {
  it('grants a subscriber threshold to subscriber and higher verified groups, not everyone', () => {
    const check = (roles) => resolveCommandAccess({ definition, roles, allowVipManagement: true });

    expect(check(['subscriber'])).toMatchObject({ allowed: true, reason: 'allowed' });
    expect(check(['vip'])).toMatchObject({ allowed: true, reason: 'allowed' });
    expect(check(['moderator'])).toMatchObject({ allowed: true, reason: 'allowed' });
    expect(check(['streamer'])).toMatchObject({ allowed: true, reason: 'allowed' });
    expect(check(['viewer'])).toMatchObject({ allowed: false, reason: 'role_not_allowed' });
  });

  it('does not count VIP evidence when VIP management is disabled', () => {
    expect(resolveCommandAccess({ definition, roles: ['vip'], allowVipManagement: false }))
      .toMatchObject({ allowed: false, reason: 'role_not_allowed' });
  });

  it('projects a minimum threshold to its inherited audience and preserves legacy exact lists', () => {
    expect(resolveAllowedRoles(definition, { [definition.key]: { mode: 'minimum_role', minimumRole: 'subscriber' } }))
      .toEqual(['subscriber', 'vip', 'moderator']);
    expect(resolveAllowedRoles(definition, { [definition.key]: { mode: 'legacy_exact', allowedRoles: ['subscriber', 'moderator'] } }))
      .toEqual(['subscriber', 'moderator']);
  });
});

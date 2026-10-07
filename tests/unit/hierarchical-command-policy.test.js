import { describe, expect, it } from 'vitest';
import { getCommandDefinition, resolveCommandAccess } from '../../apps/api/src/commands/catalog.mjs';

const definition = getCommandDefinition({ scope: 'queue', command: 'lista' });

describe('hierarchical command policy', () => {
  it('grants subscriber threshold to subscriber and higher verified groups', () => {
    const check = (roles) => resolveCommandAccess({ definition, policy: { minimumRole: 'subscriber' }, roles, allowVipManagement: true });
    for (const role of ['subscriber', 'vip', 'moderator', 'streamer']) expect(check([role]).allowed).toBe(true);
    expect(check(['follower']).allowed).toBe(false);
    expect(check(['viewer']).allowed).toBe(false);
  });

  it('does not count VIP evidence when VIP management is disabled', () => {
    expect(resolveCommandAccess({ definition, policy: { minimumRole: 'vip' }, roles: ['vip'], allowVipManagement: false }))
      .toMatchObject({ allowed: false, reason: 'role_not_allowed' });
  });
});

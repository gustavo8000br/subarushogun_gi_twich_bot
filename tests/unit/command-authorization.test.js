import { describe, expect, it } from 'vitest';
import { authorizeCommand } from '../../apps/api/src/commands/authorization.mjs';

const localMessage = (overrides = {}) => ({
  channelId: 'broadcaster-1',
  sourceChannelId: 'broadcaster-1',
  userId: 'viewer-1',
  badges: [],
  ...overrides,
});

const parsed = (command, args = []) => ({ scope: 'queue', queueKey: 'abismo', command, args });
const check = (message, command, settings = {}) => authorizeCommand({
  broadcasterId: 'broadcaster-1', message, command, allowVipManagement: false, ...settings,
});

describe('command authorization', () => {
  it('allows viewers to list and query only through their own message identity', () => {
    expect(check(localMessage(), parsed('lista'))).toMatchObject({ allowed: true, role: 'viewer', actorId: 'viewer-1' });
    expect(check(localMessage(), parsed('posicao'))).toMatchObject({ allowed: true, role: 'viewer', actorId: 'viewer-1' });
    expect(check(localMessage(), parsed('sair'))).toMatchObject({ allowed: true, role: 'viewer', actorId: 'viewer-1' });
    expect(check(localMessage(), parsed('sair', ['other-user']))).toMatchObject({ allowed: false, reason: 'viewer_identity_required' });
  });

  it('recognizes streamer by broadcaster user ID and moderator by current trusted badge', () => {
    expect(check(localMessage({ userId: 'broadcaster-1' }), parsed('abrir')))
      .toMatchObject({ allowed: true, role: 'streamer', actorId: 'broadcaster-1' });
    expect(check(localMessage({ badges: [{ setId: 'moderator' }] }), parsed('proximo')))
      .toMatchObject({ allowed: true, role: 'moderator', actorId: 'viewer-1' });
  });

  it('does not grant management from names, mentions, message text, or untrusted mod-like properties', () => {
    const message = localMessage({
      userLogin: 'moderator', displayName: '@Streamer', text: 'moderator abrir', isModerator: true,
    });
    expect(check(message, parsed('abrir'))).toMatchObject({ allowed: false, role: 'viewer' });
  });

  it('keeps VIP management disabled by default and enables it only from explicit setting plus badge', () => {
    const vip = localMessage({ badges: [{ setId: 'vip' }] });
    expect(check(vip, parsed('abrir'))).toMatchObject({ allowed: false, role: 'viewer' });
    expect(check(vip, parsed('abrir'), { allowVipManagement: true }))
      .toMatchObject({ allowed: true, role: 'vip' });
  });

  it('rejects messages from another channel or a shared-chat source outside this broadcaster', () => {
    expect(check(localMessage({ channelId: 'other-channel' }), parsed('abrir')))
      .toMatchObject({ allowed: false, reason: 'wrong_channel' });
    expect(check(localMessage({ sourceChannelId: 'other-channel', badges: [{ setId: 'moderator' }] }), parsed('abrir')))
      .toMatchObject({ allowed: false, reason: 'wrong_channel' });
  });

  it('allows account query to viewers and makes account changes streamer-only', () => {
    expect(check(localMessage(), { scope: 'global', command: 'conta', args: [] }))
      .toMatchObject({ allowed: true, role: 'viewer' });
    expect(check(localMessage(), { scope: 'global', command: 'conta', args: ['reset'] }))
      .toMatchObject({ allowed: false, role: 'viewer' });
    expect(check(localMessage({ badges: [{ setId: 'moderator' }] }), { scope: 'global', command: 'conta', args: ['reset'] }))
      .toMatchObject({ allowed: false, role: 'moderator', reason: 'streamer_only' });
    expect(check(localMessage({ userId: 'broadcaster-1' }), { scope: 'global', command: 'conta', args: ['reset'] }))
      .toMatchObject({ allowed: true, role: 'streamer' });
  });

  it('does not let a manager use viewer self-service commands against another identity', () => {
    expect(check(localMessage({ badges: [{ setId: 'moderator' }] }), parsed('sair', ['other-user'])))
      .toMatchObject({ allowed: false, reason: 'viewer_identity_required' });
  });

  it('allows global ping only to the broadcaster or a current target-channel moderator', () => {
    const ping = { scope: 'global', command: 'queue', args: ['ping'] };
    expect(check(localMessage(), ping)).toMatchObject({ allowed: false, reason: 'role_not_allowed' });
    expect(check(localMessage({ badges: [{ setId: 'moderator' }] }), ping)).toMatchObject({ allowed: true, role: 'moderator' });
    expect(check(localMessage({ userId: 'broadcaster-1' }), ping)).toMatchObject({ allowed: true, role: 'streamer' });
    expect(check(localMessage({ badges: [{ setId: 'moderator' }], sourceChannelId: 'other-channel' }), ping))
      .toMatchObject({ allowed: false, reason: 'wrong_channel' });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createEventSubRuntime } from '../../apps/api/src/twitch/eventsub-runtime.mjs';
import { authorizeCommand } from '../../apps/api/src/commands/authorization.mjs';
import { parseChatCommand } from '../../apps/api/src/commands/parser.mjs';

function listenerFake() {
  const handlers = {};
  return {
    handlers,
    start: vi.fn(),
    stop: vi.fn(),
    onChannelRedemptionAdd: vi.fn((_userId, handler) => { handlers.add = handler; }),
    onChannelRedemptionUpdate: vi.fn((_userId, handler) => { handlers.update = handler; }),
    onChannelChatMessage: vi.fn((_broadcaster, _user, handler) => { handlers.chat = handler; }),
    onUserSocketDisconnect: vi.fn((handler) => { handlers.disconnect = handler; }),
    onUserSocketReady: vi.fn((handler) => { handlers.ready = handler; }),
    onRevoke: vi.fn((handler) => { handlers.revoke = handler; }),
  };
}

describe('EventSub WebSocket runtime', () => {
  it('subscribes redemption add/update and broadcaster chat through the authenticated user socket', () => {
    const listener = listenerFake();
    const runtime = createEventSubRuntime({
      apiClient: {}, broadcasterId: 'channel-1', listenerFactory: () => listener,
      onRedemptionAdd: vi.fn(), onRedemptionUpdate: vi.fn(), onChatMessage: vi.fn(),
    });
    expect(listener.onChannelRedemptionAdd).toHaveBeenCalledWith('channel-1', expect.any(Function));
    expect(listener.onChannelRedemptionUpdate).toHaveBeenCalledWith('channel-1', expect.any(Function));
    expect(listener.onChannelChatMessage).toHaveBeenCalledWith('channel-1', 'channel-1', expect.any(Function));
    expect(listener.start).toHaveBeenCalledOnce();
    runtime.stop();
    expect(listener.stop).toHaveBeenCalledOnce();
  });

  it('normalizes SDK events, rejects other channels and ignores shared-chat messages sourced elsewhere', () => {
    const listener = listenerFake();
    const onAdd = vi.fn();
    const onUpdate = vi.fn();
    const onChat = vi.fn();
    createEventSubRuntime({
      apiClient: {}, broadcasterId: 'channel-1', listenerFactory: () => listener,
      onRedemptionAdd: onAdd, onRedemptionUpdate: onUpdate, onChatMessage: onChat,
    });
    listener.handlers.add({
      id: 'redemption-1', broadcasterId: 'channel-1', rewardId: 'reward-1', userId: 'viewer-1',
      userName: 'viewer', userDisplayName: 'Viewer', input: '123456789', status: 'unfulfilled',
      redemptionDate: new Date('2026-10-03T12:00:00Z'),
    });
    listener.handlers.update({ id: 'redemption-1', broadcasterId: 'other', rewardId: 'reward-1', status: 'fulfilled' });
    listener.handlers.chat({
      broadcasterId: 'channel-1', chatterId: 'viewer-1', chatterName: 'viewer', chatterDisplayName: 'Viewer',
      messageId: 'message-1', messageText: '!fila', badges: { moderator: '1' }, sourceBroadcasterId: 'other',
    });
    listener.handlers.chat({
      broadcasterId: 'channel-1', chatterId: 'viewer-1', chatterName: 'viewer', chatterDisplayName: 'Viewer',
      messageId: 'message-2', messageText: '!fila', badges: { moderator: '1' }, sourceBroadcasterId: null,
    });

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      id: 'redemption-1', status: 'UNFULFILLED', userLogin: 'viewer', userInput: '123456789',
    }));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onChat).toHaveBeenCalledOnce();
    expect(onChat).toHaveBeenCalledWith(expect.objectContaining({ id: 'message-2', userId: 'viewer-1', userLogin: 'viewer', channelId: 'channel-1', text: '!fila' }));
  });

  it('authorizes commands using Twurple badge objects emitted by the real EventSub callback', () => {
    const listener = listenerFake();
    let decision;
    createEventSubRuntime({
      apiClient: {}, broadcasterId: 'channel-1', listenerFactory: () => listener,
      onRedemptionAdd() {}, onRedemptionUpdate() {},
      onChatMessage: (message) => {
        decision = authorizeCommand({
          broadcasterId: 'channel-1', message,
          command: parseChatCommand('!fila proximo'),
        });
      },
    });

    listener.handlers.chat({
      broadcasterId: 'channel-1', chatterId: 'mod-1', chatterName: 'moderator',
      chatterDisplayName: 'Moderator', messageId: 'message-3', messageText: '!fila proximo',
      badges: { moderator: '1', subscriber: '12' }, sourceBroadcasterId: null,
    });

    expect(decision).toMatchObject({ allowed: true, role: 'moderator', roles: ['moderator', 'subscriber'] });
  });

  it('requests reconciliation after a real socket drop and reports revocation', () => {
    const listener = listenerFake();
    const onReconnect = vi.fn();
    const onRevoked = vi.fn();
    createEventSubRuntime({
      apiClient: {}, broadcasterId: 'channel-1', listenerFactory: () => listener,
      onRedemptionAdd() {}, onRedemptionUpdate() {}, onChatMessage() {}, onReconnected: onReconnect, onRevoked,
    });
    listener.handlers.ready('channel-1', 'socket-1');
    listener.handlers.disconnect('channel-1', new Error('disconnected'));
    listener.handlers.ready('channel-1', 'socket-2');
    listener.handlers.revoke({ type: 'channel.chat.message' }, 'authorization_revoked');
    expect(onReconnect).toHaveBeenCalledOnce();
    expect(onRevoked).toHaveBeenCalledWith('channel.chat.message', 'authorization_revoked');
  });

  it('signals when the first authenticated socket is ready so startup reconciliation can begin', () => {
    const listener = listenerFake();
    const onReady = vi.fn();
    createEventSubRuntime({
      apiClient: {}, broadcasterId: 'channel-1', listenerFactory: () => listener,
      onRedemptionAdd() {}, onRedemptionUpdate() {}, onChatMessage() {}, onReady,
    });
    listener.handlers.ready('channel-1', 'socket-1');
    expect(onReady).toHaveBeenCalledOnce();
  });
});

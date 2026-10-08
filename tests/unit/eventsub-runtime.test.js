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
  it('subscribes to broadcaster chat without reward events when redemption handling is disabled', () => {
    const listener = listenerFake();
    const onChatMessage = vi.fn();
    createEventSubRuntime({
      apiClient: {}, broadcasterId: 'channel-1', listenerFactory: () => listener,
      redemptionsEnabled: false, onRedemptionAdd: vi.fn(), onRedemptionUpdate: vi.fn(), onChatMessage,
    });

    expect(listener.onChannelChatMessage).toHaveBeenCalledWith('channel-1', 'channel-1', expect.any(Function));
    expect(listener.onChannelRedemptionAdd).not.toHaveBeenCalled();
    expect(listener.onChannelRedemptionUpdate).not.toHaveBeenCalled();
    expect(listener.start).toHaveBeenCalledOnce();
  });

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
          command: parseChatCommand('!abismo proximo'),
        });
      },
    });

    listener.handlers.chat({
      broadcasterId: 'channel-1', chatterId: 'mod-1', chatterName: 'moderator',
      chatterDisplayName: 'Moderator', messageId: 'message-3', messageText: '!abismo proximo',
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

  it('reports initial socket exhaustion separately from a previously connected socket drop', () => {
    const listener = listenerFake();
    const onDisconnect = vi.fn();
    createEventSubRuntime({
      apiClient: {}, broadcasterId: 'channel-1', listenerFactory: () => listener,
      onRedemptionAdd() {}, onRedemptionUpdate() {}, onChatMessage() {}, onDisconnect,
    });
    listener.handlers.disconnect('channel-1', new Error('temporary failure'));
    expect(onDisconnect).toHaveBeenCalledWith({ established: false });
    listener.handlers.ready('channel-1', 'socket-1');
    listener.handlers.disconnect('channel-1', new Error('temporary failure'));
    expect(onDisconnect).toHaveBeenLastCalledWith({ established: true });
  });

  it('replaces Twurple EventSub raw logs with correlated safe diagnostics', () => {
    const reportError = vi.fn(() => 'diagnostic-ref');
    let config;
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const listener = listenerFake();
    createEventSubRuntime({
      apiClient: {}, broadcasterId: 'channel-1', reportError,
      listenerFactory: (_client, listenerConfig) => {
        config = listenerConfig;
        return listener;
      },
      onRedemptionAdd() {}, onRedemptionUpdate() {}, onChatMessage() {},
    });
    config.logger.custom(1, 'raw authorization=secret response');
    expect(reportError).toHaveBeenCalledWith({ source: 'twitch.eventsub', errorType: 'EventSubError' });
    expect(stderr.mock.calls.flat().join(' ')).toContain('diagnostic-ref');
    expect(stderr.mock.calls.flat().join(' ')).not.toContain('authorization=secret');
    stderr.mockRestore();
  });
});

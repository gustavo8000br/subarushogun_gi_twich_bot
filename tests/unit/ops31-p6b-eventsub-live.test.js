// OPS-31 P6b (FT-90, U40-03): the `stream.online` / `stream.offline` subscriptions in the SAME EventSub listener, with the injectable
// listenerFactory. Callbacks are guarded by broadcasterId, not gated by `redemptionsEnabled`, isolated by `dispatch`, and the mapped payload
// carries only `{streamId, type, startedAt, broadcasterId}` (online) and `{streamId|null, broadcasterId, receivedAt}` (offline).
import { describe, expect, it, vi } from 'vitest';
import { rawDataSymbol } from '@twurple/common';
import { createEventSubRuntime } from '../../apps/api/src/twitch/eventsub-runtime.mjs';

function listenerFake() {
  const handlers = {};
  return {
    handlers, start: vi.fn(), stop: vi.fn(),
    onChannelRedemptionAdd: vi.fn((_u, handler) => { handlers.add = handler; }),
    onChannelRedemptionUpdate: vi.fn((_u, handler) => { handlers.update = handler; }),
    onChannelChatMessage: vi.fn((_b, _u, handler) => { handlers.chat = handler; }),
    onStreamOnline: vi.fn((_u, handler) => { handlers.online = handler; }),
    onStreamOffline: vi.fn((_u, handler) => { handlers.offline = handler; }),
    onUserSocketDisconnect: vi.fn((handler) => { handlers.disconnect = handler; }),
    onUserSocketReady: vi.fn((handler) => { handlers.ready = handler; }),
    onRevoke: vi.fn((handler) => { handlers.revoke = handler; }),
  };
}
const base = (listener, extra = {}) => createEventSubRuntime({
  apiClient: {}, broadcasterId: 'channel-1', listenerFactory: () => listener,
  onRedemptionAdd: vi.fn(), onRedemptionUpdate: vi.fn(), onChatMessage: vi.fn(), ...extra,
});
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('OPS-31 P6b EventSub live subscriptions', () => {
  it('subscribes both stream events on the same listener for the broadcaster, before start()', () => {
    const listener = listenerFake();
    base(listener, { onStreamOnline: vi.fn(), onStreamOffline: vi.fn() });
    expect(listener.onStreamOnline).toHaveBeenCalledWith('channel-1', expect.any(Function));
    expect(listener.onStreamOffline).toHaveBeenCalledWith('channel-1', expect.any(Function));
    expect(listener.onStreamOffline.mock.invocationCallOrder[0]).toBeLessThan(listener.start.mock.invocationCallOrder[0]);
  });

  it('does not subscribe the stream events when no live callback is given (older callers and fakes keep working)', () => {
    const listener = listenerFake();
    base(listener);
    expect(listener.onStreamOnline).not.toHaveBeenCalled();
    expect(listener.onStreamOffline).not.toHaveBeenCalled();
  });

  it('is NOT gated by redemptionsEnabled: an ineligible channel still gets the live events', () => {
    const listener = listenerFake();
    base(listener, { redemptionsEnabled: false, onStreamOnline: vi.fn(), onStreamOffline: vi.fn() });
    expect(listener.onChannelRedemptionAdd).not.toHaveBeenCalled();
    expect(listener.onStreamOnline).toHaveBeenCalledOnce();
    expect(listener.onStreamOffline).toHaveBeenCalledOnce();
  });

  it('maps the online event to the minimal payload (no title, login or name)', () => {
    const listener = listenerFake();
    const onStreamOnline = vi.fn();
    base(listener, { onStreamOnline, onStreamOffline: vi.fn() });
    const startDate = new Date('2030-01-01T10:00:00.000Z');
    listener.handlers.online({ id: 'stream-1', type: 'live', startDate, broadcasterId: 'channel-1', broadcasterName: 'login-x', broadcasterDisplayName: 'Name X' });
    expect(onStreamOnline).toHaveBeenCalledWith({ streamId: 'stream-1', type: 'live', startedAt: startDate, broadcasterId: 'channel-1' });
  });

  it('rejects an event of another channel (online and offline)', () => {
    const listener = listenerFake();
    const onStreamOnline = vi.fn();
    const onStreamOffline = vi.fn();
    base(listener, { onStreamOnline, onStreamOffline });
    listener.handlers.online({ id: 's', type: 'live', startDate: new Date(), broadcasterId: 'other' });
    listener.handlers.offline({ broadcasterId: 'other' });
    expect(onStreamOnline).not.toHaveBeenCalled();
    expect(onStreamOffline).not.toHaveBeenCalled();
  });

  it('maps offline with the receive time from the injected clock; the stream id comes only from the raw payload, else null', () => {
    const listener = listenerFake();
    const onStreamOffline = vi.fn();
    const receivedAt = new Date('2030-01-01T11:00:00.000Z');
    base(listener, { onStreamOnline: vi.fn(), onStreamOffline, clock: () => receivedAt });
    listener.handlers.offline({ broadcasterId: 'channel-1', broadcasterName: 'login-x' });
    expect(onStreamOffline).toHaveBeenLastCalledWith({ streamId: null, broadcasterId: 'channel-1', receivedAt });
    listener.handlers.offline({ broadcasterId: 'channel-1', [rawDataSymbol]: { id: 'raw-stream' } });
    expect(onStreamOffline.mock.calls[1][0].streamId).toBe('raw-stream');
    listener.handlers.offline({ broadcasterId: 'channel-1', id: 'plain-stream' });
    expect(onStreamOffline.mock.calls[2][0].streamId).toBe('plain-stream');
    // a non-string or oversized id is never trusted
    listener.handlers.offline({ broadcasterId: 'channel-1', id: 4242 });
    listener.handlers.offline({ broadcasterId: 'channel-1', id: 'x'.repeat(65) });
    expect(onStreamOffline.mock.calls[3][0].streamId).toBeNull();
    expect(onStreamOffline.mock.calls[4][0].streamId).toBeNull();
  });

  it('isolates a throwing or rejecting live handler through dispatch (onError, no crash)', async () => {
    const listener = listenerFake();
    const onError = vi.fn();
    base(listener, { onError, onStreamOnline: () => { throw new Error('boom'); }, onStreamOffline: async () => { throw new Error('boom'); } });
    listener.handlers.online({ id: 's', type: 'live', startDate: new Date(), broadcasterId: 'channel-1' });
    listener.handlers.offline({ broadcasterId: 'channel-1' });
    await flush();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith('event_handler_failed');
  });
});

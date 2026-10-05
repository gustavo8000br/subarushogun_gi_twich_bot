import { describe, expect, it, vi } from 'vitest';
import { createChatOutboxWorker } from '../../apps/api/src/outbox/chat-worker.mjs';

function harness({ sent = true, status = 'called', uidMode = 'hidden', showUidOnCall = false } = {}) {
  const repository = {
    claimNextChatNotification: vi.fn(async () => ({ id: 'task', entry: { id: 'entry', status, userLogin: 'viewer', uid: '123456789', callPosition: 3, queue: { title: 'Abyss', uidMode, showUidOnCall, callMessage: '{user} {queue} {position}{uid}', callTimeoutMin: 10 } } })),
    recordCallNotificationResult: vi.fn(async () => undefined),
    finishCallNotification: vi.fn(async () => undefined),
    getCurrentAccount: vi.fn(async () => ({ label: 'World' })),
  };
  const twitch = { sendChatMessage: vi.fn(async () => ({ sent })) };
  return { worker: createChatOutboxWorker({ repository, twitch }), repository, twitch };
}

describe('chat call outbox', () => {
  it('uses current privacy state and starts no deadline until actual delivery is confirmed', async () => {
    const h = harness({ sent: false, uidMode: 'visible', showUidOnCall: true });
    expect(await h.worker.processOne()).toBe('retry');
    expect(h.twitch.sendChatMessage).toHaveBeenCalledWith('@viewer Abyss 3 · UID 123456789');
    expect(h.repository.recordCallNotificationResult).not.toHaveBeenCalled();
  });

  it('omits UID when the queue has since switched to hidden mode', async () => {
    const h = harness({ uidMode: 'hidden', showUidOnCall: true });
    expect(await h.worker.processOne()).toBe('confirmed');
    expect(h.twitch.sendChatMessage).toHaveBeenCalledWith('@viewer Abyss 3');
    expect(h.repository.recordCallNotificationResult).toHaveBeenCalledWith(expect.objectContaining({ entryId: 'entry', sent: true }));
  });

  it('cancels a stale call instead of notifying a terminal entry', async () => {
    const h = harness({ status: 'removed' });
    expect(await h.worker.processOne()).toBe('cancelled');
    expect(h.twitch.sendChatMessage).not.toHaveBeenCalled();
    expect(h.repository.finishCallNotification).toHaveBeenCalledWith('task', { status: 'cancelled', errorCode: 'entry_not_called' });
  });
});

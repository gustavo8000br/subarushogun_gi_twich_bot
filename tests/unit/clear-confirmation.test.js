import { describe, expect, it, vi } from 'vitest';
import { createClearConfirmationService } from '../../apps/api/src/domain/clear-confirmation.mjs';

const entries = [
  { id: 'entry-1', version: 1, status: 'waiting', source: 'redemption', redemptionId: 'redemption-1' },
  { id: 'entry-2', version: 3, status: 'called', source: 'manual', redemptionId: null },
];

function makeService({ clock = () => new Date('2026-10-03T12:00:00Z'), currentEntries = entries } = {}) {
  const repository = {
    listEntriesByStatus: vi.fn(async () => currentEntries),
    clearActiveEntries: vi.fn(async () => ({ status: 'cleared', count: currentEntries.length })),
  };
  return { repository, service: createClearConfirmationService({ repository, clock }) };
}

describe('queue clear confirmation', () => {
  it('previews point outcomes without mutating and clears only for same actor, channel and queue', async () => {
    const h = makeService();
    const preview = await h.service.request({ actorId: 'mod-1', channelId: 'channel-1', queueId: 'queue-1' });
    expect(preview).toMatchObject({ status: 'confirmation_required', count: 2, refundsRequested: 1, expiresInSeconds: 15 });
    expect(h.repository.clearActiveEntries).not.toHaveBeenCalled();
    expect(await h.service.confirm({ actorId: 'mod-2', channelId: 'channel-1', queueId: 'queue-1' })).toMatchObject({ status: 'confirmation_required' });
    expect(await h.service.confirm({ actorId: 'mod-1', channelId: 'other-channel', queueId: 'queue-1' })).toMatchObject({ status: 'confirmation_required' });
    const result = await h.service.confirm({ actorId: 'mod-1', channelId: 'channel-1', queueId: 'queue-1' });
    expect(result.status).toBe('cleared');
    expect(h.repository.clearActiveEntries).toHaveBeenCalledWith({ queueId: 'queue-1', snapshot: entries, actorId: 'mod-1', origin: 'chat' });
  });

  it('requires a fresh confirmation after 15 seconds or a changed active set', async () => {
    let now = new Date('2026-10-03T12:00:00Z');
    const h = makeService({ clock: () => now });
    await h.service.request({ actorId: 'mod-1', channelId: 'channel-1', queueId: 'queue-1' });
    now = new Date(now.getTime() + 15_001);
    expect(await h.service.confirm({ actorId: 'mod-1', channelId: 'channel-1', queueId: 'queue-1' })).toMatchObject({ status: 'confirmation_required' });
    await h.service.request({ actorId: 'mod-1', channelId: 'channel-1', queueId: 'queue-1' });
    h.repository.listEntriesByStatus.mockResolvedValueOnce([...entries, { id: 'new-entry', version: 1, status: 'waiting', source: 'manual' }]);
    expect(await h.service.confirm({ actorId: 'mod-1', channelId: 'channel-1', queueId: 'queue-1' })).toMatchObject({ status: 'confirmation_required', count: 3 });
    expect(h.repository.clearActiveEntries).not.toHaveBeenCalled();
  });
});

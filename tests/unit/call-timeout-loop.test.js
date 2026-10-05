import { describe, expect, it, vi } from 'vitest';
import { createCallTimeoutLoop } from '../../apps/api/src/outbox/timeout-loop.mjs';

describe('call timeout recovery loop', () => {
  it('does not decide while reconciling, then applies no-show through domain after recovery grace', async () => {
    let recovered = false;
    const repository = { listExpiredCalledEntries: vi.fn(async () => [{ id: 'entry-1' }]) };
    const domainService = { transitionEntry: vi.fn(async () => ({ status: 'no_show' })) };
    const loop = createCallTimeoutLoop({ repository, domainService, isRecovered: () => recovered, clock: () => new Date('2026-10-03T12:01:00Z') });
    loop.start();
    expect(await loop.tick()).toBe(0);
    expect(repository.listExpiredCalledEntries).not.toHaveBeenCalled();
    recovered = true;
    expect(await loop.tick()).toBe(1);
    expect(repository.listExpiredCalledEntries).toHaveBeenCalledWith(new Date('2026-10-03T12:00:00Z'));
    expect(domainService.transitionEntry).toHaveBeenCalledWith({ entryId: 'entry-1', to: 'no_show', origin: 'timer', reason: 'call_timeout' });
    await loop.stop();
  });
});

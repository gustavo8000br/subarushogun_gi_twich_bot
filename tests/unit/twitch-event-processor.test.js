import { describe, expect, it, vi } from 'vitest';
import { createTwitchRedemptionProcessor } from '../../apps/api/src/twitch/redemption-processor.mjs';

describe('Twitch redemption processor', () => {
  it('filters other broadcasters and delegates unfulfilled app-owned events to persistence', async () => {
    const repository = { importRedemption: vi.fn(async () => ({ status: 'added' })) };
    const processor = createTwitchRedemptionProcessor({ repository, domainService: {}, broadcasterId: 'channel-1' });
    expect(await processor.onRedemptionAdd({ id: 'other', broadcasterId: 'other-channel', status: 'UNFULFILLED' }))
      .toEqual({ status: 'ignored_other_channel' });
    expect(await processor.onRedemptionAdd({ id: 'r-1', broadcasterId: 'channel-1', status: 'UNFULFILLED' }))
      .toEqual({ status: 'added' });
    expect(repository.importRedemption).toHaveBeenCalledOnce();
  });

  it('routes external terminal updates through the domain service and does not send a second financial effect', async () => {
    const entry = { id: 'entry-1', status: 'waiting', source: 'redemption', redemptionId: 'r-1' };
    const repository = {
      findEntryByRedemption: vi.fn(async () => entry),
      recordExternalRedemptionState: vi.fn(),
    };
    const domainService = { transitionEntry: vi.fn(async () => ({ status: 'completed', financialDecision: 'no_operation' })) };
    const processor = createTwitchRedemptionProcessor({ repository, domainService, broadcasterId: 'channel-1' });

    expect(await processor.onRedemptionUpdate({
      id: 'r-1', broadcasterId: 'channel-1', rewardId: 'reward-1', userId: 'viewer', status: 'fulfilled',
    })).toMatchObject({ status: 'completed' });
    expect(domainService.transitionEntry).toHaveBeenCalledWith(expect.objectContaining({
      entryId: 'entry-1', to: 'completed', origin: 'external', remoteStatus: 'FULFILLED',
    }));
    expect(repository.recordExternalRedemptionState).not.toHaveBeenCalled();
  });

  it('records terminal-before-add and external changes for rejected/history entries without creating an entry', async () => {
    const repository = {
      findEntryByRedemption: vi.fn(async () => null),
      recordTerminalRedemption: vi.fn(async () => ({ status: 'terminal_observed' })),
      recordExternalRedemptionState: vi.fn(async () => ({ status: 'external_state_recorded' })),
    };
    const processor = createTwitchRedemptionProcessor({ repository, domainService: {}, broadcasterId: 'channel-1' });
    expect(await processor.onRedemptionAdd({ id: 'early', broadcasterId: 'channel-1', status: 'CANCELED' }))
      .toMatchObject({ status: 'terminal_observed' });
    expect(await processor.onRedemptionUpdate({ id: 'rejected', broadcasterId: 'channel-1', status: 'FULFILLED' }))
      .toMatchObject({ status: 'external_state_recorded' });
    expect(repository.recordTerminalRedemption).toHaveBeenCalledOnce();
    expect(repository.recordExternalRedemptionState).toHaveBeenCalledOnce();
  });
});

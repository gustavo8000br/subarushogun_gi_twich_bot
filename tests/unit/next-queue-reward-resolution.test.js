import { describe, expect, it, vi } from 'vitest';
import { loadQueueRewardCandidates, resolveQueueReward } from '../../apps/frontend/features/queues/queue-reward-resolution.mjs';

describe('Next queue reward resolution', () => {
  it('loads only the compatible candidates and bounded diagnostics from the existing endpoint', async () => {
    const response = {
      candidates: [{ id: 'secret-id', title: 'Queue reward', cost: 350, prompt: '' }],
      diagnostics: { managedRewardCount: 3, mismatchCounts: { cost_mismatch: 2, arbitrary_secret: 99 } },
    };
    const request = vi.fn().mockResolvedValue(response);
    await expect(loadQueueRewardCandidates({ request, queueId: 'queue 1' })).resolves.toEqual({
      candidates: [{ id: 'secret-id', title: 'Queue reward', cost: 350, prompt: '' }],
      diagnostics: { managedRewardCount: 3, mismatchCounts: { cost_mismatch: 2 } },
    });
    expect(request).toHaveBeenCalledWith('/api/queues/queue%201/reward-candidates');
  });

  it('rejects malformed or non-compatible candidates rather than presenting them for selection', async () => {
    const request = vi.fn().mockResolvedValue({
      candidates: [{ id: 'reward', title: 'Reward', cost: 0, prompt: '' }],
      diagnostics: { managedRewardCount: 1, mismatchCounts: {} },
    });
    await expect(loadQueueRewardCandidates({ request, queueId: 'queue-1' })).rejects.toMatchObject({ code: 'INVALID_QUEUE_REWARD_RESOLUTION_RESPONSE' });
  });

  it('links an operator-selected candidate and requires the API to state it was not remotely confirmed', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'resolved', remoteConfirmed: false });
    await expect(resolveQueueReward({ request, queueId: 'queue-1', rewardId: 'reward-1' })).resolves.toEqual({ status: 'resolved', remoteConfirmed: false });
    expect(request).toHaveBeenCalledWith('/api/queues/queue-1/resolve-reward', { method: 'POST', body: JSON.stringify({ rewardId: 'reward-1' }) });
  });

  it('rejects unverified resolution responses without claiming Twitch confirmation', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'resolved', remoteConfirmed: true });
    await expect(resolveQueueReward({ request, queueId: 'queue-1', rewardId: 'reward-1' })).rejects.toMatchObject({ code: 'INVALID_QUEUE_REWARD_RESOLUTION_RESPONSE' });
  });
});

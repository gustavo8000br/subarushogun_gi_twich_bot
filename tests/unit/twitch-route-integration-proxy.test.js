import { describe, expect, it, vi } from 'vitest';
import { createTwitchRouteIntegrationProxy } from '../../apps/api/src/twitch/route-integration-proxy.mjs';

describe('Twitch route integration proxy', () => {
  it('exposes the active Twitch adapter dynamically to reward routes', async () => {
    let integration = null;
    const getManagedRewards = vi.fn(async () => [{ id: 'reward-1' }]);
    const proxy = createTwitchRouteIntegrationProxy(() => integration);

    expect(proxy.twitch).toBeNull();
    integration = { status: 'connected', twitch: { getManagedRewards }, chatStatus: 'connected', rewardStatus: 'available' };

    expect(await proxy.twitch.getManagedRewards()).toEqual([{ id: 'reward-1' }]);
    expect(proxy.status).toBe('connected');
    expect(proxy.chatStatus).toBe('connected');
    expect(proxy.rewardStatus).toBe('available');
    expect(getManagedRewards).toHaveBeenCalledOnce();
  });
});

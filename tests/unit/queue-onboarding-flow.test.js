import { describe, expect, it } from 'vitest';
import { getQueueOnboardingTransition } from '../../apps/web/queue-onboarding-flow.mjs';

describe('new queue onboarding', () => {
  it('opens the saved queue settings after creation without activating it', () => {
    expect(getQueueOnboardingTransition('created', {
      id: 'queue-1', queueMode: 'channel_points', remoteSyncStatus: 'pending_create', isOpen: false,
    })).toEqual({ page: 'queues', dialog: 'queue-settings', focusAction: null, canActivate: false });
  });

  it('takes the streamer to activation only after settings are saved and Twitch is synchronized', () => {
    expect(getQueueOnboardingTransition('settings_saved', {
      id: 'queue-1', queueMode: 'channel_points', remoteSyncStatus: 'synced', isOpen: false,
    })).toEqual({ page: 'queues', dialog: null, focusAction: 'open-queue', canActivate: true });
  });

  it('keeps activation disabled while Twitch has not confirmed the reward', () => {
    expect(getQueueOnboardingTransition('settings_saved', {
      id: 'queue-1', queueMode: 'channel_points', remoteSyncStatus: 'diverged', isOpen: false,
    })).toEqual({ page: 'queues', dialog: null, focusAction: 'open-queue', canActivate: false });
  });

  it('accepts local queues as ready for their explicit open action', () => {
    expect(getQueueOnboardingTransition('settings_saved', {
      id: 'queue-2', queueMode: 'manual_only', remoteSyncStatus: 'local_only', isOpen: false,
    })).toEqual({ page: 'queues', dialog: null, focusAction: 'open-queue', canActivate: true });
  });
});

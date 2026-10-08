import { describe, expect, it } from 'vitest';
import { canRetryQueueSettingsAfterVersionBump } from '../../apps/web/queue-settings-version.mjs';

describe('queue settings save after a remote status update', () => {
  const baselineSettings = {
    callTimeoutMin: 10, callMessage: 'Next: {user}', showUidInList: false,
    showUidInOverlay: false, showUidOnCall: false, autoSwitchAccount: false,
    refundIfRemovedWhileCalled: true, refundOnNoShow: false, refundIfViewerLeavesCalled: false,
  };

  it('allows one save retry when only the queue version changed during the remote reward create', () => {
    expect(canRetryQueueSettingsAfterVersionBump({
      expectedVersion: 1, baselineSettings,
      latestQueue: { id: 'queue-1', version: 2, lifecycleStatus: 'active', isOpen: false, ...baselineSettings },
    })).toBe(true);
  });

  it('does not retry over settings edited by another operation or over an unavailable queue', () => {
    expect(canRetryQueueSettingsAfterVersionBump({
      expectedVersion: 1, baselineSettings,
      latestQueue: { id: 'queue-1', version: 2, lifecycleStatus: 'active', isOpen: false, ...baselineSettings, callTimeoutMin: 15 },
    })).toBe(false);
    expect(canRetryQueueSettingsAfterVersionBump({
      expectedVersion: 1, baselineSettings,
      latestQueue: { id: 'queue-1', version: 2, lifecycleStatus: 'deleting', isOpen: false, ...baselineSettings },
    })).toBe(false);
  });
});

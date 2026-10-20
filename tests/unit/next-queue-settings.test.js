import { describe, expect, it, vi } from 'vitest';
import {
  buildQueueSettingsPayload,
  saveQueueSettingsWithRetry,
  getQueueSettingsFeedback,
  getQueueSettingsFailureKey,
  queueSettingsMatch,
  reconcileQueueSettingsDraft,
} from '../../apps/frontend/features/queues/queue-settings.mjs';

const baseline = {
  callTimeoutMin: 10, callMessage: '{user}, sua vez!', showUidInList: false,
  showUidInOverlay: false, showUidOnCall: false,
  refundIfRemovedWhileCalled: false, refundOnNoShow: false, refundIfViewerLeavesCalled: false,
};

const values = {
  expectedVersion: '3', callTimeoutMin: '', callMessage: 'Sua vez, {user}!',
  showUidInList: 'on', showUidInOverlay: '', showUidOnCall: 'on',
  refundIfRemovedWhileCalled: '', refundOnNoShow: 'on', refundIfViewerLeavesCalled: '',
};

describe('Next queue settings', () => {
  it('keeps a dirty draft separate from a newer queue projection', () => {
    const draft = { ...baseline, callMessage: 'My unsaved message' };
    expect(queueSettingsMatch(draft, baseline)).toBe(false);
    expect(queueSettingsMatch(baseline, baseline)).toBe(true);
    expect(reconcileQueueSettingsDraft({
      current: draft, draftBase: { queueId: 'q-1', version: 3, settings: baseline },
      queueId: 'q-1', queueVersion: 4, projectedSettings: baseline,
    })).toBeNull();
    expect(reconcileQueueSettingsDraft({
      current: baseline, draftBase: { queueId: 'q-1', version: 3, settings: baseline },
      queueId: 'q-1', queueVersion: 4, projectedSettings: baseline,
    })).toEqual({ queueId: 'q-1', version: 4, settings: baseline });
  });

  it('builds the versioned local settings payload with explicit checkbox values', () => {
    expect(buildQueueSettingsPayload(values)).toEqual({
      expectedVersion: 3, callTimeoutMin: null, callMessage: 'Sua vez, {user}!',
      showUidInList: true, showUidInOverlay: false, showUidOnCall: true,
      refundIfRemovedWhileCalled: false, refundOnNoShow: true, refundIfViewerLeavesCalled: false,
    });
  });

  it.each([
    [{ ...values, expectedVersion: '0' }],
    [{ ...values, callTimeoutMin: '121' }],
    [{ ...values, callTimeoutMin: '1.5' }],
    [{ ...values, callMessage: 'x'.repeat(351) }],
    [{ ...values, callMessage: 'hello\nworld' }],
  ])('rejects invalid settings before PATCH', (input) => {
    expect(() => buildQueueSettingsPayload(input)).toThrow(expect.objectContaining({ code: 'INVALID_QUEUE_SETTINGS' }));
  });

  it('saves through the existing route and accepts its versioned projection', async () => {
    const updated = { id: 'queue 1', version: 4, isOpen: false, lifecycleStatus: 'active', ...baseline, ...buildQueueSettingsPayload(values) };
    const request = vi.fn().mockResolvedValue(updated);
    await expect(saveQueueSettingsWithRetry({ request, queueId: 'queue 1', values, baselineSettings: baseline }))
      .resolves.toEqual({ queue: updated, retried: false });
    expect(request).toHaveBeenCalledWith('/api/queues/queue%201/settings', { method: 'PATCH', body: JSON.stringify(buildQueueSettingsPayload(values)) });
  });

  it('retries a 409 only when version advanced and all edited baseline fields remain unchanged', async () => {
    const latest = { id: 'queue-1', version: 4, lifecycleStatus: 'active', isOpen: false, ...baseline };
    const updated = { ...latest, ...buildQueueSettingsPayload(values), version: 5 };
    const request = vi.fn().mockRejectedValueOnce(Object.assign(new Error('stale'), { status: 409 }))
      .mockResolvedValueOnce([latest]).mockResolvedValueOnce(updated);
    await expect(saveQueueSettingsWithRetry({ request, queueId: 'queue-1', values, baselineSettings: baseline }))
      .resolves.toEqual({ queue: updated, retried: true });
    expect(request).toHaveBeenCalledTimes(3);
    expect(JSON.parse(request.mock.calls[2][1].body).expectedVersion).toBe(4);
  });

  it('does not overwrite concurrent settings changes after a 409', async () => {
    const latest = { id: 'queue-1', version: 4, lifecycleStatus: 'active', isOpen: false, ...baseline, callMessage: 'Changed by another operator' };
    const request = vi.fn().mockRejectedValueOnce(Object.assign(new Error('stale'), { status: 409 })).mockResolvedValueOnce([latest]);
    await expect(saveQueueSettingsWithRetry({ request, queueId: 'queue-1', values, baselineSettings: baseline }))
      .rejects.toMatchObject({ status: 409 });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('maps accepted settings with stale refresh feedback without losing the mutation result', () => {
    expect(getQueueSettingsFeedback({ refreshFailed: true })).toEqual({ status: 'warning', key: 'panel.queue.settings_result.refresh_failed' });
    expect(getQueueSettingsFeedback({ refreshFailed: false })).toEqual({ status: 'confirmed', key: 'panel.notice.queue_settings_saved' });
  });

  it('maps safe validation and version conflicts to localized keys', () => {
    expect(getQueueSettingsFailureKey({ status: 400, code: 'INVALID_CALL_MESSAGE_TEMPLATE' })).toBe('panel.error.invalid_call_template');
    expect(getQueueSettingsFailureKey({ status: 409 })).toBe('panel.error.stale_queue_settings');
    expect(getQueueSettingsFailureKey({ status: 503 })).toBe('panel.error.generic');
  });
});

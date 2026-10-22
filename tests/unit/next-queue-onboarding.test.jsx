/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import QueueSettingsForm from '../../apps/frontend/features/queues/queue-settings-form.jsx';
import QueueList from '../../apps/frontend/features/queues/queue-list.jsx';

const t = (key) => key;
const base = {
  id: 'queue-1', version: 2, title: 'Arena', slug: 'arena', callTimeoutMin: 10, callMessage: 'x', isOpen: false, lifecycleStatus: 'active',
  queueMode: 'manual_only', rewardOrigin: 'none', rewardId: null, remoteSyncStatus: 'local_only', entries: [],
  showUidInList: false, showUidInOverlay: false, showUidOnCall: false, refundIfRemovedWhileCalled: false, refundOnNoShow: false, refundIfViewerLeavesCalled: false,
};
const reward = { ...base, queueMode: 'channel_points', rewardOrigin: 'managed', rewardId: 'r1', remoteSyncStatus: 'synced' };

afterEach(cleanup);

describe('Next post-save queue onboarding', () => {
  it.each([
    [{ ...reward, rewardId: null, remoteSyncStatus: 'pending_create' }, 'panel.queue.onboarding.reward_pending'],
    [{ ...reward, remoteSyncStatus: 'diverged' }, 'panel.queue.onboarding.reward_diverged'],
    [{ ...reward, rewardId: null, remoteSyncStatus: 'create_failed' }, 'panel.queue.onboarding.reward_failed'],
  ])('shows a static reward notice in the settings form', (queue, key) => {
    const { container } = render(<QueueSettingsForm queue={queue} t={t} saving={false} feedback={null} onSave={() => {}} />);
    const notice = container.querySelector('.queue-settings-notice');
    expect(notice.textContent).toBe(key);
    expect(notice.getAttribute('role')).toBeNull();
    expect(notice.getAttribute('aria-live')).toBeNull();
  });

  it.each([base, reward])('shows no reward notice for local or synchronized queues', (queue) => {
    const { container } = render(<QueueSettingsForm queue={queue} t={t} saving={false} feedback={null} onSave={() => {}} />);
    expect(container.querySelector('.queue-settings-notice')).toBeNull();
  });

  it('moves focus to the enabled activate action after a save, without activating', () => {
    let toggled = 0;
    const props = { queues: [base], locale: 'en', t, onToggleQueue: () => { toggled += 1; }, onSaveSettings: () => {} };
    const view = render(<QueueList {...props} queueSettingsAction={null} />);
    view.rerender(<QueueList {...props} queueSettingsAction={{ queueId: 'queue-1', status: 'confirmed', key: 'panel.queue.onboarding.activate_next', focusActivate: true }} />);
    expect(document.activeElement?.id).toBe('queue-toggle-queue-1');
    expect(toggled).toBe(0);
  });

  it('does not move focus to a disabled activate action', () => {
    const pending = { ...reward, rewardId: null, remoteSyncStatus: 'pending_create' };
    const props = { queues: [pending], locale: 'en', t, onSaveSettings: () => {} };
    const view = render(<QueueList {...props} queueSettingsAction={null} />);
    view.rerender(<QueueList {...props} queueSettingsAction={{ queueId: 'queue-1', status: 'confirmed', key: 'panel.queue.onboarding.activate_waiting' }} />);
    expect(document.activeElement?.id).not.toBe('queue-toggle-queue-1');
  });

  it('announces a vanished call deadline once through a single polite status region', async () => {
    const { act } = await import('@testing-library/react');
    const { vi } = await import('vitest');
    vi.useFakeTimers({ now: Date.parse('2026-10-07T12:09:59.000Z') });
    const called = { ...base, entries: [{ id: 'e1', displayName: 'Ana', status: 'called', callNotifiedAt: '2026-10-07T12:00:00.000Z', callDeadlineAt: '2026-10-07T12:10:00.000Z' }] };
    const { container } = render(<QueueList queues={[called]} locale="en" t={(key, options) => (options?.values?.user ? `${key}:${options.values.user}` : key)} onSaveSettings={() => {}} />);
    expect(container.querySelectorAll('.call-deadline-announcement')).toHaveLength(1);
    expect(container.querySelector('.call-deadline-announcement').textContent).toBe('');
    act(() => { vi.advanceTimersByTime(2000); });
    const region = container.querySelector('.call-deadline-announcement');
    expect(region.getAttribute('role')).toBe('status');
    expect(region.textContent).toBe('panel.entry.call.expired_announcement:Ana');
    vi.useRealTimers();
  });
});

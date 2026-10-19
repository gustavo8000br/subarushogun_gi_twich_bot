/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import QueueRewardSettingsDialog from '../../apps/frontend/features/queues/queue-reward-settings-dialog.jsx';
import QueueRewardResolutionDialog from '../../apps/frontend/features/queues/queue-reward-resolution-dialog.jsx';

afterEach(cleanup);

beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
  }
});

const queue = {
  id: 'queue-id', version: 4, title: 'Arena', cost: 350, rewardPrompt: 'UID optional', uidMode: 'visible',
  maxRedemptionsPerStream: 20, maxRedemptionsPerUserPerStream: 2, globalCooldownSeconds: 60,
};
const t = (key) => key === 'panel.error.stale_queue_settings'
  ? 'The queue changed; your draft stays open. Copy changes and refresh before retrying.' : key;

describe('Next queue reward settings dialog', () => {
  it('submits its opened snapshot version if the queue projection changes while a draft is open', async () => {
    const onSave = vi.fn(async () => ({ status: 'pending' }));
    const { rerender, container } = render(<QueueRewardSettingsDialog queue={queue} t={t} saving={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'panel.queue.action.edit_reward' }));
    const title = container.querySelector('input[name="title"]');
    fireEvent.change(title, { target: { value: 'My draft' } });

    rerender(<QueueRewardSettingsDialog queue={{ ...queue, version: 5, title: 'External update', cost: 400 }} t={t} saving={false} onSave={onSave} />);
    expect(title.value).toBe('My draft');
    fireEvent.submit(container.querySelector('form'));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith('queue-id', expect.objectContaining({ expectedVersion: 4, title: 'My draft', cost: 350 }));
  });

  it('keeps the draft visible and explains a stale-version response', async () => {
    const onSave = vi.fn(async () => ({ status: 'error', key: 'panel.error.stale_queue_settings' }));
    const { container } = render(<QueueRewardSettingsDialog queue={queue} t={t} saving={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'panel.queue.action.edit_reward' }));
    const title = container.querySelector('input[name="title"]');
    fireEvent.change(title, { target: { value: 'My draft' } });
    fireEvent.submit(container.querySelector('form'));
    expect((await screen.findByRole('alert')).textContent).toContain('The queue changed; your draft stays open. Copy changes and refresh before retrying.');
    expect(title.value).toBe('My draft');
    expect(container.querySelector('dialog[open]')).toBeTruthy();
  });
});

describe('Next queue reward resolution dialog', () => {
  it.each([false, true])('closes after a confirmed local link when projection refresh failed=%s', async (refreshFailed) => {
    const onResolve = vi.fn(async () => ({ status: 'resolved', remoteConfirmed: false, refreshFailed }));
    render(<QueueRewardResolutionDialog queue={queue} locale="en" t={t} saving={false}
      onLoadCandidates={async () => ({ candidates: [{ id: 'reward-1', title: 'Queue reward', cost: 350 }], diagnostics: { managedRewardCount: 1, mismatchCounts: {} } })}
      onResolve={onResolve} />);
    fireEvent.click(screen.getByRole('button', { name: 'panel.queue.action.resolve_reward' }));
    await screen.findByRole('combobox');
    fireEvent.click(screen.getByRole('button', { name: 'panel.reward.link_selected' }));
    await waitFor(() => expect(onResolve).toHaveBeenCalledWith(queue.id, 'reward-1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

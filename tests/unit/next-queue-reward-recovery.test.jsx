/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../apps/frontend/lib/api/client.mjs', () => ({
  apiClient: { request: vi.fn(), initializeSession: vi.fn(async () => ({ status: 'ready' })) },
}));

import { apiClient } from '../../apps/frontend/lib/api/client.mjs';
import { PanelProvider, usePanel } from '../../apps/frontend/features/panel-shell/panel-provider.jsx';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const queue = {
  id: 'queue-reward', slug: 'reward', title: 'Reward queue', isOpen: false, entries: [],
};
const state = { product_version: '0.2.0-beta', account: { label: 'Streamer' }, pending_operations: [] };
const catalogs = {
  locales: ['pt-BR'],
  modules: { panel: { catalogs: { 'pt-BR': { 'panel.reward.link_refresh_failed': 'Link saved; refresh the queue.', 'panel.reward.link_refreshed': 'Queue refreshed.' } } } },
};

function RecoveryConsumer() {
  const { resolveQueueReward, refreshQueueProjection, queueAction } = usePanel();
  const stale = queueAction?.key === 'panel.reward.link_refresh_failed';
  return <>
    <button type="button" disabled={stale} onClick={() => void resolveQueueReward(queue.id, 'reward-1')}>Link reward</button>
    {queueAction ? <p role={queueAction.status === 'warning' ? 'alert' : 'status'}>{queueAction.key}{queueAction.referenceId ? `:${queueAction.referenceId}` : ''}</p> : null}
    {stale ? <button type="button" onClick={() => void refreshQueueProjection({ purpose: 'reward-link' })}>Refresh queue projection</button> : null}
  </>;
}

describe('Next reward association refresh recovery', () => {
  it('retains a safe reference, blocks relinking, and releases the block after refresh succeeds', async () => {
    let queueReads = 0;
    apiClient.request.mockImplementation(async (path, options) => {
      if (path === '/api/localization/catalogs') return catalogs;
      if (path === '/api/state') return state;
      if (path === '/api/setup') return {};
      if (path === '/health') return {};
      if (path === '/api/queues') {
        queueReads += 1;
        if (queueReads === 2) throw Object.assign(new Error('private refresh detail'), { referenceId: 'reward-read-4' });
        return [queue];
      }
      if (path === '/api/queues/queue-reward/resolve-reward' && options?.method === 'POST') return { status: 'resolved', remoteConfirmed: false };
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<PanelProvider fallbackCatalog={{ 'pt-BR': catalogs.modules.panel.catalogs['pt-BR'] }}><RecoveryConsumer /></PanelProvider>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Link reward' }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Link reward' }));
    await waitFor(() => expect(apiClient.request).toHaveBeenCalledWith('/api/queues/queue-reward/resolve-reward', expect.objectContaining({ method: 'POST' })));

    expect(await screen.findByText('panel.reward.link_refresh_failed:reward-read-4')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Link reward' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh queue projection' }));
    expect(await screen.findByText('panel.reward.link_refreshed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Link reward' }).disabled).toBe(false);
    expect(apiClient.request.mock.calls.filter(([path, options]) => path === '/api/queues/queue-reward/resolve-reward' && options?.method === 'POST')).toHaveLength(1);
  });
});

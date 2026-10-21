/** @vitest-environment jsdom */
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../apps/frontend/lib/api/client.mjs', () => ({
  apiClient: { request: vi.fn(), initializeSession: vi.fn(async () => ({ status: 'ready' })) },
}));

import { apiClient } from '../../apps/frontend/lib/api/client.mjs';
import { PanelProvider, usePanel } from '../../apps/frontend/features/panel-shell/panel-provider.jsx';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const queue = {
  id: 'queue-1', slug: 'arena', title: 'Arena', isOpen: false, lifecycleStatus: 'deleting',
  queueMode: 'channel_points', rewardId: 'reward-1', remoteSyncStatus: 'delete_pending', entries: [],
};
const state = { product_version: '0.2.0-beta', account: { label: 'Streamer' }, pending_operations: [] };
const bundle = { locales: ['pt-BR'], modules: { panel: { catalogs: { 'pt-BR': {} } } } };

function LifecycleConsumer() {
  const { runQueueLifecycleAction, status } = usePanel();
  const [result, setResult] = useState(null);
  return <>
    <button type="button" disabled={status !== 'ready'} onClick={async () => setResult(await runQueueLifecycleAction('queue-1', 'cancel-delete'))}>Cancelar exclusão</button>
    <output data-testid="lifecycle-result">{JSON.stringify(result)}</output>
  </>;
}

describe('Next lifecycle provider error recovery', () => {
  it('maps the API cancellation conflict into safe UI feedback', async () => {
    apiClient.request.mockImplementation(async (path) => {
      if (path === '/api/localization/catalogs') return bundle;
      if (path === '/api/state') return state;
      if (path === '/api/setup' || path === '/health') return {};
      if (path === '/api/queues') return [queue];
      if (path === '/api/queues/queue-1/delete/cancel') {
        throw Object.assign(new Error('private API details'), { code: 'QUEUE_REWARD_OPERATION_PROCESSING', status: 409 });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<PanelProvider fallbackCatalog={{ 'pt-BR': {} }}><LifecycleConsumer /></PanelProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar exclusão' }));

    expect((await screen.findByTestId('lifecycle-result')).textContent).toContain('panel.queue.delete.cancel.processing');
    expect(apiClient.request).toHaveBeenCalledWith('/api/queues/queue-1/delete/cancel', expect.objectContaining({ method: 'POST' }));
  });
});

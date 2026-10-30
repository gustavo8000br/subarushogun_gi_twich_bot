import { describe, expect, it, vi } from 'vitest';
import { loadPanelRuntimeSnapshot, loadPanelSnapshot } from '../../apps/frontend/features/panel-shell/load-panel-snapshot.mjs';
import { summarizeQueues } from '../../apps/frontend/features/overview/queue-summary.mjs';

describe('Next panel snapshot', () => {
  it('loads the protected operator queue projection as well as state and runtime catalogs', async () => {
    const bundle = { locales: ['pt-BR'], modules: { panel: { catalogs: { 'pt-BR': {} } } } };
    const state = { product_version: 'v0.2.0-beta', product_locale: { locale: 'pt-BR', revision: 4 }, account: { label: 'Streamer' }, pending_operations: [] };
    const setup = { connected: true, eligibility: { eligible: true } };
    const queues = [{ id: 'q1', slug: 'arena', title: 'Arena', isOpen: true, entries: [{ id: 'entry1', status: 'waiting', displayName: 'Viewer', uid: '123456789' }] }];
    const health = { status: 'ok', dependencies: { database: 'connected' } };
    const request = vi.fn(async (path) => ({ '/api/localization/catalogs': bundle, '/api/state': state, '/api/setup': setup, '/api/queues': queues, '/health': health })[path]);

    await expect(loadPanelSnapshot(request)).resolves.toEqual({ bundle, state, setup, queues, health });
    expect(request).toHaveBeenCalledTimes(5);
    expect(request).toHaveBeenCalledWith('/api/queues');
    expect(request).toHaveBeenCalledWith('/api/setup');
    expect(request).toHaveBeenCalledWith('/health');
  });

  it('fails a runtime refresh when health alone cannot be read, preserving the previous client snapshot', async () => {
    const request = vi.fn(async (path) => {
      if (path === '/health') throw new Error('health unavailable');
      if (path === '/api/state') return { product_version: 'v0.2.0-beta', account: { label: 'Streamer' }, pending_operations: [] };
      if (path === '/api/setup') return { connected: true };
      if (path === '/api/queues') return [];
      throw new Error(`Unexpected request ${path}`);
    });
    await expect(loadPanelRuntimeSnapshot(request)).rejects.toThrow('health unavailable');
  });

  it('rejects a malformed queue response instead of showing a false empty state', async () => {
    const request = vi.fn(async (path) => path === '/api/queues' ? { error: 'bad response' }
      : path === '/api/localization/catalogs' ? { locales: ['pt-BR'], modules: { panel: { catalogs: { 'pt-BR': {} } } } }
        : { product_locale: { locale: 'pt-BR', revision: 1 } });
    await expect(loadPanelSnapshot(request)).rejects.toMatchObject({ code: 'INVALID_QUEUE_PROJECTION' });
  });

  it('rejects incomplete queue records before the queue screen can render blank fields', async () => {
    const request = vi.fn(async (path) => path === '/api/queues' ? [{ id: 'q1', entries: [] }]
      : path === '/api/localization/catalogs' ? { locales: ['pt-BR'], modules: { panel: { catalogs: { 'pt-BR': {} } } } }
        : { product_locale: { locale: 'pt-BR', revision: 1 } });
    await expect(loadPanelSnapshot(request)).rejects.toMatchObject({ code: 'INVALID_QUEUE_PROJECTION' });
  });

  it('counts operational queue entries from the protected projection', () => {
    expect(summarizeQueues([
      { id: 'a', entries: [{ status: 'waiting' }, { status: 'called' }] },
      { id: 'b', entries: [{ status: 'in_progress' }, { status: 'completed' }] },
    ])).toEqual({ queues: 2, waiting: 1, inService: 2 });
  });
});

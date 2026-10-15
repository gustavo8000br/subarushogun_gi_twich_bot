// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PanelShell from '../../apps/frontend/features/panel-shell/panel-shell.jsx';
import { apiClient } from '../../apps/frontend/lib/api/client.mjs';

vi.mock('../../apps/frontend/lib/api/client.mjs', () => ({
  apiClient: { initializeSession: vi.fn(), request: vi.fn() },
}));

const catalog = {
  'panel.accessibility.skip_to_content': 'Skip to content',
  'panel.sidebar.title': 'Streamer panel', 'panel.navigation.label': 'Main navigation',
  'panel.navigation.overview': 'Overview', 'panel.navigation.queues': 'Queues',
  'panel.navigation.new_queue': 'New queue', 'panel.navigation.operations': 'Operations',
  'panel.navigation.commands': 'Commands', 'panel.navigation.widgets': 'Widgets',
  'panel.navigation.settings': 'Settings', 'panel.navigation.connection': 'Connection',
  'panel.sidebar.local_note': 'This panel and data stay on this computer.',
  'panel.runtime.local_data': 'Data on this computer', 'panel.runtime.version': 'Local version',
  'panel.locale.label': 'Language', 'panel.locale.loading': 'Loading languages…',
  'panel.overview.eyebrow': 'OVERVIEW', 'panel.overview.description': 'Your local queue status.',
  'panel.overview.next_eyebrow': 'NEXT STEP', 'panel.overview.next_unavailable_title': 'Checking local data',
  'panel.overview.next_unavailable_description': 'The next action will appear after loading.',
  'panel.overview.refresh': 'Refresh overview', 'panel.overview.refreshing': 'Refreshing…',
  'panel.overview.refreshed': 'Overview updated.', 'panel.overview.refresh_failed': 'Could not refresh the overview. The last loaded data remains visible.',
  'panel.overview.last_updated': 'Last updated at {time}', 'panel.overview.last_reconciliation': 'Last Twitch reconciliation (this run)',
  'panel.overview.reconciliation_not_run': 'Not run in this run', 'panel.overview.current_account': 'Current account',
  'panel.overview.pending_operations': 'Unresolved operations', 'panel.overview.needs_review': '{count} need review',
  'panel.health.label': 'Installation health', 'panel.health.bot': 'Bot API', 'panel.health.bot.connected': 'Available',
  'panel.health.legend.label': 'Health status legend',
  'panel.health.legend.functional': 'Functional', 'panel.health.legend.partial': 'Partial, in progress, or unknown',
  'panel.health.legend.nonfunctional': 'Unavailable or not configured',
  'panel.health.bot.unavailable': 'Unavailable', 'panel.health.bot.unknown': 'Unknown state',
  'panel.health.database': 'Database', 'panel.health.database.connected': 'Connected',
  'panel.health.database.unavailable': 'Unavailable', 'panel.health.database.unknown': 'Unknown state',
  'panel.health.twitch_api': 'Twitch API', 'panel.health.twitch_integration': 'Twitch integration',
  'panel.health.twitch.connected': 'Connected', 'panel.health.twitch.not_configured': 'Not configured',
  'panel.health.twitch.unknown': 'Unknown state', 'panel.health.twitch.degraded': 'Unstable',
  'panel.health.twitch_chat': 'Twitch chat / EventSub', 'panel.health.chat.connected': 'Connected',
  'panel.health.chat.unknown': 'Unknown state', 'panel.health.rewards': 'Channel Points rewards',
  'panel.health.rewards.available': 'Available', 'panel.health.rewards.unknown': 'Checking',
  'panel.health.ping_unavailable': 'No measurement', 'panel.health.ping_ms': '{ms} ms',
  'panel.health.twitch_rewards': 'Channel Points rewards',
  'panel.summary.label': 'Queue summary', 'panel.summary.queues': 'QUEUES',
  'panel.summary.configured': 'configured', 'panel.summary.waiting': 'WAITING',
  'panel.summary.viewers_waiting': 'viewers waiting', 'panel.summary.in_service': 'IN SERVICE',
  'panel.summary.called_or_started': 'called or started', 'panel.section.local': 'LOCAL',
  'panel.error.local_load': 'The local API is unavailable.',
  'panel.connection.connect_title': 'Connect your channel', 'panel.connection.connect_description': 'Connect Twitch to finish setup.',
  'panel.connection.connect_channel': 'Connect channel',
  'panel.overview.next_empty_title': 'Create your first queue',
  'panel.overview.next_empty_description': 'Start accepting viewers.', 'panel.overview.next_empty_action': 'Create queue',
  'panel.overview.next_queues_title': 'Review your queues', 'panel.overview.next_queues_description': 'Manage your live queues.',
  'panel.overview.next_queues_action': 'Open queues',
};

const queues = [{ id: 'q1', slug: 'arena', title: 'Arena', isOpen: true, entries: [] }];
const pendingOperations = [{ id: 'op-1', type: 'redemption.fulfill', status: 'unknown', attempts: 1 }];
const health = {
  status: 'ok', last_reconciliation_at: '2026-10-15T18:00:00.000Z',
  dependencies: {
    database: 'connected', twitch_api: 'connected', twitch_integration: 'degraded',
    twitch_api_ping_ms: 47, twitch_chat: 'connected', twitch_rewards: 'available',
  },
};

function setupRequests() {
  let rejectHealth = false;
  let currentQueues = queues;
  let currentPendingOperations = pendingOperations;
  let currentOperationSummary = null;
  let currentHealth = health;
  let currentAccount = 'Conta principal';
  apiClient.initializeSession.mockResolvedValue({ csrfToken: 'x'.repeat(24) });
  apiClient.request.mockImplementation(async (path) => {
    if (path === '/api/localization/catalogs') return { locales: ['en'], modules: { panel: { catalogs: { en: catalog } } } };
    if (path === '/api/state') return {
      product_version: 'v0.2.0-0000000-beta', product_locale: { locale: 'en', revision: 1 },
      account: { label: currentAccount }, pending_operations: currentPendingOperations,
      unresolved_operation_summary: currentOperationSummary,
    };
    if (path === '/api/setup') return { connected: true };
    if (path === '/api/queues') return currentQueues;
    if (path === '/health') { if (rejectHealth) throw new Error('health unavailable'); return currentHealth; }
    throw new Error(`Unexpected request ${path}`);
  });
  return {
    failHealth(value) { rejectHealth = value; },
    setOperationSummary(value) { currentOperationSummary = value; },
    setSnapshot({ nextQueues, nextPendingOperations, nextHealth, nextAccount }) {
      currentQueues = nextQueues ?? currentQueues;
      currentPendingOperations = nextPendingOperations ?? currentPendingOperations;
      currentHealth = nextHealth ?? currentHealth;
      currentAccount = nextAccount ?? currentAccount;
    },
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('Next overview runtime parity', () => {
  it('shows health dependencies, current account, reconciliation age, and unresolved-operation summary', async () => {
    setupRequests();
    render(<PanelShell fallbackCatalog={{ en: catalog }} />);

    expect(await screen.findByText('Conta principal')).toBeTruthy();
    expect(screen.getByText('Twitch chat / EventSub')).toBeTruthy();
    expect(screen.getByText('Functional')).toBeTruthy();
    expect(screen.getByText('Partial, in progress, or unknown')).toBeTruthy();
    expect(screen.getByText('Unavailable or not configured')).toBeTruthy();
    expect(document.querySelector('.health-card[data-state="connected"]')?.getAttribute('data-severity')).toBe('functional');
    expect(document.querySelector('.health-card[data-state="degraded"]')?.getAttribute('data-severity')).toBe('partial');
    expect(screen.getByText('47 ms')).toBeTruthy();
    const pendingLink = screen.getByRole('link', { name: /Unresolved operations/ });
    expect(pendingLink.getAttribute('href')).toBe('/operations/');
    expect(pendingLink.querySelector('strong')?.textContent).toBe('1');
    expect(screen.getByText(/Last Twitch reconciliation \(this run\)/)).toBeTruthy();
  });

  it('marks unconfigured services red and transient/reconciling services yellow', async () => {
    const runtime = setupRequests();
    render(<PanelShell fallbackCatalog={{ en: catalog }} />);
    await screen.findByText('Conta principal');
    runtime.setSnapshot({ nextHealth: {
      ...health,
      dependencies: { ...health.dependencies, twitch_api: 'not_configured', twitch_integration: 'reconciling' },
    } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh overview' }));
    await waitFor(() => expect(document.querySelector('.health-card[data-state="not_configured"]')?.getAttribute('data-severity')).toBe('nonfunctional'));
    expect(document.querySelector('.health-card[data-state="reconciling"]')?.getAttribute('data-severity')).toBe('partial');
  });

  it('refreshes the overview on demand and reports safe stale-data feedback when a refresh fails', async () => {
    const runtime = setupRequests();
    render(<PanelShell fallbackCatalog={{ en: catalog }} />);
    await screen.findByText('Conta principal');
    runtime.setSnapshot({ nextAccount: 'Conta secundária', nextPendingOperations: [], nextQueues: [] });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh overview' }));
    expect(await screen.findByText('Conta secundária')).toBeTruthy();
    expect(await screen.findByText('Overview updated.')).toBeTruthy();
    expect(apiClient.request).toHaveBeenCalledWith('/health');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh overview' }).disabled).toBe(false));
    runtime.failHealth(true);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh overview' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Could not refresh the overview.'));
    expect(screen.getByText('Conta secundária')).toBeTruthy();
    expect(screen.getAllByText('Connected').length).toBeGreaterThan(0);
    expect(screen.queryByText('Unavailable')).toBeNull();
    expect(screen.queryByText('health unavailable')).toBeNull();
  });

  it('uses the unbounded aggregate for the overview count while retaining the recent operation list', async () => {
    const runtime = setupRequests();
    runtime.setOperationSummary({ total: 241, needsReview: 7 });
    render(<PanelShell fallbackCatalog={{ en: catalog }} />);
    await screen.findByText('Conta principal');
    const pendingLink = screen.getByRole('link', { name: /Unresolved operations/ });
    expect(pendingLink.querySelector('strong')?.textContent).toBe('241');
    expect(pendingLink.textContent).toContain('7 need review');
  });
});

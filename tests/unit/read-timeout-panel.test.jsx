// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PanelShell from '../../apps/frontend/features/panel-shell/panel-shell.jsx';
import OperationsPageContent from '../../apps/frontend/features/operations/operations-page-content.jsx';
import { apiClient } from '../../apps/frontend/lib/api/client.mjs';

// LA-19 (FT-44): a timed-out read shows its own localized, generic text (no stack, no internal detail).
vi.mock('../../apps/frontend/lib/api/client.mjs', () => ({
  apiClient: { initializeSession: vi.fn(), request: vi.fn() },
}));

const COPY = {
  'panel.accessibility.skip_to_content': 'Skip', 'panel.sidebar.title': 'Panel', 'panel.navigation.label': 'Nav',
  'panel.navigation.overview': 'Overview', 'panel.navigation.queues': 'Queues', 'panel.navigation.new_queue': 'New queue',
  'panel.navigation.operations': 'Operations', 'panel.navigation.commands': 'Commands', 'panel.navigation.widgets': 'Widgets',
  'panel.navigation.settings': 'Settings', 'panel.navigation.connection': 'Connection', 'panel.health.database.checking': 'Checking',
  'panel.error.local_load': 'GENERIC-LOCAL-LOAD',
  'panel.error.read_timeout': 'TIMEOUT-TEXT',
  'panel.operations.refresh': 'Refresh', 'panel.operations.loading': 'Loading', 'panel.operations.eyebrow': 'E',
  'panel.operations.title': 'Ops', 'panel.operations.description': 'D', 'panel.connection.reconcile': 'Reconcile',
  'panel.operations.refreshing': 'Refreshing', 'panel.operations.empty': 'Empty', 'panel.operations.empty_hint': 'Hint',
};
const t = (key) => COPY[key] ?? key;
const timeout = () => Object.assign(new Error('The request could not be completed.'), { code: 'REQUEST_TIMEOUT', status: 0, timedOut: true });
const errorCard = () => document.querySelector('.error-card[role="alert"]');

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe('timed-out panel reads', () => {
  it('the shell shows the timeout text when the initial load times out', async () => {
    apiClient.initializeSession.mockResolvedValue({});
    apiClient.request.mockRejectedValue(timeout());
    render(<PanelShell fallbackCatalog={{ 'pt-BR': COPY }} />);
    await waitFor(() => expect(errorCard()).not.toBeNull());
    expect(errorCard().textContent).toBe('TIMEOUT-TEXT');
  });

  it('the shell shows the timeout text when the session request times out', async () => {
    apiClient.initializeSession.mockRejectedValue(Object.assign(new Error('x'), { code: 'SESSION_INITIALIZATION_FAILED', status: 0, timedOut: true }));
    render(<PanelShell fallbackCatalog={{ 'pt-BR': COPY }} />);
    await waitFor(() => expect(errorCard()).not.toBeNull());
    expect(errorCard().textContent).toBe('TIMEOUT-TEXT');
  });

  it('the shell keeps the generic text for other failures', async () => {
    apiClient.initializeSession.mockResolvedValue({});
    apiClient.request.mockRejectedValue(Object.assign(new Error('x'), { code: 'REQUEST_FAILED', status: 0 }));
    render(<PanelShell fallbackCatalog={{ 'pt-BR': COPY }} />);
    await waitFor(() => expect(errorCard()).not.toBeNull());
    expect(errorCard().textContent).toBe('GENERIC-LOCAL-LOAD');
  });

  it('the operations page shows the timeout text, then the generic text after a different failure', async () => {
    const request = vi.fn().mockRejectedValueOnce(timeout()).mockRejectedValue(Object.assign(new Error('x'), { code: 'REQUEST_FAILED', status: 0 }));
    render(<OperationsPageContent t={t} locale="en" request={request} />);
    await waitFor(() => expect(errorCard()?.textContent).toContain('TIMEOUT-TEXT'));
    expect(errorCard().textContent).not.toMatch(/stack|TimeoutError/);
    fireEvent.click(errorCard().querySelector('button'));
    await waitFor(() => expect(errorCard()?.textContent).toContain('GENERIC-LOCAL-LOAD'));
  });
});

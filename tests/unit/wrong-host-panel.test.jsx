// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PanelShell from '../../apps/frontend/features/panel-shell/panel-shell.jsx';
import OperationsPageContent from '../../apps/frontend/features/operations/operations-page-content.jsx';
import { wrongHostForPanel } from '../../apps/frontend/features/panel-shell/wrong-host.mjs';
import { apiClient } from '../../apps/frontend/lib/api/client.mjs';

// LA-17 (FT-67): a failed load at a loopback IP literal explains the real cause and links to localhost.
vi.mock('../../apps/frontend/lib/api/client.mjs', () => ({
  apiClient: { initializeSession: vi.fn(), request: vi.fn() },
}));

const NAV = {
  'panel.accessibility.skip_to_content': 'Skip', 'panel.sidebar.title': 'Panel', 'panel.navigation.label': 'Nav',
  'panel.navigation.overview': 'Overview', 'panel.navigation.queues': 'Queues', 'panel.navigation.new_queue': 'New queue',
  'panel.navigation.operations': 'Operations', 'panel.navigation.commands': 'Commands', 'panel.navigation.widgets': 'Widgets',
  'panel.navigation.settings': 'Settings', 'panel.navigation.connection': 'Connection',
  'panel.health.database.checking': 'Checking',
};
const COPY = {
  ...NAV,
  'panel.error.local_load': 'GENERIC-LOCAL-LOAD',
  'panel.error.wrong_host': 'The session is not valid at {host}. This panel only works at localhost.',
  'panel.error.wrong_host_action': 'Open {url}',
  'panel.operations.refresh': 'Refresh', 'panel.operations.loading': 'Loading', 'panel.operations.eyebrow': 'E',
  'panel.operations.title': 'Ops', 'panel.operations.description': 'D', 'panel.connection.reconcile': 'Reconcile',
  'panel.operations.refreshing': 'Refreshing', 'panel.operations.empty': 'Empty', 'panel.operations.empty_hint': 'Hint',
};
const t = (key, options = {}) => (COPY[key] ?? key).replace(/\{([a-z]+)\}/g, (_, name) => String(options.values?.[name] ?? `{${name}}`));

function setLocation(parts) {
  vi.stubGlobal('location', { protocol: 'https:', hostname: 'localhost', port: '3000', pathname: '/', search: '', hash: '', ...parts });
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('wrongHostForPanel (AC-17.1)', () => {
  it.each([
    [{ hostname: '127.0.0.1', port: '3000', pathname: '/queues/' }, { host: '127.0.0.1', url: 'https://localhost:3000/queues/' }],
    [{ hostname: '[::1]', port: '3101', pathname: '/' }, { host: '[::1]', url: 'https://localhost:3101/' }],
    [{ hostname: '::1', port: '3101', pathname: '/widgets/' }, { host: '::1', url: 'https://localhost:3101/widgets/' }],
    [{ hostname: '127.0.0.1', port: '', pathname: '/' }, { host: '127.0.0.1', url: 'https://localhost/' }],
  ])('returns the corrected address for %j', (location, expected) => {
    expect(wrongHostForPanel(location)).toEqual(expected);
  });

  it('never copies the query string or the hash (one-time outcome parameters)', () => {
    const result = wrongHostForPanel({ hostname: '127.0.0.1', port: '3000', pathname: '/queues/', search: '?outcome=queue_created&queue=abc', hash: '#secret' });
    expect(result.url).toBe('https://localhost:3000/queues/');
    expect(result.url).not.toMatch(/[?#]/);
  });

  it.each([
    [{ hostname: 'localhost' }], [{ hostname: 'example-3000.app.github.dev' }], [{ hostname: '192.168.1.20' }],
    [{ hostname: '' }], [{}], [null], [undefined],
  ])('returns null for %j', (location) => {
    expect(wrongHostForPanel(location)).toBeNull();
  });
});

const errorCard = () => waitFor(() => {
  const card = document.querySelector('.error-card[role="alert"]');
  expect(card).not.toBeNull();
  return card;
});

describe('panel shell load failure (AC-17.2, AC-17.5, AC-17.6)', () => {
  function renderFailing() {
    apiClient.initializeSession.mockRejectedValue(Object.assign(new Error('boom: stack and secret'), { referenceId: 'ref-1' }));
    return render(<PanelShell fallbackCatalog={{ 'pt-BR': { ...COPY, 'panel.error.wrong_host_action': 'Abrir {url}' } }} />);
  }

  it('shows the wrong-host text and a plain link to the localhost address at 127.0.0.1', async () => {
    setLocation({ hostname: '127.0.0.1', port: '3000', pathname: '/queues/', search: '?outcome=x', hash: '#h' });
    renderFailing();
    const alert = await errorCard();
    expect(alert.textContent).toContain('The session is not valid at 127.0.0.1. This panel only works at localhost.');
    expect(alert.textContent).not.toContain('GENERIC-LOCAL-LOAD');
    const link = alert.querySelector('a');
    expect(link.getAttribute('href')).toBe('https://localhost:3000/queues/');
    expect(link.textContent).toBe('Abrir https://localhost:3000/queues/');
    expect(alert.textContent).not.toMatch(/boom|stack|secret|ref-1/);
  });

  it('shows the wrong-host text at [::1]', async () => {
    setLocation({ hostname: '[::1]', port: '3000', pathname: '/' });
    renderFailing();
    expect((await errorCard()).querySelector('a').getAttribute('href')).toBe('https://localhost:3000/');
  });

  it('keeps the generic text and no link at localhost', async () => {
    setLocation({ hostname: 'localhost' });
    renderFailing();
    const alert = await errorCard();
    expect(alert.textContent).toBe('GENERIC-LOCAL-LOAD');
    expect(alert.querySelector('a')).toBeNull();
  });
});

describe('operations page load failure (AC-17.2)', () => {
  const failing = () => vi.fn(async () => { throw new Error('read failure'); });

  it('uses the same wrong-host message and link at 127.0.0.1', async () => {
    setLocation({ hostname: '127.0.0.1', port: '3000', pathname: '/operations/' });
    render(<OperationsPageContent t={t} locale="en" request={failing()} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The session is not valid at 127.0.0.1.');
    expect(alert.querySelector('a').getAttribute('href')).toBe('https://localhost:3000/operations/');
  });

  it('keeps the generic text at localhost', async () => {
    setLocation({ hostname: 'localhost' });
    render(<OperationsPageContent t={t} locale="en" request={failing()} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('GENERIC-LOCAL-LOAD');
    expect(alert.querySelector('a')).toBeNull();
  });
});

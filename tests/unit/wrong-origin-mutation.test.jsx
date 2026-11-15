// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// OPS-15 D-3 (LA-17, AC-17.4): the REAL api client talks to a fake fetch. At 127.0.0.1 a mutation refused with
// 403 ORIGIN_NOT_ALLOWED must show the wrong-host message (and the localhost link) in the panel shell.
const fetchImpl = vi.fn();
vi.mock('../../apps/frontend/lib/api/client.mjs', async () => {
  const actual = await vi.importActual('../../apps/frontend/lib/api/client.mjs');
  return { ...actual, apiClient: actual.createApiClient({ fetchImpl: (...args) => fetchImpl(...args) }) };
});

const { default: PanelShell } = await import('../../apps/frontend/features/panel-shell/panel-shell.jsx');
const { apiClient } = await import('../../apps/frontend/lib/api/client.mjs');

const COPY = {
  'panel.accessibility.skip_to_content': 'Skip', 'panel.sidebar.title': 'Panel', 'panel.navigation.label': 'Nav',
  'panel.navigation.overview': 'Overview', 'panel.navigation.queues': 'Queues', 'panel.navigation.new_queue': 'New queue',
  'panel.navigation.operations': 'Operations', 'panel.navigation.commands': 'Commands', 'panel.navigation.widgets': 'Widgets',
  'panel.navigation.settings': 'Settings', 'panel.navigation.connection': 'Connection',
  'panel.health.database.checking': 'Checking', 'panel.error.generic': 'GENERIC-ACTION-ERROR',
  'panel.error.wrong_host': 'The session is not valid at {host}. This panel only works at localhost.',
  'panel.error.wrong_host_action': 'Open {url}',
};
const json = (body, status = 200) => ({ ok: status < 300, status, headers: new globalThis.Headers(), json: async () => body });
const PANEL_STATE = { product_version: 'v0', account: { label: 'A' }, pending_operations: [], product_locale: { locale: 'pt-BR', revision: 1 } };

function routeFetch({ mutation }) {
  fetchImpl.mockImplementation(async (path, init = {}) => {
    if (path === '/api/session') return json({ csrfToken: 'c'.repeat(64) });
    if (path === '/api/localization/catalogs') return json({ locales: ['pt-BR'], modules: { panel: { catalogs: { 'pt-BR': COPY } } } });
    if (path === '/api/state') return json(PANEL_STATE);
    if (path === '/api/setup') return json({ connected: false });
    if (path === '/api/queues') return json([]);
    if (path === '/health') return json({ status: 'ok', dependencies: {} });
    if (path === '/api/do-something' && init.method === 'POST') return mutation();
    return json({}, 404);
  });
}
function setLocation(hostname) {
  vi.stubGlobal('location', { protocol: 'https:', hostname, port: '3000', pathname: '/widgets/', search: '', hash: '' });
}
function Trigger() {
  const [message, setMessage] = React.useState('');
  return <button type="button" onClick={() => apiClient.request('/api/do-something', { method: 'POST', body: '{}' }).catch((error) => setMessage(error.status === 403 ? 'GENERIC-ACTION-ERROR' : 'other'))}>go{message}</button>;
}
const renderShell = () => render(<PanelShell activePage="widgets" fallbackCatalog={{ 'pt-BR': COPY }}><Trigger /></PanelShell>);
const waitReady = () => waitFor(() => expect(fetchImpl).toHaveBeenCalledWith('/health', expect.anything()));
const errorCard = () => document.querySelector('.error-card[role="alert"]');
const forbidden = (code) => () => json({ error: 'Origem inválida.', ...(code ? { code } : {}) }, 403);

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('mutation refused for its origin (AC-17.4)', () => {
  it('shows the wrong-host message and the localhost link at 127.0.0.1', async () => {
    setLocation('127.0.0.1');
    routeFetch({ mutation: forbidden('ORIGIN_NOT_ALLOWED') });
    renderShell();
    await waitReady();
    expect(errorCard()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /go/ }));
    const alert = await waitFor(() => { expect(errorCard()).not.toBeNull(); return errorCard(); });
    expect(alert.textContent).toContain('The session is not valid at 127.0.0.1. This panel only works at localhost.');
    expect(alert.querySelector('a').getAttribute('href')).toBe('https://localhost:3000/widgets/');
    expect(alert.textContent).not.toContain('Origem inválida');
  });

  it('shows it at [::1] too', async () => {
    setLocation('[::1]');
    routeFetch({ mutation: forbidden('ORIGIN_NOT_ALLOWED') });
    renderShell();
    await waitReady();
    fireEvent.click(screen.getByRole('button', { name: /go/ }));
    await waitFor(() => expect(errorCard()?.querySelector('a')?.getAttribute('href')).toBe('https://localhost:3000/widgets/'));
  });

  it('shows nothing extra at localhost (the origin was not the cause)', async () => {
    setLocation('localhost');
    routeFetch({ mutation: forbidden('ORIGIN_NOT_ALLOWED') });
    renderShell();
    await waitReady();
    fireEvent.click(screen.getByRole('button', { name: /go/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /go/ }).textContent).toContain('GENERIC-ACTION-ERROR'));
    expect(errorCard()).toBeNull();
  });

  it('ignores other 403 refusals (CSRF or session) at 127.0.0.1', async () => {
    setLocation('127.0.0.1');
    routeFetch({ mutation: () => json({ error: 'Sessão ou proteção CSRF inválida.' }, 403) });
    renderShell();
    await waitReady();
    fireEvent.click(screen.getByRole('button', { name: /go/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /go/ }).textContent).toContain('GENERIC-ACTION-ERROR'));
    expect(errorCard()).toBeNull();
  });
});

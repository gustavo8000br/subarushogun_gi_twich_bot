// @vitest-environment jsdom
// TS-10 (AC-TS10-4): health contracts ported from the removed vanilla panel (health-status.test.js) to the Next overview, in pt-BR.
import React from 'react';
import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PanelShell from '../../apps/frontend/features/panel-shell/panel-shell.jsx';
import { apiClient } from '../../apps/frontend/lib/api/client.mjs';

vi.mock('../../apps/frontend/lib/api/client.mjs', () => ({
  apiClient: { initializeSession: vi.fn(), request: vi.fn() },
}));

const ptBR = Object.fromEntries(readFileSync('apps/shared/localization/catalogs/panel/pt-BR.tsv', 'utf8').trim().split('\n').map((line) => {
  const separator = line.indexOf('\t');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));

function mountWith(dependencies) {
  apiClient.initializeSession.mockResolvedValue({ csrfToken: 'x'.repeat(24) });
  apiClient.request.mockImplementation(async (path) => {
    if (path === '/api/localization/catalogs') return { locales: ['pt-BR'], modules: { panel: { catalogs: { 'pt-BR': ptBR } } } };
    if (path === '/api/state') return {
      product_version: 'v0.2.0-0000000-beta', product_locale: { locale: 'pt-BR', revision: 1 },
      account: { label: 'Conta principal' }, pending_operations: [], unresolved_operation_summary: null,
    };
    if (path === '/api/setup') return { connected: true };
    if (path === '/api/queues') return [];
    if (path === '/health') return { status: 'ok', last_reconciliation_at: null, dependencies: { database: 'connected', ...dependencies } };
    throw new Error(`Unexpected request ${path}`);
  });
  return render(<PanelShell fallbackCatalog={{ 'pt-BR': ptBR }} />);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('AC-TS10-4: Next overview health in pt-BR', () => {
  it('does not invent a ping or leak internal values for an unconfigured channel', async () => {
    const { container } = mountWith({ twitch_api: 'not_configured', twitch_api_ping_ms: null });
    expect(await screen.findByText('Sem medição')).toBeTruthy();
    expect(container.textContent).not.toMatch(/\d+\s*ms/);
    expect(container.textContent).not.toContain('not_configured');
    const card = container.querySelector('.health-card[data-state="not_configured"]');
    expect(card?.textContent).toContain('Não configurada');
    expect(card?.getAttribute('data-severity')).toBe('nonfunctional');
  });

  it('shows automatic reconnection as "Reconectando" at the attention level, neither error nor healthy', async () => {
    const { container } = mountWith({ twitch_api: 'retrying', twitch_api_ping_ms: null });
    const card = await vi.waitFor(() => {
      const found = container.querySelector('.health-card[data-state="retrying"]');
      if (!found) throw new Error('retrying card not rendered yet');
      return found;
    });
    expect(card.textContent).toContain('Reconectando');
    expect(card.getAttribute('data-severity')).toBe('partial');
    expect(container.textContent).not.toMatch(/\d+\s*ms/);
    expect(container.textContent).not.toContain('retrying');
  });

  it('keeps a measured ping numeric when the API reports one', async () => {
    mountWith({ twitch_api: 'connected', twitch_api_ping_ms: 42 });
    expect(await screen.findByText('42 ms')).toBeTruthy();
  });
});

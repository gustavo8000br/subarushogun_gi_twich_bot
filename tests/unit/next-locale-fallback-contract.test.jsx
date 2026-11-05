/** @vitest-environment jsdom */
// TS-10 (AC-TS10-6): locale picker state ported from the removed vanilla panel (locale-picker-state.test.js) to the Next language picker.
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiClient } = vi.hoisted(() => ({ apiClient: { initializeSession: vi.fn(), request: vi.fn() } }));
vi.mock('../../apps/frontend/lib/api/client.mjs', () => ({ apiClient }));

import PanelShell from '../../apps/frontend/features/panel-shell/panel-shell.jsx';

afterEach(cleanup);

const copy = (label) => ({ 'panel.navigation.overview': 'Visão geral', 'panel.locale.label': label, 'panel.locale.updated': 'ok', 'panel.locale.saving': 'Salvando…', 'panel.error.generic': 'erro' });

function mount({ locales, persisted, patchDelay = null }) {
  apiClient.initializeSession.mockResolvedValue({ csrfToken: 'a'.repeat(24) });
  let release;
  apiClient.request.mockImplementation(async (path, options = {}) => {
    if (path === '/api/localization/catalogs') return {
      locales,
      modules: { panel: { catalogs: Object.fromEntries(locales.map((locale) => [locale, copy('Idioma')])) } },
    };
    if (path === '/api/state') return { product_version: 'v0.2.0-beta', product_locale: { locale: persisted, revision: 4 }, account: { label: 'Streamer' }, pending_operations: [] };
    if (path === '/api/setup') return { connected: false };
    if (path === '/api/queues') return [];
    if (path === '/api/localization/locale' && options.method === 'PATCH') {
      if (patchDelay) await new Promise((resolve) => { release = resolve; });
      return { locale: JSON.parse(options.body).locale, revision: 5 };
    }
    throw new Error(`Unexpected request ${path}`);
  });
  render(<PanelShell fallbackCatalog={{ 'pt-BR': copy('Idioma') }} />);
  return { release: () => release?.() };
}

beforeEach(() => vi.clearAllMocks());

describe('AC-TS10-6: the locale picker falls back to pt-BR and keeps the user choice', () => {
  it('selects pt-BR when the persisted locale has no catalog (incomplete or absent)', async () => {
    mount({ locales: ['en', 'pt-BR'], persisted: 'de' });
    const picker = await screen.findByRole('combobox', { name: 'Idioma' });
    await waitFor(() => expect(picker.options).toHaveLength(2));
    expect(picker.value).toBe('pt-BR');
  });

  it('shows the persisted locale when its catalog exists and there is no pending choice', async () => {
    mount({ locales: ['en', 'es', 'pt-BR'], persisted: 'es' });
    const picker = await screen.findByRole('combobox', { name: 'Idioma' });
    await waitFor(() => expect(picker.options).toHaveLength(3));
    expect(picker.value).toBe('es');
  });

  it('keeps the chosen locale visible while it is being saved and after the save', async () => {
    const control = mount({ locales: ['pt-BR', 'en', 'es'], persisted: 'pt-BR', patchDelay: true });
    const picker = await screen.findByRole('combobox', { name: 'Idioma' });
    await waitFor(() => expect(picker.options).toHaveLength(3));
    fireEvent.change(picker, { target: { value: 'en' } });
    expect((await screen.findByRole('combobox')).value).toBe('en');
    control.release();
    await waitFor(() => expect(screen.getByRole('combobox').value).toBe('en'));
  });
});

/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiClient } = vi.hoisted(() => ({
  apiClient: { initializeSession: vi.fn(), request: vi.fn() },
}));

vi.mock('../../apps/frontend/lib/api/client.mjs', () => ({ apiClient }));

import PanelShell from '../../apps/frontend/features/panel-shell/panel-shell.jsx';

afterEach(cleanup);
beforeEach(() => {
  apiClient.initializeSession.mockResolvedValue({ csrfToken: 'a'.repeat(24) });
  apiClient.request.mockImplementation(async (path, options = {}) => {
    if (path === '/api/localization/catalogs') return {
      locales: ['pt-BR', 'en', 'es'],
      modules: { panel: { catalogs: {
        'pt-BR': { 'panel.navigation.overview': 'Visão geral', 'panel.locale.label': 'Idioma', 'panel.locale.updated': 'Idioma atualizado.', 'panel.locale.saving': 'Salvando idioma…', 'panel.error.generic': 'Não foi possível concluir. Tente novamente.', 'panel.error.locale_conflict': 'O idioma mudou em outra solicitação. Atualize a página.' },
        en: { 'panel.navigation.overview': 'Overview', 'panel.locale.label': 'Language', 'panel.locale.updated': 'Language updated.', 'panel.locale.saving': 'Saving language…', 'panel.error.generic': 'Could not complete. Try again.', 'panel.error.locale_conflict': 'The language changed in another request. Refresh the page.' },
        es: { 'panel.navigation.overview': 'Resumen', 'panel.locale.label': 'Idioma', 'panel.locale.updated': 'Idioma actualizado.', 'panel.locale.saving': 'Guardando idioma…', 'panel.error.generic': 'No se pudo completar la acción. Inténtalo de nuevo.', 'panel.error.locale_conflict': 'El idioma cambió en otra solicitud. Actualiza la página.' },
      } } },
    };
    if (path === '/api/state') return { product_version: 'v0.2.0-beta', product_locale: { locale: 'pt-BR', revision: 4 }, queues: [] };
    if (path === '/api/setup') return { connected: false };
    if (path === '/api/queues') return [];
    if (path === '/api/localization/locale' && options.method === 'PATCH') return { locale: 'en', revision: 5 };
    throw new Error(`Unexpected request ${path}`);
  });
});

describe('Next panel language picker', () => {
  it('persists the selected language and updates the visible panel copy', async () => {
    render(<PanelShell fallbackCatalog={{ 'pt-BR': { 'panel.navigation.overview': 'Visão geral', 'panel.locale.label': 'Idioma' } }} />);
    const picker = await screen.findByRole('combobox', { name: 'Idioma' });
    await waitFor(() => expect(picker.disabled).toBe(false));

    fireEvent.change(picker, { target: { value: 'en' } });

    expect(await screen.findByRole('combobox', { name: 'Language' })).toHaveProperty('value', 'en');
    expect(await screen.findByText('Overview')).toBeTruthy();
    expect(await screen.findByRole('status')).toHaveTextContent('Language updated.');
    expect(apiClient.request).toHaveBeenCalledWith('/api/localization/locale', {
      method: 'PATCH',
      body: JSON.stringify({ locale: 'en', expectedRevision: 4 }),
    });
  });

  it('shows a localized error and keeps the prior language if persistence fails', async () => {
    apiClient.request.mockImplementation(async (path, options = {}) => {
      if (path === '/api/localization/catalogs') return {
        locales: ['pt-BR', 'en'], modules: { panel: { catalogs: {
          'pt-BR': { 'panel.navigation.overview': 'Visão geral', 'panel.locale.label': 'Idioma', 'panel.error.generic': 'Não foi possível concluir.' },
          en: { 'panel.navigation.overview': 'Overview', 'panel.locale.label': 'Language', 'panel.error.generic': 'Could not complete. Try again.' },
        } } },
      };
      if (path === '/api/state') return { product_locale: { locale: 'pt-BR', revision: 4 } };
      if (path === '/api/setup') return { connected: false };
      if (path === '/api/queues') return [];
      if (path === '/api/localization/locale' && options.method === 'PATCH') throw Object.assign(new Error('private'), { code: 'PRODUCT_LOCALE_UNAVAILABLE' });
      throw new Error(`Unexpected request ${path}`);
    });
    render(<PanelShell fallbackCatalog={{ 'pt-BR': { 'panel.navigation.overview': 'Visão geral', 'panel.locale.label': 'Idioma' } }} />);
    const picker = await screen.findByRole('combobox', { name: 'Idioma' });
    await waitFor(() => expect(picker.disabled).toBe(false));

    fireEvent.change(picker, { target: { value: 'en' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível concluir.');
    expect(screen.getByRole('combobox', { name: 'Idioma' })).toHaveProperty('value', 'pt-BR');
    expect(screen.getByText('Visão geral')).toBeTruthy();
  });
});

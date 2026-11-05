/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../apps/frontend/lib/api/client.mjs', () => ({
  apiClient: { request: vi.fn(), initializeSession: vi.fn(async () => ({ status: 'ready' })) },
}));

import { apiClient } from '../../apps/frontend/lib/api/client.mjs';
import { PanelProvider, usePanel } from '../../apps/frontend/features/panel-shell/panel-provider.jsx';
import QueueSettingsForm from '../../apps/frontend/features/queues/queue-settings-form.jsx';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const initialQueue = {
  id: 'queue-1', slug: 'arena', title: 'Arena', isOpen: true, version: 3, lifecycleStatus: 'active',
  callTimeoutMin: 10, callMessage: 'Old {user} message', showUidInList: false,
  showUidInOverlay: false, showUidOnCall: false, refundIfRemovedWhileCalled: false,
  refundOnNoShow: false, refundIfViewerLeavesCalled: false, entries: [],
};
const state = { product_version: '0.2.0-beta', account: { label: 'Streamer' }, pending_operations: [] };
const panelCatalog = {
  'panel.queue.action.configure': 'Configurar fila',
  'panel.queue_settings.title': 'Configurações da fila',
  'panel.queue_settings.section_attendance': 'Chamada e presença',
  'panel.queue_settings.call_deadline': 'Prazo de chamada',
  'panel.queue_settings.call_message': 'Mensagem de chamada',
  'panel.queue_settings.call_placeholders': 'Valores aceitos: {user}, {queue}, {position}, {uid}, {account}',
  'panel.queue_settings.section_privacy': 'Privacidade de UID',
  'panel.queue_settings.show_uid_list': 'Mostrar UID na lista',
  'panel.queue_settings.show_uid_overlay': 'Mostrar UID no overlay',
  'panel.queue_settings.show_uid_call': 'Mostrar UID ao chamar',
  'panel.queue_settings.uid_policy_hint': 'Política de privacidade do UID',
  'panel.queue_settings.section_points': 'Políticas de conta e pontos',
  'panel.queue_settings.refund_removed': 'Reembolsar ao remover',
  'panel.queue_settings.refund_no_show': 'Reembolsar ausência',
  'panel.queue_settings.refund_viewer_leave': 'Reembolsar saída do viewer',
  'panel.queue_settings.unsaved': 'Alterações não salvas',
  'panel.queue_settings.no_changes': 'Todas as configurações estão salvas.',
  'panel.queue_settings.save': 'Salvar configurações',
  'panel.form.cancel': 'Cancelar',
  'panel.queue.settings_result.refresh_failed': 'As configurações foram salvas, mas a lista não atualizou. Recarregue a página para conferir os valores atuais.',
};
const catalogs = { locales: ['pt-BR'], modules: { panel: { catalogs: { 'pt-BR': panelCatalog } } } };

function SettingsConsumer() {
  const { queueProjection, queueSettingsAction, saveQueueSettings, saving, t } = usePanel();
  const queue = queueProjection[0];
  return queue ? <>
    <output data-testid="queue-settings-projection">{`${queue.version}|${queue.callTimeoutMin}|${queue.callMessage}`}</output>
    <QueueSettingsForm
      queue={queue} t={t} saving={saving}
      feedback={queueSettingsAction}
      onSave={saveQueueSettings}
    />
  </> : <p role="status">Loading</p>;
}

describe('Next queue settings refresh recovery', () => {
  it('keeps accepted settings visible and announces refresh failure when the follow-up list read fails', async () => {
    let queueReads = 0;
    const acceptedQueue = {
      ...initialQueue, version: 4, callTimeoutMin: 15, callMessage: 'New {user} message',
    };
    apiClient.request.mockImplementation(async (path, options) => {
      if (path === '/api/localization/catalogs') return catalogs;
      if (path === '/api/state') return state;
      if (path === '/api/setup') return {};
      if (path === '/health') return {};
      if (path === '/api/queues') {
        queueReads += 1;
        if (queueReads === 2) throw Object.assign(new Error('private projection failure'), { referenceId: 'settings-read-3' });
        return [initialQueue];
      }
      if (path === '/api/queues/queue-1/settings' && options?.method === 'PATCH') return acceptedQueue;
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<PanelProvider fallbackCatalog={{ 'pt-BR': panelCatalog }}><SettingsConsumer /></PanelProvider>);
    await screen.findByTestId('queue-settings-projection');
    fireEvent.click(screen.getByText('Configurar fila'));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Prazo de chamada' }), { target: { value: '15' } });
    fireEvent.change(screen.getByRole('textbox', { name: /Mensagem de chamada/ }), { target: { value: 'New {user} message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configurações' }));

    const feedback = await screen.findByText(panelCatalog['panel.queue.settings_result.refresh_failed']);
    await waitFor(() => expect(screen.getByTestId('queue-settings-projection').textContent)
      .toBe('4|15|New {user} message'));
    expect(feedback.closest('[role="status"]')).not.toBeNull();
    expect(apiClient.request).toHaveBeenCalledWith('/api/queues/queue-1/settings', expect.objectContaining({ method: 'PATCH' }));
    expect(queueReads).toBe(2);
  });
});

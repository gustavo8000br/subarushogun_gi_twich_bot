/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import QueueLifecycleActions from '../../apps/frontend/features/queues/queue-lifecycle-actions.jsx';

afterEach(cleanup);

beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
  }
});

const queue = {
  id: 'queue-1', title: 'Arena', lifecycleStatus: 'deleting', queueMode: 'channel_points', rewardId: 'reward-1',
  remoteSyncStatus: 'delete_pending', modeTransitionStatus: 'none', isOpen: false, isArchived: false, entries: [],
};
const messages = {
  'panel.queue.action.cancel_delete': 'Cancelar exclusão',
  'panel.confirmation.title': 'Confirmar ação',
  'panel.dialog.cancel': 'Voltar',
  'panel.dialog.confirm': 'Confirmar',
  'panel.queue.delete.cancel.stale': 'O estado da exclusão mudou.',
  'panel.queue.delete.cancel.processing': 'Uma operação ainda está em andamento.',
  'panel.queue.delete.cancel.uncertain': 'Não foi possível confirmar o cancelamento.',
  'panel.error.reference': ({ values }) => `Referência: ${values.id}`,
};
const t = (key, options) => {
  const message = messages[key];
  return typeof message === 'function' ? message(options) : message ?? key;
};

describe('Next queue deletion cancellation feedback', () => {
  it.each([
    ['panel.queue.delete.cancel.stale', 'O estado da exclusão mudou.'],
    ['panel.queue.delete.cancel.processing', 'Uma operação ainda está em andamento.'],
    ['panel.queue.delete.cancel.uncertain', 'Não foi possível confirmar o cancelamento.'],
  ])('announces %s as an accessible error without claiming cancellation', async (key, copy) => {
    const onAction = vi.fn().mockResolvedValue({ status: 'error', key });
    const { container } = render(<QueueLifecycleActions queue={queue} locale="pt-BR" t={t} saving={false} onAction={onAction} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar exclusão' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(onAction).toHaveBeenCalledWith('queue-1', 'cancel-delete', { challenge: null }));
    expect(alert.textContent).toContain(copy);
    expect(alert.textContent).not.toContain('Exclusão cancelada');
    expect(container.querySelector('dialog[open]')).toBeNull();
    expect(key).toMatch(/^panel\.queue\.delete\.cancel\./);
  });

  it('renders a validated diagnostic reference with an uncertain result only', async () => {
    const onAction = vi.fn().mockResolvedValue({
      status: 'error', key: 'panel.queue.delete.cancel.uncertain', referenceId: 'cancel-op-17',
    });
    render(<QueueLifecycleActions queue={queue} locale="pt-BR" t={t} saving={false} onAction={onAction} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar exclusão' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Referência: cancel-op-17');
  });

  it('omits an unsafe diagnostic reference from lifecycle feedback', async () => {
    const onAction = vi.fn().mockResolvedValue({
      status: 'error', key: 'panel.queue.delete.cancel.uncertain', referenceId: 'private SQL details',
    });
    render(<QueueLifecycleActions queue={queue} locale="pt-BR" t={t} saving={false} onAction={onAction} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar exclusão' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toContain('private SQL details');
  });
});

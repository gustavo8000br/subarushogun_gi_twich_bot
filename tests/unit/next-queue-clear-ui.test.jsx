/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import QueueList from '../../apps/frontend/features/queues/queue-list.jsx';

afterEach(cleanup);

beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
  }
});

const messages = {
  'panel.queues.title': 'Filas',
  'panel.queue.status.closed': 'Fechada',
  'panel.queue.action.activate': 'Ativar fila',
  'panel.queue.action.clear': 'Limpar fila',
  'panel.queue.clear.confirm': 'Limpar “{title}”? {count} pessoas; {refunds} reembolsos.',
  'panel.queue.clear.loading': 'Calculando fila atual…',
  'panel.queue.clear.clearing': 'Limpando fila…',
  'panel.queue.clear.uncertain': 'A limpeza pode ter sido aplicada. Confira a fila atualizada antes de tentar novamente.',
  'panel.queue.clear.refresh_required': 'Não foi possível verificar se a limpeza foi aplicada. Atualize a fila antes de tentar novamente.',
  'panel.queue.clear.refresh': 'Atualizar fila',
  'panel.queue.clear.refreshing': 'Atualizando fila…',
  'panel.queue.clear.refreshed': 'Fila atualizada. Confira antes de iniciar outra limpeza.',
  'panel.queue.clear.refresh_failed': 'Não foi possível atualizar a fila. Tente atualizar novamente antes de limpar.',
  'panel.queue.clear.failed': 'Não foi possível limpar a fila. Tente novamente.',
  'panel.confirmation.title': 'Confirmar ação',
  'panel.dialog.cancel': 'Cancelar',
  'panel.dialog.confirm': 'Confirmar',
  'panel.error.reference': 'Referência: {id}',
};
const t = (key, { values = {} } = {}) => Object.entries(values).reduce(
  (message, [name, value]) => message.replaceAll(`{${name}}`, value),
  messages[key] ?? key,
);

describe('Next queue clear uncertain result', () => {
  it.each([
    ['lost response', { status: 'uncertain', referenceId: 'clear-safe-01' }, 'clear-safe-01'],
    ['empty retry after a consumed challenge', { status: 'empty', count: 0, refundsRequested: 0 }, null],
  ])('closes the stale confirmation and shows uncertainty after %s', async (_scenario, confirmationResult, referenceId) => {
    const queue = {
      id: 'queue-id', slug: 'arena', title: 'Arena', lifecycleStatus: 'active', queueMode: 'manual_only',
      rewardOrigin: 'none', isArchived: false, isOpen: false, remoteSyncStatus: 'local_only', entries: [],
    };
    const onPreviewClear = vi.fn(async () => ({ status: 'confirmation_required', count: 2, refundsRequested: 1, expiresInSeconds: 15 }));
    const onConfirmClear = vi.fn(async () => confirmationResult);
    const { container } = render(<QueueList queues={[queue]} locale="pt-BR" t={t} onPreviewClear={onPreviewClear} onConfirmClear={onConfirmClear} />);

    fireEvent.click(screen.getByRole('button', { name: 'Limpar fila' }));
    await waitFor(() => expect(container.querySelector('dialog[open]')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('A limpeza pode ter sido aplicada. Confira a fila atualizada antes de tentar novamente.');
    if (referenceId) expect(alert.textContent).toContain(`Referência: ${referenceId}`);
    await waitFor(() => expect(container.querySelector('dialog[open]')).toBeFalsy());
    expect(alert.textContent).not.toContain('limpeza concluída');
  });

  it('blocks another clear until the stale queue projection refreshes successfully', async () => {
    const queue = {
      id: 'queue-id', slug: 'arena', title: 'Arena', lifecycleStatus: 'active', queueMode: 'manual_only',
      rewardOrigin: 'none', isArchived: false, isOpen: false, remoteSyncStatus: 'local_only', entries: [],
    };
    const onPreviewClear = vi.fn(async () => ({ status: 'confirmation_required', count: 2, refundsRequested: 1, expiresInSeconds: 15 }));
    const onConfirmClear = vi.fn(async () => ({ status: 'uncertain', refreshRequired: true, referenceId: 'clear-safe-02' }));
    const onRefreshQueue = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    function Harness() {
      const [clearRefreshRequired, setClearRefreshRequired] = React.useState(false);
      return <QueueList
        queues={[queue]}
        locale="pt-BR"
        t={t}
        onPreviewClear={onPreviewClear}
        onConfirmClear={async (...args) => {
          const result = await onConfirmClear(...args);
          if (result?.refreshRequired) setClearRefreshRequired(true);
          return result;
        }}
        onRefreshQueue={async () => {
          const refreshed = await onRefreshQueue();
          if (refreshed) setClearRefreshRequired(false);
          return refreshed;
        }}
        clearRefreshRequired={clearRefreshRequired}
      />;
    }
    const { container } = render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Limpar fila' }));
    await waitFor(() => expect(container.querySelector('dialog[open]')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(messages['panel.queue.clear.refresh_required']);
    expect(alert.textContent).toContain('Referência: clear-safe-02');
    expect(screen.getByRole('button', { name: 'Limpar fila' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar fila' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(messages['panel.queue.clear.refresh_failed']));
    expect(screen.getByRole('button', { name: 'Limpar fila' }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar fila' }));
    await waitFor(() => expect(screen.getByText(messages['panel.queue.clear.refreshed'])).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Limpar fila' }).disabled).toBe(false);
    expect(onPreviewClear).toHaveBeenCalledTimes(1);
    expect(onRefreshQueue).toHaveBeenCalledTimes(2);
  });

  it('closes an open preview and blocks confirmation when another refresh marks the projection stale', async () => {
    const queue = {
      id: 'queue-id', slug: 'arena', title: 'Arena', lifecycleStatus: 'active', queueMode: 'manual_only',
      rewardOrigin: 'none', isArchived: false, isOpen: false, remoteSyncStatus: 'local_only', entries: [],
    };
    const onConfirmClear = vi.fn();
    const props = { queues: [queue], locale: 'pt-BR', t, onPreviewClear: vi.fn(async () => ({ status: 'confirmation_required', count: 2, refundsRequested: 1, expiresInSeconds: 15 })), onConfirmClear };
    const { container, rerender } = render(<QueueList {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Limpar fila' }));
    await waitFor(() => expect(container.querySelector('dialog[open]')).toBeTruthy());
    rerender(<QueueList {...props} clearRefreshRequired onRefreshQueue={vi.fn(async () => false)} />);

    await waitFor(() => expect(container.querySelector('dialog[open]')).toBeFalsy());
    expect(screen.getByRole('button', { name: 'Limpar fila' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Atualizar fila' })).toBeTruthy();
    expect(onConfirmClear).not.toHaveBeenCalled();
  });
});

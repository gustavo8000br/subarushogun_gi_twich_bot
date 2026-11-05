/** @vitest-environment jsdom */
// TS-10 (AC-TS10-1, AC-TS10-2): confirmation contracts ported from the removed vanilla panel
// (panel-confirmation-contract.test.js) to the Next lifecycle dialog.
import React from 'react';
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import QueueLifecycleActions from '../../apps/frontend/features/queues/queue-lifecycle-actions.jsx';
import { translatePanel } from '../../apps/frontend/lib/i18n/panel-catalogs.mjs';

afterEach(cleanup);

let originalShowModal;
beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
  }
  originalShowModal = HTMLDialogElement.prototype.showModal;
});

function loadCatalog(locale) {
  return Object.fromEntries(readFileSync(`apps/shared/localization/catalogs/panel/${locale}.tsv`, 'utf8').trim().split('\n').map((line) => {
    const separator = line.indexOf('\t');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}
const catalogs = { 'pt-BR': loadCatalog('pt-BR'), en: loadCatalog('en'), es: loadCatalog('es') };
const t = (key, options) => translatePanel(catalogs, 'pt-BR', key, options);

const uncertain = {
  id: 'queue-9', title: 'Arena', lifecycleStatus: 'active', queueMode: 'channel_points', rewardId: 'reward-9', rewardOrigin: 'twitch',
  remoteSyncStatus: 'delete_unknown', modeTransitionStatus: 'none', isOpen: false, isArchived: false, entries: [], version: 3,
};
const synced = { ...uncertain, id: 'queue-1', remoteSyncStatus: 'synced' };

const renderActions = (queue, onAction) => render(<QueueLifecycleActions queue={queue} locale="pt-BR" t={t} saving={false} onAction={onAction} />);

describe('AC-TS10-1: the confirmation fails closed', () => {
  it('sends no request when showModal is missing; the dialog stays closed', () => {
    const onAction = vi.fn();
    HTMLDialogElement.prototype.showModal = undefined;
    try {
      const { container } = renderActions(synced, onAction);
      fireEvent.click(screen.getByRole('button', { name: 'Excluir fila' }));
      expect(container.querySelector('dialog').hasAttribute('open')).toBe(false);
      expect(onAction).not.toHaveBeenCalled();
    } finally {
      HTMLDialogElement.prototype.showModal = originalShowModal;
    }
  });

  it('sends no request when the dialog is already open and the action is triggered again', () => {
    const onAction = vi.fn();
    const { container } = renderActions(synced, onAction);
    container.querySelector('dialog').setAttribute('open', '');
    fireEvent.click(screen.getByRole('button', { name: 'Excluir fila' }));
    expect(onAction).not.toHaveBeenCalled();
  });

  it('never runs the action on open, on Back, or when the dialog is dismissed with Escape (close event)', () => {
    const onAction = vi.fn();
    const { container } = renderActions(synced, onAction);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir fila' }));
    const dialog = container.querySelector('dialog[open]');
    expect(dialog).not.toBeNull();
    expect(onAction).not.toHaveBeenCalled();
    fireEvent(dialog, new Event('close'));
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir fila' }));
    fireEvent.click(within(container.querySelector('dialog[open]')).getByRole('button', { name: 'Voltar' }));
    expect(onAction).not.toHaveBeenCalled();
    expect(container.querySelector('dialog[open]')).toBeNull();
  });

  it('runs the action only after the explicit accept click', async () => {
    const onAction = vi.fn().mockResolvedValue({ status: 'deleted' });
    const { container } = renderActions(synced, onAction);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir fila' }));
    fireEvent.click(within(container.querySelector('dialog[open]')).getByRole('button', { name: 'Excluir fila' }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(onAction.mock.calls[0][1]).toBe('delete');
  });
});

describe('AC-TS10-2: two separate confirmations before deleting locally when reward sync is uncertain', () => {
  const challenge = { status: 'challenge_issued', token: 'opaque', expiresAt: '2030-01-01T00:00:00.000Z' };

  it('requests the challenge on the first accept and the confirm only after a second, separate accept', async () => {
    const onAction = vi.fn(async (_id, action) => (action === 'archive-local-challenge' ? challenge : { status: 'archived' }));
    const { container } = renderActions(uncertain, onAction);

    fireEvent.click(screen.getByRole('button', { name: t('panel.queue.action.archive_local_review') }));
    let dialog = container.querySelector('dialog[open]');
    expect(dialog.textContent).toContain('Continuar para revisar a confirmação final');
    expect(onAction).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(onAction).toHaveBeenLastCalledWith('queue-9', 'archive-local-challenge', { queue: uncertain });

    await waitFor(() => expect(container.querySelector('dialog[open]').textContent).toContain('Confirmação final: excluir a fila “Arena”'));
    expect(onAction).toHaveBeenCalledTimes(1);

    dialog = container.querySelector('dialog[open]');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));
    expect(onAction).toHaveBeenLastCalledWith('queue-9', 'archive-local-confirm', { challenge });
  });

  it('cancelling the first step sends nothing', () => {
    const onAction = vi.fn();
    const { container } = renderActions(uncertain, onAction);
    fireEvent.click(screen.getByRole('button', { name: t('panel.queue.action.archive_local_review') }));
    fireEvent.click(within(container.querySelector('dialog[open]')).getByRole('button', { name: 'Cancelar' }));
    expect(onAction).not.toHaveBeenCalled();
  });

  it('cancelling at the final step never sends the confirm and drops the challenge', async () => {
    const onAction = vi.fn(async () => challenge);
    const { container } = renderActions(uncertain, onAction);
    fireEvent.click(screen.getByRole('button', { name: t('panel.queue.action.archive_local_review') }));
    fireEvent.click(within(container.querySelector('dialog[open]')).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(container.querySelector('dialog[open]').textContent).toContain('Confirmação final'));
    fireEvent.click(within(container.querySelector('dialog[open]')).getByRole('button', { name: 'Cancelar' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalledWith(expect.anything(), 'archive-local-confirm', expect.anything());
    expect(container.querySelector('dialog[open]')).toBeNull();
  });

  it('a refused challenge shows the alert and never reaches the final step', async () => {
    const onAction = vi.fn(async () => ({ status: 'error', key: 'panel.queue.archive_local.processing' }));
    const { container } = renderActions(uncertain, onAction);
    fireEvent.click(screen.getByRole('button', { name: t('panel.queue.action.archive_local_review') }));
    fireEvent.click(within(container.querySelector('dialog[open]')).getByRole('button', { name: 'Confirmar' }));
    await screen.findByRole('alert');
    expect(onAction).toHaveBeenCalledTimes(1);
    // M-1 (QA gate 2026-11-06): the notice and `setPending(null)` are one batch, but the dialog closes later in a `useEffect`.
    await waitFor(() => expect(container.querySelector('dialog[open]')).toBeNull());
  });
});

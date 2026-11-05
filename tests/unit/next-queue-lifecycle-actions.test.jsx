/** @vitest-environment jsdom */
import React, { useState } from 'react';
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import QueueLifecycleActions from '../../apps/frontend/features/queues/queue-lifecycle-actions.jsx';
import OutcomeRegion from '../../apps/frontend/features/panel-shell/outcome-region.jsx';
import { resolvePostActionRoute } from '../../apps/frontend/features/panel-shell/post-action-route.mjs';
import { translatePanel } from '../../apps/frontend/lib/i18n/panel-catalogs.mjs';

afterEach(cleanup);

beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
  }
});

function loadCatalog(locale) {
  return Object.fromEntries(readFileSync(`apps/shared/localization/catalogs/panel/${locale}.tsv`, 'utf8').trim().split('\n').map((line) => {
    const separator = line.indexOf('\t');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}
const catalogs = { 'pt-BR': loadCatalog('pt-BR'), en: loadCatalog('en'), es: loadCatalog('es') };
const makeT = (locale = 'pt-BR') => (key, options) => translatePanel(catalogs, locale, key, options);
const t = makeT();

const queue = {
  id: 'queue-1', title: 'Arena', lifecycleStatus: 'deleting', queueMode: 'channel_points', rewardId: 'reward-1', rewardOrigin: 'twitch',
  remoteSyncStatus: 'delete_pending', modeTransitionStatus: 'none', isOpen: false, isArchived: false, entries: [],
  deletionState: 'pending', blockReason: null, blockingOperations: 0, canCancelDeletion: true, cancellationInProgress: false,
};
const activeReward = { ...queue, lifecycleStatus: 'active', remoteSyncStatus: 'synced', isArchived: false, deletionState: undefined, canCancelDeletion: undefined };
const activeLocal = { ...activeReward, id: 'queue-2', queueMode: 'manual_only', rewardId: null, rewardOrigin: 'none', remoteSyncStatus: 'local_only' };
const activeConverted = { ...activeReward, id: 'queue-3', queueMode: 'manual_only', remoteSyncStatus: 'local_only' };

function Harness({ queue: current, onAction, projection, locale = 'pt-BR', saving = false, onRoute }) {
  const [outcome, setOutcome] = useState(null);
  const translate = makeT(locale);
  return <>
    <OutcomeRegion outcome={outcome} t={translate} locale={locale} onDismiss={() => setOutcome(null)} onRefresh={() => {}} />
    <QueueLifecycleActions queue={current} locale={locale} t={translate} saving={saving} onAction={onAction}
      onOutcome={(descriptor) => { const route = resolvePostActionRoute(descriptor, projection ?? [current]); onRoute?.(route); setOutcome(route?.outcome ?? null); }} />
  </>;
}

function openDialog(container, trigger) {
  fireEvent.click(trigger);
  return container.querySelector('dialog[open]');
}

describe('Next queue deletion cancellation feedback (persistent region)', () => {
  it.each([
    ['panel.queue.delete.cancel.stale', 'O estado da exclusão mudou antes'],
    ['panel.queue.delete.cancel.processing', 'Uma operação da reward na Twitch ainda está em andamento'],
    ['panel.queue.delete.cancel.uncertain', 'Não foi possível confirmar se o cancelamento foi concluído'],
  ])('announces %s as an accessible error without claiming cancellation', async (key, copy) => {
    const onAction = vi.fn().mockResolvedValue({ status: 'error', key });
    const { container } = render(<Harness queue={queue} onAction={onAction} />);

    const dialog = openDialog(container, screen.getByRole('button', { name: 'Cancelar exclusão' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar exclusão' }));

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(onAction).toHaveBeenCalledWith('queue-1', 'cancel-delete', { challenge: null }));
    await waitFor(() => expect(alert.textContent).toContain(copy));
    expect(alert.textContent).not.toContain('Exclusão cancelada');
    expect(container.querySelector('dialog[open]')).toBeNull();
    expect(key).toMatch(/^panel\.queue\.delete\.cancel\./);
  });

  it('renders a validated diagnostic reference with an uncertain result only', async () => {
    const onAction = vi.fn().mockResolvedValue({ status: 'error', key: 'panel.queue.delete.cancel.uncertain', referenceId: 'cancel-op-17' });
    const { container } = render(<Harness queue={queue} onAction={onAction} />);
    const dialog = openDialog(container, screen.getByRole('button', { name: 'Cancelar exclusão' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar exclusão' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('cancel-op-17'));
  });

  it('omits an unsafe diagnostic reference from lifecycle feedback', async () => {
    const onAction = vi.fn().mockResolvedValue({ status: 'error', key: 'panel.queue.delete.cancel.uncertain', referenceId: 'private SQL details' });
    const { container } = render(<Harness queue={queue} onAction={onAction} />);
    const dialog = openDialog(container, screen.getByRole('button', { name: 'Cancelar exclusão' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar exclusão' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Não foi possível confirmar'));
    expect(screen.getByRole('alert').textContent).not.toContain('private SQL details');
  });
});

describe('K23-04 / R2: the Cancel deletion button comes from the server projection', () => {
  it('is hidden when the server does not say canCancelDeletion, even if remoteSyncStatus looks cancellable', () => {
    render(<QueueLifecycleActions queue={{ ...queue, canCancelDeletion: false }} locale="pt-BR" t={t} saving={false} onAction={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Cancelar exclusão' })).toBeNull();
    cleanup();
    const heuristicOnly = { ...queue }; delete heuristicOnly.canCancelDeletion;
    render(<QueueLifecycleActions queue={heuristicOnly} locale="pt-BR" t={t} saving={false} onAction={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Cancelar exclusão' })).toBeNull();
  });

  it('is shown when the server says canCancelDeletion, whatever remoteSyncStatus says', () => {
    render(<QueueLifecycleActions queue={{ ...queue, remoteSyncStatus: 'synced', canCancelDeletion: true }} locale="pt-BR" t={t} saving={false} onAction={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancelar exclusão' })).toBeTruthy();
  });

  it('while cancellationInProgress the card shows the checking line and keeps the button', () => {
    render(<QueueLifecycleActions queue={{ ...queue, cancellationInProgress: true }} locale="pt-BR" t={t} saving={false} onAction={vi.fn()} />);
    expect(screen.getByText(/Verificando a recompensa na Twitch para cancelar a exclusão/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancelar exclusão' })).toBeTruthy();
  });
});

describe('K23-05 / R5: specific dialog without double negation', () => {
  it('cancel-deletion dialog: specific title, Back first and focusable, three paragraphs wired by aria-describedby', () => {
    const { container } = render(<QueueLifecycleActions queue={queue} locale="pt-BR" t={t} saving={false} onAction={vi.fn()} />);
    const dialog = openDialog(container, screen.getByRole('button', { name: 'Cancelar exclusão' }));
    const title = dialog.querySelector(`#${CSS.escape(dialog.getAttribute('aria-labelledby'))}`);
    expect(title.textContent).toBe('Cancelar a exclusão de “Arena”?');
    expect(title.textContent).not.toBe('Confirmar ação');
    const buttons = [...dialog.querySelectorAll('button')];
    expect(buttons.map((button) => button.textContent)).toEqual(['Voltar', 'Cancelar exclusão']);
    const describedBy = dialog.getAttribute('aria-describedby').split(/\s+/);
    expect(describedBy).toHaveLength(3);
    const paragraphs = describedBy.map((id) => dialog.querySelector(`#${CSS.escape(id)}`));
    expect(paragraphs.every(Boolean)).toBe(true);
    expect(paragraphs[0].textContent).toContain('O app lê a recompensa exata na Twitch');
    expect(paragraphs[1].textContent).toContain('mostrar a fila aos espectadores e abri-la de novo');
    expect(paragraphs[2].textContent).toContain('não voltam');
    expect(dialog.textContent).not.toMatch(/Confirmar$/);
  });

  it('delete dialog: specific title, Back and "Excluir fila", accept disabled and reading Saving while the request runs', () => {
    const { container, rerender } = render(<QueueLifecycleActions queue={activeReward} locale="pt-BR" t={t} saving={false} onAction={vi.fn()} />);
    const dialog = openDialog(container, screen.getByRole('button', { name: 'Excluir fila' }));
    expect(dialog.querySelector('h2').textContent).toBe('Excluir a fila “Arena”?');
    const [back, accept] = [...dialog.querySelectorAll('button')];
    expect([back.textContent, accept.textContent]).toEqual(['Voltar', 'Excluir fila']);
    rerender(<QueueLifecycleActions queue={activeReward} locale="pt-BR" t={t} saving onAction={vi.fn()} />);
    const [backSaving, acceptSaving] = [...container.querySelectorAll('dialog button')];
    expect(backSaving.disabled).toBe(true);
    expect(acceptSaving.disabled).toBe(true);
    expect(acceptSaving.textContent).toBe('Salvando…');
  });

  it('Back dismisses without calling the API', () => {
    const onAction = vi.fn();
    const { container } = render(<QueueLifecycleActions queue={queue} locale="pt-BR" t={t} saving={false} onAction={onAction} />);
    const dialog = openDialog(container, screen.getByRole('button', { name: 'Cancelar exclusão' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Voltar' }));
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe('R7: plural counts in the delete confirmation', () => {
  it.each([
    ['pt-BR', 1, /1 entrada ativa será removida/, /1 entradas/],
    ['pt-BR', 3, /3 entradas ativas serão removidas/, /3 entrada ativa/],
    ['en', 1, /1 active entry will be removed/, /1 active entries/],
    ['en', 2, /2 active entries will be removed/, /2 active entry/],
    ['es', 1, /Se quitará 1 entrada activa/, /1 entradas/],
    ['es', 5, /Se quitarán 5 entradas activas/, /5 entrada activa/],
  ])('%s with %i entries', (locale, count, expected, forbidden) => {
    const entries = Array.from({ length: count }, (_, index) => ({ id: `e${index}`, status: 'waiting' }));
    const { container } = render(<QueueLifecycleActions queue={{ ...activeReward, entries }} locale={locale} t={makeT(locale)} saving={false} onAction={vi.fn()} />);
    const trigger = container.querySelector('.queue-lifecycle-secondary-actions button');
    const dialog = openDialog(container, trigger);
    expect(dialog.textContent).toMatch(expected);
    expect(dialog.textContent).not.toMatch(forbidden);
  });

  it('local and converted queues also pluralize the count', () => {
    for (const [current, singular] of [[activeLocal, /1 entrada ativa será removida/], [activeConverted, /1 entrada ativa será removida/]]) {
      const { container, unmount } = render(<QueueLifecycleActions queue={{ ...current, entries: [{ id: 'e', status: 'waiting' }] }} locale="pt-BR" t={t} saving={false} onAction={vi.fn()} />);
      const dialog = openDialog(container, container.querySelector('.queue-lifecycle-secondary-actions button'));
      expect(dialog.textContent).toMatch(singular);
      unmount();
    }
  });
});

describe('K23-08 / R1 and AC 3: delete results by queue type', () => {
  async function runDelete(current, result, projection) {
    const onAction = vi.fn().mockResolvedValue(result);
    const view = render(<Harness queue={current} onAction={onAction} projection={projection} />);
    const dialog = openDialog(view.container, view.container.querySelector('.queue-lifecycle-secondary-actions button'));
    fireEvent.click([...dialog.querySelectorAll('button')][1]);
    await waitFor(() => expect(onAction).toHaveBeenCalled());
    return view;
  }

  it('a deleted Channel Points queue never says the reward stays paused or untouched', async () => {
    await runDelete(activeReward, { status: 'deleted' }, [{ id: 'other', lifecycleStatus: 'active' }]);
    const region = await screen.findByRole('status');
    await waitFor(() => expect(region.textContent).toContain('Fila excluída. A Twitch confirmou que a recompensa foi excluída'));
    expect(region.textContent).not.toMatch(/continua pausada|intacta|permanece/);
  });

  it('a pending Channel Points deletion says pending, never a success, and offers a refresh', async () => {
    await runDelete(activeReward, { status: 'pending', deletionState: 'pending' }, [activeReward]);
    const region = await screen.findByRole('status');
    await waitFor(() => expect(region.textContent).toContain('Exclusão pendente.'));
    expect(region.textContent).not.toMatch(/Fila excluída|continua pausada|intacta/);
    expect(screen.getByRole('button', { name: 'Atualizar filas' })).toBeTruthy();
  });

  it('local and converted queues keep the reused texts', async () => {
    await runDelete(activeConverted, { status: 'deleted' }, [{ id: 'other', lifecycleStatus: 'active' }]);
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('a reward Twitch continua pausada'));
    cleanup();
    await runDelete(activeLocal, { status: 'deleted' }, [{ id: 'other', lifecycleStatus: 'active' }]);
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Ela não tinha recompensa na Twitch'));
  });

  it('a blocked deletion goes to the alert element with a link to Operations', async () => {
    await runDelete(activeReward, { status: 'pending', deletionState: 'blocked', queue: { blockingOperations: 2 } }, [activeReward]);
    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert.textContent).toContain('Exclusão bloqueada: 2 operações precisam da sua revisão'));
    const link = screen.getByRole('link', { name: 'Revisar as operações' });
    expect(link.getAttribute('href')).toBe('/operations/');
  });
});

describe('K23-11: a blocked deletion is a persistent card line from the projection', () => {
  it.each([
    [1, /Exclusão bloqueada: 1 operação precisa da sua revisão/],
    [3, /Exclusão bloqueada: 3 operações precisam da sua revisão/],
    [0, /Exclusão bloqueada: a Twitch não confirmou uma etapa/],
  ])('shows %i blocking operations with the plural form and a link to Operations', (blockingOperations, expected) => {
    const { container } = render(<QueueLifecycleActions queue={{ ...queue, deletionState: 'blocked', blockReason: 'financial_review_required', blockingOperations }} locale="pt-BR" t={t} saving={false} onAction={vi.fn()} />);
    const line = container.querySelector('.queue-deletion-line');
    expect(line.textContent).toMatch(expected);
    expect(line.getAttribute('role')).toBeNull();
    expect(within(line).getByRole('link', { name: 'Revisar as operações' }).getAttribute('href')).toBe('/operations/');
    expect(container.textContent).not.toContain('financial_review_required');
  });

  it('an unknown blockReason falls back to the generic text and the raw code is never shown', () => {
    const { container } = render(<QueueLifecycleActions queue={{ ...queue, deletionState: 'blocked', blockReason: 'made_up_code', blockingOperations: 0 }} locale="pt-BR" t={t} saving={false} onAction={vi.fn()} />);
    expect(container.textContent).toContain('a Twitch não confirmou uma etapa');
    expect(container.textContent).not.toContain('made_up_code');
  });

  it('shows no blocked line for a pending deletion', () => {
    const { container } = render(<QueueLifecycleActions queue={queue} locale="pt-BR" t={t} saving={false} onAction={vi.fn()} />);
    expect(container.querySelector('.queue-deletion-line')).toBeNull();
  });
});

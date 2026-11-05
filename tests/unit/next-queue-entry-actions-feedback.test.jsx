/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import QueueList from '../../apps/frontend/features/queues/queue-list.jsx';

afterEach(cleanup);

const t = (key, { values = {} } = {}) => Object.entries(values).reduce(
  (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
  ({
    'panel.queue.entry_action_result.refresh_failed': 'A alteração foi aceita, mas não foi possível atualizar a fila.',
    'panel.error.reference': 'Referência: {id}',
    'panel.queues.title': 'Filas',
    'panel.queue.status.closed': 'Fechada',
  })[key] ?? key,
);

const queue = { id: 'queue-1', title: 'Fila de teste', isOpen: false, entries: [] };

describe('queue entry action recovery feedback', () => {
  it.each([
    [{ status: 'warning', key: 'panel.queue.entry_action_result.refresh_failed' }, 'status', 'A alteração foi aceita, mas não foi possível atualizar a fila.'],
    [{ status: 'error', key: 'panel.queue.action_result.failed' }, 'alert', 'panel.queue.action_result.failed'],
  ])('renders the existing accessible %s region without implying a successful refresh', (queueAction, role, expected) => {
    render(<QueueList queues={[queue]} locale="pt-BR" t={t} queueAction={{ queueId: 'queue-1', ...queueAction }} />);

    const message = screen.getByText(expected).closest(`[role="${role}"]`);
    expect(message).not.toBeNull();
    expect(message.textContent).toContain(expected);
    expect(message.textContent).not.toContain('Fila atualizada');
  });
});

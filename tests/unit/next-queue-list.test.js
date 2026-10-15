import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import QueueList from '../../apps/frontend/features/queues/queue-list.jsx';

const messages = {
  'panel.queue.empty.title': 'Nenhuma fila criada',
  'panel.queue.empty.hint': 'Crie uma fila para começar.',
  'panel.queue.empty.create': 'Criar primeira fila',
  'panel.queue.status.open': 'ABERTA',
  'panel.queue.status.closed': 'FECHADA',
  'panel.queue.status.pending_delete': 'Exclusão pendente',
  'panel.queue.group.waiting': 'Aguardando',
  'panel.queue.group.called': 'Chamados',
  'panel.queue.group.in_service': 'Em atendimento',
  'panel.queue.empty_group': 'Ninguém no momento',
  'panel.queue.sync.pending': 'sincronização pendente',
  'panel.queue.sync.synced': 'Twitch sincronizada',
  'panel.queue.sync.local': 'fila local',
  'panel.queue.sync.unknown': 'resultado desconhecido',
  'panel.queue.sync.failed': 'falha de sincronização',
  'panel.queue.sync.not_synced': 'sem sincronização confirmada',
  'panel.queue.sync.diverged': 'divergência na Twitch',
  'panel.queue.sync.manual': 'recompensa vinculada manualmente',
  'panel.queue.action.activate': 'Ativar fila',
  'panel.queue.action.pause': 'Pausar fila',
  'panel.queue.action.next': 'Próximo',
  'panel.queue.action.add': 'Adicionar pessoa',
  'panel.entry.twitch_login': 'Login Twitch',
  'panel.entry.uid_optional': 'UID (opcional)',
  'panel.entry.login_placeholder': '@usuario',
  'panel.entry.uid_placeholder': '9 dígitos',
  'panel.entry.priority_toggle': 'Prioridade conferida por mim',
  'panel.entry.benefit': 'Benefício conferido',
  'panel.entry.reason_external': 'Pagamento externo',
  'panel.entry.reason_bits': 'Bits',
  'panel.entry.reason_sub': 'Inscrição',
  'panel.entry.reason_other': 'Outro benefício conferido',
  'panel.entry.priority_audit_hint': 'A ação será auditada.',
  'panel.entry.add': 'Adicionar à fila',
  'panel.entry.priority_badge': 'Prioritária',
  'panel.queue.action_result.no_waiting': 'Não há pessoas aguardando nesta fila.',
  'panel.entry.action.call': 'Chamar',
  'panel.entry.action.call_aria': 'Chamar {user}',
  'panel.entry.action.attend': 'Atender',
  'panel.entry.action.attend_aria': 'Atender {user}',
  'panel.entry.action.complete': 'Concluir',
  'panel.entry.action.complete_aria': 'Concluir atendimento de {user}',
  'panel.entry.action.resend': 'Reenviar chamada',
  'panel.entry.action.resend_aria': 'Reenviar chamada para {user}',
  'panel.entry.action.remove': 'Remover',
  'panel.entry.action.remove_aria': 'Remover {user} da fila',
  'panel.queue.action_blocked.remote_operation_pending': 'Aguardando operação Twitch pendente.',
};
const t = (key, { values = {} } = {}) => Object.entries(values).reduce(
  (message, [name, value]) => message.replaceAll(`{${name}}`, value),
  messages[key] ?? key,
);

describe('Next queue list', () => {
  it('renders queue state and active entries from the operator projection without exposing UID', () => {
    const queues = [{
      id: 'queue-1', slug: 'arena', title: 'Arena', isOpen: true, remoteSyncStatus: 'pending',
      entries: [
        { id: 'entry-1', displayName: 'Viewer waiting', status: 'waiting', position: 2, uid: 'private-uid' },
        { id: 'entry-2', displayName: 'Viewer called', status: 'called', position: null },
        { id: 'entry-3', displayName: 'Completed viewer', status: 'completed' },
      ],
    }];
    const markup = renderToStaticMarkup(React.createElement(QueueList, { queues, locale: 'pt-BR', t }));
    expect(markup).toContain('Arena');
    expect(markup).toContain('arena');
    expect(markup).toContain('ABERTA');
    expect(markup).toContain('sincronização pendente');
    expect(markup).toContain('Viewer waiting');
    expect(markup).toContain('Viewer called');
    expect(markup).toContain('Chamar');
    expect(markup).toContain('Atender');
    expect(markup).toContain('Concluir');
    expect(markup).toContain('Reenviar chamada');
    expect(markup).toContain('Remover');
    expect(markup).toContain('aria-label="Chamar Viewer waiting"');
    expect(markup).toContain('aria-label="Atender Viewer called"');
    expect(markup).toContain('aria-label="Concluir atendimento de Viewer called"');
    expect(markup).toContain('aria-label="Reenviar chamada para Viewer called"');
    expect(markup).toContain('aria-label="Remover Viewer waiting da fila"');
    expect(markup).not.toContain('Completed viewer');
    expect(markup).not.toContain('private-uid');
  });

  it('distinguishes a valid empty queue projection', () => {
    const markup = renderToStaticMarkup(React.createElement(QueueList, { queues: [], locale: 'pt-BR', t }));
    expect(markup).toContain('Nenhuma fila criada');
    expect(markup).toContain('Crie uma fila para começar.');
    expect(markup).toContain('href="/new-queue/"');
    expect(markup).toContain('Criar primeira fila');
  });

  it('keeps a queue deletion in progress distinct from an ordinary closed queue', () => {
    const queues = [{ id: 'queue-delete', slug: 'cleanup', title: 'Cleanup', isOpen: false, lifecycleStatus: 'deleting', entries: [] }];
    const markup = renderToStaticMarkup(React.createElement(QueueList, { queues, locale: 'pt-BR', t }));
    expect(markup).toContain('Exclusão pendente');
    expect(markup).not.toContain('FECHADA');
  });

  it('renders activation and pause controls according to the queue state', () => {
    const queues = [
      { id: 'local', slug: 'local', title: 'Local', queueMode: 'manual_only', rewardOrigin: 'none', isOpen: false, remoteSyncStatus: 'local_only', entries: [] },
      { id: 'remote', slug: 'remote', title: 'Remote', queueMode: 'channel_points', rewardOrigin: 'bot_created', rewardId: 'reward-1', isOpen: true, remoteSyncStatus: 'synced', entries: [] },
      { id: 'pending', slug: 'pending', title: 'Pending', queueMode: 'channel_points', rewardOrigin: 'bot_created', rewardId: 'reward-2', isOpen: false, remoteSyncStatus: 'pending_close', entries: [] },
    ];
    const markup = renderToStaticMarkup(React.createElement(QueueList, { queues, locale: 'pt-BR', t }));
    expect(markup).toContain('Ativar fila');
    expect(markup).toContain('Pausar fila');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Aguardando operação Twitch pendente.');
  });

  it('shows sync labels for the shared queue sync state vocabulary', () => {
    const statuses = [
      ['local_only', 'fila local'],
      ['synced_manual', 'recompensa vinculada manualmente'],
      ['pending_update', 'sincronização pendente'],
      ['close_unknown', 'resultado desconhecido'],
      ['delete_failed', 'falha de sincronização'],
      ['delete_pending', 'sincronização pendente'],
    ];
    const queues = statuses.map(([remoteSyncStatus], index) => ({
      id: `queue-${index}`, slug: `queue-${index}`, title: `Fila ${index}`, isOpen: false, remoteSyncStatus, entries: [],
    }));
    const markup = renderToStaticMarkup(React.createElement(QueueList, { queues, locale: 'pt-BR', t }));
    for (const [, label] of statuses) expect(markup).toContain(label);
  });

  it('disables call-next when the queue has no waiting entries', () => {
    const queues = [{
      id: 'queue-empty', slug: 'empty', title: 'Vazia', queueMode: 'manual_only', rewardOrigin: 'none',
      isOpen: true, remoteSyncStatus: 'local_only', entries: [],
    }];
    const markup = renderToStaticMarkup(React.createElement(QueueList, { queues, locale: 'pt-BR', t }));
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Próximo<\/button>/);
  });

  it('renders a validated manual entry form with auditable priority options for active queues', () => {
    const queues = [{
      id: 'queue-manual', slug: 'manual', title: 'Manual', queueMode: 'manual_only', rewardOrigin: 'none',
      isOpen: false, remoteSyncStatus: 'local_only', entries: [],
    }];
    const markup = renderToStaticMarkup(React.createElement(QueueList, { queues, locale: 'pt-BR', t }));
    expect(markup).toContain('Adicionar pessoa');
    expect(markup).toContain('name="login"');
    expect(markup).toContain('pattern="@?[A-Za-z0-9_]{1,25}"');
    expect(markup).toContain('name="uid"');
    expect(markup).toContain('name="priority"');
    expect(markup).toContain('name="priorityReason"');
    expect(markup).toContain('A ação será auditada.');
  });

  it('shows the verified priority and benefit category for a waiting entry', () => {
    const queues = [{
      id: 'queue-priority', slug: 'priority', title: 'Prioridade', queueMode: 'manual_only', rewardOrigin: 'none',
      isOpen: true, remoteSyncStatus: 'local_only',
      entries: [{ id: 'entry-priority', displayName: 'Viewer priority', userLogin: 'viewer', status: 'waiting', priorityClass: 'priority', priorityReason: 'bits' }],
    }];
    const markup = renderToStaticMarkup(React.createElement(QueueList, { queues, locale: 'pt-BR', t }));
    expect(markup).toContain('Viewer priority');
    expect(markup).toContain('Prioritária (Bits)');
  });

  it('does not expose manual entry controls while a queue is being deleted or archived', () => {
    const queues = [
      { id: 'queue-delete', slug: 'delete', title: 'Deleting', lifecycleStatus: 'deleting', isOpen: false, entries: [] },
      { id: 'queue-archived', slug: 'archived', title: 'Archived', isArchived: true, isOpen: false, entries: [] },
    ];
    const markup = renderToStaticMarkup(React.createElement(QueueList, { queues, locale: 'pt-BR', t }));
    expect(markup).not.toContain('Adicionar pessoa');
  });
});

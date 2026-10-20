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
  'panel.queue.action_result.uncertain': 'A chamada pode ter sido registrada. Atualize a fila antes de tentar novamente.',
  'panel.queue.call_next.refresh_required': 'Não foi possível atualizar a fila. Atualize antes de chamar novamente.',
  'panel.queue.call_next.reference': 'Referência da chamada: {id}',
  'panel.queue.call_next.refresh': 'Atualizar fila',
  'panel.queue.call_next.refreshing': 'Atualizando fila…',
  'panel.queue.call_next.refreshed': 'Fila atualizada. Confira quem está aguardando antes de chamar novamente.',
  'panel.queue.call_next.refresh_failed': 'Não foi possível atualizar a fila. Tente de novo antes de chamar alguém.',
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
  'panel.queue.action.clear': 'Limpar fila',
  'panel.queue.action.delete': 'Excluir fila',
  'panel.queue.action.cancel_delete': 'Cancelar exclusão',
  'panel.queue.action.retry_local_delete': 'Verificar andamento da exclusão',
  'panel.queue.action.unarchive': 'Mostrar aos espectadores',
  'panel.queue.action.archive_local_review': 'Continuar para a confirmação final da exclusão',
  'panel.queue.action.resolve_reward': 'Vincular recompensa',
  'panel.queue.action.edit_reward': 'Editar recompensa',
  'panel.reward_settings.eyebrow': 'CUSTOM REWARD DA FILA',
  'panel.reward_settings.title': 'Editar recompensa',
  'panel.reward_settings.reward_name': 'Nome da recompensa',
  'panel.reward_settings.cost': 'Custo em pontos',
  'panel.reward_settings.description': 'Descrição',
  'panel.reward_settings.uid_field': 'Campo de UID',
  'panel.reward_settings.no_uid': 'Não solicitar UID',
  'panel.reward_settings.stream_limit': 'Limite por live',
  'panel.reward_settings.viewer_limit': 'Limite por pessoa',
  'panel.reward_settings.cooldown': 'Intervalo global',
  'panel.reward_settings.twitch_limits_hint': 'A Twitch aplica estes limites e cooldown; a alteração fica pendente.',
  'panel.reward_settings.group.reward': 'Detalhes da recompensa',
  'panel.reward_settings.group.viewer': 'Dados e privacidade de viewers',
  'panel.reward_settings.group.limits': 'Limites da Twitch',
  'panel.reward_settings.uid_removal_warning': 'Ocultar UID remove valores já salvos e cancela notificações pendentes.',
  'panel.reward_settings.submit': 'Solicitar atualização na Twitch',
  'panel.form.uid_visible': 'Solicitar UID',
  'panel.reward.dialog_eyebrow': 'RECUPERAÇÃO DE RECOMPENSA',
  'panel.reward.dialog_title': 'Localizar recompensa da fila',
  'panel.reward.manual_association_hint': 'Somente recompensas compatíveis serão listadas.',
  'panel.reward.compatible_rewards': 'Recompensas compatíveis',
  'panel.reward.refresh_candidates': 'Atualizar lista da Twitch',
  'panel.reward.link_selected': 'Vincular recompensa selecionada',
  'panel.reward.link_refresh_failed': 'A associação foi salva, mas a fila não atualizou. Atualize antes de vincular outra recompensa.',
  'panel.reward.refresh_queue': 'Atualizar fila',
  'panel.reward.refreshing_queue': 'Atualizando fila…',
  'panel.queue.confirm.archive_local_uncertain_first': 'Isto remove somente localmente; continuar?',
  'panel.queue.confirm.archive_local_uncertain_final': 'Confirmação final da exclusão local.',
  'panel.queue.confirm.delete': 'Excluir “{title}”? {count} pessoas.',
  'panel.queue.confirm.delete_local': 'Excluir fila local “{title}”? {count} pessoas.',
  'panel.queue.confirm.delete_converted': 'Excluir fila convertida “{title}”? {count} pessoas.',
  'panel.queue.confirm.cancel_delete': 'Cancelar exclusão de “{title}”?',
  'panel.queue.confirm.manual_mode': 'Pausar a recompensa Twitch e trocar para local?',
  'panel.queue.confirm.manual_mode_retry': 'Repetir pausa segura da recompensa?',
  'panel.queue.delete.pending': 'Exclusão pendente.',
  'panel.queue.delete.done': 'Fila excluída.',
  'panel.queue.delete.cancelled': 'Exclusão cancelada.',
  'panel.queue.mode_transition.done': 'Fila manual confirmada.',
  'panel.queue.mode_transition.pending': 'Pausa pendente.',
  'panel.queue.unarchive.done': 'Fila visível.',
  'panel.queue.action_result.failed': 'A ação falhou.',
  'panel.notice.call_already_queued': 'A chamada já está na fila de envio.',
  'panel.notice.call_resent': 'Reenvio solicitado. O prazo de ausência foi mantido.',
  'panel.queue.action.add': 'Adicionar pessoa',
  'panel.entry.twitch_login': 'Login Twitch',
  'panel.entry.error.failed': 'Não foi possível adicionar a entrada. Atualize o painel e tente novamente.',
  'panel.error.reference': 'Referência: {id}',
  'panel.entry.uid_optional': 'UID (opcional)',
  'panel.entry.login_placeholder': '@usuario',
  'panel.entry.uid_placeholder': '9 dígitos',
  'panel.entry.priority_toggle': 'Prioridade conferida por mim',
  'panel.priority.dialog_title': 'Confirme o benefício da prioridade',
  'panel.entry.reason_select': 'Selecione um benefício conferido',
  'panel.entry.reason_required': 'Selecione um benefício para registrar por que esta entrada tem prioridade.',
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
  'panel.entry.action.move_up': 'Mover ↑',
  'panel.entry.action.move_down': 'Mover ↓',
  'panel.entry.action.mark_priority': 'Marcar prioritária',
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
  'panel.queue.history.title': 'Histórico recente',
  'panel.queue.history.loading': 'Carregando histórico…',
  'panel.confirmation.title': 'Confirmar ação',
  'panel.queue.clear.confirm': 'Limpar “{title}”? {count} pessoas; {refunds} reembolsos.',
  'panel.queue.clear.loading': 'Calculando fila atual…',
  'panel.queue.clear.clearing': 'Limpando fila…',
  'panel.dialog.cancel': 'Cancelar',
  'panel.dialog.confirm': 'Confirmar',
};
const t = (key, { values = {} } = {}) => Object.entries(values).reduce(
  (message, [name, value]) => message.replaceAll(`{${name}}`, value),
  messages[key] ?? key,
);

describe('Next queue list', () => {
  it('keeps a saved reward link warning actionable and shows its safe reference', () => {
    const queues = [{ id: 'queue-reward', slug: 'reward', title: 'Reward', isOpen: false, queueMode: 'channel_points', lifecycleStatus: 'active', remoteSyncStatus: 'create_unknown', modeTransitionStatus: 'none', entries: [] }];
    const markup = renderToStaticMarkup(React.createElement(QueueList, {
      queues, locale: 'pt-BR', t, onRefreshProjection: () => true,
      queueAction: { queueId: 'queue-reward', status: 'warning', key: 'panel.reward.link_refresh_failed', referenceId: 'reward-refresh-3' },
    }));
    expect(markup).toContain('A associação foi salva, mas a fila não atualizou. Atualize antes de vincular outra recompensa.');
    expect(markup).toContain('Referência: reward-refresh-3');
    expect(markup).toContain('Atualizar fila');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Vincular recompensa/);
  });

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
    expect(markup).toContain('Mover ↑');
    expect(markup).toContain('Mover ↓');
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

  it.each([
    ['confirmed', 'panel.notice.call_resent', 'Reenvio solicitado. O prazo de ausência foi mantido.'],
    ['confirmed', 'panel.notice.call_already_queued', 'A chamada já está na fila de envio.'],
    ['error', 'panel.queue.action_result.failed', 'A ação falhou.'],
  ])('renders resend feedback in the existing accessible queue live region (%s, %s)', (status, key, message) => {
    const markup = renderToStaticMarkup(React.createElement(QueueList, {
      queues: [{
        id: 'queue-1', slug: 'arena', title: 'Arena', isOpen: true,
        queueMode: 'manual_only', lifecycleStatus: 'active',
        entries: [{ id: 'entry-1', displayName: 'Viewer called', status: 'called' }],
      }],
      locale: 'pt-BR', t,
      queueAction: { queueId: 'queue-1', status, key, referenceId: 'resend-queue-12' },
    }));
    expect(markup).toContain(`role="${status === 'error' ? 'alert' : 'status'}"`);
    expect(markup).toContain(message);
    expect(markup).toContain('Referência: resend-queue-12');
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

  it('renders lifecycle actions with localized confirmation dialogs and respects state guards', () => {
    const queues = [
      { id: 'local', slug: 'local', title: 'Local', queueMode: 'manual_only', rewardOrigin: 'none', lifecycleStatus: 'active', isOpen: false, isArchived: false, remoteSyncStatus: 'local_only', entries: [] },
      { id: 'archived', slug: 'archived', title: 'Archived', queueMode: 'manual_only', rewardOrigin: 'none', lifecycleStatus: 'active', isOpen: false, isArchived: true, remoteSyncStatus: 'local_only', entries: [] },
      { id: 'deleting', slug: 'deleting', title: 'Deleting', queueMode: 'channel_points', rewardOrigin: 'bot_created', rewardId: 'reward-1', lifecycleStatus: 'deleting', isOpen: false, remoteSyncStatus: 'delete_failed', entries: [] },
    ];
    const markup = renderToStaticMarkup(React.createElement(QueueList, { queues, locale: 'pt-BR', t }));
    expect(markup).toContain('Excluir fila');
    expect(markup).toContain('Excluir fila local “Local”? 0 pessoas.');
    expect(markup).toContain('Mostrar aos espectadores');
    expect(markup).toContain('Cancelar exclusão');
    expect(markup).toContain('Continuar para a confirmação final da exclusão');
    expect(markup).toContain('aria-modal="true"');
  });

  it('offers manual reward resolution only when Twitch creation is uncertain', () => {
    const queues = [{
      id: 'queue-recovery', slug: 'recovery', title: 'Recuperar reward', isOpen: false,
      lifecycleStatus: 'active', queueMode: 'channel_points', rewardOrigin: 'bot_created',
      remoteSyncStatus: 'create_unknown', modeTransitionStatus: 'none', version: 2, entries: [],
    }];
    const markup = renderToStaticMarkup(React.createElement(QueueList, { queues, locale: 'pt-BR', t }));
    expect(markup).toContain('Vincular recompensa');
    expect(markup).toContain('Localizar recompensa da fila');
    expect(markup).not.toContain('create_unknown');
  });

  it('offers reward editing only for a linked, synchronized Twitch reward', () => {
    const base = {
      id: 'queue-reward', slug: 'arena', title: 'Arena', cost: 350, isOpen: false,
      lifecycleStatus: 'active', queueMode: 'channel_points', rewardId: 'managed-reward',
      remoteSyncStatus: 'synced', uidMode: 'hidden', rewardPrompt: '', version: 4, entries: [],
    };
    const editable = renderToStaticMarkup(React.createElement(QueueList, { queues: [base], locale: 'pt-BR', t }));
    expect(editable).toContain('Editar recompensa');
    expect(editable).toContain('name="maxRedemptionsPerStream"');
    expect(editable).toContain('Detalhes da recompensa');
    expect(editable).toContain('Dados e privacidade de viewers');
    expect(editable).toContain('Limites da Twitch');
    expect(editable).toContain('A Twitch aplica estes limites e cooldown; a alteração fica pendente.');
    const pending = renderToStaticMarkup(React.createElement(QueueList, { queues: [{ ...base, remoteSyncStatus: 'pending_update' }], locale: 'pt-BR', t }));
    expect(pending).not.toContain('Editar recompensa');
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

  it('offers a destructive clear only through a preview-backed confirmation dialog', () => {
    const queues = [{
      id: 'queue-clear', slug: 'clear', title: 'Limpeza', queueMode: 'manual_only', rewardOrigin: 'none',
      isOpen: true, remoteSyncStatus: 'local_only', entries: [],
    }];
    const markup = renderToStaticMarkup(React.createElement(QueueList, { queues, locale: 'pt-BR', t }));
    expect(markup).toContain('Limpar fila');
    expect(markup).toContain('<dialog');
    expect(markup).toContain('Confirmar ação');
    expect(markup).toContain('Cancelar');
    expect(markup).not.toContain('prompt(');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).not.toContain('Limpando fila…');
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
    expect(markup).not.toContain('name="priorityReason"');
    expect(markup).not.toContain('A ação será auditada.');
    expect(markup).toContain('type="checkbox" name="priority"');
    expect(markup).not.toContain('Selecione um benefício conferido');
  });

  it('shows a safe error reference beside the localized manual-entry alert', () => {
    const queues = [{
      id: 'queue-manual', slug: 'manual', title: 'Manual', queueMode: 'manual_only', rewardOrigin: 'none',
      isOpen: false, remoteSyncStatus: 'local_only', entries: [],
    }];
    const markup = renderToStaticMarkup(React.createElement(QueueList, {
      queues,
      locale: 'pt-BR',
      t,
      queueAction: { queueId: 'queue-manual', status: 'error', key: 'panel.entry.error.failed', referenceId: '44444444-4444-4444-8444-444444444444' },
    }));

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Não foi possível adicionar a entrada. Atualize o painel e tente novamente.');
    expect(markup).toContain('Referência: 44444444-4444-4444-8444-444444444444');
  });

  it('shows a safe error reference beside the existing attendance-action alert', () => {
    const queues = [{
      id: 'queue-attendance', slug: 'attendance', title: 'Attendance', queueMode: 'manual_only', rewardOrigin: 'none',
      isOpen: true, remoteSyncStatus: 'local_only',
      entries: [{ id: 'entry-attendance', displayName: 'Viewer', status: 'in_progress' }],
    }];
    const markup = renderToStaticMarkup(React.createElement(QueueList, {
      queues,
      locale: 'pt-BR',
      t,
      queueAction: {
        queueId: 'queue-attendance', entryId: 'entry-attendance', status: 'error',
        key: 'panel.queue.action_result.failed', referenceId: '22222222-2222-4222-8222-222222222222',
      },
    }));

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('A ação falhou.');
    expect(markup).toContain('Referência: 22222222-2222-4222-8222-222222222222');
  });

  it('blocks all calls on an uncertain result until the operator refreshes the queue', () => {
    const queues = [{
      id: 'queue-call', slug: 'call', title: 'Call', queueMode: 'manual_only', rewardOrigin: 'none',
      isOpen: true, remoteSyncStatus: 'local_only', entries: [{ id: 'entry-call', displayName: 'Viewer', status: 'waiting' }],
    }];
    const markup = renderToStaticMarkup(React.createElement(QueueList, {
      queues,
      locale: 'pt-BR',
      t,
      queueCallRefreshRequired: true,
      onRefreshCallQueue: () => true,
      queueCallRecovery: {
        queueId: 'queue-call', required: true, key: 'panel.queue.action_result.uncertain',
        referenceId: '88888888-8888-4888-8888-888888888888',
      },
      queueAction: { queueId: 'queue-call', status: 'error', key: 'panel.queue.action_result.failed' },
    }));

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('A chamada pode ter sido registrada. Atualize a fila antes de tentar novamente.');
    expect(markup).toContain('Referência da chamada: 88888888-8888-4888-8888-888888888888');
    expect(markup).toContain('Atualizar fila');
    expect(markup).toMatch(/disabled=""[^>]*>Próximo<\/button>/);
    expect(markup).toMatch(/aria-label="Chamar Viewer"[^>]*disabled=""/);
    expect(markup).toContain('A ação falhou.');
  });

  it('keeps the call reference on refresh failure and focuses the refreshed status', () => {
    const queues = [{
      id: 'queue-call', slug: 'call', title: 'Call', queueMode: 'manual_only', rewardOrigin: 'none',
      isOpen: true, remoteSyncStatus: 'local_only', entries: [],
    }];
    const failed = renderToStaticMarkup(React.createElement(QueueList, {
      queues, locale: 'pt-BR', t, queueCallRefreshRequired: true, onRefreshCallQueue: () => false,
      queueCallRecovery: { queueId: 'queue-call', required: true, key: 'panel.queue.call_next.refresh_failed', referenceId: '88888888-8888-4888-8888-888888888888' },
    }));
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('Referência da chamada: 88888888-8888-4888-8888-888888888888');
    expect(failed).toContain('Atualizar fila');
    const refreshed = renderToStaticMarkup(React.createElement(QueueList, {
      queues, locale: 'pt-BR', t,
      queueCallRecovery: { queueId: 'queue-call', required: false, key: 'panel.queue.call_next.refreshed', referenceId: '88888888-8888-4888-8888-888888888888' },
    }));
    expect(refreshed).toContain('tabindex="-1"');
    expect(refreshed).toContain('role="status"');
    expect(refreshed).toContain('Referência da chamada: 88888888-8888-4888-8888-888888888888');
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

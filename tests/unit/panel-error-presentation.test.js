import { describe, expect, it } from 'vitest';
import { presentPanelError } from '../../apps/web/panel-error-presentation.mjs';

const catalogs = {
  'pt-BR': {
    'panel.error.generic': 'Não foi possível concluir. Tente novamente.',
    'panel.error.reference': 'Referência: {id}',
    'panel.error.locale_conflict': 'O idioma mudou em outra solicitação. Atualize a página.',
    'panel.error.locale_unavailable': 'Esse idioma não está disponível. Atualize os catálogos e tente novamente.',
    'panel.error.catalogs_unavailable': 'Não foi possível carregar os catálogos locais. Corrija os arquivos e tente novamente.',
    'panel.error.channel_locked': 'Este aplicativo já está vinculado a outro canal. Use uma instalação separada.',
    'panel.error.twitch_credentials': 'A Twitch não aceitou o aplicativo. Confira o Client ID e o Client Secret.',
    'panel.error.twitch_authorization': 'Não foi possível autorizar a Twitch. Reconecte o canal.',
    'panel.error.oauth_return': 'O retorno de autorização expirou ou não corresponde a esta sessão. Inicie a conexão novamente.',
    'panel.error.widget_link': 'Este link de widget não pode ser exibido novamente. Gere um novo link.',
    'panel.error.invalid_action': 'O estado foi alterado. Atualize o painel e tente novamente.',
    'panel.error.invalid_queue_settings': 'Revise as configurações da fila e tente novamente.',
    'panel.error.stale_queue_settings': 'A fila mudou enquanto você editava. Atualize o painel e tente novamente.',
    'panel.error.invalid_call_template': 'Use somente os campos de chamada listados na ajuda.',
    'panel.error.invalid_reward_settings': 'Revise o título, custo, descrição e limites da recompensa.',
    'panel.error.invalid_local_queue_setting': 'Altere UID e recompensa no editor de recompensa da Twitch.',
    'panel.error.queue_not_found': 'Esta fila não existe mais. Atualize o painel.',
    'panel.error.queue_not_available': 'Esta fila está sendo excluída e não aceita alterações.',
    'panel.error.reward_update_pending': 'Já existe uma alteração de recompensa em andamento. Atualize o painel para conferir o estado.',
    'panel.error.reward_unresolved': 'A recompensa ainda não foi confirmada. Resolva o vínculo antes de excluir a fila.',
    'panel.error.reward_not_ready': 'A recompensa desta fila ainda não foi confirmada. Atualize o painel e confira as operações pendentes.',
    'panel.error.queue_delete_unavailable': 'Não foi possível iniciar a exclusão. Atualize a fila e confira as operações pendentes.',
    'panel.error.operation_in_progress': 'Esta operação já foi iniciada. Atualize o painel para conferir o andamento.',
  },
  en: {
    'panel.error.generic': 'Could not complete the action. Try again.',
    'panel.error.reference': 'Reference: {id}',
    'panel.error.locale_conflict': 'The language changed in another request. Refresh the page.',
    'panel.error.locale_unavailable': 'That language is unavailable. Refresh the catalogs and try again.',
    'panel.error.catalogs_unavailable': 'Local catalogs could not be loaded. Fix the files and try again.',
    'panel.error.channel_locked': 'This app is already bound to another channel. Use a separate installation.',
    'panel.error.twitch_credentials': 'Twitch rejected the app. Check the Client ID and Client Secret.',
    'panel.error.twitch_authorization': 'Twitch authorization failed. Reconnect the channel.',
    'panel.error.oauth_return': 'The authorization response expired or does not match this session. Start the connection again.',
    'panel.error.widget_link': 'This widget link cannot be shown again. Generate a new link.',
    'panel.error.invalid_action': 'The state changed. Refresh the panel and try again.',
    'panel.error.invalid_queue_settings': 'Review the queue settings and try again.',
    'panel.error.stale_queue_settings': 'The queue changed while you were editing. Refresh the panel and try again.',
    'panel.error.invalid_call_template': 'Use only the call fields listed in the help text.',
    'panel.error.invalid_reward_settings': 'Review the reward title, cost, description, and limits.',
    'panel.error.invalid_local_queue_setting': 'Change UID and reward options in the Twitch reward editor.',
    'panel.error.queue_not_found': 'This queue no longer exists. Refresh the panel.',
    'panel.error.queue_not_available': 'This queue is being deleted and cannot be changed.',
    'panel.error.reward_update_pending': 'A reward update is already in progress. Refresh the panel to check its status.',
    'panel.error.queue_mode_transition_pending': 'This queue is switching modes. Wait until the Twitch pause is confirmed.',
    'panel.error.queue_mode_transition_unavailable': 'This queue cannot switch modes in its current state. Refresh the panel and review its operations.',
    'panel.error.reward_unresolved': 'The reward is not confirmed yet. Resolve the link before deleting this queue.',
    'panel.error.reward_not_ready': 'This queue reward is not confirmed yet. Refresh the panel and review pending reward operations.',
    'panel.error.queue_delete_unavailable': 'Could not start deletion. Refresh the queue and check pending operations.',
    'panel.error.operation_in_progress': 'This operation has already started. Refresh the panel to check its progress.',
  },
};

describe('panel error presentation', () => {
  it('maps stable API codes to local catalog copy without exposing backend messages', () => {
    const result = presentPanelError({ code: 'PRODUCT_LOCALE_VERSION_CONFLICT', message: 'database token=secret' }, 'en', catalogs);

    expect(result).toBe('The language changed in another request. Refresh the page.');
    expect(result).not.toContain('database');
    expect(result).not.toContain('secret');
  });

  it('uses a localized generic message for unknown codes, network errors, and missing translations', () => {
    expect(presentPanelError({ code: 'INTERNAL_ERROR', message: 'raw backend details' }, 'en', catalogs))
      .toBe('Could not complete the action. Try again.');
    expect(presentPanelError(new Error('browser network details'), 'en', catalogs))
      .toBe('Could not complete the action. Try again.');
    expect(presentPanelError({ code: 'INTERNAL_ERROR' }, 'es', catalogs))
      .toBe('Não foi possível concluir. Tente novamente.');
  });

  it('shows only a validated diagnostic reference alongside localized error copy', () => {
    const referenceId = '11111111-1111-4111-8111-111111111111';
    expect(presentPanelError({ referenceId, message: 'secret details' }, 'en', catalogs))
      .toBe(`Could not complete the action. Try again. (Reference: ${referenceId})`);
    expect(presentPanelError({ referenceId: 'token=secret' }, 'en', catalogs))
      .toBe('Could not complete the action. Try again.');
  });

  it('maps stable locale, Twitch, OAuth, widget, and state-conflict codes to safe localized copy', () => {
    const cases = [
      ['STALE_QUEUE_VERSION', 'The queue changed while you were editing. Refresh the panel and try again.'],
      ['INVALID_QUEUE_SETTINGS', 'Review the queue settings and try again.'],
      ['INTERNAL_ERROR', 'Could not complete the action. Try again.'],
      ['INVALID_CALL_MESSAGE_TEMPLATE', 'Use only the call fields listed in the help text.'],
      ['INVALID_REWARD_SETTINGS', 'Review the reward title, cost, description, and limits.'],
      ['INVALID_LOCAL_QUEUE_SETTING', 'Change UID and reward options in the Twitch reward editor.'],
      ['QUEUE_NOT_FOUND', 'This queue no longer exists. Refresh the panel.'],
      ['QUEUE_NOT_AVAILABLE', 'This queue is being deleted and cannot be changed.'],
      ['QUEUE_REWARD_UPDATE_PENDING', 'A reward update is already in progress. Refresh the panel to check its status.'],
      ['LOCALE_UNAVAILABLE', 'That language is unavailable. Refresh the catalogs and try again.'],
      ['LOCALIZATION_CATALOGS_UNAVAILABLE', 'Local catalogs could not be loaded. Fix the files and try again.'],
      ['CHANNEL_BINDING_LOCKED', 'This app is already bound to another channel. Use a separate installation.'],
      ['INVALID_TWITCH_CLIENT_CREDENTIALS', 'Twitch rejected the app. Check the Client ID and Client Secret.'],
      ['TWITCH_AUTHORIZATION_FAILED', 'Twitch authorization failed. Reconnect the channel.'],
      ['INVALID_OAUTH_SESSION', 'The authorization response expired or does not match this session. Start the connection again.'],
      ['OVERLAY_LINK_ALREADY_ISSUED', 'This widget link cannot be shown again. Generate a new link.'],
      ['INVALID_ENTRY_TRANSITION', 'The state changed. Refresh the panel and try again.'],
      ['STALE_QUEUE_VERSION', 'The queue changed while you were editing. Refresh the panel and try again.'],
      ['INVALID_QUEUE_SETTINGS', 'Review the queue settings and try again.'],
      ['QUEUE_MODE_TRANSITION_PENDING', 'This queue is switching modes. Wait until the Twitch pause is confirmed.'],
      ['QUEUE_MODE_TRANSITION_UNAVAILABLE', 'This queue cannot switch modes in its current state. Refresh the panel and review its operations.'],
      ['QUEUE_REWARD_NOT_READY', 'This queue reward is not confirmed yet. Refresh the panel and review pending reward operations.'],
      ['QUEUE_DELETE_UNAVAILABLE', 'Could not start deletion. Refresh the queue and check pending operations.'],
      ['PANEL_OPERATION_ALREADY_IN_PROGRESS', 'This operation has already started. Refresh the panel to check its progress.'],
    ];
    for (const [code, expected] of cases) {
      expect(presentPanelError({ code, message: `raw details ${code} token=secret` }, 'en', catalogs)).toBe(expected);
    }
  });
});

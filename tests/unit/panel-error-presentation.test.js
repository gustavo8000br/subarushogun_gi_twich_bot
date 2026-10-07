import { describe, expect, it } from 'vitest';
import { presentPanelError } from '../../apps/web/panel-error-presentation.mjs';

const catalogs = {
  'pt-BR': {
    'panel.error.generic': 'Não foi possível concluir. Tente novamente.',
    'panel.error.locale_conflict': 'O idioma mudou em outra solicitação. Atualize a página.',
    'panel.error.locale_unavailable': 'Esse idioma não está disponível. Atualize os catálogos e tente novamente.',
    'panel.error.catalogs_unavailable': 'Não foi possível carregar os catálogos locais. Corrija os arquivos e tente novamente.',
    'panel.error.channel_locked': 'Este aplicativo já está vinculado a outro canal. Use uma instalação separada.',
    'panel.error.twitch_credentials': 'A Twitch não aceitou o aplicativo. Confira o Client ID e o Client Secret.',
    'panel.error.twitch_authorization': 'Não foi possível autorizar a Twitch. Reconecte o canal.',
    'panel.error.oauth_return': 'O retorno de autorização expirou ou não corresponde a esta sessão. Inicie a conexão novamente.',
    'panel.error.widget_link': 'Este link de widget não pode ser exibido novamente. Gere um novo link.',
    'panel.error.invalid_action': 'O estado foi alterado. Atualize o painel e tente novamente.',
  },
  en: {
    'panel.error.generic': 'Could not complete the action. Try again.',
    'panel.error.locale_conflict': 'The language changed in another request. Refresh the page.',
    'panel.error.locale_unavailable': 'That language is unavailable. Refresh the catalogs and try again.',
    'panel.error.catalogs_unavailable': 'Local catalogs could not be loaded. Fix the files and try again.',
    'panel.error.channel_locked': 'This app is already bound to another channel. Use a separate installation.',
    'panel.error.twitch_credentials': 'Twitch rejected the app. Check the Client ID and Client Secret.',
    'panel.error.twitch_authorization': 'Twitch authorization failed. Reconnect the channel.',
    'panel.error.oauth_return': 'The authorization response expired or does not match this session. Start the connection again.',
    'panel.error.widget_link': 'This widget link cannot be shown again. Generate a new link.',
    'panel.error.invalid_action': 'The state changed. Refresh the panel and try again.',
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

  it('maps stable locale, Twitch, OAuth, widget, and state-conflict codes to safe localized copy', () => {
    const cases = [
      ['LOCALE_UNAVAILABLE', 'That language is unavailable. Refresh the catalogs and try again.'],
      ['LOCALIZATION_CATALOGS_UNAVAILABLE', 'Local catalogs could not be loaded. Fix the files and try again.'],
      ['CHANNEL_BINDING_LOCKED', 'This app is already bound to another channel. Use a separate installation.'],
      ['INVALID_TWITCH_CLIENT_CREDENTIALS', 'Twitch rejected the app. Check the Client ID and Client Secret.'],
      ['TWITCH_AUTHORIZATION_FAILED', 'Twitch authorization failed. Reconnect the channel.'],
      ['INVALID_OAUTH_SESSION', 'The authorization response expired or does not match this session. Start the connection again.'],
      ['OVERLAY_LINK_ALREADY_ISSUED', 'This widget link cannot be shown again. Generate a new link.'],
      ['INVALID_ENTRY_TRANSITION', 'The state changed. Refresh the panel and try again.'],
    ];
    for (const [code, expected] of cases) {
      expect(presentPanelError({ code, message: `raw details ${code} token=secret` }, 'en', catalogs)).toBe(expected);
    }
  });
});

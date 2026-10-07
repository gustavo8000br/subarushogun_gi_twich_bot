import { describe, expect, it } from 'vitest';
import * as setupMessages from '../../apps/web/setup-messages.mjs';
const { twitchEligibilityMessage } = setupMessages;

describe('Twitch setup eligibility message', () => {
  it('shows channel eligibility and reward capacity without hiding the near-limit warning', () => {
    expect(twitchEligibilityMessage({ eligibility: {
      eligible: true, broadcasterType: 'partner', channelPointsAvailable: true,
      rewardCount: 46, rewardLimit: 50, nearRewardLimit: true,
    } })).toBe('Parceiro · Channel Points disponíveis · 46/50 recompensas · próximo do limite.');
  });

  it('explains ineligible channels and unavailable Channel Points access', () => {
    expect(twitchEligibilityMessage({ eligibility: { eligible: false, reason: 'channel_ineligible' } }))
      .toBe('Este canal precisa ser Afiliado ou Parceiro para usar recompensas de pontos.');
    expect(twitchEligibilityMessage({ eligibility: { eligible: false, reason: 'channel_points_unavailable' } }))
      .toBe('A API de pontos do canal não está disponível. As filas continuam desativadas.');
  });

  it.each([
    ['en', 'Partner · Channel Points available · 46/50 rewards · near the limit.'],
    ['es', 'Partner · Puntos del canal disponibles · 46/50 recompensas · cerca del límite.'],
  ])('localizes eligible channel summary for %s', (locale, expected) => {
    expect(twitchEligibilityMessage({ eligibility: {
      eligible: true, broadcasterType: 'partner', channelPointsAvailable: true,
      rewardCount: 46, rewardLimit: 50, nearRewardLimit: true,
    } }, locale)).toBe(expected);
  });

  it.each([
    [{ eligibility: { eligible: false, reason: 'channel_ineligible' } }, 'en', 'This channel must be Affiliate or Partner to use Channel Points rewards.'],
    [{ eligibility: { eligible: false, reason: 'channel_ineligible' } }, 'es', 'Este canal debe ser Afiliado o Partner para usar recompensas de puntos del canal.'],
    [{ eligibility: { eligible: false, reason: 'channel_points_unavailable' } }, 'en', 'The Channel Points API is unavailable. Queues remain disabled.'],
    [{ eligibility: { eligible: false, reason: 'channel_points_unavailable' } }, 'es', 'La API de puntos del canal no está disponible. Las colas siguen desactivadas.'],
  ])('localizes eligibility guidance for %s in %s', (setup, locale, expected) => {
    expect(twitchEligibilityMessage(setup, locale)).toBe(expected);
  });

  it('does not claim eligibility when the check has not produced a result', () => {
    expect(twitchEligibilityMessage({ connected: true })).toBe('Canal conectado; verificando elegibilidade e disponibilidade de pontos.');
  });

  it.each([
    [{ connected: true }, 'en', 'Channel connected; checking eligibility and Channel Points availability.'],
    [{ connected: true }, 'es', 'Canal conectado; comprobando elegibilidad y disponibilidad de puntos.'],
    [{ secretConfigured: true }, 'en', 'Application validated. Connect the channel to check eligibility.'],
    [{ secretConfigured: true }, 'es', 'Aplicación validada. Conecta el canal para comprobar la elegibilidad.'],
    [{}, 'en', 'Connect your channel to enable rewards.'],
    [{}, 'es', 'Conecta tu canal para activar las recompensas.'],
  ])('localizes incomplete eligibility setup state for %s in %s', (setup, locale, expected) => {
    expect(twitchEligibilityMessage(setup, locale)).toBe(expected);
  });
});


describe('Twitch setup status label', () => {
  it('uses an automatically discovered community locale catalog without a locale registry', () => {
    const catalogBundle = { modules: { setup: { catalogs: { de: {
      'translation.unavailable': 'Produkttext nicht verfügbar.',
      'twitch.status.connected': 'Verbunden',
      'twitch.status.ineligible': 'Affiliate- oder Partnerstatus erforderlich',
    } } } } };
    expect(setupMessages.twitchStatusLabel({ status: 'connected' }, 'de', catalogBundle)).toBe('Verbunden');
    expect(setupMessages.twitchStatusLabel({ status: 'ineligible' }, 'de', catalogBundle)).toBe('Affiliate- oder Partnerstatus erforderlich');
  });

  it('maps ineligible and other API statuses to Portuguese display labels', () => {
    expect(setupMessages.twitchStatusLabel).toBeTypeOf('function');
    expect(setupMessages.twitchStatusLabel({ status: 'ineligible' })).toBe('Afiliado ou Parceiro necessário');
    expect(setupMessages.twitchStatusLabel({ status: 'connected' })).toBe('Conectado');
    expect(setupMessages.twitchStatusLabel({ status: 'reconnect_required' })).toBe('Reconexão necessária');
  });

  it.each([
    ['en', 'Channel requires Affiliate or Partner status'],
    ['es', 'El canal debe ser Afiliado o Partner'],
  ])('localizes the ineligible status for %s', (locale, expected) => {
    expect(setupMessages.twitchStatusLabel({ status: 'ineligible' }, locale)).toBe(expected);
  });

  it.each([
    ['en', 'not_configured', 'Not configured'],
    ['en', 'connected', 'Connected'],
    ['en', 'connecting', 'Connecting'],
    ['en', 'reconciling', 'Syncing'],
    ['en', 'degraded', 'Unstable connection'],
    ['en', 'retrying', 'Reconnecting'],
    ['en', 'reconnect_required', 'Reconnection required'],
    ['en', 'eligibility_unknown', 'Checking eligibility'],
    ['en', 'stopped', 'Stopped'],
    ['en', 'unavailable', 'Status unavailable'],
    ['es', 'not_configured', 'No configurado'],
    ['es', 'connected', 'Conectado'],
    ['es', 'connecting', 'Conectando'],
    ['es', 'reconciling', 'Sincronizando'],
    ['es', 'degraded', 'Conexión inestable'],
    ['es', 'retrying', 'Reconectando'],
    ['es', 'reconnect_required', 'Es necesario reconectar'],
    ['es', 'eligibility_unknown', 'Verificando elegibilidad'],
    ['es', 'stopped', 'Detenido'],
    ['es', 'unavailable', 'Estado no disponible'],
  ])('localizes the %s integration status %s', (locale, status, expected) => {
    expect(setupMessages.twitchStatusLabel({ status }, locale)).toBe(expected);
  });

  it('never renders unknown internal status values as panel copy', () => {
    expect(setupMessages.twitchStatusLabel({ status: 'SECRET_INTERNAL_STATUS' })).toBe('Status indisponível');
  });

  it.each([
    ['en', 'Status unavailable'],
    ['es', 'Estado no disponible'],
  ])('localizes the safe fallback for unknown statuses in %s', (locale, expected) => {
    expect(setupMessages.twitchStatusLabel({ status: 'SECRET_INTERNAL_STATUS' }, locale)).toBe(expected);
  });

  it('keeps a connected but ineligible channel visibly ineligible', () => {
    const setup = {
      connected: true,
      status: 'ineligible',
      eligibility: { eligible: false, reason: 'channel_ineligible' },
    };

    expect(setupMessages.twitchStatusLabel(setup)).toBe('Afiliado ou Parceiro necessário');
    expect(setupMessages.twitchStatusState(setup)).toBe('ineligible');
  });

  it('prioritizes an explicit reconnect status over a stale eligibility reason', () => {
    const setup = {
      connected: false,
      status: 'reconnect_required',
      eligibility: { eligible: false, reason: 'channel_ineligible' },
    };

    expect(setupMessages.twitchStatusLabel(setup)).toBe('Reconexão necessária');
    expect(setupMessages.twitchStatusState(setup)).toBe('reconnect_required');
  });
});

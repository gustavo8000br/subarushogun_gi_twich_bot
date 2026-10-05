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

  it('does not claim eligibility when the check has not produced a result', () => {
    expect(twitchEligibilityMessage({ connected: true })).toBe('Canal conectado; verificando elegibilidade e disponibilidade de pontos.');
  });
});


describe('Twitch setup status label', () => {
  it('maps ineligible and other API statuses to Portuguese display labels', () => {
    expect(setupMessages.twitchStatusLabel).toBeTypeOf('function');
    expect(setupMessages.twitchStatusLabel({ status: 'ineligible' })).toBe('Afiliado ou Parceiro necessário');
    expect(setupMessages.twitchStatusLabel({ status: 'connected' })).toBe('Conectado');
    expect(setupMessages.twitchStatusLabel({ status: 'reconnect_required' })).toBe('Reconexão necessária');
  });

  it('never renders unknown internal status values as panel copy', () => {
    expect(setupMessages.twitchStatusLabel({ status: 'SECRET_INTERNAL_STATUS' })).toBe('Status indisponível');
  });
});

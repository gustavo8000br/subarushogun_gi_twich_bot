import { describe, expect, it } from 'vitest';
import { twitchEligibilityMessage } from '../../apps/web/setup-messages.mjs';

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

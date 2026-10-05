/** @param {{eligibility?: {eligible?: boolean, broadcasterType?: string, reason?: string, rewardCount?: number, rewardLimit?: number, nearRewardLimit?: boolean}|null, connected?: boolean, secretConfigured?: boolean}} setup */
export function twitchEligibilityMessage(setup) {
  const eligibility = setup.eligibility;
  if (eligibility?.eligible) {
    const channelType = eligibility.broadcasterType === 'partner' ? 'Parceiro' : 'Afiliado';
    const count = Number.isInteger(eligibility.rewardCount) && Number.isInteger(eligibility.rewardLimit)
      ? ` · ${eligibility.rewardCount}/${eligibility.rewardLimit} recompensas` : '';
    return `${channelType} · Channel Points disponíveis${count}${eligibility.nearRewardLimit ? ' · próximo do limite' : ''}.`;
  }
  if (eligibility?.reason === 'channel_ineligible') return 'Este canal precisa ser Afiliado ou Parceiro para usar recompensas de pontos.';
  if (eligibility?.reason === 'channel_points_unavailable') return 'A API de pontos do canal não está disponível. As filas continuam desativadas.';
  if (setup.connected) return 'Canal conectado; verificando elegibilidade e disponibilidade de pontos.';
  return setup.secretConfigured ? 'Aplicativo validado. Conecte o canal para verificar elegibilidade.' : 'Conecte seu canal para ativar as recompensas.';
}

const statusLabels = Object.freeze({
  not_configured: 'Não configurado',
  connected: 'Conectado',
  connecting: 'Conectando',
  reconciling: 'Sincronizando',
  degraded: 'Conexão instável',
  reconnect_required: 'Reconexão necessária',
  ineligible: 'Afiliado ou Parceiro necessário',
  eligibility_unknown: 'Verificando elegibilidade',
  stopped: 'Desligada',
});

/** Map internal integration states to safe pt-BR panel copy. */
export function twitchStatusLabel(setup = {}) {
  if (setup.connected === true) return statusLabels.connected;
  return statusLabels[setup.status] ?? 'Status indisponível';
}

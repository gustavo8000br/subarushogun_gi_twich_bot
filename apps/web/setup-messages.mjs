import { translateCatalog } from '../shared/browser/translate-catalog.mjs';

/** @param {{eligibility?: {eligible?: boolean, broadcasterType?: string, reason?: string, rewardCount?: number, rewardLimit?: number, nearRewardLimit?: boolean}|null, connected?: boolean, secretConfigured?: boolean}} setup */
const localizedEligibilityMessages = Object.freeze({
  'pt-BR': Object.freeze({
    affiliate: 'Afiliado', partner: 'Parceiro', points_available: 'Channel Points disponíveis',
    rewards: 'recompensas', near_limit: 'próximo do limite',
    connected_pending: 'Canal conectado; verificando elegibilidade e disponibilidade de pontos.',
    app_validated: 'Aplicativo validado. Conecte o canal para verificar elegibilidade.',
    connect_channel: 'Conecte seu canal para ativar as recompensas.',
  }),
  en: Object.freeze({
    channel_ineligible: 'This channel must be Affiliate or Partner to use Channel Points rewards.',
    channel_points_unavailable: 'The Channel Points API is unavailable. Queues remain disabled.',
    affiliate: 'Affiliate', partner: 'Partner', points_available: 'Channel Points available',
    rewards: 'rewards', near_limit: 'near the limit',
    connected_pending: 'Channel connected; checking eligibility and Channel Points availability.',
    app_validated: 'Application validated. Connect the channel to check eligibility.',
    connect_channel: 'Connect your channel to enable rewards.',
  }),
  es: Object.freeze({
    channel_ineligible: 'Este canal debe ser Afiliado o Partner para usar recompensas de puntos del canal.',
    channel_points_unavailable: 'La API de puntos del canal no está disponible. Las colas siguen desactivadas.',
    affiliate: 'Afiliado', partner: 'Partner', points_available: 'Puntos del canal disponibles',
    rewards: 'recompensas', near_limit: 'cerca del límite',
    connected_pending: 'Canal conectado; comprobando elegibilidad y disponibilidad de puntos.',
    app_validated: 'Aplicación validada. Conecta el canal para comprobar la elegibilidad.',
    connect_channel: 'Conecta tu canal para activar las recompensas.',
  }),
});

function discoveredSetupCopy(catalogBundle, locale, key) {
  const catalogs = catalogBundle?.modules?.setup?.catalogs;
  if (!catalogs || !Object.hasOwn(catalogs, locale)) return null;
  return translateCatalog(catalogs, locale, key);
}

export function twitchEligibilityMessage(setup, locale = 'pt-BR', catalogBundle = null) {
  const eligibility = setup.eligibility;
  if (eligibility?.eligible) {
    const localized = localizedEligibilityMessages[locale] ?? localizedEligibilityMessages['pt-BR'];
    const channelType = discoveredSetupCopy(catalogBundle, locale,
      eligibility.broadcasterType === 'partner' ? 'twitch.eligibility.partner' : 'twitch.eligibility.affiliate')
      ?? (eligibility.broadcasterType === 'partner' ? localized.partner : localized.affiliate);
    const pointsAvailable = discoveredSetupCopy(catalogBundle, locale, 'twitch.eligibility.points_available') ?? localized.points_available;
    const rewards = discoveredSetupCopy(catalogBundle, locale, 'twitch.eligibility.rewards') ?? localized.rewards;
    const nearLimit = discoveredSetupCopy(catalogBundle, locale, 'twitch.eligibility.near_limit') ?? localized.near_limit;
    const count = Number.isInteger(eligibility.rewardCount) && Number.isInteger(eligibility.rewardLimit)
      ? ` · ${eligibility.rewardCount}/${eligibility.rewardLimit} ${rewards}` : '';
    return `${channelType} · ${pointsAvailable}${count}${eligibility.nearRewardLimit ? ` · ${nearLimit}` : ''}.`;
  }
  if (eligibility?.reason === 'channel_ineligible') return discoveredSetupCopy(catalogBundle, locale, 'twitch.eligibility.channel_ineligible')
    ?? localizedEligibilityMessages[locale]?.channel_ineligible ?? 'Este canal precisa ser Afiliado ou Parceiro para usar recompensas de pontos.';
  if (eligibility?.reason === 'channel_points_unavailable') return discoveredSetupCopy(catalogBundle, locale, 'twitch.eligibility.channel_points_unavailable')
    ?? localizedEligibilityMessages[locale]?.channel_points_unavailable ?? 'A API de pontos do canal não está disponível. As filas continuam desativadas.';
  const localized = localizedEligibilityMessages[locale] ?? localizedEligibilityMessages['pt-BR'];
  if (setup.connected) return discoveredSetupCopy(catalogBundle, locale, 'twitch.eligibility.connected_pending') ?? localized.connected_pending;
  if (setup.secretConfigured) return discoveredSetupCopy(catalogBundle, locale, 'twitch.eligibility.app_validated') ?? localized.app_validated;
  return discoveredSetupCopy(catalogBundle, locale, 'twitch.eligibility.connect_channel') ?? localized.connect_channel;
}

const statusLabels = Object.freeze({
  not_configured: 'Não configurado',
  connected: 'Conectado',
  connecting: 'Conectando',
  reconciling: 'Sincronizando',
  degraded: 'Conexão instável',
  retrying: 'Reconectando',
  reconnect_required: 'Reconexão necessária',
  ineligible: 'Afiliado ou Parceiro necessário',
  eligibility_unknown: 'Verificando elegibilidade',
  stopped: 'Desligada',
});

const localizedStatusLabels = Object.freeze({
  en: Object.freeze({
    not_configured: 'Not configured', connected: 'Connected', connecting: 'Connecting',
    reconciling: 'Syncing', degraded: 'Unstable connection', reconnect_required: 'Reconnection required',
    retrying: 'Reconnecting',
    ineligible: 'Channel requires Affiliate or Partner status', eligibility_unknown: 'Checking eligibility',
    stopped: 'Stopped', unavailable: 'Status unavailable',
  }),
  es: Object.freeze({
    not_configured: 'No configurado', connected: 'Conectado', connecting: 'Conectando',
    reconciling: 'Sincronizando', degraded: 'Conexión inestable', reconnect_required: 'Es necesario reconectar',
    retrying: 'Reconectando',
    ineligible: 'El canal debe ser Afiliado o Partner', eligibility_unknown: 'Verificando elegibilidad',
    stopped: 'Detenido', unavailable: 'Estado no disponible',
  }),
});

/** Map internal integration states to safe localized panel copy. */
export function twitchStatusLabel(setup = {}, locale = 'pt-BR', catalogBundle = null) {
  const state = twitchStatusState(setup);
  const discovered = discoveredSetupCopy(catalogBundle, locale, `twitch.status.${state}`);
  if (discovered !== null) return discovered;
  return localizedStatusLabels[locale]?.[state] ?? statusLabels[state] ?? 'Status indisponível';
}

/** Keep the visual status state aligned with the safe displayed status. */
export function twitchStatusState(setup = {}) {
  if (setup.status && setup.status !== 'connected' && statusLabels[setup.status]) return setup.status;
  if (setup.eligibility?.reason === 'channel_ineligible') return 'ineligible';
  if (setup.connected === true) return 'connected';
  return statusLabels[setup.status] ? setup.status : 'unavailable';
}

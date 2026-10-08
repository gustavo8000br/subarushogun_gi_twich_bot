const twitchLabels = Object.freeze({
  connected: 'connected',
  not_configured: 'not_configured',
  connecting: 'connecting',
  reconciling: 'reconciling',
  degraded: 'degraded',
  retrying: 'retrying',
  reconnect_required: 'reconnect_required',
  ineligible: 'ineligible',
  stopped: 'stopped',
  unknown: 'unknown',
});
const chatLabels = Object.freeze({ connected: 'connected', not_configured: 'not_configured', connecting: 'connecting', degraded: 'degraded', retrying: 'retrying', reconnect_required: 'reconnect_required', stopped: 'stopped', unknown: 'unknown' });
const rewardLabels = Object.freeze({ available: 'available', not_configured: 'not_configured', unsupported: 'unsupported', unknown: 'unknown', reconnect_required: 'reconnect_required', stopped: 'stopped' });

/** @param {unknown} value @param {string} [locale] @param {unknown} [inputCatalogs] */
export function formatHealthStatus(value, locale = 'pt-BR', inputCatalogs = {}) {
  const input = /** @type {Record<string, any>} */ (inputCatalogs);
  const catalogs = input.modules?.panel?.catalogs ?? input;
  const t = (key, fallback) => catalogs[locale]?.[key] ?? catalogs['pt-BR']?.[key] ?? fallback;
  const dependencies = value && typeof value === 'object' && 'dependencies' in value
    ? /** @type {{database?: unknown, twitch_api?: unknown, twitch_integration?: unknown, twitch_api_ping_ms?: unknown, twitch_chat?: unknown, twitch_rewards?: unknown}} */ (value.dependencies)
    : {};
  const databaseState = dependencies.database === 'connected' ? 'connected' : dependencies.database === 'unavailable' ? 'unavailable' : 'checking';
  const database = t(`panel.health.database.${databaseState}`, ({ connected: 'Conectado', unavailable: 'Indisponível', checking: 'Verificando' })[databaseState]);
  const twitchState = twitchLabels[/** @type {keyof typeof twitchLabels} */ (dependencies.twitch_api)] ?? 'unknown';
  const twitch = t(`panel.health.twitch.${twitchState}`, ({ connected: 'Conectada', not_configured: 'Não configurada', connecting: 'Conectando', reconciling: 'Sincronizando', degraded: 'Instável', retrying: 'Reconectando', reconnect_required: 'Reconexão necessária', ineligible: 'Canal não elegível', stopped: 'Desconectada', unknown: 'Estado desconhecido' })[twitchState]);
  const hasIntegrationState = Object.hasOwn(dependencies, 'twitch_integration');
  const integrationState = twitchLabels[/** @type {keyof typeof twitchLabels} */ (dependencies.twitch_integration)] ?? 'unknown';
  const integration = t(`panel.health.twitch.${integrationState}`, ({ connected: 'Conectada', not_configured: 'Não configurada', connecting: 'Conectando', reconciling: 'Sincronizando', degraded: 'Instável', retrying: 'Reconectando', reconnect_required: 'Reconexão necessária', ineligible: 'Canal não elegível', stopped: 'Desconectada', unknown: 'Estado desconhecido' })[integrationState]);
  const chatState = chatLabels[/** @type {keyof typeof chatLabels} */ (dependencies.twitch_chat ?? 'not_configured')] ?? 'unknown';
  const chat = t(`panel.health.chat.${chatState}`, ({ connected: 'Conectado', not_configured: 'Não configurado', connecting: 'Conectando', degraded: 'Instável', retrying: 'Reconectando', reconnect_required: 'Reconexão necessária', stopped: 'Desconectado', unknown: 'Estado desconhecido' })[chatState]);
  const rewardState = rewardLabels[/** @type {keyof typeof rewardLabels} */ (dependencies.twitch_rewards ?? 'not_configured')] ?? 'unknown';
  const rewards = t(`panel.health.rewards.${rewardState}`, ({ available: 'Disponíveis', not_configured: 'Não configuradas', unsupported: 'Indisponíveis neste canal', unknown: 'Verificando', reconnect_required: 'Autorização necessária', stopped: 'Desativadas' })[rewardState]);
  const rawPing = dependencies.twitch_api_ping_ms;
  const ping = typeof rawPing === 'number' && Number.isFinite(rawPing) && rawPing >= 0
    ? `${Math.round(rawPing)} ms`
    : t('panel.health.ping_unavailable', 'Sem medição');
  const unhealthy = databaseState === 'unavailable'
    || ['degraded', 'retrying', 'reconnect_required', 'unknown'].includes(twitchState)
    || (hasIntegrationState && ['degraded', 'retrying', 'reconnect_required', 'unknown'].includes(integrationState))
    || ['degraded', 'retrying', 'reconnect_required', 'unknown'].includes(chatState);
  const overall = t(unhealthy ? 'panel.health.overall.check' : 'panel.health.overall.operational', unhealthy ? 'Verificar conexão' : 'Operacional');
  return { database, twitch, ...(hasIntegrationState ? { integration } : {}), chat, rewards, ping, overall };
}

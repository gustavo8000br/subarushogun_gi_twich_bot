const twitchLabels = Object.freeze({
  connected: 'connected',
  not_configured: 'not_configured',
  connecting: 'connecting',
  reconciling: 'reconciling',
  degraded: 'degraded',
  reconnect_required: 'reconnect_required',
  ineligible: 'ineligible',
  stopped: 'stopped',
  unknown: 'unknown',
});

/** @param {unknown} value @param {string} [locale] @param {unknown} [inputCatalogs] */
export function formatHealthStatus(value, locale = 'pt-BR', inputCatalogs = {}) {
  const input = /** @type {Record<string, any>} */ (inputCatalogs);
  const catalogs = input.modules?.panel?.catalogs ?? input;
  const t = (key, fallback) => catalogs[locale]?.[key] ?? catalogs['pt-BR']?.[key] ?? fallback;
  const dependencies = value && typeof value === 'object' && 'dependencies' in value
    ? /** @type {{database?: unknown, twitch_api?: unknown, twitch_api_ping_ms?: unknown}} */ (value.dependencies)
    : {};
  const databaseState = dependencies.database === 'connected' ? 'connected' : dependencies.database === 'unavailable' ? 'unavailable' : 'checking';
  const database = t(`panel.health.database.${databaseState}`, ({ connected: 'Conectado', unavailable: 'Indisponível', checking: 'Verificando' })[databaseState]);
  const twitchState = twitchLabels[/** @type {keyof typeof twitchLabels} */ (dependencies.twitch_api)] ?? 'unknown';
  const twitch = t(`panel.health.twitch.${twitchState}`, ({ connected: 'Conectada', not_configured: 'Não configurada', connecting: 'Conectando', reconciling: 'Sincronizando', degraded: 'Instável', reconnect_required: 'Reconexão necessária', ineligible: 'Canal não elegível', stopped: 'Desconectada', unknown: 'Estado desconhecido' })[twitchState]);
  const rawPing = dependencies.twitch_api_ping_ms;
  const ping = typeof rawPing === 'number' && Number.isFinite(rawPing) && rawPing >= 0
    ? `${Math.round(rawPing)} ms`
    : t('panel.health.ping_unavailable', 'Sem medição');
  const unhealthy = databaseState === 'unavailable'
    || ['degraded', 'reconnect_required', 'unknown'].includes(twitchState);
  const overall = t(unhealthy ? 'panel.health.overall.check' : 'panel.health.overall.operational', unhealthy ? 'Verificar conexão' : 'Operacional');
  return { database, twitch, ping, overall };
}

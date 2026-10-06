const twitchLabels = Object.freeze({
  connected: 'Conectada',
  not_configured: 'Não configurada',
  connecting: 'Conectando',
  reconciling: 'Sincronizando',
  degraded: 'Instável',
  reconnect_required: 'Reconexão necessária',
  ineligible: 'Canal não elegível',
  stopped: 'Desconectada',
  unknown: 'Estado desconhecido',
});

/** @param {unknown} value */
export function formatHealthStatus(value) {
  const dependencies = value && typeof value === 'object' && 'dependencies' in value
    ? /** @type {{database?: unknown, twitch_api?: unknown, twitch_api_ping_ms?: unknown}} */ (value.dependencies)
    : {};
  const database = dependencies.database === 'connected'
    ? 'Conectado'
    : dependencies.database === 'unavailable' ? 'Indisponível' : 'Verificando';
  const twitch = twitchLabels[/** @type {keyof typeof twitchLabels} */ (dependencies.twitch_api)] ?? 'Estado desconhecido';
  const rawPing = dependencies.twitch_api_ping_ms;
  const ping = typeof rawPing === 'number' && Number.isFinite(rawPing) && rawPing >= 0
    ? `${Math.round(rawPing)} ms`
    : 'Sem medição';
  const unhealthy = database === 'Indisponível'
    || ['Instável', 'Reconexão necessária', 'Estado desconhecido'].includes(twitch);
  return { database, twitch, ping, overall: unhealthy ? 'Verificar conexão' : 'Operacional' };
}

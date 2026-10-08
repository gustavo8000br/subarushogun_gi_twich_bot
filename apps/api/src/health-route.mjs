/** Keep a stable health-reader function for handlers built before the route is registered. */
export function createTwitchHealthBridge() {
  let currentReader = () => null;
  return {
    read: () => currentReader(),
    attach(reader) {
      if (typeof reader !== 'function') throw new TypeError('Twitch health reader must be a function');
      currentReader = reader;
    },
  };
}

/**
 * Register the local runtime health projection.
 * @param {import('fastify').FastifyInstance} app
 * @param {{ pool: { query: (query: string) => Promise<unknown> }, productVersion: string, getTwitchStatus?: () => string, getTwitchChatStatus?: () => string, getTwitchRewardStatus?: () => string, probeTwitchApi?: () => Promise<true>, now?: () => number, probeCacheMs?: number }} dependencies
 */
export function registerHealthRoute(app, {
  pool, productVersion, getTwitchStatus = () => 'not_configured',
  getTwitchChatStatus = () => 'not_configured', getTwitchRewardStatus = () => 'not_configured', probeTwitchApi,
  now = Date.now, probeCacheMs = 60_000,
}) {
  let cachedProbe;
  let cachedAt = 0;
  let pendingProbe;

  async function readTwitchHealth() {
    let status;
    try { status = getTwitchStatus(); } catch { status = 'unknown'; }
    let chat;
    let rewards;
    try { chat = getTwitchChatStatus(); } catch { chat = 'unknown'; }
    try { rewards = getTwitchRewardStatus(); } catch { rewards = 'unknown'; }
    let apiHealth = { status: ['not_configured', 'connecting', 'retrying', 'reconnect_required', 'stopped'].includes(status) ? status : 'unknown', pingMs: null };
    if (['connected', 'ineligible', 'degraded', 'reconciling'].includes(status) && typeof probeTwitchApi === 'function') {
      if (cachedProbe && now() - cachedAt < probeCacheMs) apiHealth = cachedProbe;
      else if (pendingProbe) apiHealth = await pendingProbe;
      else {
        pendingProbe = (async () => {
          const startedAt = now();
          try {
            if (await probeTwitchApi() !== true) throw new Error('Twitch API probe did not complete');
            cachedProbe = { status: 'connected', pingMs: Math.max(0, Math.round(now() - startedAt)) };
          } catch {
            cachedProbe = { status: 'degraded', pingMs: null };
          }
          cachedAt = now();
          pendingProbe = null;
          return cachedProbe;
        })();
        apiHealth = await pendingProbe;
      }
    }
    const chatStates = ['not_configured', 'connecting', 'connected', 'degraded', 'retrying', 'reconnect_required', 'stopped', 'unknown'];
    const rewardStates = ['not_configured', 'available', 'unsupported', 'unknown', 'reconnect_required', 'stopped'];
    return {
      ...apiHealth,
      integration: status,
      chat: chatStates.includes(chat) ? chat : 'unknown',
      rewards: rewardStates.includes(rewards) ? rewards : 'unknown',
    };
  }

  app.get('/health', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      const twitchHealth = await readTwitchHealth();
      const validStates = ['not_configured', 'connected', 'connecting', 'reconciling', 'degraded', 'retrying', 'reconnect_required', 'ineligible', 'stopped', 'unknown'];
      const twitchApi = validStates.includes(twitchHealth.status) ? twitchHealth.status : 'unknown';
      return {
        status: 'ok',
        product_version: productVersion,
        dependencies: {
          database: 'connected', twitch_api: twitchApi, twitch_integration: twitchHealth.integration,
          twitch_api_ping_ms: twitchHealth.pingMs,
          twitch_chat: twitchHealth.chat, twitch_rewards: twitchHealth.rewards,
        },
      };
    } catch {
      return reply.code(503).send({
        status: 'unavailable',
        product_version: productVersion,
        dependencies: { database: 'unavailable', twitch_api: 'not_configured', twitch_integration: 'unknown', twitch_api_ping_ms: null, twitch_chat: 'not_configured', twitch_rewards: 'not_configured' },
      });
    }
  });

  return {
    getTwitchHealth() {
      if (!cachedProbe) return null;
      if (now() - cachedAt >= probeCacheMs) return null;
      return { ...cachedProbe };
    },
  };
}

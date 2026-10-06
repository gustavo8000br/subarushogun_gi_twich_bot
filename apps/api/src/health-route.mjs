/**
 * Register the local runtime health projection.
 * @param {import('fastify').FastifyInstance} app
 * @param {{ pool: { query: (query: string) => Promise<unknown> }, productVersion: string, getTwitchStatus?: () => string, probeTwitchApi?: () => Promise<true>, now?: () => number, probeCacheMs?: number }} dependencies
 */
export function registerHealthRoute(app, {
  pool, productVersion, getTwitchStatus = () => 'not_configured', probeTwitchApi,
  now = Date.now, probeCacheMs = 60_000,
}) {
  let cachedProbe;
  let cachedAt = 0;
  let pendingProbe;

  async function readTwitchHealth() {
    let status;
    try { status = getTwitchStatus(); } catch { status = 'unknown'; }
    if (!['connected', 'ineligible'].includes(status) || typeof probeTwitchApi !== 'function') return { status, pingMs: null };
    if (cachedProbe && now() - cachedAt < probeCacheMs) return cachedProbe;
    if (pendingProbe) return pendingProbe;
    pendingProbe = (async () => {
      const startedAt = now();
      try {
        if (await probeTwitchApi() !== true) throw new Error('Twitch API probe did not complete');
        cachedProbe = { status, pingMs: Math.max(0, Math.round(now() - startedAt)) };
      } catch {
        cachedProbe = { status: 'degraded', pingMs: null };
      }
      cachedAt = now();
      pendingProbe = null;
      return cachedProbe;
    })();
    return pendingProbe;
  }

  app.get('/health', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      const twitchHealth = await readTwitchHealth();
      const validStates = ['not_configured', 'connected', 'connecting', 'reconciling', 'degraded', 'reconnect_required', 'ineligible', 'stopped', 'unknown'];
      const twitchApi = validStates.includes(twitchHealth.status) ? twitchHealth.status : 'unknown';
      return {
        status: 'ok',
        product_version: productVersion,
        dependencies: { database: 'connected', twitch_api: twitchApi, twitch_api_ping_ms: twitchHealth.pingMs },
      };
    } catch {
      return reply.code(503).send({
        status: 'unavailable',
        product_version: productVersion,
        dependencies: { database: 'unavailable', twitch_api: 'not_configured', twitch_api_ping_ms: null },
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

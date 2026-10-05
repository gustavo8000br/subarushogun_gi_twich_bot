/**
 * Register the local runtime health projection.
 * @param {import('fastify').FastifyInstance} app
 * @param {{ pool: { query: (query: string) => Promise<unknown> }, productVersion: string, getTwitchStatus?: () => string }} dependencies
 */
export function registerHealthRoute(app, { pool, productVersion, getTwitchStatus = () => 'not_configured' }) {
  app.get('/health', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      let twitchApi = 'unknown';
      try {
        const state = getTwitchStatus();
        if (['not_configured', 'connected', 'connecting', 'reconciling', 'degraded', 'reconnect_required', 'ineligible', 'stopped'].includes(state)) {
          twitchApi = state;
        }
      } catch {
        twitchApi = 'unknown';
      }
      return {
        status: 'ok',
        product_version: productVersion,
        dependencies: { database: 'connected', twitch_api: twitchApi },
      };
    } catch {
      return reply.code(503).send({
        status: 'unavailable',
        product_version: productVersion,
        dependencies: { database: 'unavailable', twitch_api: 'not_configured' },
      });
    }
  });
}

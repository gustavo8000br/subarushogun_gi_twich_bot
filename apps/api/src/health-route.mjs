/**
 * Register the local runtime health projection.
 * @param {import('fastify').FastifyInstance} app
 * @param {{ pool: { query: (query: string) => Promise<unknown> }, productVersion: string }} dependencies
 */
export function registerHealthRoute(app, { pool, productVersion }) {
  app.get('/health', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return {
        status: 'ok',
        product_version: productVersion,
        dependencies: { database: 'connected', twitch_api: 'not_configured' },
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

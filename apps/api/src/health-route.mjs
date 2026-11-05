import { createSharedApiProbe } from './twitch/shared-api-probe.mjs';

/**
 * Register the local runtime health projection.
 * @param {import('fastify').FastifyInstance} app
 * @param {{ pool: { query: (query: string) => Promise<unknown> }, productVersion: string, getTwitchStatus?: () => string, getTwitchChatStatus?: () => string, getTwitchRewardStatus?: () => string, getLastReconciliationAt?: () => string | null, sharedProbe?: { read: () => Promise<{state: string, ms?: number}> }, probeTwitchApi?: () => Promise<true>, now?: () => number, probeCacheMs?: number }} dependencies
 */
export function registerHealthRoute(app, {
  pool, productVersion, getTwitchStatus = () => 'not_configured',
  getTwitchChatStatus = () => 'not_configured', getTwitchRewardStatus = () => 'not_configured', probeTwitchApi,
  getLastReconciliationAt = () => null,
  sharedProbe: injectedProbe, now, probeCacheMs,
}) {
  // D-8: the server builds ONE shared probe for `/health` and the chat; a standalone route (tests) builds its own from the legacy inputs.
  const sharedProbe = injectedProbe ?? (typeof probeTwitchApi === 'function'
    ? createSharedApiProbe({ probe: probeTwitchApi, getIntegrationStatus: getTwitchStatus, ...(now ? { nowMs: now } : {}), ...(probeCacheMs === undefined ? {} : { ttlMs: probeCacheMs }) })
    : null);

  function readLastReconciliationAt() {
    try {
      const value = getLastReconciliationAt();
      return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
    } catch { return null; }
  }

  async function readTwitchHealth() {
    let status;
    try { status = getTwitchStatus(); } catch { status = 'unknown'; }
    let chat;
    let rewards;
    try { chat = getTwitchChatStatus(); } catch { chat = 'unknown'; }
    try { rewards = getTwitchRewardStatus(); } catch { rewards = 'unknown'; }
    let apiHealth = { status: ['not_configured', 'connecting', 'retrying', 'reconnect_required', 'stopped'].includes(status) ? status : 'unknown', pingMs: null };
    if (sharedProbe) {
      const measured = await sharedProbe.read();
      if (measured.state === 'ok') apiHealth = { status: 'connected', pingMs: measured.ms };
      else if (measured.state === 'failed') apiHealth = { status: 'degraded', pingMs: null };
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
        last_reconciliation_at: readLastReconciliationAt(),
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
        last_reconciliation_at: readLastReconciliationAt(),
        dependencies: { database: 'unavailable', twitch_api: 'not_configured', twitch_integration: 'unknown', twitch_api_ping_ms: null, twitch_chat: 'not_configured', twitch_rewards: 'not_configured' },
      });
    }
  });
}

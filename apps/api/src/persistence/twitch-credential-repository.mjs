/** @param {Record<string, any>} prisma */
export function createTwitchCredentialRepository(prisma) {
  function locked() {
    return Object.assign(new Error('Twitch app or channel is bound to existing local data'), { code: 'CHANNEL_BINDING_LOCKED' });
  }

  async function hasProductData(tx) {
    const [queues, redemptions] = await Promise.all([
      tx.queue.count(),
      tx.redemption.count(),
    ]);
    return queues > 0 || redemptions > 0;
  }

  function publicProjection(record) {
    if (!record) return { clientId: null, secretConfigured: false, connected: false, broadcasterId: null, scopes: [] };
    return {
      clientId: record.clientId,
      secretConfigured: Boolean(record.clientSecret),
      connected: record.authStatus === 'connected' && Boolean(record.broadcasterId),
      broadcasterId: record.broadcasterId,
      scopes: record.scopes,
    };
  }

  return {
    async saveValidatedApplication({ clientId, clientSecret }) {
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended('twitch-credentials', 0))) AS credential_lock`;
        const existing = await tx.oAuthCredential.findFirst();
        if (existing && existing.clientId !== clientId) {
          if (await hasProductData(tx)) throw locked();
          await tx.oAuthCredential.delete({ where: { id: existing.id } });
        }
        const saved = existing?.clientId === clientId
          ? await tx.oAuthCredential.update({ where: { id: existing.id }, data: { clientSecret } })
          : await tx.oAuthCredential.create({ data: { clientId, clientSecret } });
        return { clientId: saved.clientId, secretConfigured: true, broadcasterId: saved.broadcasterId };
      });
    },

    async bindChannel({ clientId, broadcasterId }) {
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended('twitch-credentials', 0))) AS credential_lock`;
        const record = await tx.oAuthCredential.findUnique({ where: { clientId } });
        if (!record) throw Object.assign(new Error('Twitch application is not configured'), { code: 'TWITCH_APP_NOT_CONFIGURED' });
        if (record.broadcasterId && record.broadcasterId !== broadcasterId && await hasProductData(tx)) throw locked();
        return tx.oAuthCredential.update({ where: { id: record.id }, data: { broadcasterId } });
      });
    },

    async assertCanBind({ clientId, broadcasterId }) {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended('twitch-credentials', 0))) AS credential_lock`;
        const record = await tx.oAuthCredential.findUnique({ where: { clientId } });
        if (!record) throw Object.assign(new Error('Twitch application is not configured'), { code: 'TWITCH_APP_NOT_CONFIGURED' });
        if (record.broadcasterId && record.broadcasterId !== broadcasterId && await hasProductData(tx)) throw locked();
      });
    },

    async storeTokens({ clientId, broadcasterId, accessToken, refreshToken, scopes, expiresIn, obtainmentTimestamp = Date.now() }) {
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended('twitch-credentials', 0))) AS credential_lock`;
        const record = await tx.oAuthCredential.findUnique({ where: { clientId } });
        if (!record) throw Object.assign(new Error('Twitch application is not configured'), { code: 'TWITCH_APP_NOT_CONFIGURED' });
        if (record.broadcasterId && record.broadcasterId !== broadcasterId && await hasProductData(tx)) throw locked();
        const tokenExpiresAt = Number.isFinite(expiresIn)
          ? new Date(obtainmentTimestamp + expiresIn * 1000)
          : null;
        return tx.oAuthCredential.update({
          where: { id: record.id },
          data: { broadcasterId, accessToken, refreshToken, scopes, tokenExpiresAt, authStatus: 'connected' },
        });
      });
    },

    async getPublicStatus() {
      return publicProjection(await prisma.oAuthCredential.findFirst());
    },

    async getAuthRecord() {
      return prisma.oAuthCredential.findFirst();
    },

    async markReconnectRequired(clientId) {
      return prisma.oAuthCredential.updateMany({ where: { clientId }, data: { authStatus: 'reconnect_required' } });
    },
  };
}

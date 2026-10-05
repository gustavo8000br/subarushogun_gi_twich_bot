const activeStatuses = ['waiting', 'called', 'in_progress'];

function pendingKey({ actorId, channelId, queueId }) {
  return JSON.stringify([actorId, channelId, queueId]);
}

function captureSnapshot(entries) {
  return entries.map(({ id, version, status, source, redemptionId }) => ({ id, version, status, source, redemptionId }));
}

/** @param {{repository: any, domainService?: any, clock?: () => Date, ttlMs?: number}} dependencies */
export function createClearConfirmationService({ repository, domainService = repository, clock = () => new Date(), ttlMs = 15_000 }) {
  const pending = new Map();

  async function preview(input, knownEntries = null) {
    const entries = knownEntries ?? await repository.listEntriesByStatus(input.queueId, activeStatuses);
    const snapshot = captureSnapshot(entries);
    if (!snapshot.length) {
      pending.delete(pendingKey(input));
      return { status: 'empty', count: 0, refundsRequested: 0 };
    }
    pending.set(pendingKey(input), { snapshot, expiresAt: clock().getTime() + ttlMs });
    return {
      status: 'confirmation_required', count: snapshot.length,
      refundsRequested: snapshot.filter((entry) => entry.source === 'redemption').length,
      expiresInSeconds: Math.ceil(ttlMs / 1000),
    };
  }

  return {
    request(input) { return preview(input); },
    async confirm(input) {
      const key = pendingKey(input);
      const confirmation = pending.get(key);
      pending.delete(key);
      const now = clock().getTime();
      if (!confirmation || confirmation.expiresAt <= now) return preview(input);
      const current = captureSnapshot(await repository.listEntriesByStatus(input.queueId, activeStatuses));
      if (JSON.stringify(current) !== JSON.stringify(confirmation.snapshot)) return preview(input, current);
      const result = await domainService.clearActiveEntries({ queueId: input.queueId, snapshot: current, actorId: input.actorId, origin: input.origin ?? 'chat' });
      if (result?.status === 'stale') return preview(input);
      return { status: 'cleared', count: result.count, refundsRequested: result.refundsRequested };
    },
  };
}

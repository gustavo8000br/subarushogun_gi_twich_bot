const activeStatuses = new Set(['waiting', 'called', 'in_progress']);

function normalizeStatus(status) {
  const value = String(status ?? 'unknown').toUpperCase();
  return ['UNFULFILLED', 'FULFILLED', 'CANCELED'].includes(value) ? value : 'UNKNOWN';
}

/** @param {{repository: any, domainService: any, broadcasterId: string}} input */
export function createTwitchRedemptionProcessor({ repository, domainService, broadcasterId }) {
  return {
    async onRedemptionAdd(event) {
      if (event.broadcasterId !== broadcasterId) return { status: 'ignored_other_channel' };
      const normalized = { ...event, status: normalizeStatus(event.status) };
      if (normalized.status === 'FULFILLED' || normalized.status === 'CANCELED') {
        return repository.recordTerminalRedemption(normalized);
      }
      if (normalized.status !== 'UNFULFILLED') return { status: 'unknown_remote_state', redemptionId: event.id };
      return repository.importRedemption(normalized);
    },

    async onRedemptionUpdate(event) {
      if (event.broadcasterId !== broadcasterId) return { status: 'ignored_other_channel' };
      const status = normalizeStatus(event.status);
      if (status === 'UNFULFILLED') return { status: 'ignored_unfulfilled_update', redemptionId: event.id };
      if (status !== 'FULFILLED' && status !== 'CANCELED') return { status: 'unknown_remote_state', redemptionId: event.id };
      const entry = await repository.findEntryByRedemption(event.id);
      if (entry && activeStatuses.has(entry.status)) {
        return domainService.transitionEntry({
          entryId: entry.id,
          to: status === 'FULFILLED' ? 'completed' : 'removed',
          origin: 'external',
          reason: status === 'FULFILLED' ? 'external_fulfillment' : 'external_cancellation',
          remoteStatus: status,
        });
      }
      return repository.recordExternalRedemptionState({ ...event, status });
    },
  };
}

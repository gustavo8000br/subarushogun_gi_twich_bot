/** @param {{repository: any, twitch: any, processor: any, broadcasterId?: string, clock?: () => Date}} dependencies */
export function createTwitchReconciler({ repository, twitch, processor, broadcasterId, clock = () => new Date() }) {
  return {
    async run() {
      const queues = await repository.listManagedQueues();
      const result = { status: 'complete', startedAt: clock(), queues: queues.length, imported: 0, externalTransitions: 0, issues: [] };
      for (const queue of queues) {
        if (!queue.rewardId || queue.lifecycleStatus === 'deleted') continue;
        let reward;
        try {
          reward = await twitch.getReward(queue.rewardId);
        } catch {
          result.status = 'partial';
          result.issues.push({ queueId: queue.id, code: 'reward_verification_failed' });
          await repository.markQueueRemoteDivergence(queue.id, 'reward_verification_failed');
          continue;
        }
        if (!reward) {
          result.status = 'partial';
          result.issues.push({ queueId: queue.id, code: 'reward_missing' });
          await repository.markQueueRemoteDivergence(queue.id, 'reward_missing');
          continue;
        }
        const shouldBePaused = queue.queueMode === 'manual_only' || (queue.modeTransitionStatus && queue.modeTransitionStatus !== 'none')
          || !queue.isOpen || queue.isArchived || queue.lifecycleStatus !== 'active';
        if (reward.id !== queue.rewardId || reward.autoFulfill !== false || reward.shouldRedemptionsSkipRequestQueue !== false
            || reward.userInputRequired !== (queue.uidMode === 'visible')
            || reward.isEnabled !== true || reward.isPaused !== shouldBePaused) {
          result.status = 'partial';
          result.issues.push({ queueId: queue.id, code: 'reward_configuration_mismatch' });
          await repository.markQueueRemoteDivergence(queue.id, 'reward_configuration_mismatch');
          continue;
        }
        if (queue.remoteSyncStatus === 'diverged' && queue.queueMode !== 'manual_only'
            && typeof repository.confirmQueueRemoteState === 'function') {
          const confirmed = await repository.confirmQueueRemoteState(queue.id, { expectedVersion: queue.version });
          if (!confirmed) {
            result.status = 'partial';
            result.issues.push({ queueId: queue.id, code: 'queue_state_changed_during_reconciliation' });
            continue;
          }
        }
        if (queue.modeTransitionStatus && queue.modeTransitionStatus !== 'none' && reward.isPaused === true
            && typeof repository.confirmManualModeFromReconciliation === 'function') {
          await repository.confirmManualModeFromReconciliation(queue.id);
        }

        let redemptions;
        try {
          redemptions = await twitch.listUnfulfilledRedemptions(queue.rewardId);
        } catch {
          result.status = 'partial';
          result.issues.push({ queueId: queue.id, code: 'reconciliation_failed' });
          await repository.markQueueRemoteDivergence(queue.id, 'reconciliation_failed');
          continue;
        }
        const seen = new Set();
        const ordered = [...redemptions].sort((left, right) => {
          const timeDelta = new Date(left.redeemedAt).getTime() - new Date(right.redeemedAt).getTime();
          return timeDelta || String(left.id).localeCompare(String(right.id));
        });
        for (const redemption of ordered) {
          seen.add(redemption.id);
          try {
            const imported = await processor.onRedemptionAdd({
              ...redemption,
              broadcasterId: redemption.broadcasterId ?? broadcasterId,
              rewardId: queue.rewardId,
              status: redemption.status,
            });
            if (imported?.status === 'added') result.imported += 1;
          } catch {
            result.status = 'partial';
            result.issues.push({ queueId: queue.id, redemptionId: redemption.id, code: 'redemption_import_failed' });
          }
        }

        let activeEntries;
        try {
          activeEntries = await repository.listActiveRedemptionEntries(queue.id);
        } catch {
          result.status = 'partial';
          result.issues.push({ queueId: queue.id, code: 'active_entries_query_failed' });
          continue;
        }
        for (const entry of activeEntries) {
          if (!entry.redemptionId || seen.has(entry.redemptionId)) continue;
          try {
            const remoteStatus = await twitch.getRedemptionStatus(entry.redemptionId, queue.rewardId);
            if (remoteStatus === 'FULFILLED' || remoteStatus === 'CANCELED') {
              await processor.onRedemptionUpdate({
                id: entry.redemptionId,
                broadcasterId,
                rewardId: queue.rewardId,
                userId: entry.twitchUserId,
                userLogin: entry.userLogin,
                displayName: entry.displayName,
                status: remoteStatus,
              });
              result.externalTransitions += 1;
            }
          } catch (error) {
            if (error.status === 404 || error.code === 'REDEMPTION_NOT_FOUND') {
              await repository.markRedemptionUnknown(entry.redemptionId, 'remote_history_unavailable');
            } else {
              result.status = 'partial';
              result.issues.push({ queueId: queue.id, redemptionId: entry.redemptionId, code: 'redemption_verification_failed' });
            }
          }
        }
      }
      result.finishedAt = clock();
      return result;
    },
  };
}

import { twitchHttpError } from './http-error.mjs';

/** Every issue code a reconciliation run can report; the structured logger accepts only these. */
export const RECONCILIATION_ISSUE_CODES = Object.freeze([
  'reward_verification_failed', 'reward_confirmed_absent', 'queue_state_changed_during_reward_absence_check',
  'reward_configuration_mismatch', 'queue_state_changed_during_reconciliation', 'reconciliation_failed',
  'redemption_import_failed', 'unresolved_redemptions_query_failed', 'redemption_verification_failed',
  'active_entries_query_failed', 'tombstone_cursor_checkpoint_lost',
]);

/** Issue entry with the Twitch HTTP status when the failure carried one (no message, body or headers). */
function remoteIssue(issue, error) {
  const { httpStatus } = twitchHttpError(error);
  return httpStatus === null ? issue : { ...issue, httpStatus };
}

/** @param {{repository: any, twitch: any, processor: any, broadcasterId?: string, clock?: () => Date}} dependencies */
export function createTwitchReconciler({ repository, twitch, processor, broadcasterId, clock = () => new Date() }) {
  return {
    async run() {
      const queues = await repository.listManagedQueues();
      const tombstonePage = typeof repository.claimConvertedTombstoneReconciliationPage === 'function'
        ? await repository.claimConvertedTombstoneReconciliationPage({ limit: 10 })
        : { status: 'unavailable', queues: [] };
      const tombstones = tombstonePage.status === 'acquired' ? tombstonePage.queues : [];
      const tombstoneIds = new Set(tombstones.map(({ id }) => id));
      const result = { status: 'complete', startedAt: clock(), queues: queues.length + tombstones.length, tombstonesScanned: 0, imported: 0, externalTransitions: 0, issues: [] };
      let tombstoneLeaseSettled = false;
      try {
        for (const queue of [...queues, ...tombstones]) {
          if (tombstoneIds.has(queue.id)) result.tombstonesScanned += 1;
          const historicalManualQueue = queue.queueMode === 'manual_only'
            && ['deleting', 'deleted'].includes(queue.lifecycleStatus);
          const historicalTombstone = queue.lifecycleStatus === 'deleted';
          if (!queue.rewardId) continue;
          let reward;
          let rewardVerificationFailed = false;
          try {
            reward = await twitch.getReward(queue.rewardId);
          } catch (error) {
            rewardVerificationFailed = true;
            result.status = 'partial';
            result.issues.push(remoteIssue({ queueId: queue.id, code: 'reward_verification_failed' }, error));
            if (!historicalTombstone) await repository.markQueueRemoteUnknown?.(queue.id, 'reward_verification_failed', queue.version);
          }
          if (reward === undefined && !rewardVerificationFailed) {
            rewardVerificationFailed = true;
            result.status = 'partial';
            result.issues.push({ queueId: queue.id, code: 'reward_verification_failed' });
            if (!historicalTombstone) await repository.markQueueRemoteUnknown?.(queue.id, 'reward_verification_failed', queue.version);
          }
          if (!reward) {
            if (!rewardVerificationFailed) {
              const retired = await repository.retireQueueForConfirmedRewardAbsence?.({ queueId: queue.id, expectedVersion: queue.version, rewardId: queue.rewardId });
              if (retired) result.issues.push({ queueId: queue.id, code: 'reward_confirmed_absent' });
              else {
                result.status = 'partial';
                result.issues.push({ queueId: queue.id, code: 'queue_state_changed_during_reward_absence_check' });
              }
            }
            if (!historicalTombstone) continue;
          }
          let rewardMatches = false;
          if (reward) {
            const shouldBePaused = queue.queueMode === 'manual_only' || (queue.modeTransitionStatus && queue.modeTransitionStatus !== 'none')
              || !queue.isOpen || queue.isArchived || queue.lifecycleStatus !== 'active';
            rewardMatches = historicalTombstone ? reward.id === queue.rewardId : reward.id === queue.rewardId && reward.autoFulfill === false
              && reward.shouldRedemptionsSkipRequestQueue === false
              && reward.userInputRequired === (queue.uidMode === 'visible')
              && reward.isEnabled === true && reward.isPaused === shouldBePaused;
            if (!rewardMatches && !historicalTombstone) {
              result.status = 'partial';
              result.issues.push({ queueId: queue.id, code: 'reward_configuration_mismatch' });
              if (queue.remoteSyncStatus !== 'diverged') await repository.markQueueRemoteDivergence(queue.id, 'reward_configuration_mismatch', queue.version);
            }
          }
          if (rewardMatches && !historicalTombstone && queue.remoteSyncStatus === 'diverged') {
            const confirmConvertedState = historicalManualQueue && repository.confirmConvertedQueueRemoteState;
            const confirmRemoteState = confirmConvertedState
              ? repository.confirmConvertedQueueRemoteState(queue.id, { expectedVersion: queue.version, reward })
              : queue.queueMode !== 'manual_only' && repository.confirmQueueRemoteState
                ? repository.confirmQueueRemoteState(queue.id, { expectedVersion: queue.version })
                : null;
            if (confirmRemoteState && !(await confirmRemoteState)) {
              result.status = 'partial';
              result.issues.push({ queueId: queue.id, code: 'queue_state_changed_during_reconciliation' });
              if (!historicalManualQueue) continue;
            }
          }
          if (rewardMatches && !historicalTombstone && queue.modeTransitionStatus && queue.modeTransitionStatus !== 'none' && reward.isPaused === true
              && typeof repository.confirmManualModeFromReconciliation === 'function') {
            await repository.confirmManualModeFromReconciliation(queue.id);
          }

          if (!rewardMatches && !historicalManualQueue && !historicalTombstone) continue;

          let redemptions = [];
          if (reward) {
            try {
              redemptions = await twitch.listUnfulfilledRedemptions(queue.rewardId);
            } catch (error) {
              result.status = 'partial';
              result.issues.push(remoteIssue({ queueId: queue.id, code: 'reconciliation_failed' }, error));
              if (!historicalTombstone) await repository.markQueueRemoteUnknown?.(queue.id, 'reconciliation_failed', queue.version);
              continue;
            }
          }
          const seen = new Set();
          const statusChecked = new Set();
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

          if (historicalTombstone && repository.listUnresolvedRedemptions) {
            let unresolved;
            try { unresolved = await repository.listUnresolvedRedemptions(queue.id); }
            catch {
              result.status = 'partial';
              result.issues.push({ queueId: queue.id, code: 'unresolved_redemptions_query_failed' });
              continue;
            }
            for (const redemption of unresolved) {
              if (seen.has(redemption.redemptionId) || statusChecked.has(redemption.redemptionId)) continue;
              statusChecked.add(redemption.redemptionId);
              try {
                const remoteStatus = await twitch.getRedemptionStatus(redemption.redemptionId, queue.rewardId);
                if (remoteStatus === 'FULFILLED' || remoteStatus === 'CANCELED') {
                  await processor.onRedemptionUpdate({
                    id: redemption.redemptionId, broadcasterId: redemption.broadcasterId,
                    rewardId: queue.rewardId, userId: redemption.userId,
                    userLogin: redemption.entry?.userLogin, displayName: redemption.entry?.displayName,
                    status: remoteStatus,
                  });
                  result.externalTransitions += 1;
                }
              } catch (error) {
                if (twitchHttpError(error).httpStatus === 404 || error?.code === 'REDEMPTION_NOT_FOUND') await repository.markRedemptionUnknown(redemption.redemptionId, 'remote_history_unavailable');
                else {
                  result.status = 'partial';
                  result.issues.push(remoteIssue({ queueId: queue.id, redemptionId: redemption.redemptionId, code: 'redemption_verification_failed' }, error));
                }
              }
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
            if (!entry.redemptionId || seen.has(entry.redemptionId) || statusChecked.has(entry.redemptionId)) continue;
            statusChecked.add(entry.redemptionId);
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
              if (twitchHttpError(error).httpStatus === 404 || error?.code === 'REDEMPTION_NOT_FOUND') {
                await repository.markRedemptionUnknown(entry.redemptionId, 'remote_history_unavailable');
              } else {
                result.status = 'partial';
                result.issues.push(remoteIssue({ queueId: queue.id, redemptionId: entry.redemptionId, code: 'redemption_verification_failed' }, error));
              }
            }
          }
        }
        if (tombstonePage.status === 'acquired') {
          const checkpointed = await repository.completeConvertedTombstoneReconciliationPage({
            leaseId: tombstonePage.leaseId,
            lastQueueId: tombstones.at(-1)?.id ?? null,
            complete: true,
          });
          if (!checkpointed) {
            result.status = 'partial';
            result.issues.push({ code: 'tombstone_cursor_checkpoint_lost' });
          }
          tombstoneLeaseSettled = true;
        }
        result.finishedAt = clock();
        return result;
      } finally {
        if (tombstonePage.status === 'acquired' && !tombstoneLeaseSettled) {
          try {
            await repository.completeConvertedTombstoneReconciliationPage({
              leaseId: tombstonePage.leaseId,
              complete: false,
            });
          } catch {
            // Preserve the original reconciliation failure; the lease will expire if cleanup also fails.
          }
        }
      }
    },
  };
}

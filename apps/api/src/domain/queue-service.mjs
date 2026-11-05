import { decideEntryTransition } from './entry-transitions.mjs';
import { matchesManagedRewardState } from '../twitch/reward-state.mjs';
import { twitchHttpError } from '../twitch/http-error.mjs';

/** @typedef {{entryId: string, to: string, origin?: string, actorId?: string|null, reason: string, deadlineCutoff?: Date}} TransitionInput */
/** @typedef {{status: string, source: string}} EntrySnapshot */
/** @typedef {{refundIfRemovedWhileCalled?: boolean, refundOnNoShow?: boolean, refundIfViewerLeavesCalled?: boolean}} QueuePolicySnapshot */
/** @typedef {{repository: {applyEntryTransition: (args: {input: TransitionInput, decideTransition: (context: {entry: EntrySnapshot, queue: QueuePolicySnapshot, input: TransitionInput}) => object}) => Promise<object>, callNext?: (input: object) => Promise<Array<object>>, callSpecificEntry?: (input: object) => Promise<object>, acknowledgeCallPresence?: (input: {queueId: string, twitchUserId: string, actorId?: string|null}) => Promise<object>, clearActiveEntries?: (input: object) => Promise<object>, requestQueueDeletion?: (input: object) => Promise<object>, beginQueueDeletionCancellation?: (input: object) => Promise<Record<string, any>>, confirmQueueDeletionCancellation?: (input: object) => Promise<object>, failQueueDeletionCancellation?: (input: object) => Promise<object>}, getTwitch?: () => {getReward?: (rewardId: string) => Promise<Record<string, any>|null>}|null}} Dependencies */

function decideTransition({ entry, queue, input }) {
  return decideEntryTransition({
    from: entry.status,
    to: input.to,
    source: entry.source,
    origin: input.origin ?? 'system',
    reason: input.reason,
    policy: {
      refundIfRemovedWhileCalled: queue.refundIfRemovedWhileCalled,
      refundOnNoShow: queue.refundOnNoShow,
      refundIfViewerLeavesWhileCalled: queue.refundIfViewerLeavesCalled,
    },
  });
}

/**
 * Coordinates entry lifecycle decisions with the repository's short transaction.
 * The repository supplies the locked entry and queue policy snapshot before any write.
 * @param {Dependencies} dependencies
 */
export function createQueueDomainService({ repository, getTwitch = () => null }) {
  return {
    /** @param {TransitionInput} input */
    transitionEntry(input) {
      return repository.applyEntryTransition({
        input,
        decideTransition,
      });
    },
    /** @param {{queueId: string, count?: number, actorId?: string|null, calledAt?: Date}} input */
    callNext(input) {
      if (!repository.callNext) throw new Error('Queue calling is unavailable');
      return repository.callNext({ ...input, decideTransition });
    },
    /** @param {{queueId: string, entryId: string, actorId?: string|null, calledAt?: Date}} input */
    callSpecificEntry(input) {
      if (!repository.callSpecificEntry) throw new Error('Queue calling is unavailable');
      return repository.callSpecificEntry({ ...input, decideTransition });
    },
    acknowledgeCallPresence(input) {
      if (!repository.acknowledgeCallPresence) throw new Error('Call presence acknowledgment is unavailable');
      return repository.acknowledgeCallPresence(input);
    },
    /** @param {{queueId: string, snapshot: Array<object>, actorId?: string|null, origin?: string}} input */
    clearActiveEntries(input) {
      if (!repository.clearActiveEntries) throw new Error('Queue clearing is unavailable');
      return repository.clearActiveEntries({ ...input, decideTransition });
    },
    /** @param {{queueId: string, actorId?: string|null, origin?: string}} input */
    deleteQueue(input) {
      if (!repository.requestQueueDeletion) throw new Error('Queue deletion is unavailable');
      return repository.requestQueueDeletion({ ...input, decideTransition });
    },
    async cancelQueueDeletion({ queueId, actorId = null, origin = 'panel' }) {
      if (!repository.beginQueueDeletionCancellation || !repository.confirmQueueDeletionCancellation || !repository.failQueueDeletionCancellation) {
        throw new Error('Queue deletion cancellation is unavailable');
      }
      // OPS-22 FT-36 (#100): begin (refusals are thrown with their `code`), one read-only Twitch read, then confirm or fail.
      const reservation = await repository.beginQueueDeletionCancellation({ queueId, actorId, origin });
      if (reservation.status !== 'verification_required') return reservation;
      const fail = async (errorCode, conclusive) => {
        const result = await repository.failQueueDeletionCancellation({ queueId, operationId: reservation.operationId, errorCode, conclusive, actorId, origin });
        // Orion decision (2026-10-30): after a possibly-sent DELETE only a positive read may cancel; anything else is a
        // refusal, raised AFTER the task was restored (or set unknown) and the read was audited.
        if (reservation.requestMayHaveReachedTwitch === true) {
          throw Object.assign(new Error('The reward delete may have reached Twitch'), { code: 'QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED' });
        }
        return result;
      };
      let reward;
      try {
        const twitch = getTwitch();
        if (!twitch?.getReward) throw new Error('Twitch reward verification is unavailable');
        reward = await twitch.getReward(reservation.rewardId);
      } catch (error) {
        const { httpStatus } = twitchHttpError(error);
        if (httpStatus === 404) return fail('queue_delete_reward_absent', true);
        return fail(httpStatus === 401 ? 'authorization_required' : 'queue_deletion_cancel_verification_unavailable', false);
      }
      if (!reward) return fail('queue_delete_reward_absent', true);
      if (!matchesManagedRewardState(reward, reservation.queue)) return fail('queue_delete_reward_diverged', true);
      if (reward.isPaused !== true) return fail('queue_delete_cancel_reward_not_paused', true);
      try {
        return await repository.confirmQueueDeletionCancellation({
          queueId, operationId: reservation.operationId, expectedVersion: reservation.expectedVersion, reward, actorId, origin,
        });
      } catch (error) {
        await repository.failQueueDeletionCancellation({
          queueId, operationId: reservation.operationId, errorCode: 'queue_deletion_cancel_verification_stale', conclusive: false, actorId, origin,
        });
        throw error;
      }
    },
  };
}

/** @param {{getService: () => ReturnType<typeof createQueueDomainService>}} input */
export function createQueueDomainServiceProxy({ getService }) {
  return {
    transitionEntry: (input) => getService().transitionEntry(input),
    callNext: (input) => getService().callNext(input),
    callSpecificEntry: (input) => getService().callSpecificEntry(input),
    acknowledgeCallPresence: (input) => getService().acknowledgeCallPresence(input),
    clearActiveEntries: (input) => getService().clearActiveEntries(input),
    deleteQueue: (input) => getService().deleteQueue(input),
    cancelQueueDeletion: (input) => getService().cancelQueueDeletion(input),
  };
}

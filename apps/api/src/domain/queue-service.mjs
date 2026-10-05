import { decideEntryTransition } from './entry-transitions.mjs';

/** @typedef {{entryId: string, to: string, origin?: string, actorId?: string|null, reason: string}} TransitionInput */
/** @typedef {{status: string, source: string}} EntrySnapshot */
/** @typedef {{refundIfRemovedWhileCalled?: boolean, refundOnNoShow?: boolean, refundIfViewerLeavesCalled?: boolean}} QueuePolicySnapshot */
/** @typedef {{repository: {applyEntryTransition: (args: {input: TransitionInput, decideTransition: (context: {entry: EntrySnapshot, queue: QueuePolicySnapshot, input: TransitionInput}) => object}) => Promise<object>, callNext?: (input: object) => Promise<Array<object>>, callSpecificEntry?: (input: object) => Promise<object>, clearActiveEntries?: (input: object) => Promise<object>}}} Dependencies */

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
export function createQueueDomainService({ repository }) {
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
    /** @param {{queueId: string, snapshot: Array<object>, actorId?: string|null, origin?: string}} input */
    clearActiveEntries(input) {
      if (!repository.clearActiveEntries) throw new Error('Queue clearing is unavailable');
      return repository.clearActiveEntries({ ...input, decideTransition });
    },
  };
}

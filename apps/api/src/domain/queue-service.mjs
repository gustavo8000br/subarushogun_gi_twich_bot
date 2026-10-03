import { decideEntryTransition } from './entry-transitions.mjs';

/** @typedef {{entryId: string, to: string, origin?: string, actorId?: string|null, reason: string}} TransitionInput */
/** @typedef {{status: string, source: string}} EntrySnapshot */
/** @typedef {{refundIfRemovedWhileCalled?: boolean, refundOnNoShow?: boolean, refundIfViewerLeavesCalled?: boolean}} QueuePolicySnapshot */
/** @typedef {{repository: {applyEntryTransition: (args: {input: TransitionInput, decideTransition: (context: {entry: EntrySnapshot, queue: QueuePolicySnapshot, input: TransitionInput}) => object}) => Promise<object>}}} Dependencies */

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
        decideTransition: ({ entry, queue, input: requested }) => decideEntryTransition({
          from: entry.status,
          to: requested.to,
          source: entry.source,
          origin: requested.origin ?? 'system',
          reason: requested.reason,
          policy: {
            refundIfRemovedWhileCalled: queue.refundIfRemovedWhileCalled,
            refundOnNoShow: queue.refundOnNoShow,
            refundIfViewerLeavesWhileCalled: queue.refundIfViewerLeavesCalled,
          },
        }),
      });
    },
  };
}

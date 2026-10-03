import { describe, expect, it, vi } from 'vitest';
import { createQueueDomainService } from '../../apps/api/src/domain/queue-service.mjs';

describe('queue domain service', () => {
  it('decides a transition inside the persistence boundary and never claims remote completion', async () => {
    let persistedDecision;
    const repository = {
      applyEntryTransition: vi.fn(async ({ decideTransition, input }) => {
        persistedDecision = decideTransition({
          entry: { status: 'waiting', source: 'redemption' },
          queue: {
            refundIfRemovedWhileCalled: false,
            refundIfViewerLeavesCalled: false,
            refundOnNoShow: false,
          },
          input,
        });
        return { status: 'removed', financialDecision: persistedDecision.financialDecision };
      }),
    };
    const service = createQueueDomainService({ repository });

    const result = await service.transitionEntry({
      entryId: 'entry-1', to: 'removed', origin: 'viewer', actorId: 'viewer-1', reason: 'viewer_left',
    });

    expect(repository.applyEntryTransition).toHaveBeenCalledOnce();
    expect(persistedDecision).toMatchObject({
      accepted: true,
      previousStatus: 'waiting',
      nextStatus: 'removed',
      financialDecision: 'request_cancel',
    });
    expect(result).toEqual({ status: 'removed', financialDecision: 'request_cancel' });
    expect(result).not.toHaveProperty('refundConfirmed');
  });

  it('does not persist an invalid transition', async () => {
    let persisted = false;
    const repository = {
      applyEntryTransition: vi.fn(async ({ decideTransition, input }) => {
        const decision = decideTransition({
          entry: { status: 'waiting', source: 'redemption' },
          queue: {},
          input,
        });
        persisted = true;
        return decision;
      }),
    };
    const service = createQueueDomainService({ repository });

    await expect(service.transitionEntry({ entryId: 'entry-1', to: 'completed', reason: 'completed' }))
      .rejects.toMatchObject({ code: 'INVALID_ENTRY_TRANSITION' });
    expect(persisted).toBe(false);
  });
});

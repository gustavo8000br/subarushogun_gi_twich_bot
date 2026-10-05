import { describe, expect, it } from 'vitest';
import { createQueueRepository } from '../../apps/api/src/persistence/queue-repository.mjs';

describe('queue persistence transition boundary', () => {
  it('fails closed when callers bypass the domain decision for persisted transitions', async () => {
    const repository = createQueueRepository({});
    const error = { code: 'DOMAIN_TRANSITION_REQUIRED' };

    await expect(repository.applyEntryTransition({ input: { entryId: 'entry-1', to: 'completed', reason: 'service_completed' } })).rejects.toMatchObject(error);
    await expect(repository.callNext({ queueId: 'queue-1', count: 1 })).rejects.toMatchObject(error);
    await expect(repository.callSpecificEntry({ queueId: 'queue-1', entryId: 'entry-1' })).rejects.toMatchObject(error);
    await expect(repository.clearActiveEntries({ queueId: 'queue-1', snapshot: [] })).rejects.toMatchObject(error);
  });
});

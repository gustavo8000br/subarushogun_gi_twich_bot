import { describe, expect, it } from 'vitest';
import { getQueueConfirmationCopy } from '../../apps/web/queue-confirmation-copy.mjs';

describe('queue confirmation copy', () => {
  it('keeps unarchive wording independent of reward history', () => {
    expect(getQueueConfirmationCopy({ queueMode: 'manual_only', rewardOrigin: 'none', rewardId: null }, 'unarchive')).toBe('panel.queue.confirm.unarchive');
  });

  it('uses two distinct confirmations for local-only recovery', () => {
    expect(getQueueConfirmationCopy({}, 'archive-local-first')).toBe('panel.queue.confirm.archive_local_uncertain_first');
    expect(getQueueConfirmationCopy({}, 'archive-local-final')).toBe('panel.queue.confirm.archive_local_uncertain_final');
  });

  it('provides distinct localized accept labels and retry feedback for local-only recovery', () => {
    expect(getQueueConfirmationCopy({}, 'archive-local-first-accept')).toBe('panel.queue.action.archive_local_review');
    expect(getQueueConfirmationCopy({}, 'archive-local-final-accept')).toBe('panel.queue.action.archive_local_anyway');
    expect(getQueueConfirmationCopy({}, 'archive-local-processing')).toBe('panel.queue.archive_local.processing');
    expect(getQueueConfirmationCopy({}, 'archive-local-expired')).toBe('panel.queue.archive_local.expired');
    expect(getQueueConfirmationCopy({}, 'archive-local-stale')).toBe('panel.queue.archive_local.stale');
    expect(getQueueConfirmationCopy({}, 'archive-local-unavailable')).toBe('panel.queue.archive_local.unavailable');
  });
});

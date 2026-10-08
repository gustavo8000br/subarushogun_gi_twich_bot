import { describe, expect, it } from 'vitest';
import { queueSyncTranslationKey } from '../../apps/web/queue-sync-status.mjs';

describe('queue reward synchronization labels', () => {
  it('labels a known Twitch configuration divergence explicitly', () => {
    expect(queueSyncTranslationKey('diverged')).toBe('panel.queue.sync.diverged');
  });

  it('maps the complete remote operation lifecycle to honest states', () => {
    for (const state of ['pending_create', 'pending_update', 'pending_open', 'pending_close', 'pending_delete', 'delete_pending']) {
      expect(queueSyncTranslationKey(state)).toBe('panel.queue.sync.pending');
    }
    for (const state of ['create_unknown', 'update_unknown', 'open_unknown', 'close_unknown', 'delete_unknown']) {
      expect(queueSyncTranslationKey(state)).toBe('panel.queue.sync.unknown');
    }
    for (const state of ['create_failed', 'update_failed', 'open_failed', 'close_failed', 'delete_failed']) {
      expect(queueSyncTranslationKey(state)).toBe('panel.queue.sync.failed');
    }
  });
});

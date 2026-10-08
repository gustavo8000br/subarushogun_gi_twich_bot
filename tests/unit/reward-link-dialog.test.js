import { describe, expect, it } from 'vitest';
import { normalizeRewardCandidates } from '../../apps/web/reward-link-dialog.mjs';

describe('reward link dialog candidate projection', () => {
  it('keeps a successful empty Twitch result distinct from a lookup failure', () => {
    expect(normalizeRewardCandidates([])).toEqual({ candidates: [], diagnostics: null });
    expect(normalizeRewardCandidates(null)).toEqual({ candidates: [], diagnostics: null });
  });

  it('only exposes complete managed reward candidates returned by the Twitch lookup', () => {
    expect(normalizeRewardCandidates([
      { id: 'reward-1', title: 'Queue', cost: 100, prompt: 'Only UID' },
      { id: 'reward-incomplete', title: 'Queue', cost: 100 },
      { id: 'reward-invalid', title: 'Queue', cost: 0, prompt: '' },
      null,
    ])).toEqual({ candidates: [{ id: 'reward-1', title: 'Queue', cost: 100, prompt: 'Only UID' }], diagnostics: null });
  });

  it('normalizes safe mismatch counts so a streamer can see why rewards were filtered', () => {
    expect(normalizeRewardCandidates({
      candidates: [],
      diagnostics: {
        managedRewardCount: 6,
        mismatchCounts: { title_mismatch: 5, prompt_mismatch: 4, reward_not_paused: 3, cost_mismatch: 1, private_field: 99 },
      },
    })).toEqual({
      candidates: [],
      diagnostics: { managedRewardCount: 6, mismatchCounts: { title_mismatch: 5, prompt_mismatch: 4, reward_not_paused: 3, cost_mismatch: 1 } },
    });
  });

  it('rejects malformed or unsafe diagnostics without losing valid candidates', () => {
    expect(normalizeRewardCandidates({
      candidates: [{ id: 'reward-1', title: 'Queue', cost: 100, prompt: '' }],
      diagnostics: { managedRewardCount: -1, mismatchCounts: { title_mismatch: -2, token: 1 } },
    })).toEqual({ candidates: [{ id: 'reward-1', title: 'Queue', cost: 100, prompt: '' }], diagnostics: null });
  });
});

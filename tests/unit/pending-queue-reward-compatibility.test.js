import { describe, expect, it } from 'vitest';
import { evaluatePendingQueueRewardCompatibility, summarizePendingQueueRewardCompatibility } from '../../apps/api/src/twitch/pending-queue-reward-compatibility.mjs';

const queue = {
  title: 'Abismo', cost: 100, rewardPrompt: 'Somente UID', uidMode: 'visible',
  maxRedemptionsPerStream: null, maxRedemptionsPerUserPerStream: null, globalCooldownSeconds: null,
};
const reward = {
  id: 'private-reward-id', title: 'Abismo', cost: 100, prompt: 'Somente UID', userInputRequired: true,
  maxRedemptionsPerStream: null, maxRedemptionsPerUserPerStream: null, globalCooldown: null,
  autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: true,
};

describe('pending queue reward compatibility', () => {
  it('accepts a reward only when every recovery-critical field matches', () => {
    expect(evaluatePendingQueueRewardCompatibility(reward, queue)).toEqual({ compatible: true, mismatchReasons: [] });
  });

  it('reports stable reason codes for mismatches without returning reward content', () => {
    const result = evaluatePendingQueueRewardCompatibility({ ...reward, cost: 999, title: 'private title', isPaused: false }, queue);
    expect(result).toEqual({ compatible: false, mismatchReasons: ['title_mismatch', 'cost_mismatch', 'reward_not_paused'] });
    expect(JSON.stringify(result)).not.toMatch(/private|999|Abismo|UID|reward-id/);
  });

  it('treats missing critical Twitch values as unknown instead of silently matching', () => {
    const incomplete = Object.fromEntries(Object.entries(reward).filter(([key]) => !['shouldRedemptionsSkipRequestQueue', 'autoFulfill', 'isPaused'].includes(key)));
    expect(evaluatePendingQueueRewardCompatibility(incomplete, queue).mismatchReasons).toEqual([
      'auto_fulfill_unknown', 'skip_request_queue_unknown', 'reward_pause_unknown',
    ]);
  });

  it('summarizes candidates using bounded reason counts without identifying rewards', () => {
    const summary = summarizePendingQueueRewardCompatibility([reward, { ...reward, cost: 200 }, { ...reward, isPaused: false }], queue);
    expect(summary).toEqual({ managedRewardCount: 3, candidateCount: 1, rejectedRewardCount: 2, mismatchCounts: { cost_mismatch: 1, reward_not_paused: 1 } });
    expect(JSON.stringify(summary)).not.toMatch(/private-reward-id|Abismo|Somente UID/);
  });
});

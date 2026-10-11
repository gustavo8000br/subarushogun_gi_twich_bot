/** @type {Array<[string, string, string, ((actual: any, expected: any) => boolean)?]>} */
const FIELD_CHECKS = [
  ['title', 'title', 'title_mismatch'],
  ['cost', 'cost', 'cost_mismatch'],
  ['prompt', 'rewardPrompt', 'prompt_mismatch'],
  ['userInputRequired', 'uidMode', 'uid_input_mismatch', (actual, expected) => actual === (expected === 'visible')],
  ['maxRedemptionsPerStream', 'maxRedemptionsPerStream', 'max_redemptions_per_stream_mismatch'],
  ['maxRedemptionsPerUserPerStream', 'maxRedemptionsPerUserPerStream', 'max_redemptions_per_user_per_stream_mismatch'],
  ['globalCooldown', 'globalCooldownSeconds', 'global_cooldown_mismatch'],
];
/** @type {Array<[string, boolean, string, string]>} */
const BOOLEAN_CHECKS = [
  ['autoFulfill', false, 'auto_fulfill_enabled', 'auto_fulfill_unknown'],
  ['shouldRedemptionsSkipRequestQueue', false, 'skip_request_queue_enabled', 'skip_request_queue_unknown'],
  ['isEnabled', true, 'reward_disabled', 'reward_enabled_unknown'],
  ['isPaused', true, 'reward_not_paused', 'reward_pause_unknown'],
];
const REASONS = new Set([...FIELD_CHECKS.flatMap(([, , reason]) => [reason, `${reason.replace('_mismatch', '')}_unknown`]), ...BOOLEAN_CHECKS.flatMap(([, , mismatch, unknown]) => [mismatch, unknown])]);
REASONS.add('reward_not_managed');
export const PENDING_QUEUE_REWARD_MISMATCH_REASONS = Object.freeze([...REASONS]);

/** @param {Record<string, any>} reward @param {Record<string, any>} queue */
export function evaluatePendingQueueRewardCompatibility(reward, queue) {
  const mismatchReasons = [];
  for (const [rewardField, queueField, reason, compare = Object.is] of FIELD_CHECKS) {
    const actual = reward?.[rewardField];
    const expected = queueField === 'prompt' ? queue?.rewardPrompt ?? '' : queue?.[queueField] ?? null;
    if (actual === undefined) mismatchReasons.push(`${reason.replace('_mismatch', '')}_unknown`);
    else if (!compare(actual, expected)) mismatchReasons.push(reason);
  }
  for (const [field, expected, mismatch, unknown] of BOOLEAN_CHECKS) {
    if (typeof reward?.[field] !== 'boolean') mismatchReasons.push(unknown);
    else if (reward[field] !== expected) mismatchReasons.push(mismatch);
  }
  return { compatible: mismatchReasons.length === 0, mismatchReasons };
}

/** @param {Array<Record<string, any>>} rewards @param {Record<string, any>} queue */
export function summarizePendingQueueRewardCompatibility(rewards, queue) {
  const mismatchCounts = {};
  let candidateCount = 0;
  for (const reward of Array.isArray(rewards) ? rewards : []) {
    const evaluation = evaluatePendingQueueRewardCompatibility(reward, queue);
    if (evaluation.compatible) candidateCount += 1;
    else for (const reason of evaluation.mismatchReasons) {
      if (REASONS.has(reason)) mismatchCounts[reason] = (mismatchCounts[reason] ?? 0) + 1;
    }
  }
  return {
    managedRewardCount: Array.isArray(rewards) ? rewards.length : 0,
    candidateCount,
    rejectedRewardCount: (Array.isArray(rewards) ? rewards.length : 0) - candidateCount,
    mismatchCounts: Object.fromEntries(Object.entries(mismatchCounts).sort(([left], [right]) => left.localeCompare(right))),
  };
}

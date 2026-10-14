/** @param {Record<string, any>|null|undefined} reward @param {Record<string, any>} queue */
export function matchesManagedRewardState(reward, queue) {
  return reward?.id === queue.rewardId
    && reward.title === queue.title
    && reward.cost === queue.cost
    && (reward.prompt ?? '') === (queue.rewardPrompt ?? '')
    && reward.userInputRequired === (queue.uidMode === 'visible')
    && (reward.maxRedemptionsPerStream ?? null) === (queue.maxRedemptionsPerStream ?? null)
    && (reward.maxRedemptionsPerUserPerStream ?? null) === (queue.maxRedemptionsPerUserPerStream ?? null)
    && (reward.globalCooldown ?? null) === (queue.globalCooldownSeconds ?? null)
    && reward.autoFulfill === false
    && reward.shouldRedemptionsSkipRequestQueue === false
    && reward.isEnabled === true
    && typeof reward.isPaused === 'boolean';
}

const maxRetryMs = 60 * 60 * 1000;

function retryDelay(error, attempts, random) {
  if (error.status === 429 && Number.isFinite(error.retryAfterSeconds)) return Math.max(0, error.retryAfterSeconds * 1000);
  const base = Math.min(maxRetryMs, 1000 * (2 ** Math.min(attempts, 12)));
  return Math.min(maxRetryMs, Math.round(base * (0.5 + random())));
}

function matchesRequestedReward(reward, queue) {
  return reward.title === queue.title
    && reward.cost === queue.cost
    && (reward.prompt ?? '') === (queue.rewardPrompt ?? '')
    && reward.userInputRequired === (queue.uidMode === 'visible')
    && reward.autoFulfill === false
    && reward.shouldRedemptionsSkipRequestQueue === false
    && reward.isEnabled === true
    && reward.isPaused === true;
}

function findNewMatches(rewards, queue, baselineRewardIds) {
  const baseline = new Set(baselineRewardIds);
  return rewards.filter((reward) => !baseline.has(reward.id) && matchesRequestedReward(reward, queue));
}

function safeError(error, fallback) {
  return typeof error?.code === 'string' ? error.code.slice(0, 64) : fallback;
}

function isPermanentFailure(error) {
  return Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 && error.status !== 429;
}

/** @param {{repository: Record<string, Function>, twitch?: Record<string, Function>, getTwitch?: () => Record<string, Function>|null, clock?: () => Date, random?: () => number}} dependencies */
export function createRewardOutboxWorker({ repository, twitch, getTwitch, clock = () => new Date(), random = Math.random }) {
  return {
    async processOne() {
      const adapter = getTwitch?.() ?? twitch;
      if (!adapter) return 'idle';
      const task = await repository.claimNextRewardOperation({ now: clock() });
      if (!task) return 'idle';
      if (task.operationType !== 'reward.create' || !task.queue || task.queue.lifecycleStatus !== 'active') {
        await repository.failedRewardOperation(task.id, 'reward_operation_not_supported', task.leaseToken);
        return 'failed';
      }

      let eligibility;
      try {
        eligibility = await adapter.getChannelEligibility();
      } catch {
        await repository.retryRewardOperation(task.id, {
          nextAttemptAt: new Date(clock().getTime() + retryDelay({}, task.attempts, random)),
          errorCode: 'channel_eligibility_unavailable',
        }, task.leaseToken);
        return 'retry';
      }
      if (eligibility.eligible !== true) {
        await repository.failedRewardOperation(task.id, eligibility.reason === 'channel_points_unavailable' ? 'channel_points_unavailable' : 'channel_ineligible', task.leaseToken);
        return 'failed';
      }
      if (eligibility.channelPointsAvailable !== true || !Number.isInteger(eligibility.rewardCount) || !Number.isInteger(eligibility.rewardLimit)) {
        await repository.retryRewardOperation(task.id, {
          nextAttemptAt: new Date(clock().getTime() + retryDelay({}, task.attempts, random)),
          errorCode: 'channel_reward_count_unavailable',
        }, task.leaseToken);
        return 'retry';
      }
      if (eligibility.rewardCount >= eligibility.rewardLimit) {
        await repository.failedRewardOperation(task.id, 'reward_limit_reached', task.leaseToken);
        return 'failed';
      }

      const savedBaseline = task.payload?.baselineRewardIds;
      let rewards;
      try {
        rewards = await adapter.getManagedRewards();
      } catch {
        await repository.retryRewardOperation(task.id, {
          nextAttemptAt: new Date(clock().getTime() + retryDelay({}, task.attempts, random)),
          errorCode: 'managed_reward_lookup_failed',
        }, task.leaseToken);
        return 'retry';
      }

      if (task.payload?.requestMayHaveReachedTwitch === true) {
        if (!Array.isArray(savedBaseline)) {
          await repository.unknownRewardOperation(task.id, 'reward_create_association_ambiguous', task.leaseToken);
          return 'unknown';
        }
        const matches = findNewMatches(rewards, task.queue, savedBaseline);
        if (matches.length !== 1) {
          await repository.unknownRewardOperation(task.id, matches.length ? 'reward_create_association_ambiguous' : 'reward_create_result_unknown', task.leaseToken);
          return 'unknown';
        }
        const confirmed = await repository.confirmRewardCreated(task.id, { rewardId: matches[0].id }, task.leaseToken);
        return confirmed ? 'confirmed' : 'lease_lost';
      }

      const baselineRewardIds = rewards.map(({ id }) => id);
      const prepared = await repository.prepareRewardCreate(task.id, { baselineRewardIds, requestMayHaveReachedTwitch: true }, task.leaseToken);
      if (prepared === false) return 'lease_lost';
      const rewardRequest = {
        title: task.queue.title,
        cost: task.queue.cost,
        prompt: task.queue.rewardPrompt,
        userInputRequired: task.queue.uidMode === 'visible',
        autoFulfill: false,
        shouldRedemptionsSkipRequestQueue: false,
        isEnabled: true,
        isPaused: true,
      };
      try {
        const created = await adapter.createReward(rewardRequest);
        if (!created?.id || !matchesRequestedReward(created, task.queue)) {
          await repository.unknownRewardOperation(task.id, 'reward_create_response_unverified', task.leaseToken);
          return 'unknown';
        }
        const confirmed = await repository.confirmRewardCreated(task.id, { rewardId: created.id }, task.leaseToken);
        return confirmed ? 'confirmed' : 'lease_lost';
      } catch (error) {
        if (error?.status === 429) {
          const delayMs = retryDelay(error, task.attempts, random);
          await repository.retryRewardOperation(task.id, {
            nextAttemptAt: new Date(clock().getTime() + delayMs),
            errorCode: safeError(error, 'reward_create_rate_limited'),
            payloadUpdates: { requestMayHaveReachedTwitch: false },
          }, task.leaseToken);
          return 'retry';
        }
        if (isPermanentFailure(error)) {
          await repository.failedRewardOperation(task.id, safeError(error, 'reward_create_rejected'), task.leaseToken);
          return 'failed';
        }
        let currentRewards;
        try { currentRewards = await adapter.getManagedRewards(); } catch {
          await repository.unknownRewardOperation(task.id, 'reward_create_result_unknown', task.leaseToken);
          return 'unknown';
        }
        const matches = findNewMatches(currentRewards, task.queue, baselineRewardIds);
        if (matches.length !== 1) {
          await repository.unknownRewardOperation(task.id, matches.length ? 'reward_create_association_ambiguous' : 'reward_create_result_unknown', task.leaseToken);
          return 'unknown';
        }
        const confirmed = await repository.confirmRewardCreated(task.id, { rewardId: matches[0].id }, task.leaseToken);
        return confirmed ? 'confirmed' : 'lease_lost';
      }
    },
  };
}

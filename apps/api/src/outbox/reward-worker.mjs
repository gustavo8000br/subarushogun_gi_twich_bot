const maxRetryMs = 60 * 60 * 1000;

function httpStatus(error) {
  if (Number.isInteger(error?.status)) return error.status;
  return Number.isInteger(error?.statusCode) ? error.statusCode : undefined;
}

function retryDelay(error, attempts, random) {
  if (httpStatus(error) === 429 && Number.isFinite(error.retryAfterSeconds)) return Math.max(0, error.retryAfterSeconds * 1000);
  const base = Math.min(maxRetryMs, 1000 * (2 ** Math.min(attempts, 12)));
  return Math.min(maxRetryMs, Math.round(base * (0.5 + random())));
}

function matchesRequestedRewardConfiguration(reward, queue) {
  return reward.title === queue.title
    && reward.cost === queue.cost
    && (reward.prompt ?? '') === (queue.rewardPrompt ?? '')
    && reward.userInputRequired === (queue.uidMode === 'visible')
    && (reward.maxRedemptionsPerStream ?? null) === (queue.maxRedemptionsPerStream ?? null)
    && (reward.maxRedemptionsPerUserPerStream ?? null) === (queue.maxRedemptionsPerUserPerStream ?? null)
    && (reward.globalCooldown ?? null) === (queue.globalCooldownSeconds ?? null)
    && reward.autoFulfill === false
    && reward.shouldRedemptionsSkipRequestQueue === false;
}

function matchesRequestedReward(reward, queue) {
  return matchesRequestedRewardConfiguration(reward, queue)
    && reward.isEnabled === true
    && reward.isPaused === true;
}

function findNewMatches(rewards, queue, baselineRewardIds) {
  const baseline = new Set(baselineRewardIds);
  return rewards.filter((reward) => !baseline.has(reward.id) && matchesRequestedRewardConfiguration(reward, queue));
}

async function pauseAndConfirmCreatedReward({ repository, adapter, task, rewardId, clock, random }) {
  let updated;
  try {
    updated = await adapter.updateReward(rewardId, { isEnabled: true, isPaused: true, autoFulfill: false });
  } catch {
    await repository.retryRewardOperation(task.id, {
      nextAttemptAt: new Date(clock().getTime() + retryDelay({}, task.attempts, random)),
      errorCode: 'reward_create_pause_pending', payloadUpdates: { requestMayHaveReachedTwitch: true },
    }, task.leaseToken);
    return 'retry';
  }
  if (!updated || updated.id !== rewardId || !matchesRequestedReward(updated, task.queue)) {
    await repository.unknownRewardOperation(task.id, 'reward_create_pause_unverified', task.leaseToken);
    return 'unknown';
  }
  let paused;
  try {
    paused = await adapter.setRewardOpen(rewardId, false);
  } catch {
    await repository.retryRewardOperation(task.id, {
      nextAttemptAt: new Date(clock().getTime() + retryDelay({}, task.attempts, random)),
      errorCode: 'reward_create_stock_pause_pending', payloadUpdates: { requestMayHaveReachedTwitch: true },
    }, task.leaseToken);
    return 'retry';
  }
  if (!paused || paused.id !== rewardId || !matchesRequestedReward(paused, task.queue)) {
    await repository.unknownRewardOperation(task.id, 'reward_create_pause_unverified', task.leaseToken);
    return 'unknown';
  }
  const confirmed = await repository.confirmRewardCreated(task.id, { rewardId }, task.leaseToken);
  return confirmed ? 'confirmed' : 'lease_lost';
}

function safeError(error, fallback) {
  return typeof error?.code === 'string' ? error.code.slice(0, 64) : fallback;
}

function isPermanentFailure(error) {
  const status = httpStatus(error);
  return Number.isInteger(status) && status >= 400 && status < 500 && status !== 429;
}

function matchesManagedRewardState(reward, queue) {
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

function matchesRewardConfiguration(reward, configuration, rewardId) {
  return reward?.id === rewardId
    && reward.title === configuration.title
    && reward.cost === configuration.cost
    && (reward.prompt ?? '') === (configuration.prompt ?? '')
    && reward.userInputRequired === (configuration.uidMode === 'visible')
    && (reward.maxRedemptionsPerStream ?? null) === (configuration.maxRedemptionsPerStream ?? null)
    && (reward.maxRedemptionsPerUserPerStream ?? null) === (configuration.maxRedemptionsPerUserPerStream ?? null)
    && (reward.globalCooldown ?? null) === (configuration.globalCooldownSeconds ?? null)
    && reward.autoFulfill === false
    && reward.shouldRedemptionsSkipRequestQueue === false
    && reward.isEnabled === true;
}

function queueRewardConfiguration(queue) {
  return {
    title: queue.title, cost: queue.cost, prompt: queue.rewardPrompt, uidMode: queue.uidMode,
    maxRedemptionsPerStream: queue.maxRedemptionsPerStream,
    maxRedemptionsPerUserPerStream: queue.maxRedemptionsPerUserPerStream,
    globalCooldownSeconds: queue.globalCooldownSeconds,
  };
}

async function processRewardUpdateTask({ repository, adapter, task, clock, random }) {
  const queue = task.queue;
  const previous = task.payload?.previous;
  if (!queue || queue.lifecycleStatus !== 'active' || !queue.rewardId
    || !['pending_update', 'update_unknown'].includes(queue.remoteSyncStatus) || !previous) {
    await repository.failedRewardOperation(task.id, 'reward_update_operation_invalid', task.leaseToken);
    return 'failed';
  }
  let current;
  try { current = await adapter.getReward(queue.rewardId); }
  catch {
    if (task.payload?.requestMayHaveReachedTwitch === true) {
      await repository.unknownRewardOperation(task.id, 'reward_update_result_unknown', task.leaseToken);
      return 'unknown';
    }
    await repository.retryRewardOperation(task.id, { nextAttemptAt: new Date(clock().getTime() + retryDelay({}, task.attempts, random)), errorCode: 'reward_update_lookup_failed' }, task.leaseToken);
    return 'retry';
  }
  const desired = queueRewardConfiguration(queue);
  if (matchesRewardConfiguration(current, desired, queue.rewardId)) {
    const confirmed = await repository.confirmRewardUpdated(task.id, task.leaseToken);
    return confirmed ? 'confirmed' : 'lease_lost';
  }
  if (!matchesRewardConfiguration(current, previous, queue.rewardId)) {
    await repository.unknownRewardOperation(task.id, 'reward_update_reward_diverged', task.leaseToken);
    return 'unknown';
  }
  if (task.payload?.requestMayHaveReachedTwitch === true) {
    await repository.retryRewardOperation(task.id, {
      nextAttemptAt: new Date(clock().getTime() + retryDelay({}, task.attempts, random)),
      errorCode: 'reward_update_remote_still_previous', payloadUpdates: { requestMayHaveReachedTwitch: false },
    }, task.leaseToken);
    return 'retry';
  }
  if (!await repository.prepareRewardUpdate(task.id, task.leaseToken)) return 'lease_lost';
  try {
    const updated = await adapter.updateReward(queue.rewardId, {
      title: desired.title, cost: desired.cost, prompt: desired.prompt, userInputRequired: desired.uidMode === 'visible',
      maxRedemptionsPerStream: desired.maxRedemptionsPerStream ?? null,
      maxRedemptionsPerUserPerStream: desired.maxRedemptionsPerUserPerStream ?? null,
      globalCooldown: desired.globalCooldownSeconds ?? null, autoFulfill: false,
    });
    if (!matchesRewardConfiguration(updated, desired, queue.rewardId)) {
      await repository.unknownRewardOperation(task.id, 'reward_update_response_unverified', task.leaseToken);
      return 'unknown';
    }
    const confirmed = await repository.confirmRewardUpdated(task.id, task.leaseToken);
    return confirmed ? 'confirmed' : 'lease_lost';
  } catch (error) {
    if (httpStatus(error) === 429 || httpStatus(error) === 401) {
      await repository.retryRewardOperation(task.id, {
        nextAttemptAt: new Date(clock().getTime() + retryDelay(httpStatus(error) === 429 ? error : {}, task.attempts, random)),
        errorCode: httpStatus(error) === 429 ? safeError(error, 'reward_update_rate_limited') : 'twitch_authorization_required',
        payloadUpdates: { requestMayHaveReachedTwitch: false },
      }, task.leaseToken);
      return 'retry';
    }
    if (isPermanentFailure(error)) {
      await repository.failedRewardOperation(task.id, safeError(error, 'reward_update_rejected'), task.leaseToken);
      return 'failed';
    }
    await repository.unknownRewardOperation(task.id, 'reward_update_result_unknown', task.leaseToken);
    return 'unknown';
  }
}

async function processOpenStateTask({ repository, adapter, task, clock, random }) {
  const queue = task.queue;
  const isOpen = task.payload?.isOpen;
  const convertingToManual = task.payload?.convertToManualAfterConfirm === true;
  const isArchivePause = task.payload?.archiveAfterConfirm === true && isOpen === false;
  const isDeletionPause = task.payload?.deleteAfterConfirm === true && isOpen === false;
  if (!queue || (queue.lifecycleStatus !== 'active' && !(queue.lifecycleStatus === 'deleting' && isDeletionPause))
      || (queue.isArchived && !isArchivePause && !isDeletionPause) || !queue.rewardId || typeof isOpen !== 'boolean') {
    await repository.failedRewardOperation(task.id, 'reward_open_operation_invalid', task.leaseToken);
    return 'failed';
  }

  let current;
  try {
    current = await adapter.getReward(queue.rewardId);
  } catch {
    if (task.payload?.requestMayHaveReachedTwitch === true) {
      await repository.unknownRewardOperation(task.id, 'reward_open_result_unknown', task.leaseToken);
      return 'unknown';
    }
    await repository.retryRewardOperation(task.id, {
      nextAttemptAt: new Date(clock().getTime() + retryDelay({}, task.attempts, random)),
      errorCode: 'reward_open_lookup_failed',
    }, task.leaseToken);
    return 'retry';
  }
  if (!matchesManagedRewardState(current, queue)) {
    await repository.unknownRewardOperation(task.id, 'reward_open_reward_diverged', task.leaseToken);
    return 'unknown';
  }

  if (task.payload?.requestMayHaveReachedTwitch === true) {
    if (current.isPaused === !isOpen) {
      const confirmed = await repository.confirmRewardOpen(task.id, { isOpen }, task.leaseToken);
      return confirmed ? 'confirmed' : 'lease_lost';
    }
    if (convertingToManual && !isOpen) {
      await repository.retryRewardOperation(task.id, {
        nextAttemptAt: new Date(clock().getTime() + retryDelay({}, task.attempts, random)),
        errorCode: 'manual_mode_pause_not_yet_visible',
        payloadUpdates: { requestMayHaveReachedTwitch: false },
      }, task.leaseToken);
      return 'retry';
    }
    await repository.unknownRewardOperation(task.id, 'reward_open_result_unknown', task.leaseToken);
    return 'unknown';
  }

  const prepared = await repository.prepareRewardOpen(task.id, task.leaseToken);
  if (prepared === false) return 'lease_lost';
  try {
    const updated = await adapter.setRewardOpen(queue.rewardId, isOpen);
    if (!matchesManagedRewardState(updated, queue) || updated.isPaused !== !isOpen) {
      await repository.unknownRewardOperation(task.id, 'reward_open_response_unverified', task.leaseToken);
      return 'unknown';
    }
    const confirmed = await repository.confirmRewardOpen(task.id, { isOpen }, task.leaseToken);
    return confirmed ? 'confirmed' : 'lease_lost';
  } catch (error) {
    if (httpStatus(error) === 429) {
      await repository.retryRewardOperation(task.id, {
        nextAttemptAt: new Date(clock().getTime() + retryDelay(error, task.attempts, random)),
        errorCode: safeError(error, 'reward_open_rate_limited'),
        payloadUpdates: { requestMayHaveReachedTwitch: false },
      }, task.leaseToken);
      return 'retry';
    }
    if (httpStatus(error) === 401) {
      await repository.retryRewardOperation(task.id, {
        nextAttemptAt: new Date(clock().getTime() + retryDelay({}, task.attempts, random)),
        errorCode: 'twitch_authorization_required',
        payloadUpdates: { requestMayHaveReachedTwitch: false },
      }, task.leaseToken);
      return 'retry';
    }
    if (isPermanentFailure(error)) {
      await repository.failedRewardOperation(task.id, safeError(error, 'reward_open_rejected'), task.leaseToken);
      return 'failed';
    }
    await repository.unknownRewardOperation(task.id, 'reward_open_result_unknown', task.leaseToken);
    return 'unknown';
  }
}

async function processDeleteTask({ repository, adapter, task, clock, random }) {
  const queue = task.queue;
  if (!queue || queue.lifecycleStatus !== 'deleting' || !queue.isArchived || queue.isOpen || !queue.rewardId) {
    await repository.failedRewardOperation(task.id, 'queue_delete_operation_invalid', task.leaseToken);
    return 'failed';
  }
  const retry = async (errorCode, delayMs = retryDelay({}, task.attempts, random)) => {
    await repository.retryRewardOperation(task.id, { nextAttemptAt: new Date(clock().getTime() + delayMs), errorCode }, task.leaseToken);
    return 'retry';
  };
  const unknown = async (errorCode) => {
    await repository.unknownRewardOperation(task.id, errorCode, task.leaseToken);
    return 'unknown';
  };
  let reward;
  try {
    reward = await adapter.getReward(queue.rewardId);
  } catch (error) {
    if (httpStatus(error) === 404 && task.payload?.safeToDelete === true) {
      return await repository.completeQueueDeletion(task.id, task.leaseToken) ? 'confirmed' : 'lease_lost';
    }
    if (httpStatus(error) === 404) return await unknown('queue_delete_reward_missing_before_safe_delete');
    return await retry('queue_delete_reward_lookup_failed');
  }
  if (!reward) {
    if (task.payload?.safeToDelete === true) return await repository.completeQueueDeletion(task.id, task.leaseToken) ? 'confirmed' : 'lease_lost';
    return await unknown('queue_delete_reward_missing_before_safe_delete');
  }
  if (!matchesManagedRewardState(reward, queue) || reward.isPaused !== true) return await unknown('queue_delete_reward_diverged');

  let unfulfilled;
  try { unfulfilled = await adapter.listUnfulfilledRedemptions(queue.rewardId); }
  catch { return await retry('queue_delete_redemptions_lookup_failed'); }
  const recorded = await repository.recordQueueDeletionRedemptions({ queueId: queue.id, redemptions: unfulfilled });
  if (recorded.status === 'conflict' || recorded.conflicts > 0) return await unknown('queue_deletion_financial_conflict');
  let blockers = await repository.getQueueDeletionBlockers(queue.id);
  if (blockers.blocked > 0) return await unknown('queue_deletion_financial_conflict');
  if (blockers.pending > 0) return await retry('queue_deletion_waiting_for_refunds', 30_000);

  let finalUnfulfilled;
  try { finalUnfulfilled = await adapter.listUnfulfilledRedemptions(queue.rewardId); }
  catch { return await retry('queue_delete_final_redemption_check_failed'); }
  if (finalUnfulfilled.length) {
    const finalRecord = await repository.recordQueueDeletionRedemptions({ queueId: queue.id, redemptions: finalUnfulfilled });
    if (finalRecord.status === 'conflict' || finalRecord.conflicts > 0) return await unknown('queue_deletion_financial_conflict');
    blockers = await repository.getQueueDeletionBlockers(queue.id);
    if (blockers.blocked > 0) return await unknown('queue_deletion_financial_conflict');
    return await retry('queue_deletion_waiting_for_refunds', 30_000);
  }

  const prepared = await repository.prepareRewardDelete(task.id, task.leaseToken);
  if (!prepared) return await retry('queue_delete_preconditions_changed', 30_000);
  try {
    await adapter.deleteReward(queue.rewardId);
    return await repository.completeQueueDeletion(task.id, task.leaseToken) ? 'confirmed' : 'lease_lost';
  } catch {
    try {
      const afterError = await adapter.getReward(queue.rewardId);
      if (!afterError) return await repository.completeQueueDeletion(task.id, task.leaseToken) ? 'confirmed' : 'lease_lost';
      if (!matchesManagedRewardState(afterError, queue) || afterError.isPaused !== true) return await unknown('queue_delete_reward_diverged_after_error');
      return await retry('queue_delete_response_unknown');
    } catch (lookupError) {
      if (lookupError?.status === 404) return await repository.completeQueueDeletion(task.id, task.leaseToken) ? 'confirmed' : 'lease_lost';
      return await unknown('queue_delete_result_unknown');
    }
  }
}

function withRewardOperationDiagnostics(repository, onDiagnostic) {
  const diagnosticMethods = new Set(['retryRewardOperation', 'failedRewardOperation', 'unknownRewardOperation']);
  return new Proxy(repository, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      if (typeof property !== 'string' || !diagnosticMethods.has(property)) return value.bind(target);
      return async (...args) => {
        const result = await value.apply(target, args);
        const errorCode = property === 'retryRewardOperation' ? args[1]?.errorCode : args[1];
        try {
          onDiagnostic({ source: 'outbox.reward', errorType: 'RewardOperation', errorCode });
        } catch { /* Diagnostics must not disrupt durable operation state. */ }
        return result;
      };
    },
  });
}

/** @param {{repository: Record<string, Function>, twitch?: Record<string, Function>, getTwitch?: () => Record<string, Function>|null, clock?: () => Date, random?: () => number, onDiagnostic?: (event: {source: string, errorType: string, errorCode?: string}) => unknown}} dependencies */
export function createRewardOutboxWorker({ repository, twitch, getTwitch, clock = () => new Date(), random = Math.random, onDiagnostic = () => undefined }) {
  const diagnosticRepository = withRewardOperationDiagnostics(repository, onDiagnostic);
  return {
    async processOne() {
      const adapter = getTwitch?.() ?? twitch;
      if (!adapter) return 'idle';
      const task = await diagnosticRepository.claimNextRewardOperation({ now: clock() });
      if (!task) return 'idle';
      if (task.operationType === 'reward.update') return processRewardUpdateTask({ repository: diagnosticRepository, adapter, task, clock, random });
      if (task.operationType === 'reward.set_open') return processOpenStateTask({ repository: diagnosticRepository, adapter, task, clock, random });
      if (task.operationType === 'reward.delete') return processDeleteTask({ repository: diagnosticRepository, adapter, task, clock, random });
      if (task.operationType !== 'reward.create' || !task.queue || task.queue.lifecycleStatus !== 'active') {
        await diagnosticRepository.failedRewardOperation(task.id, 'reward_operation_not_supported', task.leaseToken);
        return 'failed';
      }

      let eligibility;
      try {
        eligibility = await adapter.getChannelEligibility();
      } catch {
        await diagnosticRepository.retryRewardOperation(task.id, {
          nextAttemptAt: new Date(clock().getTime() + retryDelay({}, task.attempts, random)),
          errorCode: 'channel_eligibility_unavailable',
        }, task.leaseToken);
        return 'retry';
      }
      if (eligibility.eligible !== true) {
        await diagnosticRepository.failedRewardOperation(task.id, eligibility.reason === 'channel_points_unavailable' ? 'channel_points_unavailable' : 'channel_ineligible', task.leaseToken);
        return 'failed';
      }
      if (eligibility.channelPointsAvailable !== true || !Number.isInteger(eligibility.rewardCount) || !Number.isInteger(eligibility.rewardLimit)) {
        await diagnosticRepository.retryRewardOperation(task.id, {
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
        await diagnosticRepository.retryRewardOperation(task.id, {
          nextAttemptAt: new Date(clock().getTime() + retryDelay({}, task.attempts, random)),
          errorCode: 'managed_reward_lookup_failed',
        }, task.leaseToken);
        return 'retry';
      }

      if (task.payload?.requestMayHaveReachedTwitch === true) {
        if (!Array.isArray(savedBaseline)) {
          await diagnosticRepository.unknownRewardOperation(task.id, 'reward_create_association_ambiguous', task.leaseToken);
          return 'unknown';
        }
        const matches = findNewMatches(rewards, task.queue, savedBaseline);
        if (matches.length !== 1) {
          await diagnosticRepository.unknownRewardOperation(task.id, matches.length ? 'reward_create_association_ambiguous' : 'reward_create_result_unknown', task.leaseToken);
          return 'unknown';
        }
        return pauseAndConfirmCreatedReward({ repository: diagnosticRepository, adapter, task, rewardId: matches[0].id, clock, random });
      }

      const baselineRewardIds = rewards.map(({ id }) => id);
      const prepared = await diagnosticRepository.prepareRewardCreate(task.id, { baselineRewardIds, requestMayHaveReachedTwitch: true }, task.leaseToken);
      if (prepared === false) return 'lease_lost';
      const rewardRequest = {
        title: task.queue.title,
        cost: task.queue.cost,
        prompt: task.queue.rewardPrompt,
        userInputRequired: task.queue.uidMode === 'visible',
        maxRedemptionsPerStream: task.queue.maxRedemptionsPerStream ?? null,
        maxRedemptionsPerUserPerStream: task.queue.maxRedemptionsPerUserPerStream ?? null,
        globalCooldown: task.queue.globalCooldownSeconds ?? null,
        autoFulfill: false,
        isEnabled: false,
      };
      try {
        const created = await adapter.createReward(rewardRequest);
        if (!created?.id || !matchesRequestedRewardConfiguration(created, task.queue)) {
          await diagnosticRepository.unknownRewardOperation(task.id, 'reward_create_response_unverified', task.leaseToken);
          return 'unknown';
        }
        return pauseAndConfirmCreatedReward({ repository: diagnosticRepository, adapter, task, rewardId: created.id, clock, random });
      } catch (error) {
        if (httpStatus(error) === 429) {
          const delayMs = retryDelay(error, task.attempts, random);
          await diagnosticRepository.retryRewardOperation(task.id, {
            nextAttemptAt: new Date(clock().getTime() + delayMs),
            errorCode: safeError(error, 'reward_create_rate_limited'),
            payloadUpdates: { requestMayHaveReachedTwitch: false },
          }, task.leaseToken);
          return 'retry';
        }
        if (isPermanentFailure(error)) {
          await diagnosticRepository.failedRewardOperation(task.id, safeError(error, 'reward_create_rejected'), task.leaseToken);
          return 'failed';
        }
        let currentRewards;
        try { currentRewards = await adapter.getManagedRewards(); } catch {
          await diagnosticRepository.unknownRewardOperation(task.id, 'reward_create_result_unknown', task.leaseToken);
          return 'unknown';
        }
        const matches = findNewMatches(currentRewards, task.queue, baselineRewardIds);
        if (matches.length !== 1) {
          await diagnosticRepository.unknownRewardOperation(task.id, matches.length ? 'reward_create_association_ambiguous' : 'reward_create_result_unknown', task.leaseToken);
          return 'unknown';
        }
        return pauseAndConfirmCreatedReward({ repository: diagnosticRepository, adapter, task, rewardId: matches[0].id, clock, random });
      }
    },
  };
}

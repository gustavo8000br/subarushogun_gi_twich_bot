const LIMIT_KEYS = Object.freeze([
  'maxRedemptionsPerStream', 'maxRedemptionsPerUserPerStream', 'globalCooldownSeconds',
]);

function invalidRequest() {
  return Object.assign(new Error('The reward settings request is invalid.'), { code: 'INVALID_REWARD_SETTINGS_REQUEST' });
}

function invalidResponse() {
  return Object.assign(new Error('The reward settings response is invalid.'), { code: 'INVALID_REWARD_SETTINGS_RESPONSE' });
}

function validLimit(value) {
  return value === null || (Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647);
}

function hasControlCharacters(value) {
  return [...value].some((character) => {
    const code = character.codePointAt(0);
    return code < 32 || code === 127;
  });
}

/** @param {{request:(path:string, options?:object)=>Promise<any>, queueId:string, settings:Record<string, any>}} input */
export async function updateQueueRewardSettings({ request, queueId, settings }) {
  if (typeof queueId !== 'string' || !queueId || !settings || typeof settings !== 'object'
    || !Number.isSafeInteger(settings.expectedVersion) || settings.expectedVersion < 1
    || typeof settings.title !== 'string' || !settings.title.trim() || settings.title.trim().length > 45
    || !Number.isSafeInteger(settings.cost) || settings.cost < 1 || settings.cost > 2_147_483_647
    || typeof settings.rewardPrompt !== 'string' || settings.rewardPrompt.trim().length > 200
    || hasControlCharacters(settings.rewardPrompt)
    || !['hidden', 'visible'].includes(settings.uidMode)
    || LIMIT_KEYS.some((key) => !(key in settings) || !validLimit(settings[key]))) throw invalidRequest();

  const response = await request(`/api/queues/${encodeURIComponent(queueId)}/reward-settings`, {
    method: 'PATCH', body: JSON.stringify(settings),
  });
  if (!response || response.operationStatus !== 'pending' || response.remoteSyncStatus !== 'pending_update'
    || response.version !== settings.expectedVersion + 1) throw invalidResponse();
  return response;
}

/** @param {unknown} error */
export function getQueueRewardSettingsFailureKey(error) {
  const requestError = error && typeof error === 'object' ? /** @type {Record<string, unknown>} */ (error) : {};
  if (requestError.code === 'INVALID_REWARD_SETTINGS' || requestError.status === 400) return 'panel.error.invalid_reward_settings';
  if (requestError.code === 'STALE_QUEUE_VERSION') return 'panel.error.stale_queue_settings';
  if (requestError.code === 'QUEUE_REWARD_UPDATE_PENDING') return 'panel.error.reward_update_pending';
  if (requestError.code === 'QUEUE_REWARD_NOT_READY') return 'panel.error.reward_not_ready';
  if (requestError.code === 'QUEUE_NOT_AVAILABLE') return 'panel.error.queue_not_available';
  if (requestError.code === 'QUEUE_NOT_FOUND') return 'panel.error.queue_not_found';
  return 'panel.error.generic';
}

/** @param {unknown} error */
export function getQueueRewardSettingsFailureFeedback(error) {
  const requestError = error && typeof error === 'object' ? /** @type {Record<string, unknown>} */ (error) : {};
  return {
    key: getQueueRewardSettingsFailureKey(requestError),
    referenceId: typeof requestError.referenceId === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(requestError.referenceId)
      ? requestError.referenceId
      : null,
  };
}

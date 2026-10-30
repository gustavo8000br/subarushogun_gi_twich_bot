import { getQueueActionState } from '../../../shared/panel/queue-action-state.mjs';
import { canRetryQueueSettingsAfterVersionBump } from '../../../shared/panel/queue-settings-version.mjs';

export const QUEUE_SETTING_KEYS = Object.freeze([
  'callTimeoutMin', 'callMessage', 'showUidInList', 'showUidInOverlay', 'showUidOnCall',
  'refundIfRemovedWhileCalled', 'refundOnNoShow', 'refundIfViewerLeavesCalled',
]);

/** @param {Record<string, unknown>} current @param {Record<string, unknown>} baseline */
export function queueSettingsMatch(current, baseline) {
  return QUEUE_SETTING_KEYS.every((key) => current[key] === baseline[key]);
}

/** @param {{current:Record<string,unknown>, draftBase:{queueId:string,version:number,settings:Record<string,unknown>}, queueId:string, queueVersion:number, projectedSettings:Record<string,unknown>}} input */
export function reconcileQueueSettingsDraft({ current, draftBase, queueId, queueVersion, projectedSettings }) {
  if (draftBase.queueId !== queueId || draftBase.version === queueVersion || !queueSettingsMatch(current, draftBase.settings)) return null;
  return { queueId, version: queueVersion, settings: projectedSettings };
}

function invalidQueueSettings() {
  return Object.assign(new Error('The local queue settings are invalid.'), { code: 'INVALID_QUEUE_SETTINGS' });
}

/** @param {Record<string, unknown>} values */
export function buildQueueSettingsPayload(values) {
  const expectedVersion = Number(String(values.expectedVersion ?? '').trim());
  const timeoutText = String(values.callTimeoutMin ?? '').trim();
  const callTimeoutMin = timeoutText ? Number(timeoutText) : null;
  const callMessage = String(values.callMessage ?? '');
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1
    || (callTimeoutMin !== null && (!Number.isInteger(callTimeoutMin) || callTimeoutMin < 1 || callTimeoutMin > 120))
    || callMessage.length > 350 || [...callMessage].some((character) => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f)) {
    throw invalidQueueSettings();
  }
  const payload = { expectedVersion, callTimeoutMin, callMessage };
  for (const key of QUEUE_SETTING_KEYS.slice(2)) {
    const value = values[key];
    const validBooleanInput = value === undefined || value === null || value === ''
      || value === 'on' || value === 'true' || value === 'false' || typeof value === 'boolean';
    if (!validBooleanInput) throw invalidQueueSettings();
    payload[key] = value === true || value === 'on' || value === 'true';
  }
  return payload;
}

function validSavedSettings(value, queueId) {
  return Boolean(value && typeof value === 'object' && value.id === queueId && Number.isInteger(value.version) && value.version > 0);
}

/** @param {{request:(path:string, options?:object)=>Promise<any>, queueId:string, values:Record<string,unknown>, baselineSettings:Record<string,unknown>}} input */
export async function saveQueueSettingsWithRetry({ request, queueId, values, baselineSettings }) {
  const payload = buildQueueSettingsPayload(values);
  const path = `/api/queues/${encodeURIComponent(queueId)}/settings`;
  let queue;
  let retried = false;
  try {
    queue = await request(path, { method: 'PATCH', body: JSON.stringify(payload) });
  } catch (error) {
    if (error?.status !== 409) throw error;
    const latestProjection = await request('/api/queues').catch(() => null);
    const latestQueue = Array.isArray(latestProjection) ? latestProjection.find((candidate) => candidate.id === queueId) : null;
    if (!canRetryQueueSettingsAfterVersionBump({ expectedVersion: payload.expectedVersion, baselineSettings, latestQueue: latestQueue ?? null })) throw error;
    queue = await request(path, { method: 'PATCH', body: JSON.stringify({ ...payload, expectedVersion: latestQueue.version }) });
    retried = true;
  }
  if (!validSavedSettings(queue, queueId)) {
    throw Object.assign(new Error('The saved queue settings response is invalid.'), { code: 'INVALID_QUEUE_SETTINGS_RESPONSE' });
  }
  return { queue, retried };
}

const REWARD_PENDING_STATES = new Set(['pending', 'pending_create', 'create_unknown', 'pending_open', 'pending_close', 'open_unknown']);

/** @param {{refreshFailed:boolean, queue?: Record<string, any>|null}} input */
export function getQueueSettingsFeedback({ refreshFailed, queue = null }) {
  if (refreshFailed) return { status: 'warning', key: 'panel.queue.settings_result.refresh_failed' };
  if (queue && !queue.isOpen && !queue.isArchived) {
    // Guidance follows the same rule that enables the activate button; activation is never automatic.
    if (getQueueActionState(queue).canToggleIntake) return { status: 'confirmed', key: 'panel.queue.onboarding.activate_next', focusActivate: true };
    if (REWARD_PENDING_STATES.has(queue.remoteSyncStatus)) return { status: 'confirmed', key: 'panel.queue.onboarding.activate_waiting' };
  }
  return { status: 'confirmed', key: 'panel.notice.queue_settings_saved' };
}

/** @param {unknown} error */
export function getQueueSettingsFailureKey(error) {
  const requestError = error && typeof error === 'object' ? /** @type {Record<string, unknown>} */ (error) : {};
  if (requestError.code === 'INVALID_CALL_MESSAGE_TEMPLATE') return 'panel.error.invalid_call_template';
  if (requestError.code === 'INVALID_QUEUE_SETTINGS' || requestError.status === 400) return 'panel.error.invalid_queue_settings';
  if (requestError.status === 409) return 'panel.error.stale_queue_settings';
  return 'panel.error.generic';
}

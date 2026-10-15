const QUEUE_KEY = /^[a-z0-9-]{2,24}$/;
const UID_MODES = new Set(['hidden', 'visible']);
const QUEUE_MODES = new Set(['channel_points', 'manual_only']);
const BENEFIT_LIMIT = 2_147_483_647;

function invalidQueueCreation() {
  return Object.assign(new Error('The queue creation input is invalid.'), { code: 'INVALID_QUEUE_CREATION' });
}

function optionalPositiveInteger(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return undefined;
  const number = Number(normalized);
  if (!Number.isInteger(number) || number < 1 || number > BENEFIT_LIMIT) throw invalidQueueCreation();
  return number;
}

/** @param {Record<string, unknown>} values */
export function buildQueueCreationPayload(values) {
  const title = String(values.title ?? '').trim();
  const slug = String(values.slug ?? '').trim().toLowerCase();
  const aliases = String(values.aliases ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const queueMode = String(values.queueMode ?? 'channel_points');
  const uidMode = String(values.uidMode ?? 'hidden');
  const callTimeoutMin = Number(String(values.callTimeoutMin ?? '10').trim() || 10);
  if (!title || title.length > 45 || !QUEUE_KEY.test(slug) || aliases.some((alias) => !QUEUE_KEY.test(alias))
    || new Set([slug, ...aliases]).size !== aliases.length + 1 || !QUEUE_MODES.has(queueMode)
    || !UID_MODES.has(uidMode) || !Number.isInteger(callTimeoutMin) || callTimeoutMin < 1 || callTimeoutMin > 120) {
    throw invalidQueueCreation();
  }
  const payload = { title, slug, aliases, queueMode, callTimeoutMin, uidMode };
  if (queueMode === 'channel_points') {
    const cost = Number(String(values.cost ?? '').trim());
    const rewardPrompt = String(values.rewardPrompt ?? '').trim();
    if (!Number.isInteger(cost) || cost < 1 || rewardPrompt.length > 180) throw invalidQueueCreation();
    Object.assign(payload, { cost, rewardPrompt });
    for (const field of ['maxRedemptionsPerStream', 'maxRedemptionsPerUserPerStream', 'globalCooldownSeconds']) {
      const value = optionalPositiveInteger(values[field]);
      if (value !== undefined) payload[field] = value;
    }
  }
  return payload;
}

/** @param {unknown} value */
export function isQueueCreationResponse(value) {
  if (!value || typeof value !== 'object') return false;
  const queue = /** @type {Record<string, unknown>} */ (value);
  return typeof queue.id === 'string' && queue.id.length > 0
    && typeof queue.slug === 'string' && queue.slug.length > 0
    && typeof queue.title === 'string' && queue.title.length > 0
    && QUEUE_MODES.has(/** @type {string} */ (queue.queueMode))
    && typeof queue.isOpen === 'boolean';
}

/** @param {{request: (path: string, options?: object) => Promise<any>, formValues: Record<string, unknown>}} input */
export async function createQueueWithRefresh({ request, formValues }) {
  const payload = buildQueueCreationPayload(formValues);
  let queue;
  let recovered = false;
  try {
    queue = await request('/api/queues', { method: 'POST', body: JSON.stringify(payload) });
  } catch (error) {
    if (error?.code === 'REQUEST_FAILED' && error?.status === 0) throw error;
    if (typeof error?.status === 'number' && error.status < 500) throw error;
    const current = await request('/api/queues').catch(() => null);
    queue = Array.isArray(current) ? current.find((item) => item.slug === payload.slug && item.title === payload.title) : null;
    if (!queue) {
      return {
        queue: null, queues: Array.isArray(current) ? current : null,
        refreshFailed: !Array.isArray(current), recovered: false, uncertain: true,
        ...(typeof error?.referenceId === 'string' ? { referenceId: error.referenceId } : {}),
      };
    }
    recovered = true;
  }
  if (!isQueueCreationResponse(queue)) {
    throw Object.assign(new Error('The queue creation response is invalid.'), { code: 'INVALID_QUEUE_CREATION_RESPONSE' });
  }
  let queues = null;
  let refreshFailed = false;
  try {
    const projection = await request('/api/queues');
    if (!Array.isArray(projection)) throw new TypeError('The queue projection is invalid.');
    queues = [queue, ...projection.filter((item) => item.id !== queue.id)];
  } catch {
    refreshFailed = true;
  }
  return { queue, queues, refreshFailed, recovered };
}

/** @param {unknown} error */
export function getQueueCreationFailureKey(error) {
  const requestError = error && typeof error === 'object' ? /** @type {Record<string, unknown>} */ (error) : {};
  if (requestError.code === 'INVALID_QUEUE_CREATION' || requestError.status === 400) return 'panel.error.invalid_queue_settings';
  if (requestError.status === 409) return 'panel.queue.creation_result.key_conflict';
  if (typeof requestError.status === 'number' && requestError.status >= 500 && requestError.referenceId) return 'panel.error.reference';
  return 'panel.error.generic';
}

/** @param {{queue: Record<string, any>|null, refreshFailed: boolean, recovered: boolean, uncertain?: boolean}} input */
export function getQueueCreationFeedback({ queue, refreshFailed, recovered, uncertain = false }) {
  if (uncertain) return { status: 'uncertain', key: 'panel.queue.creation_result.uncertain' };
  if (refreshFailed) return { status: 'warning', key: 'panel.queue.creation_result.refresh_failed' };
  if (recovered) return { status: 'warning', key: 'panel.queue.creation_result.recovered' };
  if (queue.queueMode === 'manual_only') return { status: 'confirmed', key: 'panel.queue.creation_result.created_local' };
  if (['synced', 'synced_manual'].includes(queue.remoteSyncStatus)) {
    return { status: 'confirmed', key: 'panel.queue.creation_result.created_remote' };
  }
  if (['pending_create', 'create_pending'].includes(queue.remoteSyncStatus)) {
    return { status: 'pending', key: 'panel.queue.creation_result.pending' };
  }
  return { status: 'warning', key: 'panel.queue.creation_result.review' };
}

import { normalizeRewardCandidates } from '../../../shared/panel/reward-link-dialog.mjs';

function invalidResponse() {
  return Object.assign(new Error('The reward resolution response is invalid.'), { code: 'INVALID_QUEUE_REWARD_RESOLUTION_RESPONSE' });
}

/** @param {{request:(path:string, options?:object)=>Promise<any>, queueId:string}} input */
export async function loadQueueRewardCandidates({ request, queueId }) {
  if (typeof queueId !== 'string' || !queueId) throw Object.assign(new Error('The reward lookup request is invalid.'), { code: 'INVALID_QUEUE_REWARD_RESOLUTION_REQUEST' });
  const response = await request(`/api/queues/${encodeURIComponent(queueId)}/reward-candidates`);
  if (!response || typeof response !== 'object' || !Array.isArray(response.candidates)) throw invalidResponse();
  const normalized = normalizeRewardCandidates(response);
  if (normalized.candidates.length !== response.candidates.length || !normalized.diagnostics) throw invalidResponse();
  return normalized;
}

/** @param {{request:(path:string, options?:object)=>Promise<any>, queueId:string, rewardId:string}} input */
export async function resolveQueueReward({ request, queueId, rewardId }) {
  if (typeof queueId !== 'string' || !queueId || typeof rewardId !== 'string' || !rewardId || rewardId.length > 128) {
    throw Object.assign(new Error('The reward association request is invalid.'), { code: 'INVALID_QUEUE_REWARD_RESOLUTION_REQUEST' });
  }
  const result = await request(`/api/queues/${encodeURIComponent(queueId)}/resolve-reward`, {
    method: 'POST', body: JSON.stringify({ rewardId }),
  });
  if (result?.status !== 'resolved' || result.remoteConfirmed !== false) throw invalidResponse();
  return result;
}

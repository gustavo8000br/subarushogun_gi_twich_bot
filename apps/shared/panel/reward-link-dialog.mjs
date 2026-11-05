const ALLOWED_REASONS = new Set([
  'title_mismatch', 'cost_mismatch', 'prompt_mismatch', 'uid_input_mismatch',
  'max_redemptions_per_stream_mismatch', 'max_redemptions_per_user_per_stream_mismatch',
  'global_cooldown_mismatch', 'auto_fulfill_enabled', 'auto_fulfill_unknown',
  'skip_request_queue_enabled', 'skip_request_queue_unknown', 'reward_disabled',
  'reward_enabled_unknown', 'reward_not_paused', 'reward_pause_unknown',
  'title_unknown', 'cost_unknown', 'prompt_unknown', 'userInputRequired_unknown',
  'maxRedemptionsPerStream_unknown', 'maxRedemptionsPerUserPerStream_unknown',
  'globalCooldown_unknown', 'reward_not_managed',
]);

function normalizeCandidates(candidates) {
  if (!Array.isArray(candidates)) return [];
  return candidates.filter((candidate) => candidate
    && typeof candidate.id === 'string' && candidate.id.length > 0
    && typeof candidate.title === 'string' && candidate.title.length > 0
    && Number.isSafeInteger(candidate.cost) && candidate.cost > 0
    && typeof candidate.prompt === 'string')
    .map(({ id, title, cost, prompt }) => ({ id, title, cost, prompt }));
}

/** @param {unknown} response */
export function normalizeRewardCandidates(response) {
  if (Array.isArray(response)) return { candidates: normalizeCandidates(response), diagnostics: null };
  if (!response || typeof response !== 'object') return { candidates: [], diagnostics: null };
  const payload = /** @type {Record<string, any>} */ (response);
  const candidates = normalizeCandidates(payload.candidates);
  const raw = payload.diagnostics;
  if (!raw || typeof raw !== 'object' || !Number.isSafeInteger(raw.managedRewardCount) || raw.managedRewardCount < 0 || !raw.mismatchCounts || typeof raw.mismatchCounts !== 'object') {
    return { candidates, diagnostics: null };
  }
  const mismatchCounts = Object.fromEntries(Object.entries(raw.mismatchCounts)
    .filter(([reason, count]) => ALLOWED_REASONS.has(reason) && Number.isSafeInteger(count) && count >= 0)
    .sort(([left], [right]) => left.localeCompare(right)));
  return { candidates, diagnostics: { managedRewardCount: raw.managedRewardCount, mismatchCounts } };
}

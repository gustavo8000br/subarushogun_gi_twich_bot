export function normalizeRedemptionStatus(status) {
  const normalized = String(status ?? 'unknown').toUpperCase();
  if (['UNFULFILLED', 'FULFILLED', 'CANCELED'].includes(normalized)) return normalized;
  return 'UNKNOWN';
}

export function normalizeRewardCreateInput(data) {
  return {
    ...data,
    autoFulfill: false,
    should_redemptions_skip_request_queue: false,
  };
}

function redemptionStatus(value) {
  if (value?.isFulfilled === true) return 'FULFILLED';
  if (value?.isCanceled === true) return 'CANCELED';
  return normalizeRedemptionStatus(value?.status);
}

function rewardProjection(reward) {
  const skipRequestQueue = reward.shouldRedemptionsSkipRequestQueue
    ?? reward.should_redemptions_skip_request_queue
    ?? reward.autoFulfill;
  return {
    id: reward.id,
    title: reward.title,
    cost: reward.cost,
    prompt: reward.prompt,
    isEnabled: reward.isEnabled ?? reward.is_enabled,
    isPaused: reward.isPaused ?? reward.is_paused,
    isInStock: reward.isInStock ?? reward.is_in_stock,
    userInputRequired: reward.userInputRequired ?? reward.is_user_input_required,
    autoFulfill: reward.autoFulfill ?? reward.shouldRedemptionsSkipRequestQueue ?? reward.should_redemptions_skip_request_queue,
    maxRedemptionsPerStream: reward.maxRedemptionsPerStream ?? null,
    maxRedemptionsPerUserPerStream: reward.maxRedemptionsPerUserPerStream ?? null,
    globalCooldown: reward.globalCooldown ?? null,
    shouldRedemptionsSkipRequestQueue: skipRequestQueue,
  };
}

/** @param {{api: Record<string, any>, broadcasterId: string, authProvider?: {getCurrentScopesForUser?: (userId: string) => string[]}}} dependencies */
export function createTwitchApiAdapter({ api, broadcasterId, authProvider }) {
  const followerChecks = new Map();
  async function checkFollower(userId) {
    if (typeof userId !== 'string' || !/^\d{1,32}$/.test(userId)
        || typeof broadcasterId !== 'string' || !/^\d{1,32}$/.test(broadcasterId)) return 'unknown';
    if (followerChecks.has(userId)) return followerChecks.get(userId);
    const check = (async () => {
      try {
        const scopes = authProvider?.getCurrentScopesForUser?.(broadcasterId);
        if (!Array.isArray(scopes) || !scopes.includes('moderator:read:followers')) return 'unknown';
        if (typeof api.channels?.getChannelFollowers !== 'function') return 'unknown';
        const result = await api.channels.getChannelFollowers(broadcasterId, userId);
        if (!Array.isArray(result?.data) || result.data.some((follower) => typeof follower?.userId !== 'string' || follower.userId !== userId)) return 'unknown';
        return result.data.length > 0 ? 'follower' : 'not_follower';
      } catch { return 'unknown'; }
    })();
    followerChecks.set(userId, check);
    try { return await check; } finally { if (followerChecks.get(userId) === check) followerChecks.delete(userId); }
  }
  return {
    checkFollower,
    async ping() {
      const user = await api.users.getUserById(broadcasterId);
      if (!user) throw new Error('Twitch API health probe did not find the configured broadcaster');
      return true;
    },
    async createReward(data) {
      return rewardProjection(await api.channelPoints.createCustomReward(broadcasterId, normalizeRewardCreateInput(data)));
    },
    async updateReward(rewardId, data) {
      return rewardProjection(await api.channelPoints.updateCustomReward(broadcasterId, rewardId, { ...data, autoFulfill: false }));
    },
    async setRewardOpen(rewardId, isOpen) {
      if (typeof api.channelPoints?.updateCustomReward !== 'function'
          || typeof api.channelPoints?.getCustomRewardById !== 'function') {
        throw Object.assign(new Error('Twitch reward update is not configured'), { status: 401, code: 'TWITCH_REWARD_UPDATE_NOT_CONFIGURED' });
      }
      const updatedReward = await api.channelPoints.updateCustomReward(broadcasterId, rewardId, {
        isPaused: !isOpen,
        autoFulfill: false,
      });
      if (!updatedReward || updatedReward.id !== rewardId) {
        throw Object.assign(new Error('Twitch reward update response is invalid'), { code: 'TWITCH_REWARD_RESPONSE_INVALID' });
      }
      // Helix can acknowledge PATCH while its response still reflects stale state.
      // The caller uses this projection to confirm financial/reward lifecycle state,
      // so read the persisted reward before reporting success.
      const persistedReward = await api.channelPoints.getCustomRewardById(broadcasterId, rewardId);
      if (!persistedReward || persistedReward.id !== rewardId) {
        throw Object.assign(new Error('Twitch reward state could not be verified after update'), { code: 'TWITCH_REWARD_STATE_UNVERIFIED' });
      }
      return rewardProjection(persistedReward);
    },
    async deleteReward(rewardId) {
      return api.channelPoints.deleteCustomReward(broadcasterId, rewardId);
    },
    async getManagedRewards() {
      return (await api.channelPoints.getCustomRewards(broadcasterId, true)).map(rewardProjection);
    },
    async getReward(rewardId) {
      const reward = await api.channelPoints.getCustomRewardById(broadcasterId, rewardId);
      return reward ? rewardProjection(reward) : null;
    },
    async getChannelEligibility() {
      const user = await api.users.getUserById(broadcasterId);
      const broadcasterType = String(user?.broadcasterType ?? '').toLowerCase() || 'unknown';
      let rewards;
      try {
        rewards = await api.channelPoints.getCustomRewards(broadcasterId, false);
      } catch (error) {
        const status = error?.statusCode ?? error?.status;
        if (status === 401) {
          return { eligible: false, broadcasterType, channelPointsAvailable: false, reason: 'access_token_invalid' };
        }
        if (status === 403) {
          return { eligible: false, broadcasterType, channelPointsAvailable: false, reason: 'channel_ineligible' };
        }
        return { eligible: false, broadcasterType, channelPointsAvailable: false, reason: 'channel_points_unavailable' };
      }
      const rewardCount = rewards.length;
      return {
        eligible: true, broadcasterType, channelPointsAvailable: true, rewardCount, rewardLimit: 50,
        nearRewardLimit: rewardCount >= 45,
      };
    },
    async getRedemptionStatus(redemptionId, rewardId) {
      const redemption = await api.channelPoints.getRedemptionById(broadcasterId, rewardId, redemptionId);
      if (!redemption) throw Object.assign(new Error('Redemption status is unavailable'), { status: 404, code: 'REDEMPTION_NOT_FOUND' });
      return redemptionStatus(redemption);
    },
    async setRedemptionStatus(redemptionId, status, rewardId) {
      const targetStatus = normalizeRedemptionStatus(status);
      if (!['FULFILLED', 'CANCELED'].includes(targetStatus)) throw Object.assign(new Error('Invalid redemption target status'), { code: 'INVALID_REDEMPTION_STATUS' });
      const result = await api.channelPoints.updateRedemptionStatusByIds(broadcasterId, rewardId, [redemptionId], targetStatus);
      return result.length ? { status: redemptionStatus(result[0]) } : { status: 'UNKNOWN' };
    },
    async listUnfulfilledRedemptions(rewardId) {
      const paginator = api.channelPoints.getRedemptionsForBroadcasterPaginated(
        broadcasterId, rewardId, 'UNFULFILLED', { limit: 50, newestFirst: false },
      );
      const redemptions = [];
      for await (const item of paginator) {
        redemptions.push({
          id: item.id,
          broadcasterId: item.broadcasterId,
          rewardId: item.rewardId,
          userId: item.userId,
          userLogin: item.userName.toLowerCase(),
          displayName: item.userDisplayName,
          userInput: item.userInput,
          status: redemptionStatus(item),
          redeemedAt: item.redemptionDate,
        });
      }
      return redemptions;
    },
    async getUserByLogin(login) {
      const user = await api.users.getUserByName(login.replace(/^@/, '').toLowerCase());
      return user ? { id: user.id, login: user.name.toLowerCase(), displayName: user.displayName } : null;
    },
    async sendChatMessage(message) {
      const result = await api.chat.sendChatMessage(broadcasterId, message);
      return { sent: result.isSent, messageId: result.id, dropReasonCode: result.dropReasonCode };
    },
  };
}

export function normalizeRedemptionStatus(status) {
  const normalized = String(status ?? 'unknown').toUpperCase();
  if (['UNFULFILLED', 'FULFILLED', 'CANCELED'].includes(normalized)) return normalized;
  return 'UNKNOWN';
}

function redemptionStatus(value) {
  if (value?.isFulfilled === true) return 'FULFILLED';
  if (value?.isCanceled === true) return 'CANCELED';
  return normalizeRedemptionStatus(value?.status);
}

function rewardProjection(reward) {
  return {
    id: reward.id,
    title: reward.title,
    cost: reward.cost,
    prompt: reward.prompt,
    isEnabled: reward.isEnabled,
    isPaused: reward.isPaused,
    userInputRequired: reward.userInputRequired,
    autoFulfill: reward.autoFulfill,
    shouldRedemptionsSkipRequestQueue: reward.shouldRedemptionsSkipRequestQueue ?? reward.should_redemptions_skip_request_queue ?? false,
  };
}

/** @param {{api: Record<string, any>, broadcasterId: string}} dependencies */
export function createTwitchApiAdapter({ api, broadcasterId }) {
  return {
    async createReward(data) {
      return rewardProjection(await api.channelPoints.createCustomReward(broadcasterId, { ...data, autoFulfill: false }));
    },
    async updateReward(rewardId, data) {
      return rewardProjection(await api.channelPoints.updateCustomReward(broadcasterId, rewardId, { ...data, autoFulfill: false }));
    },
    async setRewardOpen(rewardId, isOpen) {
      return rewardProjection(await api.channelPoints.updateCustomReward(broadcasterId, rewardId, {
        isEnabled: true, isPaused: !isOpen, autoFulfill: false,
      }));
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
      return { eligible: user?.broadcasterType === 'affiliate' || user?.broadcasterType === 'partner', broadcasterType: user?.broadcasterType ?? 'unknown' };
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

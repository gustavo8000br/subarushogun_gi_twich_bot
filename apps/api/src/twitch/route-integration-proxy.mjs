/** @param {() => Record<string, any>|null|undefined} getIntegration */
export function createTwitchRouteIntegrationProxy(getIntegration) {
  return {
    get twitch() { return getIntegration()?.twitch ?? null; },
    get status() { return getIntegration()?.status ?? 'not_configured'; },
    get chatStatus() { return getIntegration()?.chatStatus ?? 'not_configured'; },
    get rewardStatus() { return getIntegration()?.rewardStatus ?? 'unknown'; },
    async getSetupState() { return getIntegration()?.getSetupState?.(); },
    async validateAndSaveApplication(input) { return getIntegration()?.validateAndSaveApplication?.(input); },
    async beginAuthorization(sessionId) { return getIntegration()?.beginAuthorization?.(sessionId); },
    async beginFollowerAuthorization(input) { return getIntegration()?.beginFollowerAuthorization?.(input); },
    async completeAuthorization(input) { return getIntegration()?.completeAuthorization?.(input); },
    async reconcileNow() { return getIntegration()?.reconcileNow?.(); },
  };
}

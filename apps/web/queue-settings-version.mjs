/** @param {{expectedVersion:number,baselineSettings:Record<string,unknown>,latestQueue:Record<string,any>|null}} input */
export function canRetryQueueSettingsAfterVersionBump(input) {
  const { expectedVersion, baselineSettings, latestQueue } = input;
  const settingKeys = [
    'callTimeoutMin', 'callMessage', 'showUidInList', 'showUidInOverlay', 'showUidOnCall',
    'autoSwitchAccount', 'refundIfRemovedWhileCalled', 'refundOnNoShow', 'refundIfViewerLeavesCalled',
  ];
  if (!latestQueue || !Number.isInteger(expectedVersion) || !Number.isInteger(latestQueue.version)
      || latestQueue.version <= expectedVersion || latestQueue.lifecycleStatus !== 'active' || latestQueue.isOpen !== false
      || settingKeys.some((key) => !Object.hasOwn(baselineSettings, key))) return false;
  return settingKeys.every((key) => Object.is(latestQueue[key], baselineSettings[key]));
}

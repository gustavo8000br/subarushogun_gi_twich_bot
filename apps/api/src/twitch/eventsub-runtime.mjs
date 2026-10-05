import { EventSubWsListener } from '@twurple/eventsub-ws';
import { normalizeRedemptionStatus } from './helix-adapter.mjs';

/** @param {{apiClient: any, broadcasterId: string, listenerFactory?: (apiClient: any) => any, onRedemptionAdd: (event: object) => unknown, onRedemptionUpdate: (event: object) => unknown, onChatMessage: (event: object) => unknown, onReady?: () => unknown, onReconnected?: () => unknown, onRevoked?: (type: string, status: string) => unknown, onError?: (code: string) => unknown}} input */
export function createEventSubRuntime({
  apiClient, broadcasterId, listenerFactory = (client) => new EventSubWsListener({ apiClient: client }),
  onRedemptionAdd, onRedemptionUpdate, onChatMessage, onReady = () => undefined, onReconnected = () => undefined,
  onRevoked = () => undefined, onError = () => undefined,
}) {
  const listener = listenerFactory(apiClient);
  let disconnected = false;
  let stopped = false;
  let didConnect = false;
  const dispatch = (handler, ...args) => {
    try {
      Promise.resolve(handler(...args)).catch(() => onError('event_handler_failed'));
    } catch {
      onError('event_handler_failed');
    }
  };
  listener.onChannelRedemptionAdd(broadcasterId, (event) => {
    if (event.broadcasterId !== broadcasterId) return;
    dispatch(onRedemptionAdd, {
      id: event.id,
      broadcasterId: event.broadcasterId,
      rewardId: event.rewardId,
      userId: event.userId,
      userLogin: event.userName?.toLowerCase(),
      displayName: event.userDisplayName,
      userInput: event.input,
      status: normalizeRedemptionStatus(event.status),
      redeemedAt: event.redemptionDate,
    });
  });
  listener.onChannelRedemptionUpdate(broadcasterId, (event) => {
    if (event.broadcasterId !== broadcasterId) return;
    dispatch(onRedemptionUpdate, {
    id: event.id,
    broadcasterId: event.broadcasterId,
    rewardId: event.rewardId,
    userId: event.userId,
    userLogin: event.userName?.toLowerCase(),
    displayName: event.userDisplayName,
    redeemedAt: event.redemptionDate,
    status: normalizeRedemptionStatus(event.status),
  });
  });
  listener.onChannelChatMessage(broadcasterId, broadcasterId, (event) => {
    if (event.broadcasterId !== broadcasterId) return;
    if (event.sourceBroadcasterId && event.sourceBroadcasterId !== broadcasterId) return;
    dispatch(onChatMessage, {
      id: event.messageId,
      broadcasterId: event.broadcasterId,
      channelId: event.broadcasterId,
      chatterId: event.chatterId,
      userId: event.chatterId,
      userLogin: event.chatterName?.toLowerCase(),
      displayName: event.chatterDisplayName,
      text: event.messageText,
      badges: event.badges,
      sourceBroadcasterId: event.sourceBroadcasterId ?? null,
    });
  });
  listener.onUserSocketDisconnect((userId) => {
    if (userId === broadcasterId) disconnected = true;
  });
  listener.onUserSocketReady((userId) => {
    if (userId !== broadcasterId || stopped) return;
    if (!didConnect) {
      didConnect = true;
      dispatch(onReady);
      return;
    }
    if (!disconnected) return;
    disconnected = false;
    dispatch(onReconnected, undefined);
  });
  listener.onRevoke((subscription, status) => {
    dispatch(onRevoked, subscription?.type ?? 'unknown', status);
  });
  listener.start();
  return {
    listener,
    stop() {
      stopped = true;
      listener.stop();
    },
  };
}

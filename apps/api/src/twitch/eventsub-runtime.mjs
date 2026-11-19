import { EventSubWsListener } from '@twurple/eventsub-ws';
import { getRawData } from '@twurple/common';
import { normalizeRedemptionStatus } from './helix-adapter.mjs';

/** @param {(event?: {source?: string, errorType?: string, errorCode?: string}) => string} reportError */
function createSafeEventSubLogger(reportError) {
  return (level, _message) => {
    if (level === 0 || level === 1 || level === 'error' || level === 'crit' || level === 'critical') {
      const referenceId = reportError({ source: 'twitch.eventsub', errorType: 'EventSubError' });
      process.stderr.write(`${JSON.stringify({ event: 'third_party_error', level: 'error', source: 'twitch.eventsub', referenceId })}\n`);
      return;
    }
    if (level === 2 || level === 'warn' || level === 'warning') {
      process.stderr.write(`${JSON.stringify({ event: 'third_party_warning', source: 'twitch.eventsub', code: 'eventsub_warning' })}\n`);
    }
  };
}

/**
 * The Twurple 8.2.0 offline event class exposes no stream id (only the broadcaster fields), while the research note lists an `id`
 * in the Twitch payload. The id is read from the raw payload when it is a sane string and is otherwise `null`, never guessed.
 * @param {any} event
 */
function offlineStreamId(event) {
  let raw;
  try { raw = getRawData(event); } catch { raw = undefined; }
  const candidate = typeof raw?.id === 'string' ? raw.id : typeof event?.id === 'string' ? event.id : null;
  return candidate !== null && candidate.length >= 1 && candidate.length <= 64 ? candidate : null;
}

/** @param {{apiClient: any, broadcasterId: string, listenerFactory?: (apiClient: any, config?: any) => any, reportError?: (event?: {source?: string, errorType?: string, errorCode?: string}) => string | null, redemptionsEnabled?: boolean, onRedemptionAdd: (event: object) => unknown, onRedemptionUpdate: (event: object) => unknown, onChatMessage: (event: object) => unknown, onStreamOnline?: (event: object) => unknown, onStreamOffline?: (event: object) => unknown, clock?: () => Date, onReady?: () => unknown, onReconnected?: () => unknown, onDisconnect?: (details: {established: boolean}) => unknown, onRevoked?: (type: string, status: string) => unknown, onError?: (code: string) => unknown}} input */
export function createEventSubRuntime({
  apiClient, broadcasterId, listenerFactory, reportError = () => null, redemptionsEnabled = true,
  onRedemptionAdd, onRedemptionUpdate, onChatMessage, onStreamOnline, onStreamOffline, clock = () => new Date(), onReady = () => undefined, onReconnected = () => undefined,
  onRevoked = () => undefined, onDisconnect = () => undefined, onError = () => undefined,
}) {
  const listenerConfig = {
    apiClient,
    logger: { custom: createSafeEventSubLogger(reportError) },
  };
  listenerFactory ??= (_client, config) => new EventSubWsListener(config);
  const listener = listenerFactory(apiClient, listenerConfig);
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
  if (redemptionsEnabled) listener.onChannelRedemptionAdd(broadcasterId, (event) => {
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
  if (redemptionsEnabled) listener.onChannelRedemptionUpdate(broadcasterId, (event) => {
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
  // OPS-31 P6b (FT-90): `stream.online` / `stream.offline` on the SAME listener and connection. They need no authorization and are NOT
  // gated by `redemptionsEnabled` (the cap needs the live whether or not the channel is eligible). Subscribed only when the caller
  // supplies a live callback, so callers and fakes that predate P6b keep working.
  if (onStreamOnline) listener.onStreamOnline(broadcasterId, (event) => {
    if (event.broadcasterId !== broadcasterId) return;
    dispatch(onStreamOnline, { streamId: event.id, type: event.type, startedAt: event.startDate, broadcasterId: event.broadcasterId });
  });
  if (onStreamOffline) listener.onStreamOffline(broadcasterId, (event) => {
    if (event.broadcasterId !== broadcasterId) return;
    dispatch(onStreamOffline, { streamId: offlineStreamId(event), broadcasterId: event.broadcasterId, receivedAt: clock() });
  });
  listener.onUserSocketDisconnect((userId) => {
    if (userId !== broadcasterId || stopped) return;
    const established = didConnect;
    disconnected = established;
    dispatch(onDisconnect, { established });
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

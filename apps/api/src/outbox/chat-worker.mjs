/** @param {{repository: any, twitch?: any, getTwitch?: () => any, clock?: () => Date}} dependencies */
export function createChatOutboxWorker({ repository, twitch, getTwitch, clock = () => new Date() }) {
  return {
    async processOne() {
      const adapter = getTwitch?.() ?? twitch;
      if (!adapter) return 'idle';
      const task = await repository.claimNextChatNotification?.();
      if (!task) return 'idle';
      const entry = task.entry;
      if (!entry || entry.status !== 'called') {
        await repository.finishCallNotification(task.id, { status: 'cancelled', errorCode: 'entry_not_called' });
        return 'cancelled';
      }
      const queue = entry.queue;
      const showUid = queue.uidMode === 'visible' && queue.showUidOnCall;
      const uid = showUid && entry.uid ? ` · UID ${entry.uid}` : '';
      const account = await repository.getCurrentAccount?.() ?? { label: 'Streamer' };
      const message = String(queue.callMessage || '{user}, sua vez!')
        .replaceAll('{user}', `@${entry.userLogin}`)
        .replaceAll('{queue}', queue.title)
        .replaceAll('{position}', String(entry.callPosition ?? '?'))
        .replaceAll('{uid}', uid)
        .replaceAll('{account}', account.label);
      try {
        const result = await adapter.sendChatMessage(message.slice(0, 500));
        if (result.sent !== true) {
          await repository.finishCallNotification(task.id, { status: 'retry', errorCode: 'chat_delivery_not_confirmed' });
          return 'retry';
        }
        await repository.recordCallNotificationResult({ entryId: entry.id, sent: true, timeoutMin: queue.callTimeoutMin, at: clock() });
        await repository.finishCallNotification(task.id, { status: 'confirmed' });
        return 'confirmed';
      } catch {
        await repository.finishCallNotification(task.id, { status: 'retry', errorCode: 'chat_send_failed' });
        return 'retry';
      }
    },
  };
}

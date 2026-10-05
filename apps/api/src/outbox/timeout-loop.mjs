import { clearInterval as clearNodeInterval, setInterval as setNodeInterval } from 'node:timers';

/** @param {{repository: any, domainService: any, intervalMs?: number, graceMs?: number, clock?: () => Date, setIntervalImpl?: typeof setInterval, clearIntervalImpl?: typeof clearInterval, isRecovered?: () => boolean, onError?: (code: string) => unknown}} options */
export function createCallTimeoutLoop({
  repository, domainService, intervalMs = 1000, graceMs = 60_000,
  clock = () => new Date(), setIntervalImpl = setNodeInterval, clearIntervalImpl = clearNodeInterval,
  isRecovered = () => true, onError = () => undefined,
}) {
  let timer;
  let active = false;
  /** @type {Promise<any>} */
  let inFlight = Promise.resolve();
  return {
    async tick() {
      if (!active || !isRecovered()) return 0;
      inFlight = (async () => {
        let expired = 0;
        try {
          const candidates = await repository.listExpiredCalledEntries(new Date(clock().getTime() - graceMs));
          for (const entry of candidates) {
            const result = await domainService.transitionEntry({ entryId: entry.id, to: 'no_show', origin: 'timer', reason: 'call_timeout' });
            if (result) expired += 1;
          }
        } catch {
          onError('call_timeout_processing_failed');
        }
        return expired;
      })();
      return inFlight;
    },
    start() {
      if (active) return;
      active = true;
      timer = setIntervalImpl(() => { void this.tick(); }, intervalMs);
    },
    async stop() {
      active = false;
      if (timer) clearIntervalImpl(timer);
      await inFlight;
    },
  };
}

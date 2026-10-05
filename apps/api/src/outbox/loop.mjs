/** @param {{worker: {processOne: () => Promise<string>}, idleDelayMs?: number, activeDelayMs?: number, setTimeoutImpl?: typeof setTimeout, clearTimeoutImpl?: typeof clearTimeout, onError?: (code: string) => unknown}} options */
export function createOutboxLoop({
  worker, idleDelayMs = 1000, activeDelayMs = 10, setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout, onError = () => undefined,
}) {
  let active = false;
  let timer;
  let inFlight = Promise.resolve();

  function schedule(delayMs) {
    if (!active) return;
    timer = setTimeoutImpl(() => { void run(); }, delayMs);
  }

  async function run() {
    if (!active) return;
    inFlight = (async () => {
      let outcome = 'idle';
      try {
        outcome = await worker.processOne();
      } catch {
        onError('outbox_processing_failed');
      }
      if (active) schedule(outcome === 'idle' ? idleDelayMs : activeDelayMs);
    })();
    await inFlight;
  }

  return {
    start() {
      if (active) return;
      active = true;
      schedule(0);
    },
    async stop() {
      active = false;
      if (timer) clearTimeoutImpl(timer);
      await inFlight;
    },
  };
}

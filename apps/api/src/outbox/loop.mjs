/** @param {{worker: {processOne: () => Promise<string>}, idleDelayMs?: number, activeDelayMs?: number, setTimeoutImpl?: typeof setTimeout, clearTimeoutImpl?: typeof clearTimeout, onError?: (code: string) => unknown, onDiagnostic?: (event: {source: string, errorType: string, errorCode: string | null}) => unknown, source?: string}} options */
export function createOutboxLoop({
  worker, idleDelayMs = 1000, activeDelayMs = 10, setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout, onError = () => undefined, onDiagnostic = () => undefined, source = 'outbox.worker',
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
      } catch (error) {
        const errorType = typeof error?.name === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.name) ? error.name : 'Error';
        const errorCode = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{1,31}$/.test(error.code) ? error.code : null;
        try { onDiagnostic({ source, errorType, errorCode }); } catch { /* A diagnostic sink must not stop recovery. */ }
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

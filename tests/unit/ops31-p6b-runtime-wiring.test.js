// OPS-31 P6b (FT-90): the application runtime builds the live-session repository over the same Prisma client and hands it to the Twitch
// integration (so the stream events, the reconciliation and `GET /api/state` share it); a supplied repository wins.
import { describe, expect, it, vi } from 'vitest';
import { createApplicationRuntime } from '../../apps/api/src/runtime.mjs';

const base = (extra = {}) => ({
  app: { close: vi.fn() }, pool: {}, prisma: {}, repository: {}, credentialRepository: { getAuthRecord: vi.fn(async () => null) },
  financialWorker: {}, loopFactory: () => ({ start() {}, stop() {} }), ...extra,
});

describe('OPS-31 P6b runtime wiring', () => {
  it('hands a live-session repository to the integration by default', async () => {
    const integrationFactory = vi.fn(async () => ({ status: 'not_configured', stop: vi.fn() }));
    const runtime = await createApplicationRuntime(base({ integrationFactory }));
    const { liveSessionRepository } = integrationFactory.mock.calls[0][0];
    for (const method of ['applyOnline', 'applyOffline', 'applyReconcileClose', 'getLatest', 'describeLiveSession', 'createCapWindowProvider']) {
      expect(liveSessionRepository[method], method).toEqual(expect.any(Function));
    }
    await runtime.stop();
  });

  it('uses the supplied repository instead', async () => {
    const integrationFactory = vi.fn(async () => ({ status: 'not_configured', stop: vi.fn() }));
    const liveSessionRepository = { marker: true };
    const runtime = await createApplicationRuntime(base({ integrationFactory, liveSessionRepository }));
    expect(integrationFactory.mock.calls[0][0].liveSessionRepository).toBe(liveSessionRepository);
    await runtime.stop();
  });
});

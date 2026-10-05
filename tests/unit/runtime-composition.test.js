import { describe, expect, it, vi } from 'vitest';
import { createApplicationRuntime } from '../../apps/api/src/runtime.mjs';
import { registerHealthRoute } from '../../apps/api/src/health-route.mjs';

describe('application runtime composition', () => {
  it('starts durable financial processing without requiring Twitch login', async () => {
    const starts = [];
    const runtime = await createApplicationRuntime({
      app: { close: vi.fn(async () => starts.push('http-close')) },
      pool: { query: vi.fn(async () => ({ rows: [] })), end: vi.fn(async () => starts.push('pool-close')) },
      prisma: { $disconnect: vi.fn(async () => starts.push('prisma-close')) },
      repository: {},
      credentialRepository: { getAuthRecord: vi.fn(async () => null) },
      financialWorker: { processOne: vi.fn() },
      integrationFactory: vi.fn(async () => ({ status: 'not_configured', stop: vi.fn(async () => starts.push('twitch-stop')) })),
      loopFactory: vi.fn(({ worker }) => ({ worker, start: vi.fn(() => starts.push('loop-start')), stop: vi.fn(async () => starts.push('loop-stop')) })),
    });
    expect(runtime.twitchStatus).toBe('not_configured');
    expect(starts).toContain('loop-start');
    await runtime.stop();
    expect(starts).toEqual(['loop-start', 'loop-start', 'loop-start', 'loop-stop', 'loop-stop', 'loop-stop', 'twitch-stop', 'http-close', 'prisma-close', 'pool-close']);
  });

  it('reports runtime Twitch state dynamically after integration status changes', async () => {
    const app = { close: vi.fn() };
    const integration = { status: 'connecting', stop: vi.fn() };
    const runtime = await createApplicationRuntime({ app, pool: {}, prisma: {}, repository: {}, credentialRepository: { getAuthRecord: vi.fn(async () => ({ clientId: 'c' })) }, financialWorker: {}, integrationFactory: async () => integration, loopFactory: () => ({ start() {}, stop() {} }) });
    expect(runtime.twitchStatus).toBe('connecting');
    integration.status = 'connected';
    expect(runtime.twitchStatus).toBe('connected');
  });

  it('activates financial and chat workers when OAuth connects after startup', async () => {
    const integration = { status: 'not_configured', stop: vi.fn(), get twitch() { return this.adapter ?? null; } };
    const twitch = { sendChatMessage: vi.fn(async () => ({ sent: true })), getRedemption: vi.fn(async () => ({ status: 'CANCELED' })), cancelRedemption: vi.fn() };
    const financialCalls = [];
    const chatCalls = [];
    const runtime = await createApplicationRuntime({
      app: {}, pool: {}, prisma: {}, repository: { claimNext: vi.fn(), claimNextChatNotification: vi.fn() },
      credentialRepository: { getAuthRecord: vi.fn(async () => null) }, integrationFactory: async () => integration,
      financialWorkerFactory: ({ getTwitch }) => ({ processOne: async () => { financialCalls.push(getTwitch()); return 'processed'; } }),
      chatWorkerFactory: ({ getTwitch }) => ({ processOne: async () => { chatCalls.push(getTwitch()); return 'processed'; } }),
      loopFactory: ({ worker }) => ({ worker, start() {}, stop() {} }), timeoutLoopFactory: () => ({ start() {}, stop() {} }),
    });
    expect(await runtime.financialWorker.processOne()).toBe('idle');
    integration.adapter = twitch;
    expect(await runtime.financialWorker.processOne()).toBe('processed');
    expect(await runtime.chatWorker.processOne()).toBe('processed');
    expect(financialCalls).toEqual([twitch]);
    expect(chatCalls).toEqual([twitch]);
    await runtime.stop();
  });

  it('projects runtime Twitch state and version from the composed application health endpoint', async () => {
    const app = (await import('fastify')).default();
    const integration = { status: 'not_configured', stop: vi.fn() };
    const runtime = await createApplicationRuntime({ app, pool: { query: vi.fn(async () => ({ rows: [] })) }, prisma: {}, repository: {}, credentialRepository: { getAuthRecord: vi.fn(async () => null) }, financialWorker: {}, loopFactory: () => ({ start() {}, stop() {} }), timeoutLoopFactory: () => ({ start() {}, stop() {} }) });
    integration.status = runtime.twitchStatus;
    registerHealthRoute(app, { pool: runtime.pool, productVersion: 'v0.1.0-0000000-alpha', getTwitchStatus: () => runtime.twitchStatus });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.json()).toMatchObject({ product_version: 'v0.1.0-0000000-alpha', dependencies: { database: 'connected', twitch_api: 'not_configured' } });
    await runtime.stop();
  });
});

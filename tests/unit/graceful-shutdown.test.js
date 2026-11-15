// OPS-15 FT-68: bounded, idempotent API shutdown. Timers are injected; no real waiting.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createGracefulShutdown } from '../../apps/api/src/graceful-shutdown.mjs';

function harness(overrides = {}) {
  const timers = [];
  const cleared = [];
  const events = [];
  const options = {
    stop: vi.fn(async () => { events.push('stop'); }),
    closeIdleConnections: vi.fn(() => events.push('idle')),
    closeAllConnections: vi.fn(() => events.push('all')),
    exit: vi.fn((code) => events.push(`exit:${code}`)),
    writeError: vi.fn(),
    graceMs: 100, hardTimeoutMs: 500,
    setTimeoutImpl: (callback, delay) => { const timer = { callback, delay, unref: vi.fn() }; timers.push(timer); return timer; },
    clearTimeoutImpl: (timer) => cleared.push(timer),
    ...overrides,
  };
  return { options, timers, cleared, events, controller: createGracefulShutdown(options) };
}

describe('graceful API shutdown', () => {
  it('drops idle connections first, then stops the runtime', async () => {
    const { controller, events, options } = harness();
    await controller.shutdown();
    expect(events.slice(0, 2)).toEqual(['idle', 'stop']);
    expect(options.exit).not.toHaveBeenCalled();
  });

  it('force-closes connections that outlive the grace period while stop is still pending', async () => {
    let release;
    const { controller, timers, options } = harness({ stop: () => new Promise((resolve) => { release = resolve; }) });
    const done = controller.shutdown();
    const grace = timers.find((timer) => timer.delay === 100);
    expect(options.closeAllConnections).not.toHaveBeenCalled();
    grace.callback();
    expect(options.closeAllConnections).toHaveBeenCalledOnce();
    release();
    await done;
  });

  it('exits with code 1 and a generic message when the hard timeout fires', async () => {
    const { controller, timers, options } = harness({ stop: () => new Promise(() => undefined) });
    void controller.shutdown();
    const hard = timers.find((timer) => timer.delay === 500);
    hard.callback();
    expect(options.exit).toHaveBeenCalledWith(1);
    expect(options.writeError).toHaveBeenCalledWith(expect.stringContaining('timed out'));
  });

  it('arms both timers as unref so they never keep the process alive on their own', async () => {
    const { controller, timers } = harness();
    await controller.shutdown();
    expect(timers).toHaveLength(2);
    for (const timer of timers) expect(timer.unref).toHaveBeenCalledOnce();
  });

  it('turns a failing stop into exit code 1 without leaking the error text', async () => {
    const { controller, options } = harness({ stop: async () => { throw new Error('postgresql://user:secret@host/db'); } });
    await expect(controller.shutdown()).resolves.toBe(1);
    expect(options.exit).toHaveBeenCalledWith(1);
    expect(JSON.stringify(options.writeError.mock.calls)).not.toContain('secret');
  });

  it('survives connection cleanup that throws', async () => {
    const { controller, options } = harness({ closeIdleConnections: () => { throw new Error('boom'); } });
    await expect(controller.shutdown()).resolves.toBe(0);
    expect(options.stop).toHaveBeenCalledOnce();
  });

  it('is idempotent: repeated signals share one shutdown', async () => {
    const { controller, options } = harness();
    expect(controller.closing).toBe(false);
    const first = controller.shutdown();
    const second = controller.shutdown();
    expect(controller.closing).toBe(true);
    expect(second).toBe(first);
    await first;
    expect(options.stop).toHaveBeenCalledOnce();
    expect(options.closeIdleConnections).toHaveBeenCalledOnce();
  });
});

describe('server wiring', () => {
  it('routes SIGTERM and SIGINT through the bounded controller and closes tracked connections', () => {
    const source = readFileSync(new URL('../../apps/api/src/server.mjs', import.meta.url), 'utf8');
    expect(source).toContain("createGracefulShutdown({");
    expect(source).toContain('app.server.closeIdleConnections()');
    expect(source).toContain('app.server.closeAllConnections()');
    expect(source).toMatch(/process\.on\('SIGTERM', \(\) => void shutdown\(\)\)/);
    expect(source).toMatch(/process\.on\('SIGINT', \(\) => void shutdown\(\)\)/);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createChatLimiter, withChatLimiter } from '../../apps/api/src/outbox/chat-limiter.mjs';

function harness(options = {}) {
  let now = 1_000_000;
  const limiter = createChatLimiter({
    ceiling: 80, windowMs: 30_000, reservedForPriorityZero: 20, warmupMs: 0, maxWaitMs: 5_000,
    clock: () => now, sleep: async (ms) => { now += ms; }, ...options,
  });
  return { limiter, advance: (ms) => { now += ms; }, now: () => now };
}

describe('OPS-31 P2 chat limiter (U71-06, U71-07)', () => {
  it('U71-06: 1000 priority-1 attempts never exceed the share left for informational messages in any 30 s window', async () => {
    const h = harness();
    let granted = 0;
    for (let i = 0; i < 1000; i += 1) {
      if ((await h.limiter.acquire(1)).granted) granted += 1;
      h.advance(10);
    }
    // 60 informational slots per 30 s; 10 000 ms of simulated time at most.
    expect(granted).toBeLessThanOrEqual(60);
    expect(h.limiter.snapshot().windowUsed).toBeLessThanOrEqual(60);
  });

  it('U71-07: priority 0 keeps its reserved share under a priority-1 flood and uses the whole ceiling', async () => {
    const h = harness();
    for (let i = 0; i < 200; i += 1) await h.limiter.acquire(1);
    let zero = 0;
    for (let i = 0; i < 20; i += 1) if ((await h.limiter.acquire(0)).granted) zero += 1;
    expect(zero).toBe(20);
    expect(h.limiter.snapshot().windowUsed).toBe(80);
  });

  it('priority 0 waits for a free slot (bounded) and is dropped with a counter when the wait is exceeded', async () => {
    const events = [];
    const h = harness({ onEvent: (event) => events.push(event) });
    for (let i = 0; i < 80; i += 1) await h.limiter.acquire(0);
    // The window frees in 30 s but the bound is 5 s.
    const dropped = await h.limiter.acquire(0);
    expect(dropped).toEqual({ granted: false, reason: 'wait_exceeded' });
    expect(events.at(-1)).toMatchObject({ event: 'chat.limiter', outcome: 'dropped', priority: 0 });
    h.advance(30_000);
    expect((await h.limiter.acquire(0)).granted).toBe(true);
  });

  it('priority 0 gets a slot when one frees inside the bound', async () => {
    const h = harness({ maxWaitMs: 40_000 });
    for (let i = 0; i < 80; i += 1) await h.limiter.acquire(0);
    const started = h.now();
    expect((await h.limiter.acquire(0)).granted).toBe(true);
    expect(h.now() - started).toBeGreaterThan(0);
  });

  it('warm-up halves the ceiling in the first 30 s after boot, then the full ceiling applies (ML4)', async () => {
    const h = harness({ warmupMs: 30_000, maxWaitMs: 0 });
    let granted = 0;
    for (let i = 0; i < 80; i += 1) if ((await h.limiter.acquire(0)).granted) granted += 1;
    expect(h.limiter.snapshot().warmingUp).toBe(true);
    expect(granted).toBe(40); // exactly half of the 80 ceiling right after boot
    const reserved = harness({ warmupMs: 30_000, maxWaitMs: 0 });
    let informational = 0;
    for (let i = 0; i < 80; i += 1) if ((await reserved.limiter.acquire(1)).granted) informational += 1;
    expect(informational).toBe(30); // half of the 60 informational slots (80 - 20 reserved)
    h.advance(30_001);
    expect(h.limiter.snapshot().warmingUp).toBe(false);
    let afterWarmup = 0;
    for (let i = 0; i < 100; i += 1) if ((await h.limiter.acquire(0)).granted) afterWarmup += 1;
    expect(afterWarmup).toBe(80);
  });

  it('wraps the adapter so command replies and calls count, and a refusal reads as not delivered', async () => {
    const h = harness({ ceiling: 3, reservedForPriorityZero: 1, maxWaitMs: 0 });
    const send = vi.fn(async () => ({ sent: true }));
    const adapter = withChatLimiter({ sendChatMessage: send }, h.limiter);
    expect((await adapter.sendChatMessage('a', { priority: 1 })).sent).toBe(true);
    expect((await adapter.sendChatMessage('b', { priority: 2 })).sent).toBe(true);
    expect(await adapter.sendChatMessage('c', { priority: 1 })).toMatchObject({ sent: false, rateLimited: true });
    expect((await adapter.sendChatMessage('call')).sent).toBe(true);
    expect(await adapter.sendChatMessage('late call')).toMatchObject({ sent: false });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('leaves an adapter without a sender untouched', () => {
    const adapter = { ping: () => true };
    expect(withChatLimiter(adapter, harness().limiter)).toBe(adapter);
  });
});

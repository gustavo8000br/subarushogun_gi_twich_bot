// OPS-31 P6b (FT-90, U39-01): the `capWindowStart` port of the financial gate keeps its P1 shape and its constant-fallback default (the
// assertions of financial-gate.test.js stay as they were); P6b adds the optional `provider` the gate can be handed. The gate itself does
// not import the live repository (LIVE-1 and the lock order stay clean): P7 passes `repository.createCapWindowProvider(...)`.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { capWindowStart } from '../../apps/api/src/persistence/financial-gate.mjs';

const now = new Date('2030-01-01T12:00:00.000Z');

describe('OPS-31 P6b capWindowStart provider option', () => {
  it('without a provider it is still the constant fallback with the hours window (unchanged P1 behavior)', async () => {
    expect(await capWindowStart({}, 'b', now)).toEqual({ kind: 'fallback', start: new Date('2030-01-01T00:00:00.000Z'), reason: 'no_session_provider' });
  });

  it('with a provider it returns exactly what the provider says and passes (tx, broadcasterId, now, {reentryWindowHours})', async () => {
    const tx = {};
    const session = { kind: 'session', start: new Date('2030-01-01T10:00:00.000Z') };
    const provider = vi.fn(async () => session);
    expect(await capWindowStart(tx, 'b', now, { reentryWindowHours: 5, provider })).toBe(session);
    expect(provider).toHaveBeenCalledWith(tx, 'b', now, { reentryWindowHours: 5 });
  });

  it('a provider that throws never makes the cap unlimited: the error reaches the gate (its transaction rolls back) and is not swallowed into a window', async () => {
    const provider = vi.fn(async () => { throw new Error('db down'); });
    await expect(capWindowStart({}, 'b', now, { provider })).rejects.toThrow('db down');
  });

  it('a provider answer of an unexpected shape is refused instead of trusted', async () => {
    for (const bad of [null, undefined, {}, { kind: 'session' }, { kind: 'session', start: 'x' }, { kind: 'fallback', start: now }, { kind: 'other', start: now, reason: 'r' }]) {
      await expect(capWindowStart({}, 'b', now, { provider: async () => bad }), JSON.stringify(bad)).rejects.toMatchObject({ code: 'CAP_WINDOW_INVALID' });
    }
  });

  it('the gate does not import the live-session modules', () => {
    const source = readFileSync(new URL('../../apps/api/src/persistence/financial-gate.mjs', import.meta.url), 'utf8');
    const specifiers = [...source.matchAll(/(?:import|from)\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
    for (const specifier of specifiers) expect(specifier).not.toMatch(/live-session/);
  });
});

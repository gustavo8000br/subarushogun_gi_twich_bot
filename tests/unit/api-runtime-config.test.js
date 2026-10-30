import { describe, expect, it } from 'vitest';
import { resolveApiHost } from '../../apps/api/src/runtime-config.mjs';

describe('API listener host configuration', () => {
  it('binds to IPv4 loopback when APP_HOST is not configured', () => {
    expect(resolveApiHost({})).toBe('127.0.0.1');
  });

  it('preserves an explicitly configured host', () => {
    expect(resolveApiHost({ APP_HOST: '127.0.0.2' })).toBe('127.0.0.2');
    expect(resolveApiHost({ APP_HOST: '0.0.0.0' })).toBe('0.0.0.0');
  });
});

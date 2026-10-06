import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createOverlayWidgetService } from '../../apps/api/src/domain/overlay-widget-service.mjs';

function createRepository() {
  return {
    create: vi.fn(async (data) => ({ id: 'widget-1', ...data })),
    rotateCapability: vi.fn(async ({ capabilityHash }) => ({ id: 'widget-1', capabilityHash })),
    revokeCapability: vi.fn(async () => ({ id: 'widget-1', capabilityHash: null })),
  };
}

describe('OBS widget capability service', () => {
  it('issues a high-entropy secret only in the HTTPS URL fragment and persists only its SHA-256 hash', async () => {
    const repository = createRepository();
    const service = createOverlayWidgetService({ repository, origin: 'https://localhost:3000', tokenFactory: () => 'x'.repeat(43) });
    const result = await service.create({ sourceType: 'account_label' });
    const secret = new URL(result.capabilityUrl).hash.slice(1);
    expect(result.capabilityUrl).toBe(`https://localhost:3000/overlay.html#${secret}`);
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new URL(result.capabilityUrl).search).toBe('');
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      capabilityHash: createHash('sha256').update(secret).digest('hex'),
    }));
    expect(repository.create.mock.calls[0][0].capabilityHash).not.toContain(secret);
  });

  it('rotates by replacing the hash and returns only the newly issued URL once', async () => {
    const repository = createRepository();
    const service = createOverlayWidgetService({ repository, origin: 'https://localhost:3000', tokenFactory: vi.fn().mockReturnValueOnce('a'.repeat(43)).mockReturnValueOnce('b'.repeat(43)) });
    const first = await service.create({ sourceType: 'account_label' });
    const second = await service.regenerate({ id: 'widget-1', expectedVersion: 1 });
    expect(first.capabilityUrl).toContain('a'.repeat(43));
    expect(second.capabilityUrl).toContain('b'.repeat(43));
    expect(repository.rotateCapability).toHaveBeenCalledWith(expect.objectContaining({
      id: 'widget-1', expectedVersion: 1,
      capabilityHash: createHash('sha256').update('b'.repeat(43)).digest('hex'),
    }));
    expect(second.widget).not.toHaveProperty('capabilityHash');
  });

  it('revokes without issuing or returning a replacement capability URL', async () => {
    const repository = createRepository();
    const tokenFactory = vi.fn(() => 'c'.repeat(43));
    const service = createOverlayWidgetService({ repository, origin: 'https://localhost:3000', tokenFactory });
    const result = await service.revoke({ id: 'widget-1', expectedVersion: 3 });
    expect(result).toEqual({ id: 'widget-1' });
    expect(tokenFactory).not.toHaveBeenCalled();
    expect(repository.revokeCapability).toHaveBeenCalledWith({ id: 'widget-1', expectedVersion: 3 });
  });

  it('rejects non-loopback or non-HTTPS origins', () => {
    expect(() => createOverlayWidgetService({ repository: createRepository(), origin: 'http://localhost:3000' })).toThrow();
    expect(() => createOverlayWidgetService({ repository: createRepository(), origin: 'https://192.168.1.4:3000' })).toThrow();
  });
});

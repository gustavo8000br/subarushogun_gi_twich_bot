import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createOverlayProjectionService } from '../../apps/api/src/domain/overlay-projection-service.mjs';

describe('OBS widget read-only projection service', () => {
  it('hashes the bearer token and returns only the selected source, fallback and style', async () => {
    const tx = { marker: 'transaction' };
    const projectWithActiveCapability = vi.fn(async (_hash, project) => project({
      id: 'private-id', sourceType: 'queue_name', queueId: 'queue-secret', fixedText: null,
      fallbackText: 'No queue', style: { fontSize: 32 }, capabilityHash: 'private-hash',
    }, tx));
    const getOverlaySourceValue = vi.fn(async ({ sourceType, queueId, tx: receivedTx }) => {
      expect(sourceType).toBe('queue_name');
      expect(queueId).toBe('queue-secret');
      expect(receivedTx).toBe(tx);
      return 'Theatre';
    });
    const service = createOverlayProjectionService({ overlayRepository: { projectWithActiveCapability }, queueRepository: { getOverlaySourceValue } });
    const token = 's'.repeat(43);
    const projection = await service.readWithCapability(token);
    expect(projectWithActiveCapability).toHaveBeenCalledWith(createHash('sha256').update(token).digest('hex'), expect.any(Function));
    expect(projection).toEqual({ sourceType: 'queue_name', value: 'Theatre', fallbackText: 'No queue', style: { fontSize: 32 } });
    expect(JSON.stringify(projection)).not.toContain(token);
    expect(JSON.stringify(projection)).not.toContain('queue-secret');
    expect(JSON.stringify(projection)).not.toContain('private-hash');
  });

  it('projects fixed text without a business-state lookup and denies absent or unknown capabilities', async () => {
    const queueRepository = { getOverlaySourceValue: vi.fn() };
    const overlayRepository = { projectWithActiveCapability: vi.fn(async (_hash, project) => project({ sourceType: 'fixed_text', fixedText: 'Hello', fallbackText: '', style: {} }, {})) };
    const service = createOverlayProjectionService({ overlayRepository, queueRepository });
    await expect(service.readWithCapability('x'.repeat(43))).resolves.toEqual({ sourceType: 'fixed_text', value: 'Hello', fallbackText: '', style: {} });
    expect(queueRepository.getOverlaySourceValue).not.toHaveBeenCalled();
    await expect(service.readWithCapability('')).resolves.toBeNull();
    overlayRepository.projectWithActiveCapability.mockResolvedValue(null);
    await expect(service.readWithCapability('y'.repeat(43))).resolves.toBeNull();
  });
});

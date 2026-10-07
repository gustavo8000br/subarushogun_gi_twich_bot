import { describe, expect, it, vi } from 'vitest';
import { createQueueRepository } from '../../apps/api/src/persistence/queue-repository.mjs';

describe('installer-selected product locale', () => {
  it('uses the selected supported locale until the streamer changes it in the panel', async () => {
    const prisma = { setting: { findUnique: vi.fn(async () => null) } };
    const repository = createQueueRepository(prisma, { defaultProductLocale: 'en' });

    await expect(repository.getProductLocale()).resolves.toEqual({ locale: 'en', revision: 1 });
  });

  it('falls back to Brazilian Portuguese when the installer locale is unsupported', async () => {
    const prisma = { setting: { findUnique: vi.fn(async () => null) } };
    const repository = createQueueRepository(prisma, { defaultProductLocale: 'pt_BR' });
    await expect(repository.getProductLocale()).resolves.toEqual({ locale: 'pt-BR', revision: 1 });
  });
});

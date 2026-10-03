import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

describe('foundation operator documentation contract', () => {
  it('provides linked English and Brazilian Portuguese setup and operations guides', async () => {
    const [english, portuguese] = await Promise.all([read('README.md'), read('README.pt-BR.md')]);
    expect(english).toContain('[Português brasileiro](README.pt-BR.md)');
    expect(portuguese).toContain('[English](README.md)');
    for (const term of ['Docker Compose', 'localhost:3000', 'logs', 'volume']) {
      expect(english.toLowerCase()).toContain(term.toLowerCase());
      expect(portuguese.toLowerCase()).toContain(term.toLowerCase());
    }
    for (const reference of ['Streamer.bot', 'PhantomBot', 'twitch-voxer']) {
      expect(english).toContain(reference);
      expect(portuguese).toContain(reference);
    }
  });

  it('documents checked Twitch SDK operations, scopes, versions and consultation date in both languages', async () => {
    const [english, portuguese] = await Promise.all([
      read('docs/integrations.md'), read('docs/pt-BR/integrations.md'),
    ]);
    expect(english).toContain('[Português brasileiro](pt-BR/integrations.md)');
    expect(portuguese).toContain('[English](../integrations.md)');
    for (const term of ['2026-10-03', 'channel:manage:redemptions', 'user:read:chat', 'user:write:chat', 'is_sent', 'not implemented']) {
      expect(english.toLowerCase()).toContain(term.toLowerCase());
    }
    expect(portuguese.toLowerCase()).toContain('2026-10-03');
    expect(portuguese.toLowerCase()).toContain('channel:manage:redemptions');
    expect(portuguese.toLowerCase()).toContain('user:read:chat');
    expect(portuguese.toLowerCase()).toContain('user:write:chat');
    expect(portuguese.toLowerCase()).toContain('is_sent');
    expect(portuguese.toLowerCase()).toContain('ainda não está implementada');
  });
});

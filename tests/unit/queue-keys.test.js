import { describe, expect, it } from 'vitest';
import { normalizeQueueKeys } from '../../apps/api/src/domain/queue-keys.mjs';

describe('queue slug and alias validation', () => {
  it('normalizes ASCII case and returns one shared key namespace', () => {
    expect(normalizeQueueKeys({ slug: 'Abismo-2', aliases: ['Genshin', 'Teatro'] })).toEqual({
      slug: 'abismo-2',
      aliases: ['genshin', 'teatro'],
      keys: [
        { key: 'abismo-2', keyType: 'slug' },
        { key: 'genshin', keyType: 'alias' },
        { key: 'teatro', keyType: 'alias' },
      ],
    });
  });

  it.each(['a', 'a'.repeat(25), 'a b', 'ábc', '連続', 'a_b', ''])('rejects invalid key grammar safely: %s', (slug) => {
    expect(() => normalizeQueueKeys({ slug })).toThrowError(expect.objectContaining({ code: 'INVALID_QUEUE_KEY' }));
  });

  it.each(['add', 'remover', 'sair', 'posicao', 'proximo', 'atender', 'concluir', 'mover', 'abrir', 'fechar', 'limpar', 'confirmar', 'filas', 'conta', 'lista', 'queue'])('rejects reserved key: %s', (slug) => {
    expect(() => normalizeQueueKeys({ slug })).toThrowError(expect.objectContaining({ code: 'RESERVED_QUEUE_KEY' }));
  });

  it('rejects collisions between slug and alias and repeated aliases', () => {
    expect(() => normalizeQueueKeys({ slug: 'abismo', aliases: ['ABISMO'] }))
      .toThrowError(expect.objectContaining({ code: 'DUPLICATE_QUEUE_KEY' }));
    expect(() => normalizeQueueKeys({ slug: 'abismo', aliases: ['teatro', 'TEATRO'] }))
      .toThrowError(expect.objectContaining({ code: 'DUPLICATE_QUEUE_KEY' }));
  });

  it('requires aliases to be an array of strings', () => {
    expect(() => normalizeQueueKeys({ slug: 'abismo', aliases: 'teatro' }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_QUEUE_ALIASES' }));
  });
});

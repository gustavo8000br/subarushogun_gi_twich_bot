import { describe, expect, it } from 'vitest';
import { parseCatalogBytes } from '../../apps/shared/localization/parse-catalog-bytes.mjs';

describe('parseCatalogBytes', () => {
  it('decodes and validates a UTF-8 catalog in one operation', () => {
    const source = 'setup.title\tConfiguração\nsetup.ready\tPronto\n';
    const bytes = new globalThis.TextEncoder().encode(source);

    const catalog = parseCatalogBytes(bytes);

    expect(catalog).toEqual({ 'setup.title': 'Configuração', 'setup.ready': 'Pronto' });
    expect(Object.getPrototypeOf(catalog)).toBeNull();
    expect(Object.isFrozen(catalog)).toBe(true);
  });

  it('rejects malformed UTF-8 before catalog parsing', () => {
    const bytes = new Uint8Array([0x6b, 0x65, 0x79, 0x09, 0xc3, 0x28]);

    expect(() => parseCatalogBytes(bytes)).toThrow('Catalog is not valid UTF-8');
  });

  it('rejects valid UTF-8 bytes that violate the catalog contract', () => {
    const bytes = new globalThis.TextEncoder().encode('invalid key\tvalue\n');

    expect(() => parseCatalogBytes(bytes)).toThrow('Invalid catalog key at line 1');
  });
});

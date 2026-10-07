import { describe, expect, it } from 'vitest';
import { decodeCatalogBytes } from '../../apps/shared/localization/decode-catalog-bytes.mjs';

describe('decodeCatalogBytes', () => {
  it('decodes UTF-8 catalog bytes without changing localized text', () => {
    const source = 'setup.channel.ineligible\tCanal não elegível\n';

    expect(decodeCatalogBytes(new globalThis.TextEncoder().encode(source))).toBe(source);
  });

  it('rejects a UTF-8 BOM instead of silently normalizing catalog files', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new globalThis.TextEncoder().encode('key\tvalue\n')]);

    expect(() => decodeCatalogBytes(bytes)).toThrow('Catalog must not start with a UTF-8 BOM');
  });

  it('rejects malformed UTF-8 instead of inserting replacement characters', () => {
    const bytes = new Uint8Array([0x6b, 0x65, 0x79, 0x09, 0xc3, 0x28, 0x0a]);

    expect(() => decodeCatalogBytes(bytes)).toThrow('Catalog is not valid UTF-8');
  });

  it('requires byte input', () => {
    expect(() => decodeCatalogBytes('key\tvalue\n')).toThrow(TypeError);
  });
});

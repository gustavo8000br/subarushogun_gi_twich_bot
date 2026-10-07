/**
 * Decode a catalog file using the shared UTF-8 without BOM contract.
 * @param {Uint8Array} sourceBytes
 * @returns {string}
 */
export function decodeCatalogBytes(sourceBytes) {
  if (!(sourceBytes instanceof Uint8Array)) {
    throw new TypeError('Catalog source must be a Uint8Array');
  }

  if (sourceBytes[0] === 0xef && sourceBytes[1] === 0xbb && sourceBytes[2] === 0xbf) {
    throw new Error('Catalog must not start with a UTF-8 BOM');
  }

  try {
    return new globalThis.TextDecoder('utf-8', { fatal: true }).decode(sourceBytes);
  } catch {
    throw new Error('Catalog is not valid UTF-8');
  }
}

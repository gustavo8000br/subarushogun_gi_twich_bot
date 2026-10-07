import { decodeCatalogBytes } from './decode-catalog-bytes.mjs';
import { parseTsvCatalog } from './tsv-catalog.mjs';

/**
 * Decode UTF-8 catalog bytes strictly, then validate the shared TSV contract.
 * @param {Uint8Array} sourceBytes
 * @returns {Record<string, string>}
 */
export function parseCatalogBytes(sourceBytes) {
  return parseTsvCatalog(decodeCatalogBytes(sourceBytes));
}

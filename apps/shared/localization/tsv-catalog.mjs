const CATALOG_KEY_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

function hasControlCharacter(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint < 0x20 || codePoint === 0x7F) return true;
  }
  return false;
}

/**
 * Parse the product's literal, one-key-per-line UTF-8 TSV catalog format.
 * Byte decoding is the caller's responsibility; this parser rejects a BOM and
 * malformed text structure without evaluating or rendering catalog values.
 *
 * @param {string} source
 * @returns {Record<string, string>}
 */
export function parseTsvCatalog(source) {
  if (typeof source !== 'string' || source.length === 0) {
    throw new Error('Catalog must contain at least one entry');
  }
  if (source.charCodeAt(0) === 0xFEFF) {
    throw new Error('Catalog must not contain a byte order mark');
  }

  const lines = source.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length === 0) throw new Error('Catalog must contain at least one entry');

  const entries = Object.create(null);
  for (const [index, line] of lines.entries()) {
    const tabIndex = line.indexOf('\t');
    if (tabIndex <= 0 || tabIndex !== line.lastIndexOf('\t')) {
      throw new Error(`Malformed catalog row at line ${index + 1}`);
    }

    const key = line.slice(0, tabIndex);
    const value = line.slice(tabIndex + 1);
    if (!CATALOG_KEY_PATTERN.test(key)) {
      throw new Error(`Invalid catalog key at line ${index + 1}`);
    }
    if (Object.hasOwn(entries, key)) {
      throw new Error(`Duplicate catalog key: ${key}`);
    }
    if (value.length === 0) {
      throw new Error(`Empty catalog value at line ${index + 1}`);
    }
    if (hasControlCharacter(value)) {
      throw new Error(`Control character in catalog value at line ${index + 1}`);
    }
    entries[key] = value;
  }

  return Object.freeze(entries);
}

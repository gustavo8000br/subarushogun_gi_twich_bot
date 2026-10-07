const DEFAULT_LOCALES = Object.freeze(['pt-BR', 'en', 'es']);
const KEY_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const PLACEHOLDER_PATTERN = /\{([a-z][a-zA-Z0-9_]*)\}/g;

function sorted(values) {
  return [...values].sort();
}

function isCanonicalLocale(locale) {
  if (typeof locale !== 'string') return false;
  try {
    return globalThis.Intl.getCanonicalLocales(locale)[0] === locale;
  } catch {
    return false;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getPlaceholderNames(template, key) {
  const names = [...template.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]);
  if (/[{}]/.test(template.replace(PLACEHOLDER_PATTERN, ''))) {
    throw new Error(`Invalid template placeholder for key ${key}`);
  }
  return [...new Set(names)];
}

/**
 * Validate locale coverage and allowlisted interpolation placeholders.
 * @param {Record<string, Record<string, string>>} catalogs
 * @param {{locales?: readonly string[], placeholders?: Record<string, string[]>}} [options]
 * @returns {true}
 */
export function validateCatalogSet(catalogs, options = {}) {
  const locales = options.locales ?? DEFAULT_LOCALES;
  const placeholders = options.placeholders ?? {};

  if (!Array.isArray(locales) || locales.length === 0
      || locales.some((locale) => !isCanonicalLocale(locale))
      || new Set(locales).size !== locales.length) {
    throw new Error('Invalid locale identifier');
  }
  if (!isRecord(catalogs) || !isRecord(placeholders)) {
    throw new Error('Catalog bundle must include exactly: ' + locales.join(', '));
  }

  const discoveredLocales = Object.keys(catalogs);
  if (discoveredLocales.some((locale) => !isCanonicalLocale(locale))) {
    throw new Error('Invalid locale identifier');
  }
  const missingRequiredLocales = locales.filter((locale) => !Object.hasOwn(catalogs, locale));
  if (missingRequiredLocales.length > 0) {
    throw new Error(`Catalog bundle must include required locales: ${sorted(locales).join(', ')}`);
  }

  const baseLocale = locales.includes('pt-BR') ? 'pt-BR' : locales[0];
  const baseCatalog = catalogs[baseLocale];
  if (!isRecord(baseCatalog) || Object.keys(baseCatalog).length === 0) {
    throw new Error(`Catalog must include entries for locale ${baseLocale}`);
  }

  const baseKeys = sorted(Object.keys(baseCatalog));
  const baseKeySet = new Set(baseKeys);
  if (Object.keys(placeholders).some((key) => !baseKeySet.has(key))) {
    throw new Error('Placeholder contract references a missing catalog key');
  }

  for (const locale of discoveredLocales) {
    const catalog = catalogs[locale];
    if (!isRecord(catalog) || JSON.stringify(sorted(Object.keys(catalog))) !== JSON.stringify(baseKeys)) {
      throw new Error(`Catalog keys differ for locale ${locale}`);
    }

    for (const key of baseKeys) {
      if (!KEY_PATTERN.test(key) || typeof catalog[key] !== 'string' || catalog[key].length === 0) {
        throw new Error(`Invalid catalog entry for key ${key}`);
      }
      const actual = getPlaceholderNames(catalog[key], key);
      const allowed = placeholders[key] ?? [];
      if (!Array.isArray(allowed)
          || allowed.some((name) => typeof name !== 'string' || !/^[a-z][a-zA-Z0-9_]*$/.test(name))
          || JSON.stringify(sorted(actual)) !== JSON.stringify(sorted(allowed))) {
        throw new Error(`Placeholder allowlist mismatch for key ${key}`);
      }
    }
  }

  return true;
}

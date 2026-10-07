const DEFAULT_LOCALES = Object.freeze(['pt-BR', 'en', 'es']);
const KEY_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const PLACEHOLDER_PATTERN = /\{([a-z][a-zA-Z0-9_]*)\}/g;
const PLURAL_SUFFIXES = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
// eslint-disable-next-line no-control-regex -- Catalogs must reject control bytes even though this source spells them as Unicode escapes.
const UNSAFE_VALUE_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/gi;
const ANGLE_PLACEHOLDER_PATTERN = /<[\p{L}][\p{L}\p{N}_-]*>/giu;
const HTML_RESERVED_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'style', 'svg', 'math', 'img', 'a', 'div', 'span', 'form', 'input', 'button', 'link', 'meta']);
const ALLOWED_SYNTAX_PLACEHOLDERS = new Set(['name', 'nome', 'nombre', 'queue', 'fila', 'cola', 'user', 'usuario', 'usuário', 'position', 'posição', 'posicion', 'posición', 'posição', 'uid', 'confirm', '1-10']);

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

function splitPluralKey(key) {
  const separator = key.lastIndexOf('.');
  if (separator < 0) return null;
  const category = key.slice(separator + 1);
  return PLURAL_SUFFIXES.has(category) ? { base: key.slice(0, separator), category } : null;
}

function catalogShape(catalog) {
  const regularKeys = [];
  const pluralGroups = new Map();
  const candidates = new Map();
  for (const key of Object.keys(catalog)) {
    const plural = splitPluralKey(key);
    if (!plural) regularKeys.push(key);
    else candidates.set(plural.base, [...(candidates.get(plural.base) ?? []), { key, category: plural.category }]);
  }
  for (const [base, entries] of candidates) {
    if (entries.length > 1 || entries.some(({ category }) => category !== 'other')) {
      pluralGroups.set(base, entries.map(({ category }) => category));
    } else {
      regularKeys.push(entries[0].key);
    }
  }
  return { regularKeys: sorted(regularKeys), pluralGroups };
}

function getPlaceholderNames(template, key) {
  const names = [...template.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]);
  if (/[{}]/.test(template.replace(PLACEHOLDER_PATTERN, ''))) {
    throw new Error(`Invalid template placeholder for key ${key}`);
  }
  return [...new Set(names)];
}

/**
 * Validate locale coverage, locale-specific Intl plural categories, and
 * allowlisted interpolation placeholders. Plural groups use `<base>.<category>`
 * keys and one shared placeholder contract at `<base>`.
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
  const baseShape = catalogShape(baseCatalog);
  const basePluralGroups = sorted(baseShape.pluralGroups.keys());
  const baseRegularKeys = baseShape.regularKeys;

  const placeholderKeys = Object.keys(placeholders);
  if (placeholderKeys.some((key) => !baseCatalog[key] && !baseShape.pluralGroups.has(key))) {
    throw new Error('Placeholder contract references a missing catalog key');
  }

  for (const locale of discoveredLocales) {
    const catalog = catalogs[locale];
    if (!isRecord(catalog)) throw new Error(`Catalog keys differ for locale ${locale}`);
    const shape = catalogShape(catalog);
    if (JSON.stringify(shape.regularKeys) !== JSON.stringify(baseRegularKeys)
        || JSON.stringify(sorted(shape.pluralGroups.keys())) !== JSON.stringify(basePluralGroups)) {
      throw new Error(`Catalog keys differ for locale ${locale}`);
    }

    const expectedPluralCategories = sorted(new Intl.PluralRules(locale).resolvedOptions().pluralCategories);
    for (const group of basePluralGroups) {
      const actualPluralCategories = sorted(shape.pluralGroups.get(group) ?? []);
      if (JSON.stringify(actualPluralCategories) !== JSON.stringify(expectedPluralCategories)) {
        throw new Error(`Plural forms differ for locale ${locale}`);
      }
    }

    for (const key of Object.keys(catalog)) {
      if (!KEY_PATTERN.test(key) || typeof catalog[key] !== 'string' || catalog[key].length === 0) {
        throw new Error(`Invalid catalog entry for key ${key}`);
      }
      const withoutPlaceholders = catalog[key].replace(ANGLE_PLACEHOLDER_PATTERN, (placeholder) => {
        const name = placeholder.slice(1, -1).toLowerCase();
        return ALLOWED_SYNTAX_PLACEHOLDERS.has(name) && !HTML_RESERVED_TAGS.has(name) ? '' : placeholder;
      });
      HTML_TAG_PATTERN.lastIndex = 0;
      if (UNSAFE_VALUE_PATTERN.test(catalog[key]) || HTML_TAG_PATTERN.test(withoutPlaceholders)) {
        throw new Error(`Unsafe catalog value for key ${key}`);
      }
      const actual = getPlaceholderNames(catalog[key], key);
      const plural = splitPluralKey(key);
      const allowed = placeholders[key] ?? (plural ? placeholders[plural.base] : undefined) ?? [];
      if (!Array.isArray(allowed)
          || allowed.some((name) => typeof name !== 'string' || !/^[a-z][a-zA-Z0-9_]*$/.test(name))
          || JSON.stringify(sorted(actual)) !== JSON.stringify(sorted(allowed))) {
        throw new Error(`Placeholder allowlist mismatch for key ${key}`);
      }
    }
  }

  return true;
}

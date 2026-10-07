const DEFAULT_LOCALE = 'pt-BR';
const SAFE_UNAVAILABLE = Object.freeze({
  'pt-BR': 'Texto do produto indisponível.',
  en: 'Product text unavailable.',
  es: 'Texto del producto no disponible.',
});
const PLACEHOLDER_PATTERN = /\{([a-z][a-zA-Z0-9_]*)\}/g;

/** @param {unknown} value */
function isSafeInterpolationValue(value) {
  return typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
}

/**
 * Resolve a literal catalog key and interpolate only explicitly allowlisted
 * scalar values. The returned string must be rendered as text by the caller.
 * @param {Record<string, Record<string, string>>} catalogs
 * @param {string} locale
 * @param {string} key
 * @param {{values?: Record<string, unknown>, placeholders?: Record<string, string[]>}} [options]
 * @returns {string}
 */
export function translateCatalog(catalogs, locale, key, options = {}) {
  const selectedLocale = typeof locale === 'string' && Object.hasOwn(catalogs ?? {}, locale)
    ? locale
    : DEFAULT_LOCALE;
  const selectedCatalog = catalogs?.[selectedLocale];
  const unavailable = () => selectedCatalog?.['translation.unavailable']
    ?? catalogs?.[DEFAULT_LOCALE]?.['translation.unavailable']
    ?? SAFE_UNAVAILABLE[selectedLocale]
    ?? SAFE_UNAVAILABLE[DEFAULT_LOCALE];
  const template = selectedCatalog?.[key] ?? catalogs?.[DEFAULT_LOCALE]?.[key];
  if (typeof template !== 'string') return unavailable();

  const allowed = options.placeholders?.[key] ?? [];
  const values = options.values ?? {};
  if (!Array.isArray(allowed) || Object.keys(values).some((name) => !allowed.includes(name))) {
    return unavailable();
  }
  const matches = [...template.matchAll(PLACEHOLDER_PATTERN)];
  if (/[{}]/.test(template.replace(PLACEHOLDER_PATTERN, ''))) return unavailable();
  for (const [, name] of matches) {
    if (!allowed.includes(name) || !Object.hasOwn(values, name) || !isSafeInterpolationValue(values[name])) return unavailable();
  }
  return template.replace(PLACEHOLDER_PATTERN, (_, name) => String(values[name]));
}

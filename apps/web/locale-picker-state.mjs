/** @param {string[]} locales @param {string} persistedLocale @param {string} pendingLocale @param {boolean} preservePending */
export function resolveLocaleSelection(locales, persistedLocale, pendingLocale, preservePending) {
  if (preservePending && locales.includes(pendingLocale)) return pendingLocale;
  if (locales.includes(persistedLocale)) return persistedLocale;
  return locales.includes('pt-BR') ? 'pt-BR' : '';
}

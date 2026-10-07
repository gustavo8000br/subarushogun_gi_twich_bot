import { readdir } from 'node:fs/promises';
import { discoverCatalogModule } from './discover-catalog-module.mjs';

/**
 * Discover every module directory and expose only locales complete in all of them.
 * @param {string} catalogRoot
 * @param {{requiredLocales?: readonly string[], placeholdersByModule?: Record<string, Record<string, string[]>>}} [options]
 * @returns {Promise<{modules: object, locales: readonly string[]}>}
 */
export async function discoverCatalogBundle(catalogRoot, options = {}) {
  let entries;
  try {
    entries = await readdir(catalogRoot, { withFileTypes: true });
  } catch {
    throw new Error('Catalog root directory is unavailable');
  }

  const moduleNames = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (moduleNames.length === 0) throw new Error('Catalog root must contain at least one module');

  const discoveredModules = await Promise.all(moduleNames.map(async (moduleName) => {
    const result = await discoverCatalogModule(catalogRoot, moduleName, {
      requiredLocales: options.requiredLocales,
      placeholders: options.placeholdersByModule?.[moduleName],
    });
    return [moduleName, result];
  }));

  const locales = discoveredModules[0][1].locales.filter((locale) => (
    discoveredModules.every(([, result]) => result.locales.includes(locale))
  ));
  const modules = Object.create(null);
  for (const [moduleName, result] of discoveredModules) {
    const catalogs = Object.create(null);
    for (const locale of locales) catalogs[locale] = result.catalogs[locale];
    modules[moduleName] = Object.freeze({ catalogs: Object.freeze(catalogs) });
  }

  return Object.freeze({ modules: Object.freeze(modules), locales: Object.freeze(locales) });
}

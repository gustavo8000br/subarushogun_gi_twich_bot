import { translateCatalog as translate } from '../../../shared/browser/translate-catalog.mjs';
import { PANEL_PLACEHOLDERS } from '../../../web/panel-catalog.mjs';

/** Convert the validated API bundle into the shared translator's module shape. */
export function normalizeCatalogBundle(bundle) {
  if (!bundle || typeof bundle !== 'object' || !Array.isArray(bundle.locales) || !bundle.modules?.panel?.catalogs) {
    throw new TypeError('The runtime panel catalog bundle is invalid.');
  }
  const panel = Object.create(null);
  for (const locale of bundle.locales) {
    const catalog = bundle.modules.panel.catalogs[locale];
    if (typeof locale !== 'string' || !catalog || typeof catalog !== 'object') throw new TypeError('The runtime panel catalog bundle is invalid.');
    panel[locale] = catalog;
  }
  if (bundle.locales.length === 0) throw new TypeError('The runtime panel catalog bundle is empty.');
  return Object.freeze({ locales: Object.freeze([...bundle.locales]), catalogs: Object.freeze(panel) });
}

export function translatePanel(catalogs, locale, key, options) {
  return translate({ 'pt-BR': catalogs?.['pt-BR'] ?? {}, ...catalogs }, locale, key, {
    ...options,
    placeholders: PANEL_PLACEHOLDERS,
  });
}

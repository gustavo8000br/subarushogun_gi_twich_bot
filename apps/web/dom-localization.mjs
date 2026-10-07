import { translateCatalog } from '../shared/browser/translate-catalog.mjs';

/** @param {Document|{documentElement?:{lang?:string},querySelectorAll:(selector:string)=>Iterable<HTMLElement>}} root @param {string} locale @param {Record<string,Record<string,string>>} catalogs */
export function applyPanelTranslations(root, locale, catalogs) {
  if (root.documentElement) root.documentElement.lang = locale;
  const translate = (key) => translateCatalog(catalogs, locale, key);
  for (const rawElement of root.querySelectorAll('[data-i18n]')) {
    const element = /** @type {HTMLElement} */ (rawElement);
    const key = element.dataset.i18n;
    if (key) element.textContent = translate(key);
  }
  for (const [selector, attribute, property] of [
    ['[data-i18n-placeholder]', 'placeholder', 'i18nPlaceholder'],
    ['[data-i18n-aria-label]', 'aria-label', 'i18nAriaLabel'],
    ['[data-i18n-title]', 'title', 'i18nTitle'],
  ]) {
    for (const rawElement of root.querySelectorAll(selector)) {
      const element = /** @type {HTMLElement} */ (rawElement);
      const key = element.dataset[property];
      if (key) element.setAttribute(attribute, translate(key));
    }
  }
}

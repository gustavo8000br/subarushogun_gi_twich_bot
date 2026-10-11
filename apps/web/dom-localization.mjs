import { translateCatalog } from '../shared/browser/translate-catalog.mjs';

/** @param {Document|{documentElement?:{lang?:string},querySelectorAll:(selector:string)=>Iterable<HTMLElement>}} root @param {string} locale @param {Record<string,Record<string,string>>} catalogs */
export function applyPanelTranslations(root, locale, catalogs, placeholders = {}) {
  if (root.documentElement) root.documentElement.lang = locale;
  const translate = (key) => {
    const values = Object.fromEntries((placeholders[key] ?? []).map((name) => [name, `{${name}}`]));
    return translateCatalog(catalogs, locale, key, { values, placeholders });
  };
  for (const rawElement of root.querySelectorAll('[data-i18n]')) {
    const element = /** @type {HTMLElement} */ (rawElement);
    const key = element.dataset.i18n;
    if (!key) continue;
    const textChild = [...(element.childNodes ?? [])].find((child) => child.nodeType === 3);
    if (textChild) textChild.textContent = translate(key);
    else element.textContent = translate(key);
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

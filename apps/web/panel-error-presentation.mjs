const ERROR_KEYS = Object.freeze({
  PRODUCT_LOCALE_VERSION_CONFLICT: 'panel.error.locale_conflict',
});

const DEFAULT_MESSAGE = 'Não foi possível concluir. Tente novamente.';

/**
 * Render only catalog-owned presentation text for an API or browser failure.
 * Never use a backend-provided error string as user-facing copy.
 * @param {{code?:unknown}|Error|null|undefined} error
 * @param {string} locale
 * @param {Record<string,Record<string,string>>|null|undefined} catalogs
 */
export function presentPanelError(error, locale = 'pt-BR', catalogs = null) {
  const errorCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const key = typeof errorCode === 'string' ? ERROR_KEYS[errorCode] : null;
  const messages = catalogs?.[locale];
  const fallbackMessages = catalogs?.['pt-BR'];
  if (key && typeof messages?.[key] === 'string' && messages[key].length > 0) return messages[key];
  if (key && typeof fallbackMessages?.[key] === 'string' && fallbackMessages[key].length > 0) return fallbackMessages[key];
  if (typeof messages?.['panel.error.generic'] === 'string' && messages['panel.error.generic'].length > 0) {
    return messages['panel.error.generic'];
  }
  if (typeof fallbackMessages?.['panel.error.generic'] === 'string' && fallbackMessages['panel.error.generic'].length > 0) {
    return fallbackMessages['panel.error.generic'];
  }
  return DEFAULT_MESSAGE;
}

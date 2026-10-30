/**
 * Persist the product language through Fastify's revision-checked API.
 * @param {{request: (path:string, options?:Record<string, unknown>) => Promise<any>, locale:string, current:{locale:string,revision:number}}} input
 */
export async function persistProductLocale({ request, locale, current }) {
  if (typeof locale !== 'string' || locale.length === 0
    || !current || typeof current.locale !== 'string'
    || !Number.isInteger(current.revision) || current.revision < 1) {
    throw Object.assign(new Error('The current product locale state is invalid.'), { code: 'INVALID_LOCALE_STATE' });
  }
  if (locale === current.locale) return current;
  const saved = await request('/api/localization/locale', {
    method: 'PATCH',
    body: JSON.stringify({ locale, expectedRevision: current.revision }),
  });
  if (!saved || saved.locale !== locale || saved.revision !== current.revision + 1) {
    throw Object.assign(new Error('The product locale response did not confirm the requested update.'), {
      code: 'INVALID_PRODUCT_LOCALE_RESPONSE',
    });
  }
  return saved;
}

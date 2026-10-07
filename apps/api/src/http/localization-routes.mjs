import { discoverCatalogBundle } from '../../../shared/localization/discover-catalog-bundle.mjs';

/**
 * Register the authenticated local projection of product translation catalogs.
 * Catalog contents are plain text and are rendered by the browser with textContent.
 * @param {import('fastify').FastifyInstance} app
 * @param {{catalogRoot: string, writeHostProjection?:(state:{locale:string,revision:number})=>Promise<unknown>, repository?: {setProductLocale?: (input: {locale: string, expectedRevision: number, actorId: string|null}) => Promise<{locale: string, revision: number}>}}} options
 */
export function registerLocalizationRoutes(app, { catalogRoot, repository = {}, writeHostProjection = async () => undefined }) {
  app.get('/api/localization/catalogs', async (_request, reply) => {
    try {
      const catalogs = await discoverCatalogBundle(catalogRoot);
      reply.header('cache-control', 'no-store');
      return catalogs;
    } catch {
      reply.header('cache-control', 'no-store');
      return reply.code(503).send({ code: 'LOCALIZATION_CATALOGS_UNAVAILABLE', error: 'Os textos do produto estão temporariamente indisponíveis.' });
    }
  });

  app.patch('/api/localization/locale', async (request, reply) => {
    const requestBody = /** @type {unknown} */ (request.body);
    const body = requestBody && typeof requestBody === 'object' && !Array.isArray(requestBody)
      ? /** @type {Record<string, unknown>} */ (requestBody) : {};
    if (typeof body.locale !== 'string' || body.locale.length > 64
      || typeof body.expectedRevision !== 'number' || !Number.isInteger(body.expectedRevision) || body.expectedRevision < 1) {
      return reply.code(400).send({ code: 'INVALID_PRODUCT_LOCALE', error: 'Revise o idioma selecionado e atualize a página.' });
    }

    let bundle;
    try { bundle = await discoverCatalogBundle(catalogRoot); }
    catch {
      return reply.code(503).send({ code: 'LOCALIZATION_CATALOGS_UNAVAILABLE', error: 'Os idiomas do produto estão temporariamente indisponíveis.' });
    }
    if (!bundle.locales.includes(body.locale)) {
      return reply.code(400).send({ code: 'LOCALE_UNAVAILABLE', error: 'Esse idioma ainda não está completo em todos os módulos do produto.' });
    }
    if (typeof repository.setProductLocale !== 'function') {
      return reply.code(503).send({ code: 'PRODUCT_LOCALE_UNAVAILABLE', error: 'Não foi possível salvar o idioma do produto.' });
    }

    try {
      const localRequest = /** @type {import('fastify').FastifyRequest & {localSession?: {id: string}}} */ (request);
      const saved = await repository.setProductLocale({
        locale: body.locale,
        expectedRevision: body.expectedRevision,
        actorId: localRequest.localSession?.id ?? null,
      });
      try { await writeHostProjection(saved); }
      catch { return { ...saved, host_projection_status: 'pending' }; }
      return saved;
    } catch (error) {
      if (error?.code === 'PRODUCT_LOCALE_VERSION_CONFLICT') {
        return reply.code(409).send({ code: 'PRODUCT_LOCALE_VERSION_CONFLICT', error: 'O idioma mudou em outra solicitação. Atualize as configurações.' });
      }
      if (error?.code === 'INVALID_PRODUCT_LOCALE') {
        return reply.code(400).send({ code: 'INVALID_PRODUCT_LOCALE', error: 'O idioma selecionado não está disponível.' });
      }
      return reply.code(503).send({ code: 'PRODUCT_LOCALE_UNAVAILABLE', error: 'Não foi possível salvar o idioma do produto.' });
    }
  });
}

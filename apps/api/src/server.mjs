import Fastify from 'fastify';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { createDatabaseUrl } from '../../infra/src/database-url.mjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { createTwitchHealthBridge, registerHealthRoute } from './health-route.mjs';
import { registerWebRoutes } from './web-route.mjs';
import { registerLocalSession } from './http/local-session.mjs';
import { registerQueueRoutes } from './http/queue-routes.mjs';
import { createQueueRepository } from './persistence/queue-repository.mjs';
import { createQueueDomainServiceProxy } from './domain/queue-service.mjs';
import { createOverlayWidgetRepository } from './persistence/overlay-widget-repository.mjs';
import { createTwitchCredentialRepository } from './persistence/twitch-credential-repository.mjs';
import { createApplicationRuntime } from './runtime.mjs';
import { createChatCommandHandler } from './commands/chat-handler.mjs';
import { createClearConfirmationService } from './domain/clear-confirmation.mjs';
import { createOverlayWidgetService } from './domain/overlay-widget-service.mjs';
import { createOverlayProjectionService } from './domain/overlay-projection-service.mjs';
import { registerOverlayRoutes } from './http/overlay-routes.mjs';
import { registerLocalizationRoutes } from './http/localization-routes.mjs';
import { discoverCatalogModule } from '../../shared/localization/discover-catalog-module.mjs';
import { writeProductLocaleProjection } from '../../infra/src/product-locale-projection.mjs';
import { fileURLToPath } from 'node:url';
import { createErrorDiagnosticReporter } from './observability/error-diagnostics.mjs';
import { createStructuredLogger } from './observability/structured-logger.mjs';
import { registerSafeHttpErrorHandler } from './http/safe-http-error-handler.mjs';
import { createTwitchRouteIntegrationProxy } from './twitch/route-integration-proxy.mjs';

const databaseUrl = await createDatabaseUrl();
const pool = new pg.Pool({ connectionString: databaseUrl });
const tlsKey = await readFile(process.env.TLS_KEY_FILE ?? '/run/secrets/localhost.key');
const tlsCertificate = await readFile(process.env.TLS_CERT_FILE ?? '/run/secrets/localhost.crt');
const app = Fastify({ logger: false, bodyLimit: 32 * 1024, https: { key: tlsKey, cert: tlsCertificate } });
const logEvent = createStructuredLogger({ level: process.env.APP_LOG_LEVEL ?? 'info' });
const reportDiagnostic = createErrorDiagnosticReporter({ logger: logEvent });
registerSafeHttpErrorHandler(app, { reportDiagnostic });
const productVersion = (await readFile(new URL('../../../VERSION', import.meta.url), 'utf8')).trim();
const port = Number(process.env.APP_PORT ?? 3000);
const catalogRoot = fileURLToPath(new URL('../../web/localization/catalogs/', import.meta.url));
process.env.DATABASE_URL = databaseUrl;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const repository = createQueueRepository(prisma, { defaultProductLocale: process.env.PRODUCT_INITIAL_LOCALE ?? 'pt-BR' });
const localeProjectionPath = process.env.PRODUCT_LOCALE_PROJECTION_FILE ?? '/app/.local/product-locale.state';
try { await writeProductLocaleProjection(localeProjectionPath, await repository.getProductLocale()); }
catch { process.stderr.write('Product locale host projection could not be synchronized; the database remains authoritative.\n'); }
const overlayRepository = createOverlayWidgetRepository(prisma);
const credentialRepository = createTwitchCredentialRepository(prisma);
let runtime;
const twitchHealthBridge = createTwitchHealthBridge();
let overlayCatalogCache = null;
let overlayCatalogCacheAt = 0;
const getOverlayCatalogs = async () => {
  if (overlayCatalogCache && Date.now() - overlayCatalogCacheAt < 5_000) return overlayCatalogCache;
  const discovered = await discoverCatalogModule(catalogRoot, 'overlay');
  overlayCatalogCache = discovered.catalogs;
  overlayCatalogCacheAt = Date.now();
  return overlayCatalogCache;
};
const currentCredential = await credentialRepository.getAuthRecord().catch(() => null);
const domainServiceProxy = createQueueDomainServiceProxy({ getService: () => runtime.domainService });
const clearConfirmation = createClearConfirmationService({ repository, domainService: domainServiceProxy });
const twitchProxy = {
  async sendChatMessage(message) { return runtime?.integration?.twitch?.sendChatMessage(message) ?? { sent: false }; },
  async getUserByLogin(login) { return runtime?.integration?.twitch?.getUserByLogin(login) ?? null; },
};
const buildChatHandler = (broadcasterId) => createChatCommandHandler({
  repository, domainService: domainServiceProxy, twitch: twitchProxy, clearConfirmation, settings: {
    getAccount: () => repository.getCurrentAccount(),
    setAccount: (label, actorId) => repository.setCurrentAccount(label, actorId),
    resetAccount: (actorId) => repository.resetCurrentAccount(actorId),
  }, broadcasterId, productVersion, getTwitchHealth: twitchHealthBridge.read,
  getChatCatalogs: async () => (await discoverCatalogModule(catalogRoot, 'chat')).catalogs,
  onError: () => undefined,
});
let chatHandler = currentCredential?.broadcasterId ? buildChatHandler(currentCredential.broadcasterId) : null;

registerLocalSession(app, { port });
const healthRoute = registerHealthRoute(app, {
  pool,
  productVersion,
  getTwitchStatus: () => runtime?.twitchStatus ?? 'connecting',
  getTwitchChatStatus: () => runtime?.integration?.chatStatus ?? 'not_configured',
  getTwitchRewardStatus: () => runtime?.integration?.rewardStatus ?? 'unknown',
  probeTwitchApi: () => runtime?.integration?.probeTwitchApi?.() ?? false,
});
twitchHealthBridge.attach(healthRoute.getTwitchHealth);
registerQueueRoutes(app, {
  repository,
  domainService: domainServiceProxy,
  clearConfirmation,
  getSetupCatalogs: async () => (await discoverCatalogModule(catalogRoot, 'setup')).catalogs,
  productVersion,
  integrations: createTwitchRouteIntegrationProxy(() => runtime?.integration ?? null),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `https://localhost:${port}`,
  resolveUser: async (login) => runtime?.integration?.twitch?.getUserByLogin(login) ?? null,
  reportDiagnostic,
  logEvent,
});
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `https://localhost:${port}`;
registerOverlayRoutes(app, {
  repository: overlayRepository,
  widgetService: createOverlayWidgetService({ repository: overlayRepository, origin: publicBaseUrl }),
  projectionService: createOverlayProjectionService({ overlayRepository, queueRepository: repository, getOverlayCatalogs }),
});
registerLocalizationRoutes(app, {
  catalogRoot,
  writeHostProjection: (localeState) => writeProductLocaleProjection(localeProjectionPath, localeState),
  repository,
});
await registerWebRoutes(
  app,
  fileURLToPath(new URL('../../web/', import.meta.url)),
  fileURLToPath(new URL('../../shared/browser/', import.meta.url)),
);

runtime = await createApplicationRuntime({ app, pool, prisma, repository, credentialRepository, reportDiagnostic, onError: () => undefined,
  onChatMessage: (event) => {
    chatHandler ??= buildChatHandler(event.broadcasterId);
    return chatHandler(event);
  } });

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await runtime?.stop();
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

try {
  await app.listen({ host: process.env.APP_HOST ?? '0.0.0.0', port });
} catch {
  await shutdown();
  process.stderr.write('Local application server failed to start. Check runtime configuration and database health.\n');
  process.exitCode = 1;
}

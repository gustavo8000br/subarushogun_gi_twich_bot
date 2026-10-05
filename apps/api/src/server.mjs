import Fastify from 'fastify';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { createDatabaseUrl } from '../../infra/src/database-url.mjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { registerHealthRoute } from './health-route.mjs';
import { registerWebRoutes } from './web-route.mjs';
import { registerLocalSession } from './http/local-session.mjs';
import { registerQueueRoutes } from './http/queue-routes.mjs';
import { createQueueRepository } from './persistence/queue-repository.mjs';
import { createTwitchCredentialRepository } from './persistence/twitch-credential-repository.mjs';
import { createApplicationRuntime } from './runtime.mjs';
import { createChatCommandHandler } from './commands/chat-handler.mjs';
import { createClearConfirmationService } from './domain/clear-confirmation.mjs';
import { fileURLToPath } from 'node:url';

const databaseUrl = await createDatabaseUrl();
const pool = new pg.Pool({ connectionString: databaseUrl });
const app = Fastify({ logger: false, bodyLimit: 32 * 1024 });
const productVersion = (await readFile(new URL('../../../VERSION', import.meta.url), 'utf8')).trim();
const port = Number(process.env.APP_PORT ?? 3000);
process.env.DATABASE_URL = databaseUrl;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const repository = createQueueRepository(prisma);
const credentialRepository = createTwitchCredentialRepository(prisma);
let runtime;
const currentCredential = await credentialRepository.getAuthRecord().catch(() => null);
const domainServiceProxy = {
  transitionEntry: (input) => runtime.domainService.transitionEntry(input),
  callNext: (input) => runtime.domainService.callNext(input),
  callSpecificEntry: (input) => runtime.domainService.callSpecificEntry(input),
  clearActiveEntries: (input) => runtime.domainService.clearActiveEntries(input),
};
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
  }, broadcasterId, onError: () => undefined,
});
let chatHandler = currentCredential?.broadcasterId ? buildChatHandler(currentCredential.broadcasterId) : null;

registerLocalSession(app, { port });
registerHealthRoute(app, { pool, productVersion, getTwitchStatus: () => runtime?.twitchStatus ?? 'connecting' });
registerQueueRoutes(app, {
  repository,
  domainService: domainServiceProxy,
  clearConfirmation,
  productVersion,
  integrations: {
    get status() { return runtime?.integration?.status ?? 'not_configured'; },
    async getSetupState() { return runtime?.integration?.getSetupState?.(); },
    async validateAndSaveApplication(input) { return runtime?.integration?.validateAndSaveApplication?.(input); },
    async beginAuthorization(sessionId) { return runtime?.integration?.beginAuthorization?.(sessionId); },
    async completeAuthorization(input) { return runtime?.integration?.completeAuthorization?.(input); },
  },
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`,
  resolveUser: async (login) => runtime?.integration?.twitch?.getUserByLogin(login) ?? null,
});
await registerWebRoutes(app, fileURLToPath(new URL('../../web/', import.meta.url)));

runtime = await createApplicationRuntime({ app, pool, prisma, repository, credentialRepository, onError: () => undefined,
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

import { createQueueRepository } from './persistence/queue-repository.mjs';
import { createQueueDomainService } from './domain/queue-service.mjs';
import { createFinancialOutboxWorker } from './outbox/financial-worker.mjs';
import { createChatOutboxWorker } from './outbox/chat-worker.mjs';
import { createRewardOutboxWorker } from './outbox/reward-worker.mjs';
import { createOutboxLoop } from './outbox/loop.mjs';
import { createTwitchIntegration } from './twitch/integration.mjs';
import { createCallTimeoutLoop } from './outbox/timeout-loop.mjs';

/** @param {Record<string, any>} dependencies */
export async function createApplicationRuntime({
  app, pool, prisma, repository = createQueueRepository(prisma),
  credentialRepository: suppliedCredentialRepository,
  financialWorker = null, chatWorker = null,
  rewardWorker = null,
  financialWorkerFactory = createFinancialOutboxWorker,
  chatWorkerFactory = createChatOutboxWorker,
  rewardWorkerFactory = createRewardOutboxWorker,
  integrationFactory = createTwitchIntegration,
  loopFactory = createOutboxLoop,
  timeoutLoopFactory = createCallTimeoutLoop,
  onChatMessage = () => undefined,
  onError = () => undefined,
  reportDiagnostic = () => undefined,
}) {
  const domainService = createQueueDomainService({ repository });
  const credentialRepository = suppliedCredentialRepository ?? dependenciesCredentialRepository(prisma);
  const integration = await integrationFactory({ credentialRepository, repository, domainService, onChatMessage, onStatus: onError, reportDiagnostic });
  let financialImplementation = financialWorker ?? null;
  let chatImplementation = chatWorker ?? null;
  let rewardImplementation = rewardWorker ?? null;
  const financial = {
    async processOne() {
      if (!integration.twitch) return 'idle';
      financialImplementation ??= financialWorkerFactory({ repository, getTwitch: () => integration.twitch, twitch: integration.twitch });
      return financialImplementation.processOne();
    },
  };
  const chat = {
    async processOne() {
      if (!integration.twitch) return 'idle';
      chatImplementation ??= chatWorkerFactory({ repository, getTwitch: () => integration.twitch, twitch: integration.twitch });
      return chatImplementation.processOne();
    },
  };
  const reward = {
    async processOne() {
      if (!integration.twitch) return 'idle';
      rewardImplementation ??= rewardWorkerFactory({ repository, getTwitch: () => integration.twitch, twitch: integration.twitch, onDiagnostic: reportDiagnostic });
      return rewardImplementation.processOne();
    },
  };
  const loops = [
    loopFactory({ worker: financial, onError, source: 'outbox.financial', onDiagnostic: reportDiagnostic }),
    loopFactory({ worker: chat, onError, source: 'outbox.chat', onDiagnostic: reportDiagnostic }),
    loopFactory({ worker: reward, onError, source: 'outbox.reward', onDiagnostic: reportDiagnostic }),
  ];
  for (const loop of loops) loop.start();
  const timeoutLoop = timeoutLoopFactory({ repository, domainService, onError, isRecovered: () => integration?.status === 'connected' });
  timeoutLoop.start();
  let stopped = false;
  return {
    app, pool, prisma, repository, domainService, integration, financialWorker: financial, chatWorker: chat, rewardWorker: reward,
    get twitchStatus() { return integration?.status ?? 'not_configured'; },
    async stop() {
      if (stopped) return;
      stopped = true;
      await Promise.all(loops.map((loop) => loop.stop()));
      await timeoutLoop.stop();
      await integration?.stop?.();
      await app?.close?.();
      await prisma?.$disconnect?.();
      await pool?.end?.();
    },
  };
}

function dependenciesCredentialRepository(prisma) {
  return prisma?.credentialRepository ?? {
    async getAuthRecord() { return null; },
  };
}

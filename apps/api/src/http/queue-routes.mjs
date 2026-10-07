import { normalizeQueueKeys } from '../domain/queue-keys.mjs';
import { createHash } from 'node:crypto';
import { CHAT_COMMANDS, CONFIGURABLE_COMMAND_ROLES, resolveAllowedRoles } from '../commands/catalog.mjs';

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  return value;
}

function mutationFingerprint(request) {
  const body = canonicalValue(request.body ?? null);
  return createHash('sha256').update(JSON.stringify({ method: request.method, url: request.url, body })).digest('hex');
}

function routeError(error) {
  if (['INVALID_QUEUE_KEY', 'RESERVED_QUEUE_KEY', 'DUPLICATE_QUEUE_KEY', 'INVALID_QUEUE_ALIASES', 'INVALID_UID'].includes(error?.code)) return 400;
  if (['DUPLICATE_QUEUE_KEY'].includes(error?.code)) return 409;
  if (error?.code === 'QUEUE_NOT_FOUND' || error?.code === 'ENTRY_NOT_FOUND') return 404;
  if (error?.code === 'QUEUE_NOT_AVAILABLE') return 409;
  return 400;
}

function containsControlCharacters(value) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
}

function queueDto(queue, { operator = false } = {}) {
  return {
    id: queue.id, slug: queue.slug, aliases: queue.aliases ?? [], title: queue.title,
    rewardPrompt: queue.rewardPrompt, cost: queue.cost, uidMode: queue.uidMode,
    maxRedemptionsPerStream: queue.maxRedemptionsPerStream ?? null,
    maxRedemptionsPerUserPerStream: queue.maxRedemptionsPerUserPerStream ?? null,
    globalCooldownSeconds: queue.globalCooldownSeconds ?? null,
    callMessage: queue.callMessage, callTimeoutMin: queue.callTimeoutMin,
    showUidInList: queue.showUidInList, showUidInOverlay: queue.showUidInOverlay, showUidOnCall: queue.showUidOnCall,
    autoSwitchAccount: queue.autoSwitchAccount, refundIfRemovedWhileCalled: queue.refundIfRemovedWhileCalled,
    refundOnNoShow: queue.refundOnNoShow, refundIfViewerLeavesWhileCalled: queue.refundIfViewerLeavesCalled,
    isOpen: queue.isOpen, isArchived: queue.isArchived, lifecycleStatus: queue.lifecycleStatus,
    version: queue.version, remoteSyncStatus: queue.remoteSyncStatus,
    entries: (queue.entries ?? []).map((entry) => ({
      id: entry.id, userId: entry.userId, userLogin: entry.userLogin, displayName: entry.displayName,
      status: entry.status, position: entry.position, version: entry.version,
      priorityClass: entry.priorityClass ?? 'standard', priorityReason: entry.priorityReason ?? null,
      ...((operator && queue.uidMode === 'visible') || (!operator && queue.uidMode === 'visible' && queue.showUidInOverlay) ? { uid: entry.uid ?? null } : {}),
      calledAt: entry.calledAt, callDeadlineAt: entry.callDeadlineAt,
    })),
  };
}

function setupDto(value, publicBaseUrl) {
  const source = value ?? {};
  const eligibility = source.eligibility && typeof source.eligibility === 'object' ? {
    eligible: source.eligibility.eligible === true,
    broadcasterType: ['affiliate', 'partner'].includes(source.eligibility.broadcasterType) ? source.eligibility.broadcasterType : 'unknown',
    channelPointsAvailable: source.eligibility.channelPointsAvailable === true,
    ...(Number.isInteger(source.eligibility.rewardCount) ? { rewardCount: source.eligibility.rewardCount } : {}),
    ...(Number.isInteger(source.eligibility.rewardLimit) ? { rewardLimit: source.eligibility.rewardLimit } : {}),
    ...(typeof source.eligibility.nearRewardLimit === 'boolean' ? { nearRewardLimit: source.eligibility.nearRewardLimit } : {}),
    ...(typeof source.eligibility.reason === 'string' ? { reason: source.eligibility.reason } : {}),
  } : null;
  return {
    callbackUrl: `${publicBaseUrl}/callback`,
    clientId: typeof source.clientId === 'string' ? source.clientId : null,
    secretConfigured: source.secretConfigured === true,
    connected: source.connected === true,
    broadcasterId: source.connected === true ? source.broadcasterId ?? null : null,
    scopes: source.connected === true && Array.isArray(source.scopes) ? source.scopes : [],
    status: source.status ?? (source.connected === true ? 'connected' : 'not_configured'),
    eligibility,
  };
}

function matchesPendingQueueReward(reward, queue) {
  return reward.title === queue.title && reward.cost === queue.cost
    && (reward.prompt ?? '') === (queue.rewardPrompt ?? '')
    && reward.userInputRequired === (queue.uidMode === 'visible')
    && (reward.maxRedemptionsPerStream ?? null) === (queue.maxRedemptionsPerStream ?? null)
    && (reward.maxRedemptionsPerUserPerStream ?? null) === (queue.maxRedemptionsPerUserPerStream ?? null)
    && (reward.globalCooldown ?? null) === (queue.globalCooldownSeconds ?? null)
    && reward.autoFulfill === false && reward.shouldRedemptionsSkipRequestQueue === false
    && reward.isEnabled === true && reward.isPaused === true;
}

/** @param {import('fastify').FastifyInstance} app @param {{repository: any, domainService?: any, integrations?: any, clearConfirmation?: any, publicBaseUrl?: string, productVersion?: string, resolveUser?: (login: string) => Promise<any>}} deps */
export function registerQueueRoutes(app, { repository, domainService = repository, integrations = {}, clearConfirmation, publicBaseUrl = process.env.PUBLIC_BASE_URL ?? 'https://localhost:3000', productVersion = process.env.PRODUCT_VERSION ?? 'v0.1.0-0000000-alpha', resolveUser = async () => null }) {
  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/api/') || request.url === '/api/session'
      || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const localRequest = /** @type {any} */ (request);
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
      return reply.code(400).send({ error: 'Esta ação precisa de uma chave de idempotência válida. Atualize o painel e tente novamente.' });
    }
    if (typeof repository.beginPanelOperation !== 'function' || typeof repository.completePanelOperation !== 'function') {
      return reply.code(503).send({ error: 'O registro seguro de operações não está disponível.' });
    }
    const fingerprint = mutationFingerprint(request);
    const operationKey = `panel:${localRequest.localSession?.id ?? 'unknown'}:${key}`;
    let decision;
    try { decision = await repository.beginPanelOperation({ operationKey, fingerprint }); }
    catch { return reply.code(503).send({ error: 'Não foi possível registrar a operação com segurança.' }); }
    if (decision.status === 'replay') {
      reply.header('idempotency-replayed', 'true').code(decision.statusCode ?? 200);
      return reply.send(decision.responseBody ?? null);
    }
    if (decision.status === 'conflict') return reply.code(409).send({ error: 'Esta chave já foi usada com outra requisição. Atualize o painel e tente novamente.' });
    if (decision.status === 'in_progress') return reply.code(409).send({ error: 'Esta operação já foi iniciada. Atualize o painel para conferir o estado antes de tentar novamente.' });
    localRequest.idempotencyRecord = { operationKey, fingerprint };
  });
  app.addHook('onSend', async (request, reply, payload) => {
    const record = /** @type {any} */ (request).idempotencyRecord;
    if (!record || reply.statusCode >= 500) return payload;
    const oneTimeSecretResponse = Boolean((/** @type {any} */ (request)).overlaySecretResponse);
    let responseBody = oneTimeSecretResponse
      ? { code: 'OVERLAY_LINK_ALREADY_ISSUED', error: 'O link foi emitido uma vez. Gere outro se precisar copiá-lo novamente.' }
      : null;
    const replayStatusCode = oneTimeSecretResponse ? 409 : reply.statusCode;
    if (!oneTimeSecretResponse) {
      try { responseBody = typeof payload === 'string' ? JSON.parse(payload) : payload ?? null; } catch { /* Keep an explicit null result for non-JSON replies. */ }
    }
    try { await repository.completePanelOperation({ ...record, statusCode: replayStatusCode, responseBody }); }
    catch { reply.header('idempotency-store', 'pending'); }
    return payload;
  });
  app.get('/api/setup', async () => setupDto(await integrations.getSetupState?.(), publicBaseUrl));
  app.get('/api/state', async () => {
    const state = await repository.getLocalState?.() ?? {};
    return {
      product_version: state.productVersion ?? productVersion,
      api_contract_version: '1', revision: state.revision ?? 1,
      generated_at: new Date().toISOString(), account: state.account ?? { label: 'Streamer', source: 'default' },
      product_locale: state.productLocale ?? { locale: 'pt-BR', revision: 1 },
      connectivity: { database: 'connected', twitch: integrations.status ?? 'not_configured' },
      queues: (await repository.listQueueProjection?.() ?? []).map((queue) => queueDto(queue)),
      pending_operations: await repository.listFinancialOperations?.() ?? [],
    };
  });
  app.get('/api/command-catalog', async (_request, reply) => {
    if (typeof repository.getCommandPolicyState !== 'function') return reply.code(503).send({ error: 'O catálogo de comandos não está disponível.' });
    try {
      const state = await repository.getCommandPolicyState();
      return {
        version: state.version,
        configurableRoles: CONFIGURABLE_COMMAND_ROLES,
        commands: CHAT_COMMANDS.map((definition) => ({
          key: definition.key, scope: definition.scope, syntax: definition.syntax,
          description: definition.description, defaultRoles: definition.defaultRoles,
          allowedRoles: resolveAllowedRoles(definition, state.policies),
          immutableRoles: definition.immutableRoles ?? null,
          configurable: !definition.immutableRoles,
        })),
      };
    } catch {
      return reply.code(503).send({ error: 'Não foi possível carregar o catálogo de comandos.' });
    }
  });
  app.patch('/api/command-policies', async (request, reply) => {
    const localRequest = /** @type {any} */ (request);
    const body = localRequest.body && typeof localRequest.body === 'object' && !Array.isArray(localRequest.body) ? localRequest.body : {};
    const policies = body.policies;
    if (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 1
      || !policies || typeof policies !== 'object' || Array.isArray(policies) || !Object.keys(policies).length
      || Object.keys(body).some((key) => !['expectedVersion', 'policies'].includes(key))) {
      return reply.code(400).send({ error: 'Atualize o catálogo e informe permissões válidas.' });
    }
    for (const [key, roles] of Object.entries(policies)) {
      const definition = CHAT_COMMANDS.find((entry) => entry.key === key);
      if (!definition || definition.immutableRoles || !Array.isArray(roles)
        || roles.some((role) => !CONFIGURABLE_COMMAND_ROLES.includes(role))
        || new Set(roles).size !== roles.length) {
        return reply.code(400).send({ error: 'Um ou mais comandos têm cargos inválidos ou não podem ser alterados.' });
      }
    }
    if (typeof repository.updateCommandPolicies !== 'function') return reply.code(503).send({ error: 'A gravação do catálogo de comandos não está disponível.' });
    try {
      return await repository.updateCommandPolicies({
        expectedVersion: body.expectedVersion, policies,
        actorId: localRequest.localSession?.id ?? null, origin: 'panel',
      });
    } catch (error) {
      if (error?.code === 'COMMAND_POLICY_VERSION_CONFLICT') return reply.code(409).send({ error: 'As permissões mudaram. Atualize o catálogo antes de salvar.' });
      if (error?.code === 'INVALID_COMMAND_POLICY') return reply.code(400).send({ error: 'Revise os cargos selecionados para cada comando.' });
      return reply.code(503).send({ error: 'Não foi possível salvar as permissões dos comandos.' });
    }
  });
  app.get('/api/operations', async () => (await repository.listFinancialOperations?.() ?? []).map((operation) => ({
    id: operation.id, type: operation.operationType, redemptionId: operation.redemptionId,
    ...(operation.operationType.startsWith('reward.') ? { entityId: operation.entityId } : {}),
    status: operation.status, attempts: operation.attempts, lastError: operation.lastError,
    nextAttemptAt: operation.nextAttemptAt ?? null,
  })));
  app.post('/api/operations/:operationId/retry', async (request, reply) => {
    const result = await repository.retryOutboxManually(/** @type {any} */ (request.params).operationId);
    if (!result.count) return reply.code(409).send({ error: 'Esta operação não está disponível para nova tentativa manual.' });
    return { status: 'pending' };
  });
  app.post('/api/operations/:operationId/resolve-unknown', async (request, reply) => {
    const localRequest = /** @type {any} */ (request);
    const result = await repository.resolveUnknownFinancialOperation?.(localRequest.params.operationId, localRequest.localSession?.id);
    if (!result || result.status !== 'resolved_manual') return reply.code(409).send({ error: 'Esta operação não está disponível para resolução manual.' });
    return { status: 'resolved_manual', remoteConfirmed: false };
  });
  app.post('/api/reconciliation', async (_request, reply) => {
    if (typeof integrations.reconcileNow !== 'function') return reply.code(503).send({ error: 'A integração Twitch não está pronta para sincronização.' });
    const result = await integrations.reconcileNow();
    if (!result) return reply.code(503).send({ error: 'Não foi possível iniciar a sincronização. Verifique a conexão Twitch.' });
    return result;
  });
  app.post('/api/setup/application', async (request, reply) => {
    /** @type {Record<string, any>} */
    const body = /** @type {Record<string, any>} */ (request.body && typeof request.body === 'object' ? request.body : {});
    if (typeof body.clientId !== 'string' || body.clientId.trim().length < 1 || body.clientId.length > 128
      || typeof body.clientSecret !== 'string' || body.clientSecret.length < 1 || body.clientSecret.length > 256) {
      return reply.code(400).send({ error: 'Informe Client ID e Secret válidos.' });
    }
    if (!integrations.validateAndSaveApplication) return reply.code(503).send({ error: 'A integração Twitch ainda não está disponível. Reinicie a aplicação e consulte o estado de saúde.' });
    try {
      const status = await integrations.validateAndSaveApplication({ clientId: body.clientId.trim(), clientSecret: body.clientSecret });
      return reply.code(200).send({ status: 'validated', clientId: status.clientId, secretConfigured: true });
    } catch (error) {
      const code = error?.code === 'CHANNEL_BINDING_LOCKED' ? 409 : 400;
      return reply.code(code).send({ error: code === 409 ? 'Esta instalação já está vinculada a outro canal ou aplicativo.' : 'Não foi possível validar as credenciais da Twitch.' });
    }
  });
  app.post('/api/setup/connect', async (_request, reply) => {
    /** @type {import('fastify').FastifyRequest & {localSession?: {id: string}}} */
    const localRequest = _request;
    const result = await integrations.beginAuthorization?.(localRequest.localSession?.id);
    if (!result?.url) return reply.code(503).send({ error: 'Configure e valide o aplicativo Twitch antes de conectar.' });
    return { authorizationUrl: result.url };
  });
  app.get('/callback', async (request, reply) => {
    /** @type {import('fastify').FastifyRequest & {localSession?: {id: string}, query: Record<string, any>}} */
    const localRequest = request;
    if (!localRequest.localSession?.id) return reply.code(400).type('text/html; charset=utf-8').send(callbackPage('', { success: false }));
    const code = localRequest.query?.code;
    const state = localRequest.query?.state;
    if (typeof code !== 'string' || typeof state !== 'string' || !integrations.completeAuthorization || localRequest.query?.error) {
      return reply.code(400).type('text/html; charset=utf-8').send(callbackPage('', { success: false }));
    }
    try {
      const identity = await integrations.completeAuthorization({ sessionId: localRequest.localSession.id, code, state });
      return reply.type('text/html; charset=utf-8').send(callbackPage(identity.displayName ?? identity.login ?? 'Canal conectado'));
    } catch {
      return reply.code(400).type('text/html; charset=utf-8').send(callbackPage('', { success: false }));
    }
  });
  app.post('/api/queues', async (request, reply) => {
    /** @type {Record<string, any>} */
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    /** @type {import('fastify').FastifyRequest & {localSession?: {id: string}}} */
    const localRequest = request;
    try {
      const keys = normalizeQueueKeys({ slug: body.slug, aliases: body.aliases ?? [] });
      if (typeof body.title !== 'string' || body.title.trim().length < 1 || body.title.length > 45
        || !Number.isInteger(body.cost) || body.cost <= 0
        || ['maxRedemptionsPerStream', 'maxRedemptionsPerUserPerStream', 'globalCooldownSeconds'].some((field) => body[field] !== undefined && body[field] !== null && (!Number.isInteger(body[field]) || body[field] < 1 || body[field] > 2147483647))
        || !['hidden', 'visible'].includes(body.uidMode ?? 'hidden')) return reply.code(400).send({ error: 'Revise o nome, o custo e o modo de UID da fila.' });
      const result = await repository.createQueueWithRewardIntent({
        ...keys, title: body.title.trim(), cost: body.cost, rewardPrompt: safePrompt(body.rewardPrompt),
        maxRedemptionsPerStream: body.maxRedemptionsPerStream ?? null,
        maxRedemptionsPerUserPerStream: body.maxRedemptionsPerUserPerStream ?? null,
        globalCooldownSeconds: body.globalCooldownSeconds ?? null,
        callMessage: validCallMessage(body.callMessage), callTimeoutMin: body.callTimeoutMin === undefined ? 10 : body.callTimeoutMin,
        uidMode: body.uidMode ?? 'hidden', isOpen: false, actorId: localRequest.localSession?.id ?? null,
      });
      return reply.code(201).send(queueDto(result.queue, { operator: true }));
    } catch (error) {
      return reply.code(routeError(error)).send({ error: userError(error) });
    }
  });
  app.get('/api/queues', async () => (await repository.listQueueProjection?.() ?? []).map((queue) => queueDto(queue, { operator: true })));
  app.patch('/api/queues/:queueId/settings', async (request, reply) => {
    const localRequest = /** @type {any} */ (request);
    const body = localRequest.body && typeof localRequest.body === 'object' ? localRequest.body : {};
    const allowed = new Set(['expectedVersion', 'callTimeoutMin', 'callMessage', 'showUidInList', 'showUidInOverlay', 'showUidOnCall', 'autoSwitchAccount', 'refundIfRemovedWhileCalled', 'refundOnNoShow', 'refundIfViewerLeavesCalled']);
    const keys = Object.keys(body);
    if (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 1 || keys.some((key) => !allowed.has(key))) {
      return reply.code(400).send({ error: 'Atualize a fila e informe somente configurações válidas.' });
    }
    const settings = Object.fromEntries(keys.filter((key) => key !== 'expectedVersion').map((key) => [key, body[key]]));
    if (!Object.keys(settings).length
      || ('callTimeoutMin' in settings && settings.callTimeoutMin !== null && (!Number.isInteger(settings.callTimeoutMin) || settings.callTimeoutMin < 1 || settings.callTimeoutMin > 120))
      || ('callMessage' in settings && (typeof settings.callMessage !== 'string' || settings.callMessage.length > 350 || containsControlCharacters(settings.callMessage)))
      || Object.entries(settings).some(([key, value]) => !['callTimeoutMin', 'callMessage'].includes(key) && typeof value !== 'boolean')) {
      return reply.code(400).send({ error: 'Revise as configurações da fila.' });
    }
    if (typeof settings.callMessage === 'string' && [...settings.callMessage.matchAll(/\{([^}]+)\}/g)].some(([, name]) => !['user', 'queue', 'position', 'uid', 'account'].includes(name))) {
      return reply.code(400).send({ error: 'O modelo de chamada contém um campo não permitido.' });
    }
    try {
      const queue = await repository.updateLocalQueueSettings({ queueId: localRequest.params.queueId, expectedVersion: body.expectedVersion, settings, actorId: localRequest.localSession?.id ?? null, origin: 'panel' });
      return queueDto(queue, { operator: true });
    } catch (error) {
      if (error?.code === 'QUEUE_NOT_FOUND') return reply.code(404).send({ error: 'Fila não encontrada.' });
      if (error?.code === 'STALE_QUEUE_VERSION') return reply.code(409).send({ error: 'A fila mudou em outra operação. Atualize o painel e tente novamente.' });
      if (error?.code === 'QUEUE_NOT_AVAILABLE') return reply.code(409).send({ error: 'Esta fila não aceita alterações enquanto está sendo excluída.' });
      if (error?.code === 'INVALID_LOCAL_QUEUE_SETTING') return reply.code(400).send({ error: 'A privacidade do UID e a recompensa devem ser alteradas no editor de recompensa Twitch.' });
      return reply.code(503).send({ error: 'Não foi possível salvar as configurações da fila.' });
    }
  });
  app.patch('/api/queues/:queueId/reward-settings', async (request, reply) => {
    const localRequest = /** @type {any} */ (request);
    const body = localRequest.body && typeof localRequest.body === 'object' ? localRequest.body : {};
    const allowed = new Set(['expectedVersion', 'title', 'cost', 'rewardPrompt', 'uidMode', 'maxRedemptionsPerStream', 'maxRedemptionsPerUserPerStream', 'globalCooldownSeconds']);
    const keys = Object.keys(body);
    if (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 1 || keys.some((key) => !allowed.has(key)) || keys.length < 2) {
      return reply.code(400).send({ error: 'Atualize a fila e informe configurações de recompensa válidas.' });
    }
    const settings = Object.fromEntries(keys.filter((key) => key !== 'expectedVersion').map((key) => [key, body[key]]));
    const validLimit = (key) => !(key in settings) || settings[key] === null || (Number.isInteger(settings[key]) && settings[key] > 0 && settings[key] <= 2147483647);
    if (('title' in settings && (typeof settings.title !== 'string' || !settings.title.trim() || settings.title.trim().length > 45))
      || ('cost' in settings && (!Number.isInteger(settings.cost) || settings.cost < 1 || settings.cost > 2147483647))
      || ('rewardPrompt' in settings && (typeof settings.rewardPrompt !== 'string' || settings.rewardPrompt.trim().length > 200 || containsControlCharacters(settings.rewardPrompt)))
      || ('uidMode' in settings && !['hidden', 'visible'].includes(settings.uidMode))
      || !validLimit('maxRedemptionsPerStream') || !validLimit('maxRedemptionsPerUserPerStream') || !validLimit('globalCooldownSeconds')) {
      return reply.code(400).send({ error: 'Revise título, custo, descrição, modo de UID e limites da recompensa.' });
    }
    if (typeof settings.title === 'string') settings.title = settings.title.trim();
    if (typeof settings.rewardPrompt === 'string') settings.rewardPrompt = settings.rewardPrompt.trim();
    try {
      const result = await repository.updateQueueRewardSettings({ queueId: localRequest.params.queueId, expectedVersion: body.expectedVersion, settings, actorId: localRequest.localSession?.id ?? null, origin: 'panel' });
      return reply.code(202).send({ ...queueDto(result.queue, { operator: true }), operationStatus: result.status });
    } catch (error) {
      if (error?.code === 'QUEUE_NOT_FOUND') return reply.code(404).send({ error: 'Fila não encontrada.' });
      if (['STALE_QUEUE_VERSION', 'QUEUE_REWARD_NOT_READY', 'QUEUE_REWARD_UPDATE_PENDING'].includes(error?.code)) return reply.code(409).send({ error: 'A recompensa não está sincronizada ou a fila mudou. Atualize o painel e tente novamente.' });
      if (error?.code === 'QUEUE_NOT_AVAILABLE') return reply.code(409).send({ error: 'Esta fila não aceita alterações enquanto está sendo excluída.' });
      return reply.code(503).send({ error: 'Não foi possível solicitar a alteração da recompensa Twitch.' });
    }
  });
  app.get('/api/queues/:queueId/history', async (request, reply) => {
    const queueId = /** @type {any} */ (request.params).queueId;
    const queue = await repository.getQueueById(queueId);
    if (!queue || queue.lifecycleStatus === 'deleted') return reply.code(404).send({ error: 'Fila não encontrada.' });
    const entries = await repository.listQueueHistoryProjection?.(queueId, { limit: 100 }) ?? [];
    return entries.map((entry) => ({
      id: entry.id,
      userLogin: entry.userLogin,
      displayName: entry.displayName,
      status: entry.status,
      finishedAt: entry.finishedAt,
      terminalReason: entry.terminalReason,
    }));
  });
  app.post('/api/queues/:queueId/move', async (request, reply) => {
    const localRequest = /** @type {any} */ (request);
    const { entryId, position } = localRequest.body ?? {};
    if (typeof entryId !== 'string' || entryId.length > 64 || !Number.isInteger(position) || position < 1 || position > 10_000) {
      return reply.code(400).send({ error: 'Informe uma entrada e uma posição válida.' });
    }
    try {
      return await repository.moveWaitingEntry({ queueId: localRequest.params.queueId, entryId, position });
    } catch (error) {
      if (error?.code === 'QUEUE_NOT_FOUND') return reply.code(404).send({ error: 'Fila não encontrada.' });
      if (error?.code === 'ENTRY_NOT_WAITING' || error?.code === 'INVALID_QUEUE_POSITION') return reply.code(409).send({ error: 'A pessoa não está aguardando ou a posição não está mais disponível. Atualize o painel.' });
      return reply.code(503).send({ error: 'Não foi possível reorganizar a fila.' });
    }
  });
  app.post('/api/entries/:entryId/priority', async (request, reply) => {
    const localRequest = /** @type {any} */ (request);
    const { priority, reason } = localRequest.body ?? {};
    if (typeof priority !== 'boolean' || !['subscription', 'bits', 'external_payment', 'operator_override'].includes(reason)) {
      return reply.code(400).send({ error: 'Informe se a pessoa tem prioridade e qual benefício foi conferido.' });
    }
    try {
      const entry = await repository.getEntry(localRequest.params.entryId);
      if (!entry) return reply.code(404).send({ error: 'Entrada não encontrada.' });
      return await repository.setEntryPriority({ queueId: entry.queueId, entryId: entry.id, priority, reason, actorId: localRequest.localSession?.id, origin: 'panel' });
    } catch (error) {
      if (error?.code === 'ENTRY_NOT_WAITING') return reply.code(409).send({ error: 'Só é possível alterar a prioridade enquanto a pessoa aguarda.' });
      if (error?.code === 'INVALID_PRIORITY') return reply.code(400).send({ error: 'A categoria do benefício é inválida.' });
      return reply.code(503).send({ error: 'Não foi possível atualizar a prioridade.' });
    }
  });
  app.get('/api/queues/:queueId/reward-candidates', async (request, reply) => {
    const queueId = /** @type {any} */ (request.params).queueId;
    const queue = await repository.getQueueById(queueId);
    if (!queue) return reply.code(404).send({ error: 'Fila não encontrada.' });
    if (queue.rewardId || queue.remoteSyncStatus !== 'create_unknown') return reply.code(409).send({ error: 'Esta fila não está aguardando associação manual de recompensa.' });
    if (typeof integrations.twitch?.getManagedRewards !== 'function') return reply.code(503).send({ error: 'Conecte novamente a Twitch para consultar recompensas gerenciáveis.' });
    try {
      const rewards = await integrations.twitch.getManagedRewards();
      return rewards.filter((reward) => matchesPendingQueueReward(reward, queue)).map(({ id, title, cost, prompt }) => ({ id, title, cost, prompt: prompt ?? '' }));
    } catch {
      return reply.code(503).send({ error: 'Não foi possível consultar as recompensas gerenciáveis da Twitch.' });
    }
  });
  app.post('/api/queues/:queueId/resolve-reward', async (request, reply) => {
    const localRequest = /** @type {any} */ (request);
    const { queueId } = localRequest.params;
    const rewardId = localRequest.body?.rewardId;
    if (typeof rewardId !== 'string' || rewardId.length < 1 || rewardId.length > 128) return reply.code(400).send({ error: 'Selecione uma recompensa válida.' });
    const queue = await repository.getQueueById(queueId);
    if (!queue) return reply.code(404).send({ error: 'Fila não encontrada.' });
    if (queue.rewardId || queue.remoteSyncStatus !== 'create_unknown') return reply.code(409).send({ error: 'Esta fila não está aguardando associação manual de recompensa.' });
    if (typeof integrations.twitch?.getManagedRewards !== 'function') return reply.code(503).send({ error: 'Conecte novamente a Twitch para validar a recompensa selecionada.' });
    try {
      const rewards = await integrations.twitch.getManagedRewards();
      const selected = rewards.find((reward) => reward.id === rewardId);
      if (!selected || !matchesPendingQueueReward(selected, queue)) return reply.code(409).send({ error: 'A recompensa não pertence ao conjunto gerenciável esperado ou seus parâmetros mudaram. Atualize a lista e revise no console Twitch.' });
      const result = await repository.resolveUnknownRewardCreation({ queueId, rewardId, actorId: localRequest.localSession?.id });
      return { status: result.status, queue: queueDto(result.queue, { operator: true }), remoteConfirmed: false };
    } catch (error) {
      if (error?.code === 'REWARD_ASSOCIATION_NOT_PENDING') return reply.code(409).send({ error: 'A associação da recompensa foi alterada. Atualize o painel.' });
      return reply.code(503).send({ error: 'Não foi possível consultar ou registrar a recompensa selecionada.' });
    }
  });
  app.post('/api/queues/:queueId/manual-entries', async (request, reply) => {
    /** @type {Record<string, any>} */
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    if (typeof body.login !== 'string' || !/^[a-zA-Z0-9_]{1,25}$/.test(body.login)) return reply.code(400).send({ error: 'Informe um login válido da Twitch.' });
    if (body.priority !== undefined && typeof body.priority !== 'boolean') return reply.code(400).send({ error: 'A prioridade informada é inválida.' });
    if (body.priority === true && !['subscription', 'bits', 'external_payment', 'operator_override'].includes(body.priorityReason)) return reply.code(400).send({ error: 'Selecione o benefício conferido para atribuir prioridade.' });
    const user = await resolveUser(body.login);
    if (!user) return reply.code(404).send({ error: 'Esse usuário da Twitch não foi encontrado.' });
    try {
      const result = await repository.addManualEntry({ queueId: /** @type {any} */ (request.params).queueId, twitchUserId: user.id, userLogin: user.login, displayName: user.displayName, uid: body.uid, actorId: /** @type {any} */ (request).localSession?.id, origin: 'panel', priorityReason: body.priority === true ? body.priorityReason : null });
      if (result.status !== 'created') return reply.code(409).send({ error: 'Essa pessoa já está ativa nesta fila.' });
      return reply.code(201).send({ id: result.entry.id, status: result.entry.status, position: result.entry.position });
    } catch (error) { return reply.code(routeError(error)).send({ error: userError(error) }); }
  });
  app.post('/api/entries/:entryId/transitions', async (request, reply) => {
    /** @type {Record<string, any>} */
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    if (!['called', 'in_progress', 'completed', 'removed', 'no_show'].includes(body.to)
      || typeof body.reason !== 'string' || !/^[a-z][a-z0-9_]{1,47}$/.test(body.reason)) {
      return reply.code(400).send({ error: 'Ação de atendimento inválida.' });
    }
    try {
      /** @type {any} */
      const localRequest = request;
      const result = await domainService.transitionEntry({ entryId: localRequest.params.entryId, to: body.to, origin: 'panel', reason: body.reason, actorId: localRequest.localSession?.id });
      return { id: result.id, status: result.status, financialDecision: result.financialDecision };
    } catch (error) { return reply.code(routeError(error)).send({ error: userError(error) }); }
  });
  app.post('/api/entries/:entryId/call-notification/resend', async (request, reply) => {
    /** @type {any} */
    const localRequest = request;
    try {
      const result = await repository.resendCallNotification({ entryId: localRequest.params.entryId, actorId: localRequest.localSession?.id });
      if (result.status === 'entry_not_found' || result.status === 'notification_not_found') return reply.code(404).send({ error: 'A chamada não está disponível para reenvio.' });
      if (result.status === 'entry_not_called' || result.status === 'already_processing') return reply.code(409).send({ error: 'A chamada mudou de estado ou já está sendo enviada.' });
      return { status: result.status, entryId: result.entryId };
    } catch {
      return reply.code(503).send({ error: 'Não foi possível enfileirar o reenvio da chamada.' });
    }
  });
  app.post('/api/queues/:queueId/call', async (request, reply) => {
    /** @type {Record<string, any>} */
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    /** @type {any} */
    const localRequest = request;
    try {
      if (body.entryId) {
        const queue = await repository.getQueueById(localRequest.params.queueId);
        const entry = await repository.getEntry(body.entryId);
        if (!queue || !entry || entry.queueId !== queue.id || entry.status !== 'waiting') return reply.code(409).send({ error: 'A entrada não está aguardando nesta fila.' });
        const moved = await domainService.callSpecificEntry({ queueId: queue.id, entryId: entry.id, actorId: localRequest.localSession.id });
        await repository.enqueueCallNotification({ queueId: queue.id, entryId: entry.id });
        return { status: 'called', id: moved.id };
      }
      const count = body.count ?? 1;
      if (!Number.isInteger(count) || count < 1 || count > 10) return reply.code(400).send({ error: 'Escolha de 1 a 10 pessoas.' });
      const called = await domainService.callNext({ queueId: localRequest.params.queueId, count, actorId: localRequest.localSession.id });
      for (const entry of called) await repository.enqueueCallNotification({ queueId: localRequest.params.queueId, entryId: entry.id });
      return { status: 'called', count: called.length };
    } catch (error) { return reply.code(routeError(error)).send({ error: userError(error) }); }
  });
  for (const [suffix, method] of [['clear-preview', 'request'], ['clear-confirm', 'confirm']]) {
    app.post(`/api/queues/:queueId/${suffix}`, async (request, reply) => {
      if (!clearConfirmation) return reply.code(503).send({ error: 'A confirmação de limpeza não está disponível.' });
      /** @type {any} */
      const localRequest = request;
      const queueId = localRequest.params.queueId;
      const queue = await repository.getQueueById(queueId);
      if (!queue || queue.lifecycleStatus !== 'active') return reply.code(404).send({ error: 'Fila não encontrada.' });
      const result = await clearConfirmation[method]({ actorId: localRequest.localSession.id, channelId: 'local-panel', queueId, origin: 'panel' });
      return result;
    });
  }
  app.post('/api/queues/:queueId/open-state', async (request, reply) => {
    /** @type {any} */
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    /** @type {any} */
    const localRequest = request;
    if (typeof body.isOpen !== 'boolean') return reply.code(400).send({ error: 'Estado da fila inválido.' });
    try { return await repository.setQueueOpen(localRequest.params.queueId, body.isOpen, localRequest.localSession.id); }
    catch (error) { return reply.code(routeError(error)).send({ error: userError(error) }); }
  });
  app.post('/api/queues/:queueId/archive', async (request, reply) => {
    /** @type {any} */
    const localRequest = request;
    try {
      const result = await repository.archiveQueue({ queueId: localRequest.params.queueId, actorId: localRequest.localSession.id, origin: 'panel' });
      return { status: result.status, queue: queueDto(result.queue, { operator: true }) };
    } catch (error) {
      return reply.code(error?.code === 'QUEUE_NOT_AVAILABLE' || error?.code === 'QUEUE_REWARD_NOT_READY' ? 409 : 503)
        .send({ error: 'Não foi possível arquivar a fila neste estado. Verifique a sincronização da recompensa.' });
    }
  });
  app.post('/api/queues/:queueId/unarchive', async (request, reply) => {
    /** @type {any} */
    const localRequest = request;
    try {
      const result = await repository.unarchiveQueue({ queueId: localRequest.params.queueId, actorId: localRequest.localSession.id, origin: 'panel' });
      return { status: result.status, queue: queueDto(result.queue, { operator: true }) };
    } catch (error) {
      return reply.code(error?.code === 'QUEUE_NOT_AVAILABLE' || error?.code === 'QUEUE_REWARD_NOT_READY' || error?.code === 'QUEUE_OPEN_WHILE_ARCHIVED' ? 409 : 503)
        .send({ error: 'Não foi possível desarquivar a fila. Confirme primeiro que a recompensa está pausada.' });
    }
  });
  app.post('/api/queues/:queueId/delete', async (request, reply) => {
    /** @type {any} */
    const localRequest = request;
    const body = /** @type {Record<string, any>} */ (request.body && typeof request.body === 'object' ? request.body : {});
    if (body.confirm !== true) return reply.code(400).send({ error: 'Confirme explicitamente a exclusão desta fila.' });
    try {
      const result = await domainService.deleteQueue({ queueId: localRequest.params.queueId, actorId: localRequest.localSession.id, origin: 'panel' });
      return { status: result.status, activeRemoved: result.activeRemoved, refundsRequested: result.refundsRequested, queue: queueDto(result.queue, { operator: true }) };
    } catch (error) {
      return reply.code(error?.code === 'QUEUE_NOT_FOUND' ? 404 : error?.code === 'QUEUE_REWARD_NOT_READY' || error?.code === 'QUEUE_NOT_AVAILABLE' ? 409 : 503)
        .send({ error: 'A exclusão não pode começar agora. Resolva a sincronização da recompensa antes de tentar novamente.' });
    }
  });
  app.post('/api/account', async (request, reply) => {
    /** @type {any} */
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    /** @type {any} */
    const localRequest = request;
    try { return await repository.setCurrentAccount(body.label, localRequest.localSession.id); }
    catch (error) { return reply.code(error?.code === 'INVALID_ACCOUNT_LABEL' ? 400 : 500).send({ error: error?.code === 'INVALID_ACCOUNT_LABEL' ? 'O nome deve ter até 60 caracteres e não pode conter quebras de linha.' : 'Não foi possível atualizar a conta atual.' }); }
  });
  app.post('/api/account/default', async (request, reply) => {
    /** @type {any} */
    const localRequest = request;
    const label = localRequest.body?.label;
    if (typeof label !== 'string' || !label.trim() || label.trim().length > 60 || Array.from(label).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return reply.code(400).send({ error: 'Informe um nome com até 60 caracteres, sem quebras de linha ou controles.' });
    if (!repository.setDefaultAccountLabel) return reply.code(503).send({ error: 'A configuração do nome padrão não está disponível.' });
    try { return await repository.setDefaultAccountLabel(label, localRequest.localSession.id); }
    catch { return reply.code(400).send({ error: 'Não foi possível atualizar o nome padrão da conta.' }); }
  });
}

function safePrompt(value) { return typeof value === 'string' ? value.trim().slice(0, 180) : ''; }
function validCallMessage(value) { return typeof value === 'string' && value.length <= 350 ? value : '{user}, sua vez!'; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function callbackPage(displayName, { success = true } = {}) {
  const title = success ? 'Twitch conectada' : 'Não foi possível conectar a Twitch';
  const message = success
    ? `O canal <strong>${escapeHtml(displayName || 'conectado')}</strong> está autorizado para esta instalação.`
    : 'A autorização não foi concluída ou expirou. Volte ao painel para conferir a conexão e tentar novamente.';
  const icon = success ? '✓' : '!';
  const eyebrow = success ? 'CONFIGURAÇÃO CONCLUÍDA' : 'CONEXÃO NÃO CONCLUÍDA';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#111318"><title>${title} · Fila Local</title><link rel="stylesheet" href="/styles.css"></head><body><header class="topbar"><a class="brand" href="/" aria-label="Fila Local início"><span class="brand-mark">F</span><span>FILA <b>LOCAL</b></span></a><div class="runtime"><span>Conexão segura</span><span class="runtime-dot"></span><span>Instalação local</span></div></header><main class="callback-shell"><section class="panel callback-card" role="status" aria-live="polite"><span class="callback-success-icon${success ? '' : ' callback-error-icon'}" aria-hidden="true">${icon}</span><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="lead">${message}</p><p class="muted">Você pode voltar ao painel agora. Esta tela também retornará automaticamente em <strong id="callback-countdown">30</strong> segundos.</p><a class="button button-primary callback-return" href="/">Voltar ao painel</a></section></main><script>window.history.replaceState(null,\x27\x27,\x27/callback\x27);let seconds=30;const counter=document.getElementById('callback-countdown');const timer=window.setInterval(()=>{seconds-=1;if(counter)counter.textContent=String(seconds);if(seconds<=0){window.clearInterval(timer);window.location.assign('/');}},1000);window.setTimeout(()=>window.location.assign('/'),30000);</script></body></html>`;
}
function userError(error) {
  if (error?.code === 'DUPLICATE_QUEUE_KEY') return 'Esse identificador ou apelido já está em uso.';
  if (error?.code === 'RESERVED_QUEUE_KEY') return 'Esse identificador é reservado para um comando.';
  if (error?.code === 'QUEUE_NOT_AVAILABLE') return 'Essa fila não aceita novas entradas.';
  if (error?.code === 'INVALID_UID') return 'O UID deve conter exatamente 9 dígitos ASCII.';
  return 'Não foi possível concluir a operação.';
}

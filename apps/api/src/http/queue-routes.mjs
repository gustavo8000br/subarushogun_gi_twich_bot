import { normalizeQueueKeys } from '../domain/queue-keys.mjs';

function routeError(error) {
  if (['INVALID_QUEUE_KEY', 'RESERVED_QUEUE_KEY', 'DUPLICATE_QUEUE_KEY', 'INVALID_QUEUE_ALIASES', 'INVALID_UID'].includes(error?.code)) return 400;
  if (['DUPLICATE_QUEUE_KEY'].includes(error?.code)) return 409;
  if (error?.code === 'QUEUE_NOT_FOUND' || error?.code === 'ENTRY_NOT_FOUND') return 404;
  if (error?.code === 'QUEUE_NOT_AVAILABLE') return 409;
  return 400;
}

function queueDto(queue, { operator = false } = {}) {
  return {
    id: queue.id, slug: queue.slug, aliases: queue.aliases ?? [], title: queue.title,
    rewardPrompt: queue.rewardPrompt, cost: queue.cost, uidMode: queue.uidMode,
    isOpen: queue.isOpen, isArchived: queue.isArchived, lifecycleStatus: queue.lifecycleStatus,
    version: queue.version, remoteSyncStatus: queue.remoteSyncStatus,
    entries: (queue.entries ?? []).map((entry) => ({
      id: entry.id, userId: entry.userId, userLogin: entry.userLogin, displayName: entry.displayName,
      status: entry.status, position: entry.position, version: entry.version,
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
    && reward.autoFulfill === false && reward.shouldRedemptionsSkipRequestQueue === false
    && reward.isEnabled === true && reward.isPaused === true;
}

/** @param {import('fastify').FastifyInstance} app @param {{repository: any, domainService?: any, integrations?: any, clearConfirmation?: any, publicBaseUrl?: string, productVersion?: string, resolveUser?: (login: string) => Promise<any>}} deps */
export function registerQueueRoutes(app, { repository, domainService = repository, integrations = {}, clearConfirmation, publicBaseUrl = process.env.PUBLIC_BASE_URL ?? 'https://localhost:3000', productVersion = process.env.PRODUCT_VERSION ?? 'v0.1.0-0000000-alpha', resolveUser = async () => null }) {
  app.get('/api/setup', async () => setupDto(await integrations.getSetupState?.(), publicBaseUrl));
  app.get('/api/state', async () => {
    const state = await repository.getLocalState?.() ?? {};
    return {
      product_version: state.productVersion ?? productVersion,
      api_contract_version: '1', revision: state.revision ?? 1,
      generated_at: new Date().toISOString(), account: state.account ?? { label: 'Streamer', source: 'default' },
      connectivity: { database: 'connected', twitch: integrations.status ?? 'not_configured' },
      queues: (await repository.listQueueProjection?.() ?? []).map((queue) => queueDto(queue)),
      pending_operations: await repository.listFinancialOperations?.() ?? [],
    };
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
    if (!localRequest.localSession?.id) return reply.code(400).type('text/plain').send('Sessão local expirada. Volte ao painel e inicie a conexão novamente.');
    const code = localRequest.query?.code;
    const state = localRequest.query?.state;
    if (typeof code !== 'string' || typeof state !== 'string' || !integrations.completeAuthorization) {
      return reply.code(400).type('text/plain').send('Não foi possível concluir a conexão. Volte ao painel e tente novamente.');
    }
    try {
      const identity = await integrations.completeAuthorization({ sessionId: localRequest.localSession.id, code, state });
      return reply.type('text/html').send(`<main><h1>Twitch conectada</h1><p>${escapeHtml(identity.displayName ?? identity.login ?? 'Canal conectado')}</p><a href="/">Voltar ao painel</a></main>`);
    } catch {
      return reply.code(400).type('text/plain').send('A autorização falhou ou expirou. Volte ao painel para tentar novamente.');
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
        || !['hidden', 'visible'].includes(body.uidMode ?? 'hidden')) return reply.code(400).send({ error: 'Revise o nome, o custo e o modo de UID da fila.' });
      const result = await repository.createQueueWithRewardIntent({
        ...keys, title: body.title.trim(), cost: body.cost, rewardPrompt: safePrompt(body.rewardPrompt),
        callMessage: validCallMessage(body.callMessage), callTimeoutMin: body.callTimeoutMin === undefined ? 10 : body.callTimeoutMin,
        uidMode: body.uidMode ?? 'hidden', isOpen: false, actorId: localRequest.localSession?.id ?? null,
      });
      return reply.code(201).send(queueDto(result.queue, { operator: true }));
    } catch (error) {
      return reply.code(routeError(error)).send({ error: userError(error) });
    }
  });
  app.get('/api/queues', async () => (await repository.listQueueProjection?.() ?? []).map((queue) => queueDto(queue, { operator: true })));
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
    const user = await resolveUser(body.login);
    if (!user) return reply.code(404).send({ error: 'Esse usuário da Twitch não foi encontrado.' });
    try {
      const result = await repository.addManualEntry({ queueId: /** @type {any} */ (request.params).queueId, twitchUserId: user.id, userLogin: user.login, displayName: user.displayName, uid: body.uid });
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
function userError(error) {
  if (error?.code === 'DUPLICATE_QUEUE_KEY') return 'Esse identificador ou apelido já está em uso.';
  if (error?.code === 'RESERVED_QUEUE_KEY') return 'Esse identificador é reservado para um comando.';
  if (error?.code === 'QUEUE_NOT_AVAILABLE') return 'Essa fila não aceita novas entradas.';
  if (error?.code === 'INVALID_UID') return 'O UID deve conter exatamente 9 dígitos ASCII.';
  return 'Não foi possível concluir a operação.';
}

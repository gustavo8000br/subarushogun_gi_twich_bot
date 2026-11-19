import { QUEUE_DELETION_REMOTE_DELETE_REASONS } from '../domain/queue-service.mjs';
import { SETTLEMENT_MODES, REFUND_GROUP_SCOPES, normalizeRefundGroups, refundGroupsOf } from '../domain/settlement-setting.mjs';
import { parsePolicyBody } from '../domain/settlement-policy.mjs';
import { REFUND_LIST_MAX } from '../persistence/refund-list-store.mjs';
import { normalizeQueueKeys } from '../domain/queue-keys.mjs';
import { createHash } from 'node:crypto';
import { isDatabaseTimeout } from '../persistence/database-errors.mjs';
import { CHAT_COMMANDS, COMMAND_POLICY_MINIMUM_ROLES, resolveCommandPolicy } from '../commands/catalog.mjs';
import { createErrorDiagnosticReporter } from '../observability/error-diagnostics.mjs';
import { financialOperationHealth } from '../outbox/financial-retry-policy.mjs';
import { evaluatePendingQueueRewardCompatibility, summarizePendingQueueRewardCompatibility } from '../twitch/pending-queue-reward-compatibility.mjs';
import { QUEUE_DELETION_CANCEL_REFUSALS, getQueueDeletionProjection, normalizeDeletionCancelReason } from '../../../shared/panel/queue-action-state.mjs';

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  return value;
}

function mutationFingerprint(request) {
  const body = canonicalValue(request.body ?? null);
  return createHash('sha256').update(JSON.stringify({ method: request.method, url: request.url, body })).digest('hex');
}

/** Stable, non-sensitive outcome codes the manual-admission form may use to explain a 4xx precisely. */
const MANUAL_ENTRY_PUBLIC_CODES = new Set(['QUEUE_NOT_FOUND', 'QUEUE_NOT_AVAILABLE', 'QUEUE_REWARD_NOT_READY', 'QUEUE_MODE_TRANSITION_PENDING', 'QUEUE_MODE_TRANSITION_UNAVAILABLE']);

/** Audit labels the panel may send per target status (G-14). The panel UI sends the first four; the fifth is reserved for a panel no-show. */
const PANEL_TRANSITION_REASONS = Object.freeze({
  called: ['operator_call'],
  in_progress: ['service_started'],
  completed: ['service_completed'],
  removed: ['operator_removed'],
  no_show: ['operator_no_show'],
  // OPS-31 P3: skip (from `called`) and restore (from `no_show`); the domain checks the label against the current status.
  waiting: ['operator_skip', 'operator_restore'],
});

function routeError(error) {
  if (['INVALID_QUEUE_KEY', 'RESERVED_QUEUE_KEY', 'INVALID_QUEUE_ALIASES', 'INVALID_UID'].includes(error?.code)) return 400;
  if (['DUPLICATE_QUEUE_KEY'].includes(error?.code)) return 409;
  if (error?.code === 'QUEUE_NOT_FOUND' || error?.code === 'ENTRY_NOT_FOUND') return 404;
  // OPS-31 P0 (W3-4): a double click, a stale panel or a race with the timer is a conflict, never an `application_error`.
  if (['QUEUE_NOT_AVAILABLE', 'QUEUE_REWARD_NOT_READY', 'QUEUE_MODE_TRANSITION_PENDING', 'QUEUE_MODE_TRANSITION_UNAVAILABLE', 'QUEUE_OPEN_WHILE_ARCHIVED', 'INVALID_ENTRY_TRANSITION', 'ENTRY_VERSION_STALE', 'ENTRY_RESTORE_NOT_ALLOWED'].includes(error?.code)) return 409;
  // OPS-31 P0 (DB-11): lock_timeout / statement_timeout is retryable; the callers send it with a referenceId and generic text.
  if (error?.code === 'DATABASE_TIMEOUT') return 503;
  return 500;
}

/** @param {any} reply @param {{reportDiagnostic:(event:{source:string,error?:Error})=>string,source:string,error:Error,statusCode?:number,message:string,code?:string}} options */
function sendDiagnosedFailure(reply, { reportDiagnostic, source, error, statusCode = 503, message, code = 'INTERNAL_ERROR' }) {
  const referenceId = reportDiagnostic({ source, error });
  reply.header('x-error-reference', referenceId);
  // OPS-31 P0 (DB-11): lock_timeout / statement_timeout is retryable, with generic text and nothing written.
  if (isDatabaseTimeout(error)) {
    reply.header('retry-after', '1');
    return reply.code(503).send({ code: 'TEMPORARILY_UNAVAILABLE', error: GENERIC_FAILURE_MESSAGE, referenceId });
  }
  return reply.code(statusCode).send({ ...(code ? { code } : {}), error: message, referenceId });
}

const GENERIC_FAILURE_MESSAGE = 'Não foi possível concluir. Tente novamente.';
const ACCOUNT_LABEL_INVALID_MESSAGE = 'O nome deve ter até 60 caracteres e não pode conter quebras de linha.';

/** Public account projection: never exposes `updatedBy` (the HttpOnly local session id) or `ownerEntryId`. */
function accountDto(account) {
  const value = account && typeof account === 'object' ? account : {};
  return {
    label: typeof value.label === 'string' ? value.label : 'Streamer',
    source: typeof value.source === 'string' ? value.source : 'default',
    ...(typeof value.defaultLabel === 'string' ? { defaultLabel: value.defaultLabel } : {}),
  };
}

function containsControlCharacters(value) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
}

const DEFAULT_CALL_MESSAGE = '{user}, sua vez!';
const CALL_MESSAGE_PLACEHOLDERS = new Set(['user', 'queue', 'position', 'uid', 'account']);
const INVALID_CALL_MESSAGE_TEMPLATE_MESSAGE = 'O modelo de chamada contém um campo não permitido.';

/** @param {unknown} value */
function isValidCallMessageText(value) {
  return typeof value === 'string' && value.length <= 350 && !containsControlCharacters(value);
}

/** @param {string} value */
function hasUnknownCallMessagePlaceholder(value) {
  return [...value.matchAll(/\{([^}]+)\}/g)].some(([, name]) => !CALL_MESSAGE_PLACEHOLDERS.has(name));
}

/** @param {unknown} value */
function isValidCallTimeout(value) {
  return value === null || (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 120);
}

function queueDto(queue, { operator = false } = {}) {
  return {
    id: queue.id, slug: queue.slug, aliases: queue.aliases ?? [], title: queue.title,
    rewardPrompt: queue.rewardPrompt, cost: queue.cost, uidMode: queue.uidMode,
    queueMode: queue.queueMode ?? 'channel_points', rewardOrigin: queue.rewardOrigin ?? 'legacy_unknown',
    modeTransitionStatus: queue.modeTransitionStatus ?? 'none', rewardId: queue.rewardId ?? null,
    maxRedemptionsPerStream: queue.maxRedemptionsPerStream ?? null,
    maxRedemptionsPerUserPerStream: queue.maxRedemptionsPerUserPerStream ?? null,
    globalCooldownSeconds: queue.globalCooldownSeconds ?? null,
    callMessage: queue.callMessage, callTimeoutMin: queue.callTimeoutMin,
    showUidInList: queue.showUidInList, showUidInOverlay: queue.showUidInOverlay, showUidOnCall: queue.showUidOnCall,
    autoSwitchAccount: queue.autoSwitchAccount, refundIfRemovedWhileCalled: queue.refundIfRemovedWhileCalled,
    refundOnNoShow: queue.refundOnNoShow, refundIfViewerLeavesCalled: queue.refundIfViewerLeavesCalled,
    noticeJoined: queue.noticeJoined === true, noticeService: queue.noticeService === true, noticeState: queue.noticeState === true,
    noticeReordered: queue.noticeReordered === true, noticePoints: queue.noticePoints === true,
    settlement: queue.settlement ?? 'fulfill_on_start', refundGroups: queue.refundGroups ?? refundGroupsOf(queue),
    // OPS-31 P5b (AC 38): absent = unknown (the panel shows nothing, never 0); present only when the count was read.
    ...(queue.pendingDecisions ? { pendingDecisions: {
      awaitingChoice: queue.pendingDecisions.awaitingChoice, checkGroup: queue.pendingDecisions.checkGroup, total: queue.pendingDecisions.total,
    } } : {}),
    // OPS-31 K72-01b: absent people (`no_show`) for the operator list only; never in `entries` (public DTO, summary and chat read those).
    // Absent field = unknown (the panel renders no group), never 0.
    ...(operator && queue.absent ? { absent: {
      total: queue.absent.total,
      entries: (queue.absent.entries ?? []).map((entry) => ({
        id: entry.id, userLogin: entry.userLogin, displayName: entry.displayName, version: entry.version, finishedAt: entry.finishedAt,
      })),
    } } : {}),
    isOpen: queue.isOpen, isArchived: queue.isArchived, lifecycleStatus: queue.lifecycleStatus,
    version: queue.version, remoteSyncStatus: queue.remoteSyncStatus,
    // OPS-22 FT-26 (AC 15, F17): enumerated deletion projection for the operator panel; never the raw outbox facts.
    ...(operator ? getQueueDeletionProjection(queue, queue.deletion) ?? {} : {}),
    entries: (queue.entries ?? []).map((entry) => ({
      id: entry.id, userId: entry.userId, userLogin: entry.userLogin, displayName: entry.displayName,
      status: entry.status, position: entry.position, version: entry.version,
      priorityClass: entry.priorityClass ?? 'standard', priorityReason: entry.priorityReason ?? null,
      ...((operator && queue.uidMode === 'visible') || (!operator && queue.uidMode === 'visible' && queue.showUidInOverlay) ? { uid: entry.uid ?? null } : {}),
      calledAt: entry.calledAt, callNotifiedAt: entry.callNotifiedAt, callDeadlineAt: entry.callDeadlineAt,
    })),
  };
}

// OPS-22 FT-25 (AC 8, 11): only enumerated reasons the panel has text for; never the raw `lastError`.
const PROJECTED_FINANCIAL_REASONS = new Set(['attempts_exhausted', 'authorization_required']);
const QUEUE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REMOTE_REDEMPTION_STATUSES = new Set(['UNFULFILLED', 'FULFILLED', 'CANCELED']);

function operationDto(operation) {
  const financial = operation.operationType.startsWith('redemption.');
  const health = financial ? financialOperationHealth({ status: operation.status }) : null;
  return {
    id: operation.id, type: operation.operationType, redemptionId: operation.redemptionId,
    ...(operation.operationType.startsWith('reward.') ? { entityId: operation.entityId } : {}),
    ...(operation.requiresDeleteConfirmation === true ? { requiresDeleteConfirmation: true } : {}),
    status: operation.status, attempts: operation.attempts,
    nextAttemptAt: operation.nextAttemptAt ?? null,
    ...(health ? { health } : {}),
    ...(financial && PROJECTED_FINANCIAL_REASONS.has(operation.lastError) ? { reason: operation.lastError }
      : financial && operation.manualContradicted === true && ['pending', 'retry', 'processing'].includes(operation.status)
        ? { reason: 'manual_contradicted' } : {}),
    ...(financial && typeof operation.blockingQueueId === 'string' && QUEUE_ID_PATTERN.test(operation.blockingQueueId)
      ? { blockingQueueId: operation.blockingQueueId } : {}),
    // OPS-31 P0 (O-1): a `conflict` shows the remote status stored by the last read (closed set) and when it was found.
    ...(financial && operation.status === 'conflict' && REMOTE_REDEMPTION_STATUSES.has(operation.remoteStatus) ? { remoteStatus: operation.remoteStatus } : {}),
    ...(financial && operation.status === 'conflict' && operation.conflictDetectedAt instanceof Date ? { conflictDetectedAt: operation.conflictDetectedAt.toISOString() } : {}),
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
    ...(source.connected === true && source.eligibility.channelIdentity && typeof source.eligibility.channelIdentity === 'object' ? {
      channelIdentity: {
        ...(typeof source.eligibility.channelIdentity.login === 'string' && /^[a-z0-9_]{1,25}$/.test(source.eligibility.channelIdentity.login)
          ? { login: source.eligibility.channelIdentity.login } : {}),
        ...(typeof source.eligibility.channelIdentity.displayName === 'string'
          && source.eligibility.channelIdentity.displayName.trim().length > 0
          && source.eligibility.channelIdentity.displayName.length <= 100
          ? { displayName: source.eligibility.channelIdentity.displayName.trim() } : {}),
      },
    } : {}),
  } : null;
  return {
    callbackUrl: `${publicBaseUrl}/callback`,
    clientId: typeof source.clientId === 'string' ? source.clientId : null,
    secretConfigured: source.secretConfigured === true,
    connected: source.connected === true,
    broadcasterId: source.connected === true ? source.broadcasterId ?? null : null,
    scopes: source.connected === true && Array.isArray(source.scopes) ? source.scopes : [],
    status: source.status ?? (source.connected === true ? 'connected' : 'not_configured'),
    chatStatus: ['not_configured', 'connecting', 'connected', 'degraded', 'retrying', 'reconnect_required', 'stopped'].includes(source.chatStatus) ? source.chatStatus : 'unknown',
    rewardStatus: ['not_configured', 'available', 'unsupported', 'unknown', 'reconnect_required', 'stopped'].includes(source.rewardStatus) ? source.rewardStatus : 'unknown',
    eligibility,
  };
}

const LIVE_STATES = ['live', 'offline', 'unknown'];
const LIVE_SOURCES = ['event', 'reconciled'];
const LIVE_FALLBACK_REASONS = ['none_known', 'revoked', 'stale'];
const isoOrNull = (value) => (typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null);

/** OPS-31 P6b (design 3.14 item 3): the channel-level live session of `GET /api/state`, allow-listed (no stream id, title, login or channel id). */
function liveSessionDto(source) {
  const capWindow = source?.capWindow === 'session' ? 'session' : 'fallback';
  return {
    state: LIVE_STATES.includes(source?.state) ? source.state : 'unknown',
    startedAt: isoOrNull(source?.startedAt),
    endedAt: isoOrNull(source?.endedAt),
    source: LIVE_SOURCES.includes(source?.source) ? source.source : null,
    capWindow,
    fallbackReason: capWindow === 'session' ? null : LIVE_FALLBACK_REASONS.includes(source?.fallbackReason) ? source.fallbackReason : 'none_known',
  };
}

/** @param {import('fastify').FastifyInstance} app @param {{repository: any, domainService?: any, integrations?: any, clearConfirmation?: any, publicBaseUrl?: string, productVersion?: string, resolveUser?: (login: string) => Promise<any>, reportDiagnostic?: (event: {source: string, error?: Error}) => string, logEvent?: (event: object) => unknown}} deps */
export function registerQueueRoutes(app, { repository, domainService = repository, integrations = {}, clearConfirmation, publicBaseUrl = process.env.PUBLIC_BASE_URL ?? 'https://localhost:3000', productVersion = process.env.PRODUCT_VERSION ?? 'v0.1.0-0000000-alpha', resolveUser = async () => null, reportDiagnostic = createErrorDiagnosticReporter(), logEvent = () => undefined }) {
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
    const operationKey = `panel:${localRequest.localSession?.actorId ?? 'unknown'}:${key}`;
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
    const unresolvedOperationSummary = await repository.getFinancialOperationSummary?.();
    const safeUnresolvedOperationSummary = unresolvedOperationSummary
      && Number.isSafeInteger(unresolvedOperationSummary.total) && unresolvedOperationSummary.total >= 0
      && Number.isSafeInteger(unresolvedOperationSummary.needsReview) && unresolvedOperationSummary.needsReview >= 0
      && unresolvedOperationSummary.needsReview <= unresolvedOperationSummary.total
      ? { total: unresolvedOperationSummary.total, needsReview: unresolvedOperationSummary.needsReview }
      : null;
    // OPS-31 P6b: present only when the live provider is wired and has something to say; a failure never fails the state.
    const liveSession = typeof integrations.getLiveSession === 'function' ? await Promise.resolve(integrations.getLiveSession()).catch(() => null) : null;
    return {
      product_version: state.productVersion ?? productVersion,
      api_contract_version: '1', revision: state.revision ?? 1,
      generated_at: new Date().toISOString(), account: accountDto(state.account),
      product_locale: state.productLocale ?? { locale: 'pt-BR', revision: 1 },
      connectivity: {
        database: 'connected', twitch: integrations.status ?? 'not_configured',
        twitch_chat: integrations.chatStatus ?? 'not_configured', twitch_rewards: integrations.rewardStatus ?? 'unknown',
      },
      queues: (await repository.listQueueProjection?.() ?? []).map((queue) => queueDto(queue)),
      pending_operations: (await repository.listFinancialOperations?.() ?? []).map(operationDto),
      unresolved_operation_summary: safeUnresolvedOperationSummary,
      ...(liveSession ? { liveSession: liveSessionDto(liveSession) } : {}),
    };
  });
  app.get('/api/command-catalog', async (_request, reply) => {
    if (typeof repository.getCommandPolicyState !== 'function') return reply.code(503).send({ error: 'O catálogo de comandos não está disponível.' });
    try {
      const state = await repository.getCommandPolicyState();
      const setupState = await Promise.resolve(integrations.getSetupState?.()).catch(() => null);
      const followerScopeReady = Array.isArray(setupState?.scopes) && setupState.scopes.includes('moderator:read:followers');
      return {
        schemaVersion: state.schemaVersion,
        version: state.version,
        followerScopeReady,
        configurableRoles: COMMAND_POLICY_MINIMUM_ROLES,
        commands: CHAT_COMMANDS.map((definition) => ({
          key: definition.key, scope: definition.scope, syntax: definition.syntax,
          description: definition.description,
          policy: resolveCommandPolicy(definition, state.policies),
          policyOverridden: definition.access.kind === 'configurable' && Object.hasOwn(state.policies ?? {}, definition.key),
          access: definition.access,
          configurable: definition.access.kind === 'configurable',
        })),
      };
    } catch {
      return reply.code(503).send({ error: 'Não foi possível carregar o catálogo de comandos.' });
    }
  });
  app.post('/api/command-policies/follower-authorization', async (request, reply) => {
    const localRequest = /** @type {any} */ (request);
    const body = localRequest.body && typeof localRequest.body === 'object' && !Array.isArray(localRequest.body) ? localRequest.body : {};
    const policies = body.policies;
    const scopeOnly = body.scopeOnly === true;
    if (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 1
      || (scopeOnly ? (policies !== undefined && (!policies || typeof policies !== 'object' || Array.isArray(policies) || Object.keys(policies).length > 0))
        : (!policies || typeof policies !== 'object' || Array.isArray(policies) || !Object.keys(policies).length))
      || Object.keys(body).some((key) => !['expectedVersion', 'policies', 'scopeOnly'].includes(key))) {
      return reply.code(400).send({ error: 'Atualize o catálogo e informe permissões válidas.' });
    }
    let hasFollowerThreshold = false;
    for (const [key, policy] of Object.entries(policies ?? {})) {
      const definition = CHAT_COMMANDS.find((entry) => entry.key === key);
      if (!definition || definition.access.kind !== 'configurable' || !policy || typeof policy !== 'object' || Array.isArray(policy)
        || !COMMAND_POLICY_MINIMUM_ROLES.includes(policy.minimumRole)
        || Object.keys(policy).some((property) => property !== 'minimumRole')) {
        return reply.code(400).send({ error: 'Um ou mais comandos têm níveis inválidos ou não podem ser alterados.' });
      }
      if (policy.minimumRole === 'follower') hasFollowerThreshold = true;
    }
    if (!scopeOnly && !hasFollowerThreshold) return reply.code(400).send({ error: 'Selecione ao menos um comando com nível de seguidor.' });
    if (typeof integrations.beginFollowerAuthorization !== 'function') return reply.code(503).send({ error: 'A autorização Twitch adicional não está disponível.' });
    let result;
    try {
      result = await integrations.beginFollowerAuthorization({
        sessionId: localRequest.localSession?.id,
        expectedVersion: body.expectedVersion,
        policies: policies ?? {},
        scopeOnly,
      });
    } catch {
      return reply.code(503).send({ error: 'Não foi possível iniciar a autorização adicional da Twitch.' });
    }
    if (!result?.url) return reply.code(503).send({ error: 'Conecte o canal Twitch antes de habilitar acesso de seguidores.' });
    return { authorizationUrl: result.url };
  });
  // OPS-31 P6 (AC 16): starts the Twitch reauthorization that adds only the scopes of the chosen refund groups. It changes no
  // setting and no queue; the panel block that calls it stays hidden until P7.
  app.post('/api/settlement/group-authorization', async (request, reply) => {
    const localRequest = /** @type {any} */ (request);
    const body = localRequest.body && typeof localRequest.body === 'object' && !Array.isArray(localRequest.body) ? localRequest.body : {};
    const groups = normalizeRefundGroups(body.groups);
    if (!groups || groups.every((group) => !REFUND_GROUP_SCOPES[group]) || Object.keys(body).some((key) => key !== 'groups')) {
      return reply.code(400).send({ error: 'Escolha ao menos um grupo que precise de autorização da Twitch.' });
    }
    if (typeof integrations.beginGroupAuthorization !== 'function') return reply.code(503).send({ error: 'A autorização Twitch adicional não está disponível.' });
    let result;
    try {
      result = await integrations.beginGroupAuthorization({ sessionId: localRequest.localSession?.id, groups });
    } catch {
      return reply.code(503).send({ error: 'Não foi possível iniciar a autorização adicional da Twitch.' });
    }
    if (!result?.url) return reply.code(503).send({ error: 'Conecte o canal Twitch antes de habilitar grupos.' });
    return { authorizationUrl: result.url };
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
    for (const [key, policy] of Object.entries(policies)) {
      const definition = CHAT_COMMANDS.find((entry) => entry.key === key);
      if (!definition || definition.access.kind !== 'configurable' || !policy || typeof policy !== 'object' || Array.isArray(policy)
        || !COMMAND_POLICY_MINIMUM_ROLES.includes(policy.minimumRole)
        || Object.keys(policy).some((property) => property !== 'minimumRole')) {
        return reply.code(400).send({ error: 'Um ou mais comandos têm cargos inválidos ou não podem ser alterados.' });
      }
    }
    if (typeof repository.updateCommandPolicies !== 'function') return reply.code(503).send({ error: 'A gravação do catálogo de comandos não está disponível.' });
    try {
      return await repository.updateCommandPolicies({
        expectedVersion: body.expectedVersion, policies,
        actorId: localRequest.localSession?.actorId ?? null, origin: 'panel',
      });
    } catch (error) {
      if (error?.code === 'COMMAND_POLICY_VERSION_CONFLICT') return reply.code(409).send({ error: 'As permissões mudaram. Atualize o catálogo antes de salvar.' });
      if (error?.code === 'INVALID_COMMAND_POLICY') return reply.code(400).send({ error: 'Revise os cargos selecionados para cada comando.' });
      return reply.code(503).send({ error: 'Não foi possível salvar as permissões dos comandos.' });
    }
  });
  app.get('/api/operations', async () => (await repository.listFinancialOperations?.() ?? []).map(operationDto));
  app.post('/api/operations/:operationId/retry', async (request, reply) => {
    const localRequest = /** @type {any} */ (request);
    const result = await repository.retryOutboxManually(localRequest.params.operationId, { actorId: localRequest.localSession?.actorId ?? null });
    if (!result.count) return reply.code(409).send({ code: 'OPERATION_RETRY_UNAVAILABLE', error: 'Esta operação não está disponível para nova tentativa manual.' });
    return { status: 'pending' };
  });
  app.post('/api/operations/:operationId/resolve-unknown', async (request, reply) => {
    const localRequest = /** @type {any} */ (request);
    const result = await repository.resolveUnknownFinancialOperation?.(localRequest.params.operationId, localRequest.localSession?.actorId);
    if (!result || result.status !== 'resolved_manual') return reply.code(409).send({ code: 'OPERATION_RESOLUTION_UNAVAILABLE', error: 'Esta operação não está disponível para resolução manual.' });
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
    /** @type {import('fastify').FastifyRequest & {localSession?: {id: string, actorId: string}}} */
    const localRequest = _request;
    const result = await integrations.beginAuthorization?.(localRequest.localSession?.id);
    if (!result?.url) return reply.code(503).send({ error: 'Configure e valide o aplicativo Twitch antes de conectar.' });
    return { authorizationUrl: result.url };
  });
  app.get('/callback', async (request, reply) => {
    /** @type {import('fastify').FastifyRequest & {localSession?: {id: string, actorId: string}, query: Record<string, any>}} */
    const localRequest = request;
    const redirectToPanel = (status) => {
      reply.header('cache-control', 'no-store');
      reply.header('referrer-policy', 'no-referrer');
      return reply.redirect(`/connection/?oauth=${status}`, 303);
    };
    if (localRequest.query?.error) return redirectToPanel('declined');
    if (!localRequest.localSession?.id) return redirectToPanel('error');
    const code = localRequest.query?.code;
    const state = localRequest.query?.state;
    if (typeof code !== 'string' || typeof state !== 'string' || !integrations.completeAuthorization) return redirectToPanel('error');
    try {
      await integrations.completeAuthorization({ sessionId: localRequest.localSession.id, code, state });
      return redirectToPanel('success');
    } catch {
      return redirectToPanel('error');
    }
  });
  app.post('/api/queues', async (request, reply) => {
    /** @type {Record<string, any>} */
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    /** @type {import('fastify').FastifyRequest & {localSession?: {id: string, actorId: string}}} */
    const localRequest = request;
    try {
      const keys = normalizeQueueKeys({ slug: body.slug, aliases: body.aliases ?? [] });
      const queueMode = body.queueMode ?? 'channel_points';
      if (typeof body.title !== 'string' || body.title.trim().length < 1 || body.title.length > 45
        || !['channel_points', 'manual_only'].includes(queueMode)
        || (queueMode === 'channel_points' && (!Number.isInteger(body.cost) || body.cost <= 0))
        || (queueMode === 'manual_only' && body.cost !== undefined && body.cost !== null)
        || ['maxRedemptionsPerStream', 'maxRedemptionsPerUserPerStream', 'globalCooldownSeconds'].some((field) => body[field] !== undefined && body[field] !== null && (!Number.isInteger(body[field]) || body[field] < 1 || body[field] > 2147483647))
        || !['hidden', 'visible'].includes(body.uidMode ?? 'hidden')) return reply.code(400).send({ error: 'Revise o nome, o custo e o modo de UID da fila.' });
      if (body.callTimeoutMin !== undefined && !isValidCallTimeout(body.callTimeoutMin)) {
        return reply.code(400).send({ error: 'Revise o prazo de chamada da fila.' });
      }
      const callMessage = body.callMessage ?? DEFAULT_CALL_MESSAGE;
      if (!isValidCallMessageText(callMessage)) return reply.code(400).send({ error: 'Revise as configurações da fila.' });
      if (hasUnknownCallMessagePlaceholder(callMessage)) {
        return reply.code(400).send({ code: 'INVALID_CALL_MESSAGE_TEMPLATE', error: INVALID_CALL_MESSAGE_TEMPLATE_MESSAGE });
      }
      if (queueMode === 'manual_only') {
        if (body.maxRedemptionsPerStream != null || body.maxRedemptionsPerUserPerStream != null || body.globalCooldownSeconds != null || body.rewardPrompt != null) {
          return reply.code(400).send({ error: 'Filas manuais não aceitam configurações de recompensa Twitch.' });
        }
        const queue = await repository.createManualQueue({
          ...keys, title: body.title.trim(), callMessage,
          callTimeoutMin: body.callTimeoutMin === undefined ? 10 : body.callTimeoutMin,
          uidMode: body.uidMode ?? 'hidden', actorId: localRequest.localSession?.actorId ?? null,
        });
        return reply.code(201).send(queueDto(queue, { operator: true }));
      }
      const result = await repository.createQueueWithRewardIntent({
        ...keys, title: body.title.trim(), cost: body.cost, rewardPrompt: safePrompt(body.rewardPrompt),
        maxRedemptionsPerStream: body.maxRedemptionsPerStream ?? null,
        maxRedemptionsPerUserPerStream: body.maxRedemptionsPerUserPerStream ?? null,
        globalCooldownSeconds: body.globalCooldownSeconds ?? null,
        callMessage, callTimeoutMin: body.callTimeoutMin === undefined ? 10 : body.callTimeoutMin,
        uidMode: body.uidMode ?? 'hidden', isOpen: false, actorId: localRequest.localSession?.actorId ?? null,
      });
      return reply.code(201).send(queueDto(result.queue, { operator: true }));
    } catch (error) {
      const statusCode = routeError(error);
      if (statusCode >= 500) {
        return sendDiagnosedFailure(reply, { reportDiagnostic, source: 'http.queue.create', error, statusCode, message: GENERIC_FAILURE_MESSAGE });
      }
      return reply.code(statusCode).send({ error: userError(error) });
    }
  });
  app.get('/api/queues', async () => (await repository.listQueueProjection?.() ?? []).map((queue) => queueDto(queue, { operator: true })));
  app.patch('/api/queues/:queueId/settings', async (request, reply) => {
    const localRequest = /** @type {any} */ (request);
    const body = localRequest.body && typeof localRequest.body === 'object' ? localRequest.body : {};
    const allowed = new Set(['expectedVersion', 'callTimeoutMin', 'callMessage', 'showUidInList', 'showUidInOverlay', 'showUidOnCall', 'autoSwitchAccount', 'refundIfRemovedWhileCalled', 'refundOnNoShow', 'refundIfViewerLeavesCalled', 'noticeJoined', 'noticeService', 'noticeState', 'noticeReordered', 'noticePoints', 'settlement', 'refundGroups']);
    const keys = Object.keys(body);
    if (keys.some((key) => ['uidMode', 'title', 'cost', 'rewardPrompt', 'maxRedemptionsPerStream', 'maxRedemptionsPerUserPerStream', 'globalCooldownSeconds'].includes(key))) {
      return reply.code(400).send({ code: 'INVALID_LOCAL_QUEUE_SETTING', error: 'A privacidade do UID e a recompensa devem ser alteradas no editor de recompensa Twitch.' });
    }
    if (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 1 || keys.some((key) => !allowed.has(key))) {
      return reply.code(400).send({ code: 'INVALID_QUEUE_SETTINGS', error: 'Atualize a fila e informe somente configurações válidas.' });
    }
    const settings = Object.fromEntries(keys.filter((key) => key !== 'expectedVersion').map((key) => [key, body[key]]));
    if (!Object.keys(settings).length
      || ('callTimeoutMin' in settings && !isValidCallTimeout(settings.callTimeoutMin))
      || ('callMessage' in settings && !isValidCallMessageText(settings.callMessage))
      || ('settlement' in settings && !SETTLEMENT_MODES.includes(settings.settlement))
      || ('refundGroups' in settings && !Array.isArray(settings.refundGroups))
      || Object.entries(settings).some(([key, value]) => !['callTimeoutMin', 'callMessage', 'settlement', 'refundGroups'].includes(key) && typeof value !== 'boolean')) {
      return reply.code(400).send({ code: 'INVALID_QUEUE_SETTINGS', error: 'Revise as configurações da fila.' });
    }
    if (typeof settings.callMessage === 'string' && hasUnknownCallMessagePlaceholder(settings.callMessage)) {
      return reply.code(400).send({ code: 'INVALID_CALL_MESSAGE_TEMPLATE', error: INVALID_CALL_MESSAGE_TEMPLATE_MESSAGE });
    }
    try {
      const queue = await repository.updateLocalQueueSettings({ queueId: localRequest.params.queueId, expectedVersion: body.expectedVersion, settings, actorId: localRequest.localSession?.actorId ?? null, origin: 'panel' });
      return queueDto(queue, { operator: true });
    } catch (error) {
      if (error?.code === 'QUEUE_NOT_FOUND') return reply.code(404).send({ code: error.code, error: 'Fila não encontrada.' });
      if (error?.code === 'STALE_QUEUE_VERSION') return reply.code(409).send({ code: error.code, error: 'A fila mudou em outra operação. Atualize o painel e tente novamente.' });
      if (error?.code === 'QUEUE_NOT_AVAILABLE') return reply.code(409).send({ code: error.code, error: 'Esta fila não aceita alterações enquanto está sendo excluída.' });
      if (error?.code === 'SETTLEMENT_MODE_UNAVAILABLE') return reply.code(409).send({ code: error.code, reason: 'not_delivered', error: 'A devolução dos pontos ao fim do atendimento ainda não está disponível.' });
      if (error?.code === 'INVALID_LOCAL_QUEUE_SETTING') {
        // OPS-31 P5: a malformed settlement setting or group list is a client error with its own text; the UID and reward text stays for the other case.
        if (/settlement|refund groups/i.test(String(error.message))) return reply.code(400).send({ code: 'INVALID_QUEUE_SETTINGS', error: 'Revise as configurações da fila.' });
        return reply.code(400).send({ code: error.code, error: 'A privacidade do UID e a recompensa devem ser alteradas no editor de recompensa Twitch.' });
      }
      return sendDiagnosedFailure(reply, { reportDiagnostic, source: 'http.queue.settings', error, message: 'Não foi possível salvar as configurações da fila.' });
    }
  });
  // OPS-31 P5b (AC 35): the settlement policy of a queue. Panel session only (the same onRequest hook as every /api route:
  // 401 without a session, CSRF and Origin on a write) and the panel operation key on the PUT.
  app.get('/api/queues/:queueId/settlement-policy', async (request, reply) => {
    const localRequest = /** @type {any} */ (request);
    try {
      const policy = await repository.getQueueSettlementPolicy?.(localRequest.params.queueId);
      if (!policy) return reply.code(404).send({ code: 'QUEUE_NOT_FOUND', error: 'Fila não encontrada.' });
      return policy;
    } catch (error) {
      return sendDiagnosedFailure(reply, { reportDiagnostic, source: 'http.queue.settlement_policy.read', error, message: 'Não foi possível carregar a política de pontos.' });
    }
  });
  app.put('/api/queues/:queueId/settlement-policy', async (request, reply) => {
    const localRequest = /** @type {any} */ (request);
    const parsed = parsePolicyBody(localRequest.body);
    if (!parsed.ok) return reply.code(400).send({ code: 'SETTLEMENT_POLICY_INVALID', field: parsed.field, error: 'Revise a política de pontos da fila.' });
    try {
      return await repository.updateQueueSettlementPolicy({
        queueId: localRequest.params.queueId, expectedPolicyRev: parsed.expectedPolicyRev, changes: parsed.changes,
        actorId: localRequest.localSession?.actorId ?? null, origin: 'panel',
      });
    } catch (error) {
      if (error?.code === 'QUEUE_NOT_FOUND') return reply.code(404).send({ code: error.code, error: 'Fila não encontrada.' });
      if (error?.code === 'QUEUE_NOT_AVAILABLE') return reply.code(409).send({ code: error.code, error: 'Esta fila não aceita alterações agora.' });
      if (error?.code === 'SETTLEMENT_POLICY_STALE') return reply.code(409).send({ code: error.code, settlementPolicyRev: error.settlementPolicyRev, error: 'A política mudou em outra operação. Atualize o painel e tente novamente.' });
      if (error?.code === 'SETTLEMENT_MODE_UNAVAILABLE') {
        const reason = ['policy_not_active', 'legacy_not_selectable'].includes(error.reason) ? error.reason : 'policy_not_active';
        return reply.code(409).send({ code: error.code, reason, error: 'Esta opção da política de pontos ainda não está disponível.' });
      }
      return sendDiagnosedFailure(reply, { reportDiagnostic, source: 'http.queue.settlement_policy.write', error, message: 'Não foi possível salvar a política de pontos.' });
    }
  });
  app.patch('/api/queues/:queueId/reward-settings', async (request, reply) => {
    const localRequest = /** @type {any} */ (request);
    const body = localRequest.body && typeof localRequest.body === 'object' ? localRequest.body : {};
    const allowed = new Set(['expectedVersion', 'title', 'cost', 'rewardPrompt', 'uidMode', 'maxRedemptionsPerStream', 'maxRedemptionsPerUserPerStream', 'globalCooldownSeconds']);
    const keys = Object.keys(body);
    if (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 1 || keys.some((key) => !allowed.has(key)) || keys.length < 2) {
      return reply.code(400).send({ code: 'INVALID_REWARD_SETTINGS', error: 'Atualize a fila e informe configurações de recompensa válidas.' });
    }
    const settings = Object.fromEntries(keys.filter((key) => key !== 'expectedVersion').map((key) => [key, body[key]]));
    const validLimit = (key) => !(key in settings) || settings[key] === null || (Number.isInteger(settings[key]) && settings[key] > 0 && settings[key] <= 2147483647);
    if (('title' in settings && (typeof settings.title !== 'string' || !settings.title.trim() || settings.title.trim().length > 45))
      || ('cost' in settings && (!Number.isInteger(settings.cost) || settings.cost < 1 || settings.cost > 2147483647))
      || ('rewardPrompt' in settings && (typeof settings.rewardPrompt !== 'string' || settings.rewardPrompt.trim().length > 200 || containsControlCharacters(settings.rewardPrompt)))
      || ('uidMode' in settings && !['hidden', 'visible'].includes(settings.uidMode))
      || !validLimit('maxRedemptionsPerStream') || !validLimit('maxRedemptionsPerUserPerStream') || !validLimit('globalCooldownSeconds')) {
      return reply.code(400).send({ code: 'INVALID_REWARD_SETTINGS', error: 'Revise título, custo, descrição, modo de UID e limites da recompensa.' });
    }
    if (typeof settings.title === 'string') settings.title = settings.title.trim();
    if (typeof settings.rewardPrompt === 'string') settings.rewardPrompt = settings.rewardPrompt.trim();
    try {
      const result = await repository.updateQueueRewardSettings({ queueId: localRequest.params.queueId, expectedVersion: body.expectedVersion, settings, actorId: localRequest.localSession?.actorId ?? null, origin: 'panel' });
      return reply.code(202).send({ ...queueDto(result.queue, { operator: true }), operationStatus: result.status });
    } catch (error) {
      if (error?.code === 'QUEUE_NOT_FOUND') return reply.code(404).send({ code: error.code, error: 'Fila não encontrada.' });
      if (['STALE_QUEUE_VERSION', 'QUEUE_REWARD_NOT_READY', 'QUEUE_REWARD_UPDATE_PENDING'].includes(error?.code)) return reply.code(409).send({ code: error.code, error: 'A recompensa não está sincronizada ou a fila mudou. Atualize o painel e tente novamente.' });
      if (error?.code === 'QUEUE_NOT_AVAILABLE') return reply.code(409).send({ code: error.code, error: 'Esta fila não aceita alterações enquanto está sendo excluída.' });
      return sendDiagnosedFailure(reply, { reportDiagnostic, source: 'http.queue.reward_settings', error, message: 'Não foi possível solicitar a alteração da recompensa Twitch.' });
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
    const { entryId, position, expectedVersion } = localRequest.body ?? {};
    if (typeof entryId !== 'string' || entryId.length > 64 || !Number.isInteger(position) || position < 1 || position > 10_000
      || (expectedVersion !== undefined && (!Number.isInteger(expectedVersion) || expectedVersion < 1))) {
      return reply.code(400).send({ error: 'Informe uma entrada e uma posição válida.' });
    }
    try {
      return await repository.moveWaitingEntry({ queueId: localRequest.params.queueId, entryId, position, ...(expectedVersion === undefined ? {} : { expectedVersion }) });
    } catch (error) {
      if (error?.code === 'ENTRY_VERSION_STALE') return reply.code(409).send({ code: error.code, version: error.currentVersion, error: userError(error) });
      if (error?.code === 'QUEUE_NOT_FOUND') return reply.code(404).send({ error: 'Fila não encontrada.' });
      if (error?.code === 'ENTRY_NOT_WAITING' || error?.code === 'INVALID_QUEUE_POSITION') return reply.code(409).send({ error: 'A pessoa não está aguardando ou a posição não está mais disponível. Atualize o painel.' });
      return sendDiagnosedFailure(reply, { reportDiagnostic, source: 'http.queue.move', error, statusCode: 503, message: 'Não foi possível reorganizar a fila.' });
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
      return await repository.setEntryPriority({ queueId: entry.queueId, entryId: entry.id, priority, reason, actorId: localRequest.localSession?.actorId, origin: 'panel' });
    } catch (error) {
      if (error?.code === 'ENTRY_NOT_WAITING') return reply.code(409).send({ error: 'Só é possível alterar a prioridade enquanto a pessoa aguarda.' });
      if (error?.code === 'INVALID_PRIORITY') return reply.code(400).send({ error: 'A categoria do benefício é inválida.' });
      return sendDiagnosedFailure(reply, { reportDiagnostic, source: 'http.entry.priority', error, statusCode: 503, message: 'Não foi possível atualizar a prioridade.' });
    }
  });
  app.get('/api/queues/:queueId/reward-candidates', async (request, reply) => {
    const queueId = /** @type {any} */ (request.params).queueId;
    const queue = await repository.getQueueById(queueId);
    if (!queue) return reply.code(404).send({ error: 'Fila não encontrada.' });
    if (queue.rewardId || queue.remoteSyncStatus !== 'create_unknown') return reply.code(409).send({ error: 'Esta fila não está aguardando associação manual de recompensa.' });
    if (typeof integrations.twitch?.getManagedRewards !== 'function') {
      const referenceId = reportDiagnostic({ source: 'http.queue.reward_candidates', error: Object.assign(new Error('Twitch adapter unavailable'), { code: 'TWITCH_ADAPTER_UNAVAILABLE' }) });
      reply.header('x-error-reference', referenceId);
      return reply.code(503).send({ error: 'A conexão Twitch está indisponível para consultar recompensas. Aguarde a reconexão e tente novamente.', referenceId });
    }
    try {
      logEvent({ event: 'queue_reward_candidates_lookup_started', level: 'debug', source: 'http.queue.reward_candidates', details: { queueMode: queue.queueMode ?? 'channel_points', remoteSyncStatus: queue.remoteSyncStatus } });
      const rewards = await integrations.twitch.getManagedRewards();
      const summary = summarizePendingQueueRewardCompatibility(rewards, queue);
      logEvent({ event: 'queue_reward_candidates_evaluated', level: 'info', source: 'http.queue.reward_candidates', details: {
        managedRewardCount: summary.managedRewardCount, candidateCount: summary.candidateCount, rejectedRewardCount: summary.rejectedRewardCount,
      } });
      if (summary.rejectedRewardCount > 0) logEvent({ event: 'queue_reward_candidates_rejected', level: 'verbose', source: 'http.queue.reward_candidates', details: { mismatchCounts: summary.mismatchCounts } });
      return {
        candidates: rewards.filter((reward) => evaluatePendingQueueRewardCompatibility(reward, queue).compatible)
          .map(({ id, title, cost, prompt }) => ({ id, title, cost, prompt: prompt ?? '' })),
        diagnostics: summary,
      };
    } catch (error) {
      const referenceId = reportDiagnostic({ source: 'http.queue.reward_candidates', error });
      reply.header('x-error-reference', referenceId);
      return reply.code(503).send({ error: 'Não foi possível consultar as recompensas gerenciáveis da Twitch.', referenceId });
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
    if (typeof integrations.twitch?.getManagedRewards !== 'function') {
      const referenceId = reportDiagnostic({ source: 'http.queue.resolve_reward', error: Object.assign(new Error('Twitch adapter unavailable'), { code: 'TWITCH_ADAPTER_UNAVAILABLE' }) });
      reply.header('x-error-reference', referenceId);
      return reply.code(503).send({ error: 'A conexão Twitch está indisponível para validar a recompensa. Aguarde a reconexão e tente novamente.', referenceId });
    }
    try {
      logEvent({ event: 'queue_reward_association_lookup_started', level: 'debug', source: 'http.queue.resolve_reward' });
      const rewards = await integrations.twitch.getManagedRewards();
      const selected = rewards.find((reward) => reward.id === rewardId);
      const evaluation = selected ? evaluatePendingQueueRewardCompatibility(selected, queue) : { compatible: false, mismatchReasons: ['reward_not_managed'] };
      if (!evaluation.compatible) {
        logEvent({ event: 'queue_reward_association_rejected', level: 'notice', source: 'http.queue.resolve_reward', details: { mismatchCounts: Object.fromEntries(evaluation.mismatchReasons.map((reason) => [reason, 1])) } });
        return reply.code(409).send({ error: 'A recompensa não pertence ao conjunto gerenciável esperado ou seus parâmetros mudaram. Atualize a lista e revise no console Twitch.' });
      }
      const result = await repository.resolveUnknownRewardCreation({ queueId, rewardId, actorId: localRequest.localSession?.actorId });
      return { status: result.status, queue: queueDto(result.queue, { operator: true }), remoteConfirmed: false };
    } catch (error) {
      if (error?.code === 'REWARD_ASSOCIATION_NOT_PENDING') return reply.code(409).send({ error: 'A associação da recompensa foi alterada. Atualize o painel.' });
      const referenceId = reportDiagnostic({ source: 'http.queue.resolve_reward', error });
      reply.header('x-error-reference', referenceId);
      return reply.code(503).send({ error: 'Não foi possível consultar ou registrar a recompensa selecionada.', referenceId });
    }
  });
  app.post('/api/queues/:queueId/manual-entries', async (request, reply) => {
    /** @type {Record<string, any>} */
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    if (typeof body.login !== 'string' || !/^[a-zA-Z0-9_]{1,25}$/.test(body.login)) return reply.code(400).send({ error: 'Informe um login válido da Twitch.' });
    if (body.priority !== undefined && typeof body.priority !== 'boolean') return reply.code(400).send({ error: 'A prioridade informada é inválida.' });
    if (body.priority === true && !['subscription', 'bits', 'external_payment', 'operator_override'].includes(body.priorityReason)) return reply.code(400).send({ error: 'Selecione o benefício conferido para atribuir prioridade.' });
    try {
      const user = await resolveUser(body.login);
      if (!user) return reply.code(404).send({ code: 'TWITCH_USER_NOT_FOUND', error: 'Esse usuário da Twitch não foi encontrado.' });
      const result = await repository.addManualEntry({ queueId: /** @type {any} */ (request.params).queueId, twitchUserId: user.id, userLogin: user.login, displayName: user.displayName, uid: body.uid, actorId: /** @type {any} */ (request).localSession?.actorId, origin: 'panel', priorityReason: body.priority === true ? body.priorityReason : null });
      if (result.status !== 'created') return reply.code(409).send({ code: 'DUPLICATE_ACTIVE_ENTRY', error: 'Essa pessoa já está ativa nesta fila.' });
      return reply.code(201).send({ id: result.entry.id, status: result.entry.status, position: result.entry.position });
    } catch (error) {
      const statusCode = routeError(error);
      if (statusCode >= 500) return sendDiagnosedFailure(reply, { reportDiagnostic, source: 'http.queue.manual_entry', error, statusCode, message: 'Não foi possível concluir. Tente novamente.' });
      return reply.code(statusCode).send({ ...(MANUAL_ENTRY_PUBLIC_CODES.has(error?.code) ? { code: error.code } : {}), error: userError(error) });
    }
  });
  app.post('/api/entries/:entryId/transitions', async (request, reply) => {
    /** @type {Record<string, any>} */
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    // OPS-31 P1 (G-14): `reason` is an audit label from a closed list per target status; it can never carry the
    // clear/delete trigger, and the domain service types the trigger as `panel_action`.
    if (!Object.hasOwn(PANEL_TRANSITION_REASONS, body.to)
      || typeof body.reason !== 'string' || !PANEL_TRANSITION_REASONS[body.to].includes(body.reason)) {
      return reply.code(400).send({ error: 'Ação de atendimento inválida.' });
    }
    // OPS-31 P3 (G-8): the panel sends the version it saw; optional, so older clients keep working.
    if (body.expectedVersion !== undefined && (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 1)) {
      return reply.code(400).send({ error: 'Ação de atendimento inválida.' });
    }
    try {
      /** @type {any} */
      const localRequest = request;
      const result = await domainService.transitionEntry({ entryId: localRequest.params.entryId, to: body.to, origin: 'panel', trigger: 'panel_action', reason: body.reason, actorId: localRequest.localSession?.actorId, ...(body.expectedVersion === undefined ? {} : { expectedVersion: body.expectedVersion }) });
      return { id: result.id, status: result.status, financialDecision: result.financialDecision };
    } catch (error) {
      const statusCode = routeError(error);
      if (statusCode >= 500) return sendDiagnosedFailure(reply, {
        reportDiagnostic,
        source: 'http.entry.transition',
        error,
        statusCode,
        message: userError(error),
      });
      return reply.code(statusCode).send({
        ...(['INVALID_ENTRY_TRANSITION', 'ENTRY_VERSION_STALE', 'ENTRY_RESTORE_NOT_ALLOWED'].includes(error?.code) ? { code: error.code } : {}),
        ...(error?.code === 'ENTRY_VERSION_STALE' && Number.isInteger(error.currentVersion) ? { version: error.currentVersion } : {}),
        ...(error?.code === 'ENTRY_RESTORE_NOT_ALLOWED' && ['intent_recorded', 'other_active_entry'].includes(error.reason) ? { reason: error.reason } : {}),
        error: userError(error),
      });
    }
  });
  app.post('/api/entries/:entryId/call-notification/resend', async (request, reply) => {
    /** @type {any} */
    const localRequest = request;
    try {
      const result = await repository.resendCallNotification({ entryId: localRequest.params.entryId, actorId: localRequest.localSession?.actorId });
      if (result.status === 'entry_not_found' || result.status === 'notification_not_found') return reply.code(404).send({ error: 'A chamada não está disponível para reenvio.' });
      if (result.status === 'entry_not_called' || result.status === 'already_processing') return reply.code(409).send({ error: 'A chamada mudou de estado ou já está sendo enviada.' });
      return { status: result.status, entryId: result.entryId };
    } catch (error) {
      return sendDiagnosedFailure(reply, {
        reportDiagnostic,
        source: 'http.entry.call_notification_resend',
        error,
        statusCode: 503,
        message: 'Não foi possível concluir. Tente novamente.',
      });
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
        const moved = await domainService.callSpecificEntry({ queueId: queue.id, entryId: entry.id, actorId: localRequest.localSession.actorId });
        await repository.enqueueCallNotification({ queueId: queue.id, entryId: entry.id, previousPosition: moved.previousPosition });
        return { status: 'called', id: moved.id };
      }
      const count = body.count ?? 1;
      if (!Number.isInteger(count) || count < 1 || count > 10) return reply.code(400).send({ error: 'Escolha de 1 a 10 pessoas.' });
      const called = await domainService.callNext({ queueId: localRequest.params.queueId, count, actorId: localRequest.localSession.actorId });
      for (const entry of called) await repository.enqueueCallNotification({ queueId: localRequest.params.queueId, entryId: entry.id, previousPosition: entry.previousPosition });
      return { status: 'called', count: called.length };
    } catch (error) {
      if (error?.code === 'QUEUE_MODE_TRANSITION_PENDING') return reply.code(409).send({ code: error.code });
      const statusCode = routeError(error);
      if (statusCode >= 500) return sendDiagnosedFailure(reply, {
        reportDiagnostic,
        source: 'http.queue.call',
        error,
        statusCode,
        message: 'Não foi possível concluir. Tente novamente.',
      });
      return reply.code(statusCode).send({ error: userError(error) });
    }
  });
  for (const [suffix, method] of [['clear-preview', 'request'], ['clear-confirm', 'confirm']]) {
    app.post(`/api/queues/:queueId/${suffix}`, async (request, reply) => {
      if (!clearConfirmation) return reply.code(503).send({ error: 'A confirmação de limpeza não está disponível.' });
      /** @type {any} */
      const localRequest = request;
      const queueId = localRequest.params.queueId;
      try {
        const queue = await repository.getQueueById(queueId);
        if (!queue || queue.lifecycleStatus !== 'active') return reply.code(404).send({ error: 'Fila não encontrada.' });
        const result = await clearConfirmation[method]({ actorId: localRequest.localSession.actorId, channelId: 'local-panel', queueId, origin: 'panel' });
        return result;
      } catch (error) {
        const statusCode = routeError(error);
        if (statusCode >= 500) return sendDiagnosedFailure(reply, {
          reportDiagnostic,
          source: `http.queue.${suffix.replace('-', '_')}`,
          error,
          statusCode: 503,
          message: 'Não foi possível concluir. Tente novamente.',
        });
        return reply.code(statusCode).send({ error: userError(error) });
      }
    });
  }
  app.post('/api/queues/:queueId/open-state', async (request, reply) => {
    /** @type {any} */
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    /** @type {any} */
    const localRequest = request;
    if (typeof body.isOpen !== 'boolean') return reply.code(400).send({ error: 'Estado da fila inválido.' });
    try { return await repository.setQueueOpen(localRequest.params.queueId, body.isOpen, localRequest.localSession.actorId); }
    catch (error) {
      const status = routeError(error);
      const code = ['QUEUE_NOT_AVAILABLE', 'QUEUE_REWARD_NOT_READY'].includes(error?.code) ? error.code : undefined;
      if (status >= 500) return sendDiagnosedFailure(reply, { reportDiagnostic, source: 'http.queue.open_state', error, statusCode: status, message: userError(error), code });
      return reply.code(status).send({ ...(code ? { code } : {}), error: userError(error) });
    }
  });
  app.post('/api/queues/:queueId/manual-mode', async (request, reply) => {
    /** @type {any} */
    const localRequest = request;
    if (typeof repository.requestManualModeTransition !== 'function') return reply.code(503).send({ error: 'A troca para fila local não está disponível.' });
    try {
      const result = await repository.requestManualModeTransition({ queueId: localRequest.params.queueId, actorId: localRequest.localSession.actorId, origin: 'panel' });
      return reply.code(result.status === 'pending' ? 202 : 200).send({ status: result.status, queue: queueDto(result.queue, { operator: true }) });
    } catch (error) {
      const status = routeError(error);
      const code = ['QUEUE_NOT_AVAILABLE', 'QUEUE_REWARD_NOT_READY', 'QUEUE_MODE_TRANSITION_PENDING', 'QUEUE_MODE_TRANSITION_UNAVAILABLE'].includes(error?.code) ? error.code : undefined;
      if (status >= 500) return sendDiagnosedFailure(reply, { reportDiagnostic, source: 'http.queue.manual_mode', error, statusCode: status, message: userError(error), code });
      return reply.code(status).send({ ...(code ? { code } : {}), error: userError(error) });
    }
  });
  app.post('/api/queues/:queueId/archive-local/challenge', async (request, reply) => {
    /** @type {any} */
    const localRequest = request;
    /** @type {{ expectedVersion?: number }} */
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    if (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 1) return reply.code(400).send({ code: 'INVALID_LOCAL_ARCHIVE_CHALLENGE', error: 'A confirmação local está inválida. Atualize o painel e tente novamente.' });
    try {
      const result = await repository.beginLocalQueueArchive({ queueId: localRequest.params.queueId, actorId: localRequest.localSession.actorId, expectedVersion: body.expectedVersion });
      return reply.code(200).send(result);
    } catch (error) {
      const code = error?.code;
      if (['QUEUE_NOT_FOUND', 'QUEUE_REWARD_UNRESOLVED', 'QUEUE_LOCAL_ARCHIVE_UNAVAILABLE', 'STALE_QUEUE_VERSION'].includes(code)) {
        return reply.code(code === 'QUEUE_NOT_FOUND' ? 404 : 409).send({ code, error: code === 'QUEUE_REWARD_UNRESOLVED'
          ? 'A recompensa ainda está sendo identificada. Resolva a sincronização antes de arquivar.'
          : 'A fila mudou ou não está disponível para arquivamento local. Atualize o painel e tente novamente.' });
      }
      return sendDiagnosedFailure(reply, { reportDiagnostic, source: 'http.queue.archive_local_challenge', error, message: 'Não foi possível iniciar o arquivamento local.' });
    }
  });
  app.post('/api/queues/:queueId/archive-local/confirm', async (request, reply) => {
    /** @type {any} */
    const localRequest = request;
    /** @type {{ challengeId?: string, expectedVersion?: number, remoteSyncStatus?: string }} */
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    if (typeof body.challengeId !== 'string' || !Number.isInteger(body.expectedVersion) || body.expectedVersion < 1 || typeof body.remoteSyncStatus !== 'string') {
      return reply.code(400).send({ code: 'INVALID_LOCAL_ARCHIVE_CHALLENGE', error: 'A confirmação local está inválida. Recomece as duas confirmações.' });
    }
    try {
      const result = await repository.confirmLocalQueueArchive({
        queueId: localRequest.params.queueId, actorId: localRequest.localSession.actorId,
        challengeId: body.challengeId, expectedVersion: body.expectedVersion, remoteSyncStatus: body.remoteSyncStatus,
      });
      return reply.send({ status: result.status, queue: queueDto(result.queue, { operator: true }) });
    } catch (error) {
      const code = error?.code;
      const conflictCodes = ['QUEUE_NOT_FOUND', 'QUEUE_REWARD_UNRESOLVED', 'QUEUE_LOCAL_ARCHIVE_UNAVAILABLE', 'STALE_QUEUE_VERSION', 'LOCAL_ARCHIVE_CHALLENGE_EXPIRED', 'QUEUE_REWARD_OPERATION_PROCESSING', 'QUEUE_DELETION_CANCELLATION_IN_PROGRESS'];
      if (conflictCodes.includes(code)) return reply.code(code === 'QUEUE_NOT_FOUND' ? 404 : 409).send({ code, error: code === 'QUEUE_REWARD_OPERATION_PROCESSING'
        ? 'Uma operação da recompensa ainda está em processamento. Aguarde e tente novamente.'
        : code === 'QUEUE_DELETION_CANCELLATION_IN_PROGRESS'
          ? 'O cancelamento da exclusão ainda está verificando a recompensa na Twitch. Aguarde e tente novamente.'
        : code === 'QUEUE_REWARD_UNRESOLVED'
          ? 'A recompensa ainda está sendo identificada. Resolva a sincronização antes de arquivar.'
          : 'A fila ou a confirmação mudou/expirou. Atualize o painel e reinicie as duas confirmações.' });
      if (code === 'INVALID_LOCAL_ARCHIVE_CHALLENGE') return reply.code(400).send({ code, error: 'A confirmação local está inválida. Recomece as duas confirmações.' });
      return sendDiagnosedFailure(reply, { reportDiagnostic, source: 'http.queue.archive_local_confirm', error, message: 'Não foi possível concluir o arquivamento local.' });
    }
  });
  app.post('/api/queues/:queueId/unarchive', async (request, reply) => {
    /** @type {any} */
    const localRequest = request;
    try {
      const result = await repository.unarchiveQueue({ queueId: localRequest.params.queueId, actorId: localRequest.localSession.actorId, origin: 'panel' });
      return { status: result.status, queue: queueDto(result.queue, { operator: true }) };
    } catch (error) {
      if (error?.code === 'QUEUE_NOT_AVAILABLE' || error?.code === 'QUEUE_REWARD_NOT_READY' || error?.code === 'QUEUE_OPEN_WHILE_ARCHIVED') return reply.code(409)
        .send({ error: 'Não foi possível desarquivar a fila. Confirme primeiro que a recompensa está pausada.' });
      return sendDiagnosedFailure(reply, { reportDiagnostic, source: 'http.queue.unarchive', error, message: 'Não foi possível desarquivar a fila. Confirme primeiro que a recompensa está pausada.' });
    }
  });
  app.post('/api/queues/:queueId/delete', async (request, reply) => {
    /** @type {any} */
    const localRequest = request;
    const body = /** @type {Record<string, any>} */ (request.body && typeof request.body === 'object' ? request.body : {});
    if (body.confirm !== true) return reply.code(400).send({ code: 'QUEUE_DELETE_CONFIRMATION_REQUIRED', error: 'Confirme explicitamente a exclusão desta fila.' });
    let result;
    try {
      result = await domainService.deleteQueue({ queueId: localRequest.params.queueId, actorId: localRequest.localSession.actorId, origin: 'panel' });
    } catch (error) {
      if (error?.code === 'QUEUE_NOT_FOUND') return reply.code(404).send({ code: 'QUEUE_NOT_FOUND', error: 'Fila não encontrada.' });
      if (error?.code === 'QUEUE_REWARD_NOT_READY') return reply.code(409).send({ code: 'QUEUE_REWARD_NOT_READY', error: 'A recompensa ainda não foi confirmada.' });
      if (error?.code === 'QUEUE_NOT_AVAILABLE') return reply.code(409).send({ code: 'QUEUE_NOT_AVAILABLE', error: 'A fila não está disponível para exclusão.' });
      const referenceId = reportDiagnostic({ source: 'http.queue.delete', error });
      reply.header('x-error-reference', referenceId);
      return reply.code(503).send({ code: 'QUEUE_DELETE_UNAVAILABLE', error: 'A exclusão não pôde ser iniciada.', referenceId });
    }
    // OPS-22 FT-26 (AC 15): the answer names the deletion state; a failing projection read falls back to `pending`
    // (never an error after the request was accepted, never a promise of success).
    let deletion = null;
    if (result.queue?.lifecycleStatus === 'deleting') {
      try { deletion = (await repository.getQueueDeletionFacts?.([result.queue.id]))?.get(result.queue.id) ?? null; } catch { deletion = null; }
    }
    const queue = queueDto({ ...result.queue, deletion }, { operator: true });
    return {
      status: result.status, activeRemoved: result.activeRemoved, refundsRequested: result.refundsRequested,
      deletionState: queue.deletionState ?? null, queue,
    };
  });
  app.post('/api/queues/:queueId/delete/cancel', async (request, reply) => {
    /** @type {any} */
    const localRequest = request;
    const body = /** @type {Record<string, any>} */ (request.body && typeof request.body === 'object' ? request.body : {});
    if (body.confirm !== true) return reply.code(400).send({ code: 'QUEUE_DELETE_CANCEL_CONFIRMATION_REQUIRED', error: 'Confirme explicitamente o cancelamento da exclusão.' });
    try {
      const result = await domainService.cancelQueueDeletion({ queueId: localRequest.params.queueId, actorId: localRequest.localSession.actorId, origin: 'panel' });
      return { status: result.status, reason: normalizeDeletionCancelReason(result.reason), ...(result.queue ? { queue: queueDto(result.queue, { operator: true }) } : {}) };
    } catch (error) {
      const code = error?.code;
      if (code === 'QUEUE_NOT_FOUND') return reply.code(404).send({ code, error: 'Fila não encontrada.' });
      // OPS-22 FT-36 (architect-review-ft36 §1.5): every refusal is a 409 with an enumerated `code`; the panel maps by code.
      if ([...QUEUE_DELETION_CANCEL_REFUSALS, 'QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED', 'QUEUE_DELETION_CANCELLATION_STALE', 'QUEUE_DELETION_CANCELLATION_UNVERIFIED'].includes(code)) {
        // FT-53: additive, closed `reason` only for the possibly-sent DELETE refusal (`code` and `error` unchanged).
        const reason = code === 'QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED' && typeof error.reason === 'string' && REMOTE_DELETE_PUBLIC_REASONS.has(error.reason) ? error.reason : null;
        return reply.code(409).send({ code, error: 'Não foi possível cancelar a exclusão neste estado. Atualize o painel e revise a operação da reward.', ...(reason ? { reason } : {}) });
      }
      return sendDiagnosedFailure(reply, { reportDiagnostic, source: 'http.queue.delete_cancel', error, message: 'Não foi possível verificar o cancelamento da exclusão.' });
    }
  });
  // OPS-31 P5 (FT-74, AC 10): the own refund list, one per channel. The panel gets the internal id, the label and the date,
  // never the Twitch user id; the typed login is resolved once at add time and not stored.
  const refundListFailure = (reply, error, source) => {
    const map = {
      REFUND_LIST_FULL: [409, { max: REFUND_LIST_MAX }, 'A lista está cheia. Remova alguém para adicionar outra pessoa.'],
      REFUND_LIST_DUPLICATE: [409, {}, 'Essa pessoa já está na lista.'],
      REFUND_LIST_MEMBER_NOT_FOUND: [404, {}, 'Essa pessoa não está na lista.'],
      REFUND_LIST_INVALID: [400, {}, 'Revise o login e o rótulo informados.'],
    };
    const entry = map[error?.code];
    if (entry) return reply.code(entry[0]).send({ code: error.code, ...entry[1], error: entry[2] });
    return sendDiagnosedFailure(reply, { reportDiagnostic, source, error, statusCode: 500, message: GENERIC_FAILURE_MESSAGE });
  };
  const refundListDto = (list) => ({ items: list.items.map((item) => ({ id: item.id, label: item.label, createdAt: item.createdAt })), count: list.count, max: list.max ?? REFUND_LIST_MAX });
  app.get('/api/refund-list', async (_request, reply) => {
    try { return refundListDto(await repository.listRefundList()); }
    catch (error) { return refundListFailure(reply, error, 'http.refund_list.read'); }
  });
  app.post('/api/refund-list', async (request, reply) => {
    /** @type {Record<string, any>} */
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    if (typeof body.login !== 'string' || !/^@?[a-zA-Z0-9_]{1,25}$/.test(body.login)) return reply.code(400).send({ code: 'REFUND_LIST_INVALID', error: 'Informe um login válido da Twitch.' });
    if (body.label !== undefined && body.label !== null && typeof body.label !== 'string') return reply.code(400).send({ code: 'REFUND_LIST_INVALID', error: 'Revise o login e o rótulo informados.' });
    try {
      const user = await resolveUser(body.login.replace(/^@/, ''));
      if (!user) return reply.code(404).send({ code: 'TWITCH_USER_NOT_FOUND', error: 'Esse usuário da Twitch não foi encontrado.' });
      const result = await repository.addRefundListMember({ twitchUserId: String(user.id), label: body.label, actorId: /** @type {any} */ (request).localSession?.actorId ?? null });
      return reply.code(201).send({ member: { id: result.member.id, label: result.member.label, createdAt: result.member.createdAt }, count: result.count, max: REFUND_LIST_MAX });
    } catch (error) { return refundListFailure(reply, error, 'http.refund_list.add'); }
  });
  app.post('/api/refund-list/clear', async (request, reply) => {
    try {
      const result = await repository.clearRefundList({ actorId: /** @type {any} */ (request).localSession?.actorId ?? null });
      return { removed: result.removed, count: 0, max: REFUND_LIST_MAX };
    } catch (error) { return refundListFailure(reply, error, 'http.refund_list.clear'); }
  });
  app.post('/api/refund-list/:memberId/remove', async (request, reply) => {
    const memberId = /** @type {any} */ (request.params).memberId;
    if (typeof memberId !== 'string' || !QUEUE_ID_PATTERN.test(memberId)) return reply.code(404).send({ code: 'REFUND_LIST_MEMBER_NOT_FOUND', error: 'Essa pessoa não está na lista.' });
    try {
      const result = await repository.removeRefundListMember({ id: memberId, actorId: /** @type {any} */ (request).localSession?.actorId ?? null });
      return { count: result.count, max: REFUND_LIST_MAX };
    } catch (error) { return refundListFailure(reply, error, 'http.refund_list.remove'); }
  });
  app.post('/api/account', async (request, reply) => {
    /** @type {any} */
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    /** @type {any} */
    const localRequest = request;
    try { return accountDto(await repository.setCurrentAccount(body.label, localRequest.localSession.actorId)); }
    catch (error) {
      if (error?.code === 'INVALID_ACCOUNT_LABEL') return reply.code(400).send({ error: ACCOUNT_LABEL_INVALID_MESSAGE });
      return sendDiagnosedFailure(reply, { reportDiagnostic, source: 'http.account.set', error, statusCode: 500, message: GENERIC_FAILURE_MESSAGE });
    }
  });
  app.post('/api/account/default', async (request, reply) => {
    /** @type {any} */
    const localRequest = request;
    const label = localRequest.body?.label;
    if (typeof label !== 'string' || !label.trim() || label.trim().length > 60 || Array.from(label).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return reply.code(400).send({ error: 'Informe um nome com até 60 caracteres, sem quebras de linha ou controles.' });
    if (!repository.setDefaultAccountLabel) return reply.code(503).send({ error: 'A configuração do nome padrão não está disponível.' });
    try { return accountDto(await repository.setDefaultAccountLabel(label, localRequest.localSession.actorId)); }
    catch (error) {
      if (error?.code === 'INVALID_ACCOUNT_LABEL') return reply.code(400).send({ error: ACCOUNT_LABEL_INVALID_MESSAGE });
      return sendDiagnosedFailure(reply, { reportDiagnostic, source: 'http.account.default', error, statusCode: 500, message: GENERIC_FAILURE_MESSAGE });
    }
  });
}

const REMOTE_DELETE_PUBLIC_REASONS = new Set(Object.values(QUEUE_DELETION_REMOTE_DELETE_REASONS));
function safePrompt(value) { return typeof value === 'string' ? value.trim().slice(0, 180) : ''; }
function userError(error) {
  if (error?.code === 'DUPLICATE_QUEUE_KEY') return 'Esse identificador ou apelido já está em uso.';
  if (error?.code === 'RESERVED_QUEUE_KEY') return 'Esse identificador é reservado para um comando.';
  if (error?.code === 'QUEUE_NOT_AVAILABLE') return 'Essa fila não aceita novas entradas.';
  if (error?.code === 'QUEUE_REWARD_NOT_READY') return 'Confirme a recompensa da Twitch antes de alterar a fila.';
  if (error?.code === 'QUEUE_MODE_TRANSITION_PENDING') return 'A troca do modo da fila ainda está sendo confirmada pela Twitch.';
  if (error?.code === 'QUEUE_MODE_TRANSITION_UNAVAILABLE') return 'A troca para fila local não está disponível neste estado.';
  if (error?.code === 'INVALID_UID') return 'O UID deve conter exatamente 9 dígitos ASCII.';
  if (error?.code === 'ENTRY_VERSION_STALE') return 'A pessoa mudou de estado desde que a fila foi carregada. Atualize o painel.';
  if (error?.code === 'ENTRY_RESTORE_NOT_ALLOWED') return error.reason === 'other_active_entry'
    ? 'Essa pessoa já tem outra entrada ativa nesta fila.'
    : 'Não é possível restaurar: a devolução ou conclusão dos pontos já foi registrada.';
  if (error?.code === 'INVALID_ENTRY_TRANSITION') return 'Essa ação não está disponível para o estado atual do atendimento. Atualize a fila.';
  return 'Não foi possível concluir a operação.';
}

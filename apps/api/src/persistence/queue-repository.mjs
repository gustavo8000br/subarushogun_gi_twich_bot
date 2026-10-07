import { normalizeQueueKeys } from '../domain/queue-keys.mjs';
import { validateUidInput } from '../domain/uid.mjs';
import { CHAT_COMMANDS, COMMAND_POLICY_MINIMUM_ROLES } from '../commands/catalog.mjs';

/** @typedef {Record<string, any>} PrismaClientLike */

const activeStatuses = ['waiting', 'called', 'in_progress'];

function repositoryError(code, message) {
  return Object.assign(new Error(message), { code });
}

function isUniqueConstraintError(error) {
  return Boolean(error && typeof error === 'object' && error.code === 'P2002');
}

async function lockQueue(tx, queueId) {
  await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${queueId}, 0))) AS queue_lock`;
}

async function lockCurrentAccount(tx) {
  await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(1868787013, 1)) AS account_lock`;
}

async function lockScopedOperation(tx, key) {
  await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))) AS operation_lock`;
}

async function withQueueTransaction(prisma, queueId, callback) {
  return prisma.$transaction(async (tx) => {
    await lockQueue(tx, queueId);
    return callback(tx);
  });
}

async function renumberWaitingEntries(tx, queueId) {
  const waiting = await tx.entry.findMany({
    where: { queueId, status: 'waiting' },
    orderBy: [{ priorityClass: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  await Promise.all(waiting.map(({ id }, index) => tx.entry.update({
    where: { id },
    data: { position: index + 1 },
  })));
}

function isSafeReason(reason) {
  return typeof reason === 'string' && /^[a-z][a-z0-9_]{1,47}$/.test(reason);
}

function parseCommandPolicyState(value) {
  if (!value) return { schemaVersion: 3, version: 1, policies: {} };
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !value.policies || typeof value.policies !== 'object' || Array.isArray(value.policies)) {
    throw repositoryError('INVALID_COMMAND_POLICY_STATE', 'Stored command policy state is invalid');
  }
  const schemaVersion = value.schemaVersion;
  const version = value.revision;
  if (schemaVersion !== 3 || !Number.isInteger(version) || version < 1) {
    throw repositoryError('INVALID_COMMAND_POLICY_STATE', 'Stored command policy state is invalid');
  }
  for (const [key, policy] of Object.entries(value.policies)) {
    const definition = CHAT_COMMANDS.find((entry) => entry.key === key);
    if (!definition) throw repositoryError('INVALID_COMMAND_POLICY_STATE', 'Stored command policy state is invalid');
    if (!policy || typeof policy !== 'object' || Array.isArray(policy) || definition.access.kind !== 'configurable'
        || !COMMAND_POLICY_MINIMUM_ROLES.includes(policy.minimumRole)
        || Object.keys(policy).some((property) => property !== 'minimumRole')) {
      throw repositoryError('INVALID_COMMAND_POLICY_STATE', 'Stored command policy state is invalid');
    }
  }
  return { schemaVersion, version, policies: value.policies };
}

function validateCommandPolicyChanges(policies) {
  if (!policies || typeof policies !== 'object' || Array.isArray(policies) || !Object.keys(policies).length) {
    throw repositoryError('INVALID_COMMAND_POLICY', 'Command policy update is invalid');
  }
  for (const [key, policy] of Object.entries(policies)) {
    const definition = CHAT_COMMANDS.find((entry) => entry.key === key);
    if (!definition || definition.access.kind !== 'configurable' || !policy || typeof policy !== 'object' || Array.isArray(policy)
        || !COMMAND_POLICY_MINIMUM_ROLES.includes(policy.minimumRole)
        || Object.keys(policy).some((property) => property !== 'minimumRole')) {
      throw repositoryError('INVALID_COMMAND_POLICY', 'Command policy update is invalid');
    }
  }
}

async function updateCommandPoliciesInTransaction(tx, { expectedVersion, policies, actorId = null, origin = 'panel' }) {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw repositoryError('INVALID_COMMAND_POLICY', 'Command policy update is invalid');
  }
  validateCommandPolicyChanges(policies);
  await lockScopedOperation(tx, 'setting:chat-command-policies');
  const record = await tx.setting.findUnique({ where: { key: 'chat_command_policies' } });
  const current = parseCommandPolicyState(record?.value);
  if (current.version !== expectedVersion) {
    throw repositoryError('COMMAND_POLICY_VERSION_CONFLICT', 'Command policy version changed');
  }
  const next = { schemaVersion: 3, version: current.version + 1, policies: { ...current.policies, ...policies } };
  const stored = { schemaVersion: 3, revision: next.version, policies: next.policies };
  await tx.setting.upsert({
    where: { key: 'chat_command_policies' },
    create: { key: 'chat_command_policies', value: stored },
    update: { value: stored },
  });
  await tx.auditLog.create({ data: {
    event: 'command.policies_updated', actorId, origin, reason: 'command_role_policy_changed',
    safeDetail: { commandIds: Object.keys(policies).sort(), changedPolicies: policies, version: next.version },
  } });
  return next;
}

async function readCommandPolicyState(prisma) {
  const record = await prisma.setting.findUnique({ where: { key: 'chat_command_policies' } });
  return parseCommandPolicyState(record?.value);
}

/** @typedef {{locale: string, revision: number}} ProductLocaleState */

/** @type {ProductLocaleState} */
const DEFAULT_PRODUCT_LOCALE = Object.freeze({ locale: 'pt-BR', revision: 1 });

/** @param {unknown} value @param {ProductLocaleState} [fallback] @returns {ProductLocaleState} */
function parseProductLocaleState(value, fallback = DEFAULT_PRODUCT_LOCALE) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }
  const candidate = /** @type {Record<string, unknown>} */ (value);
  if (typeof candidate.locale !== 'string' || typeof candidate.revision !== 'number'
    || !Number.isInteger(candidate.revision) || candidate.revision < 1) return fallback;
  try {
    if (globalThis.Intl.getCanonicalLocales(candidate.locale)[0] !== candidate.locale) return fallback;
  } catch {
    return fallback;
  }
  return { locale: candidate.locale, revision: candidate.revision };
}

function normalizeRedemptionStatus(status) {
  const value = String(status ?? 'unknown').toUpperCase();
  return ['UNFULFILLED', 'FULFILLED', 'CANCELED'].includes(value) ? value : 'UNKNOWN';
}

function validateAccountLabel(label) {
  if (typeof label !== 'string' || label.trim().length < 1 || label.trim().length > 60 || Array.from(label).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    throw repositoryError('INVALID_ACCOUNT_LABEL', 'Account label is invalid');
  }
}

async function createCancellationIntent(tx, redemptionId, entryId = null) {
  await tx.redemption.update({
    where: { redemptionId },
    data: { expectedStatus: 'CANCELED', syncStatus: 'pending' },
  });
  await tx.outbox.create({
    data: {
      operationType: 'redemption.cancel',
      entityType: 'redemption',
      entityId: redemptionId,
      idempotencyKey: `financial:${redemptionId}`,
      payload: {},
      entryId,
      redemptionId,
    },
  });
}

/** @param {PrismaClientLike} prisma */
export function createQueueRepository(prisma, { clock = () => new Date(), defaultProductLocale = 'pt-BR' } = {}) {
  let initialProductLocale = 'pt-BR';
  try {
    const candidate = globalThis.Intl.getCanonicalLocales(defaultProductLocale)[0];
    if (candidate === defaultProductLocale) initialProductLocale = candidate;
  } catch { /* Keep the Portuguese default when a host value is invalid. */ }
  /** @type {ProductLocaleState} */
  const productLocaleFallback = Object.freeze({ locale: initialProductLocale, revision: 1 });
  return {
    async getCommandPolicyState() {
      return readCommandPolicyState(prisma);
    },

    async getCommandPolicies() {
      return (await readCommandPolicyState(prisma)).policies;
    },

    async updateCommandPolicies({ expectedVersion, policies, actorId = null, origin = 'panel' }) {
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        throw repositoryError('INVALID_COMMAND_POLICY', 'Command policy update is invalid');
      }
      validateCommandPolicyChanges(policies);
      return prisma.$transaction((tx) => updateCommandPoliciesInTransaction(tx, { expectedVersion, policies, actorId, origin }));
    },

    async updateCommandPoliciesInTransaction(tx, input) {
      return updateCommandPoliciesInTransaction(tx, input);
    },

    async beginPanelOperation({ operationKey, fingerprint }) {
      try {
        await prisma.processedOperation.create({ data: { operationKey, result: { kind: 'panel_mutation', fingerprint, state: 'processing' } } });
        return { status: 'started' };
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const previous = await prisma.processedOperation.findUnique({ where: { operationKey } });
        const result = previous?.result;
        if (result?.kind !== 'panel_mutation') return { status: 'conflict' };
        if (result.fingerprint !== fingerprint) return { status: 'conflict' };
        if (result.state === 'completed') return { status: 'replay', statusCode: result.statusCode, responseBody: result.responseBody ?? null };
        return { status: 'in_progress' };
      }
    },

    async completePanelOperation({ operationKey, fingerprint, statusCode, responseBody }) {
      const current = await prisma.processedOperation.findUnique({ where: { operationKey } });
      if (current?.result?.kind !== 'panel_mutation' || current.result.fingerprint !== fingerprint || current.result.state !== 'processing') return false;
      await prisma.processedOperation.update({ where: { operationKey }, data: { result: { ...current.result, state: 'completed', statusCode, responseBody: responseBody ?? null } } });
      return true;
    },

    async listFinancialOperations() {
      const deletingQueues = await prisma.queue.findMany({ where: { lifecycleStatus: 'deleting' }, select: { id: true } });
      const [financialOperations, deletionOperations, rewardUpdates] = await Promise.all([
        prisma.outbox.findMany({
          where: { operationType: { in: ['redemption.cancel', 'redemption.fulfill'] } },
          select: { id: true, operationType: true, entityId: true, redemptionId: true, status: true, attempts: true, nextAttemptAt: true, lastError: true, createdAt: true, updatedAt: true },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: 200,
        }),
        deletingQueues.length ? prisma.outbox.findMany({
          where: { operationType: { in: ['reward.set_open', 'reward.delete'] }, entityId: { in: deletingQueues.map(({ id }) => id) } },
          select: { id: true, operationType: true, entityId: true, redemptionId: true, status: true, attempts: true, nextAttemptAt: true, lastError: true, createdAt: true, updatedAt: true },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        }) : Promise.resolve([]),
        prisma.outbox.findMany({
          where: { operationType: 'reward.update', status: { in: ['pending', 'retry', 'processing', 'unknown', 'conflict', 'failed'] } },
          select: { id: true, operationType: true, entityId: true, redemptionId: true, status: true, attempts: true, nextAttemptAt: true, lastError: true, createdAt: true, updatedAt: true },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        }),
      ]);
      return [...financialOperations, ...deletionOperations, ...rewardUpdates].sort((first, second) => second.updatedAt.getTime() - first.updatedAt.getTime() || second.id.localeCompare(first.id));
    },
    async getCurrentAccount() {
      const setting = await prisma.setting.findUnique({ where: { key: 'account_state' } });
      return setting?.value ?? { label: 'Streamer', source: 'default', ownerEntryId: null, defaultLabel: 'Streamer' };
    },

    async getOverlaySourceValue({ sourceType, queueId = null, tx = prisma }) {
      if (sourceType === 'account_label') {
        const setting = await tx.setting.findUnique({ where: { key: 'account_state' } });
        return typeof setting?.value?.label === 'string' ? setting.value.label : 'Streamer';
      }
      if (sourceType === 'queue_name' || sourceType === 'queue_state' || sourceType === 'queue_waiting_count') {
        if (typeof queueId !== 'string') return null;
        const queue = await tx.queue.findUnique({ where: { id: queueId }, select: { title: true, isOpen: true, lifecycleStatus: true, remoteSyncStatus: true } });
        if (!queue || queue.lifecycleStatus === 'deleted') return null;
        if (sourceType === 'queue_name') return queue.title;
        if (sourceType === 'queue_state') {
          if (!['synced', 'synced_manual', 'delete_pending'].includes(queue.remoteSyncStatus)) return null;
          return queue.isOpen ? 'open' : 'closed';
        }
        return tx.entry.count({ where: { queueId, status: 'waiting' } });
      }
      if (sourceType === 'called_viewer_display_name' || sourceType === 'called_viewer_position') {
        const entry = await tx.entry.findFirst({
          where: { status: 'called', calledAt: { not: null } },
          orderBy: [{ calledAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true, displayName: true },
        });
        if (!entry) return null;
        if (sourceType === 'called_viewer_display_name') return entry.displayName;
        const transition = await tx.auditLog.findFirst({
          where: { entryId: entry.id, event: 'entry.transitioned', previousState: 'waiting', nextState: 'called' },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { safeDetail: true },
        });
        return Number.isInteger(transition?.safeDetail?.previousPosition) ? transition.safeDetail.previousPosition : null;
      }
      if (sourceType === 'in_service_viewer_display_name') {
        const entry = await tx.entry.findFirst({
          where: { status: 'in_progress', startedAt: { not: null } },
          orderBy: [{ startedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          select: { displayName: true },
        });
        return entry?.displayName ?? null;
      }
      return null;
    },

    async claimChatCommand({ messageId, channelId, userId, role, cooldownExempt = false, now = clock(), cooldownMs = 5_000 }) {
      if (typeof messageId !== 'string' || !messageId || typeof channelId !== 'string' || !channelId
          || typeof userId !== 'string' || !userId || !['viewer', 'follower', 'subscriber', 'vip', 'moderator', 'streamer'].includes(role)
          || !(now instanceof Date) || !Number.isFinite(now.getTime()) || !Number.isInteger(cooldownMs) || cooldownMs < 0) {
        throw repositoryError('INVALID_CHAT_OPERATION', 'Chat operation identity or timing is invalid');
      }
      return prisma.$transaction(async (tx) => {
        const messageKey = `chat-message:${messageId}`;
        await lockScopedOperation(tx, messageKey);
        const previousMessage = await tx.processedOperation.findUnique({ where: { operationKey: messageKey } });
        if (previousMessage) return { status: 'duplicate' };

        if (!['moderator', 'streamer'].includes(role) && !cooldownExempt) {
          const cooldownKey = `chat-viewer-cooldown:${channelId}:${userId}`;
          await lockScopedOperation(tx, cooldownKey);
          const cooldownRecord = await tx.processedOperation.findUnique({ where: { operationKey: cooldownKey } });
          const lastAcceptedAt = cooldownRecord?.result?.lastAcceptedAt ? new Date(cooldownRecord.result.lastAcceptedAt) : null;
          if (lastAcceptedAt && now.getTime() - lastAcceptedAt.getTime() < cooldownMs) {
            await tx.processedOperation.create({ data: { operationKey: messageKey, result: { status: 'cooldown', channelId, userId } } });
            return { status: 'cooldown' };
          }
          await tx.processedOperation.upsert({
            where: { operationKey: cooldownKey },
            create: { operationKey: cooldownKey, result: { lastAcceptedAt: now.toISOString() } },
            update: { result: { lastAcceptedAt: now.toISOString() } },
          });
        }
        await tx.processedOperation.create({ data: { operationKey: messageKey, result: { status: 'accepted', channelId, userId, role } } });
        return { status: 'accepted' };
      });
    },

    async getLocalState() {
      const [account, credential, queueCount, pendingOperations, productLocale] = await Promise.all([
        prisma.setting.findUnique({ where: { key: 'account_state' } }),
        prisma.oAuthCredential.findFirst({ select: { clientId: true, broadcasterId: true, authStatus: true, scopes: true } }),
        prisma.queue.count({ where: { lifecycleStatus: { not: 'deleted' } } }),
        prisma.outbox.count({ where: { status: { in: ['pending', 'retry', 'processing', 'unknown', 'conflict', 'failed'] } } }),
        prisma.setting.findUnique({ where: { key: 'product_locale' } }),
      ]);
      return { account: account?.value ?? { label: 'Streamer', source: 'default' }, productLocale: parseProductLocaleState(productLocale?.value, productLocaleFallback), twitch: credential ? { clientId: credential.clientId, broadcasterId: credential.broadcasterId, status: credential.authStatus, scopes: credential.scopes } : null, queueCount, pendingOperations };
    },

    async getProductLocale() {
      const setting = await prisma.setting.findUnique({ where: { key: 'product_locale' } });
      return parseProductLocaleState(setting?.value, productLocaleFallback);
    },

    async setProductLocale({ locale, expectedRevision, actorId = null }) {
      let canonicalLocale;
      try { canonicalLocale = globalThis.Intl.getCanonicalLocales(locale)[0]; } catch { canonicalLocale = null; }
      if (typeof locale !== 'string' || canonicalLocale !== locale) {
        throw repositoryError('INVALID_PRODUCT_LOCALE', 'Product locale must be a canonical BCP 47 identifier');
      }
      if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
        throw repositoryError('PRODUCT_LOCALE_VERSION_CONFLICT', 'Product locale revision is invalid');
      }
      return prisma.$transaction(async (tx) => {
        await lockScopedOperation(tx, 'setting:product-locale');
        const currentRecord = await tx.setting.findUnique({ where: { key: 'product_locale' } });
        const previous = parseProductLocaleState(currentRecord?.value, productLocaleFallback);
        if (previous.revision !== expectedRevision) {
          throw repositoryError('PRODUCT_LOCALE_VERSION_CONFLICT', 'Product locale changed since it was read');
        }
        if (previous.locale === locale) return previous;

        const next = { locale, revision: previous.revision + 1 };
        await tx.setting.upsert({
          where: { key: 'product_locale' },
          create: { key: 'product_locale', value: next },
          update: { value: next },
        });
        await tx.auditLog.create({ data: {
          event: 'product.locale_changed', actorId, origin: 'panel',
          previousState: previous.locale, nextState: next.locale,
          reason: 'operator_locale_change', safeDetail: { revision: next.revision },
        } });
        return next;
      });
    },

    async setCurrentAccount(label, actorId = null) {
      validateAccountLabel(label);
      return prisma.$transaction(async (tx) => {
        await lockCurrentAccount(tx);
        const current = await tx.setting.findUnique({ where: { key: 'account_state' } });
        const previous = current?.value ?? { label: 'Streamer', source: 'default', ownerEntryId: null, defaultLabel: 'Streamer' };
        const next = { ...previous, label: label.trim(), source: 'manual', updatedBy: actorId };
        await tx.setting.upsert({ where: { key: 'account_state' }, create: { key: 'account_state', value: next }, update: { value: next } });
        await tx.auditLog.create({ data: { event: 'account.changed', origin: 'panel', actorId, previousState: previous.label, nextState: next.label, reason: 'manual_account_change', safeDetail: { source: 'manual', ownerEntryId: next.ownerEntryId } } });
        return next;
      });
    },

    async setQueueOpen(queueId, isOpen, actorId = null, origin = 'panel') {
      if (typeof isOpen !== 'boolean') throw repositoryError('INVALID_QUEUE_OPEN_STATE', 'Queue open state must be boolean');
      return withQueueTransaction(prisma, queueId, async (tx) => {
        const queue = await tx.queue.findUnique({ where: { id: queueId } });
        if (!queue || queue.lifecycleStatus !== 'active' || queue.isArchived) throw repositoryError('QUEUE_NOT_AVAILABLE', 'Queue cannot be opened or closed');
        if (queue.isOpen === isOpen) {
          if (['synced', 'synced_manual'].includes(queue.remoteSyncStatus)) return { status: 'confirmed', isOpen, remoteSyncStatus: queue.remoteSyncStatus };
          if (['pending_open', 'pending_close'].includes(queue.remoteSyncStatus)) return { status: 'pending', isOpen, remoteSyncStatus: queue.remoteSyncStatus };
          return { status: queue.remoteSyncStatus, isOpen, remoteSyncStatus: queue.remoteSyncStatus };
        }
        if (!queue.rewardId || !['synced', 'synced_manual'].includes(queue.remoteSyncStatus)) throw repositoryError('QUEUE_REWARD_NOT_READY', 'Queue reward is not ready for an open-state change');
        const nextVersion = queue.version + 1;
        const updated = await tx.queue.update({ where: { id: queueId }, data: { isOpen, remoteSyncStatus: isOpen ? 'pending_open' : 'pending_close', version: nextVersion } });
        await tx.outbox.create({ data: {
          operationType: 'reward.set_open', entityType: 'queue', entityId: queueId,
          idempotencyKey: `queue:${queueId}:reward.open:${nextVersion}`,
          payload: { isOpen, queueVersion: nextVersion, requestMayHaveReachedTwitch: false },
        } });
        await tx.auditLog.create({ data: { queueId, event: 'queue.open_state_requested', actorId, origin, previousState: String(queue.isOpen), nextState: String(isOpen), reason: isOpen ? 'queue_open_requested' : 'queue_close_requested', safeDetail: { remoteSyncStatus: updated.remoteSyncStatus } } });
        return { status: 'pending', isOpen: updated.isOpen, remoteSyncStatus: updated.remoteSyncStatus };
      });
    },

    async archiveQueue({ queueId, actorId = null, origin = 'panel' }) {
      return withQueueTransaction(prisma, queueId, async (tx) => {
        const queue = await tx.queue.findUnique({ where: { id: queueId } });
        if (!queue || queue.lifecycleStatus !== 'active') throw repositoryError('QUEUE_NOT_AVAILABLE', 'Queue cannot be archived');
        if (queue.isArchived) return { status: queue.remoteSyncStatus === 'pending_close' ? 'pending' : 'archived', queue };
        if (!queue.rewardId || !['synced', 'synced_manual'].includes(queue.remoteSyncStatus)) throw repositoryError('QUEUE_REWARD_NOT_READY', 'Queue reward is not ready to archive');
        const nextVersion = queue.version + 1;
        if (!queue.isOpen) {
          const archived = await tx.queue.update({ where: { id: queueId }, data: { isArchived: true, version: nextVersion } });
          await tx.auditLog.create({ data: { queueId, event: 'queue.archived', actorId, origin, previousState: 'active', nextState: 'archived', reason: 'queue_archived_while_closed', safeDetail: { remoteSyncStatus: queue.remoteSyncStatus } } });
          return { status: 'archived', queue: archived };
        }
        const archived = await tx.queue.update({ where: { id: queueId }, data: { isArchived: true, isOpen: false, remoteSyncStatus: 'pending_close', version: nextVersion } });
        await tx.outbox.create({ data: {
          operationType: 'reward.set_open', entityType: 'queue', entityId: queueId,
          idempotencyKey: `queue:${queueId}:reward.archive:${nextVersion}`,
          payload: { isOpen: false, queueVersion: nextVersion, archiveAfterConfirm: true, requestMayHaveReachedTwitch: false },
        } });
        await tx.auditLog.create({ data: { queueId, event: 'queue.archive_requested', actorId, origin, previousState: 'active', nextState: 'archived_pending_pause', reason: 'queue_archive_requested', safeDetail: { rewardId: queue.rewardId } } });
        return { status: 'pending', queue: archived };
      });
    },

    async unarchiveQueue({ queueId, actorId = null, origin = 'panel' }) {
      return withQueueTransaction(prisma, queueId, async (tx) => {
        const queue = await tx.queue.findUnique({ where: { id: queueId } });
        if (!queue || queue.lifecycleStatus !== 'active') throw repositoryError('QUEUE_NOT_AVAILABLE', 'Queue cannot be unarchived');
        if (!queue.isArchived) return { status: 'unchanged', queue };
        if (queue.isOpen) throw repositoryError('QUEUE_OPEN_WHILE_ARCHIVED', 'Archived queue must remain closed');
        if (!['synced', 'synced_manual'].includes(queue.remoteSyncStatus)) throw repositoryError('QUEUE_REWARD_NOT_READY', 'Queue pause must be confirmed before unarchiving');
        const updated = await tx.queue.update({ where: { id: queueId }, data: { isArchived: false, version: { increment: 1 } } });
        await tx.auditLog.create({ data: { queueId, event: 'queue.unarchived', actorId, origin, previousState: 'archived', nextState: 'active_closed', reason: 'queue_unarchived_closed', safeDetail: { isOpen: false } } });
        return { status: 'unarchived', queue: updated };
      });
    },

    async requestQueueDeletion({ queueId, actorId = null, origin = 'panel', decideTransition }) {
      if (typeof decideTransition !== 'function') throw repositoryError('DOMAIN_TRANSITION_REQUIRED', 'Queue transitions must use the domain service');
      return withQueueTransaction(prisma, queueId, async (tx) => {
        const queue = await tx.queue.findUnique({ where: { id: queueId } });
        if (!queue) throw repositoryError('QUEUE_NOT_FOUND', 'Queue was not found');
        if (queue.lifecycleStatus === 'deleted') return { status: 'deleted', queue, activeRemoved: 0, refundsRequested: 0 };
        if (queue.lifecycleStatus === 'deleting') return { status: 'pending', queue, activeRemoved: 0, refundsRequested: 0 };
        if (!queue.rewardId || !['synced', 'synced_manual'].includes(queue.remoteSyncStatus)) throw repositoryError('QUEUE_REWARD_NOT_READY', 'Managed reward must be resolved and synchronized before deletion');

        const active = await tx.entry.findMany({ where: { queueId, status: { in: activeStatuses } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
        const nextVersion = queue.version + 1;
        const needsPause = queue.isOpen;
        const next = await tx.queue.update({ where: { id: queueId }, data: {
          lifecycleStatus: 'deleting', isArchived: true, isOpen: false,
          remoteSyncStatus: needsPause ? 'pending_close' : 'delete_pending', version: nextVersion,
        } });
        let refundsRequested = 0;
        const now = clock();
        let accountSetting = null;
        if (active.length) {
          await lockCurrentAccount(tx);
          accountSetting = await tx.setting.findUnique({ where: { key: 'account_state' } });
        }
        const currentAccount = accountSetting?.value;
        let ownerEntryEnded = false;
        for (const entry of active) {
          const decision = decideTransition({ entry, queue, input: { to: 'removed', origin, actorId, reason: 'queue_deleted' } });
          await tx.entry.update({ where: { id: entry.id }, data: { status: 'removed', position: null, finishedAt: now, terminalReason: 'queue_deleted', callDeadlineAt: null, version: { increment: 1 } } });
          await tx.auditLog.create({ data: { queueId, entryId: entry.id, redemptionId: entry.redemptionId, event: 'entry.transitioned', actorId, origin, previousState: entry.status, nextState: 'removed', reason: 'queue_deleted', safeDetail: { policySnapshot: decision.policySnapshot, financialDecision: decision.financialDecision } } });
          if (decision.financialDecision === 'request_cancel' && entry.redemptionId) {
            await createCancellationIntent(tx, entry.redemptionId, entry.id);
            refundsRequested += 1;
          }
          if (entry.id === currentAccount?.ownerEntryId) ownerEntryEnded = true;
        }
        if (active.length) await renumberWaitingEntries(tx, queueId);
        if (ownerEntryEnded) {
          if (currentAccount?.ownerEntryId && active.some(({ id }) => id === currentAccount.ownerEntryId)) {
            const reset = { ...currentAccount, label: currentAccount.defaultLabel || 'Streamer', source: 'default', ownerEntryId: null, updatedBy: actorId };
            await tx.setting.update({ where: { key: 'account_state' }, data: { value: reset } });
            await tx.auditLog.create({ data: { queueId, event: 'account.auto_reset', actorId, origin, previousState: currentAccount.label, nextState: reset.label, reason: 'owner_entry_ended', safeDetail: { ownerEntryId: currentAccount.ownerEntryId } } });
          }
        }
        if (needsPause) {
          await tx.outbox.create({ data: {
            operationType: 'reward.set_open', entityType: 'queue', entityId: queueId,
            idempotencyKey: `queue:${queueId}:reward.delete.pause:${nextVersion}`,
            payload: { isOpen: false, queueVersion: nextVersion, deleteAfterConfirm: true, requestMayHaveReachedTwitch: false },
          } });
        } else {
          await tx.outbox.create({ data: {
            operationType: 'reward.delete', entityType: 'queue', entityId: queueId,
            idempotencyKey: `queue:${queueId}:reward.delete`,
            payload: { requestMayHaveReachedTwitch: false, safeToDelete: false },
          } });
        }
        await tx.auditLog.create({ data: { queueId, event: 'queue.deletion_requested', actorId, origin, previousState: queue.lifecycleStatus, nextState: 'deleting', reason: 'operator_requested_queue_deletion', safeDetail: { rewardId: queue.rewardId, activeRemoved: active.length, refundsRequested } } });
        return { status: 'pending', queue: next, activeRemoved: active.length, refundsRequested };
      });
    },

    async resetCurrentAccount(actorId = null) {
      return prisma.$transaction(async (tx) => {
        await lockCurrentAccount(tx);
        const current = await tx.setting.findUnique({ where: { key: 'account_state' } });
        const previous = current?.value ?? { label: 'Streamer', source: 'default', ownerEntryId: null, defaultLabel: 'Streamer' };
        const next = { ...previous, label: previous.defaultLabel || 'Streamer', source: 'default', ownerEntryId: null, updatedBy: actorId };
        await tx.setting.upsert({ where: { key: 'account_state' }, create: { key: 'account_state', value: next }, update: { value: next } });
        await tx.auditLog.create({ data: { event: 'account.reset', origin: 'panel', actorId, previousState: previous.label, nextState: next.label, reason: 'account_reset', safeDetail: { source: 'default' } } });
        return next;
      });
    },

    async setDefaultAccountLabel(label, actorId = null) {
      validateAccountLabel(label);
      return prisma.$transaction(async (tx) => {
        await lockCurrentAccount(tx);
        const current = await tx.setting.findUnique({ where: { key: 'account_state' } });
        const previous = current?.value ?? { label: 'Streamer', source: 'default', ownerEntryId: null, defaultLabel: 'Streamer' };
        const next = { ...previous, defaultLabel: label.trim(), ...(previous.source === 'default' ? { label: label.trim() } : {}), updatedBy: actorId };
        await tx.setting.upsert({ where: { key: 'account_state' }, create: { key: 'account_state', value: next }, update: { value: next } });
        await tx.auditLog.create({ data: { event: 'account.default_label_changed', origin: 'panel', actorId, previousState: previous.defaultLabel || 'Streamer', nextState: next.defaultLabel, reason: 'default_account_label_changed', safeDetail: { source: next.source, ownerEntryId: next.ownerEntryId } } });
        return next;
      });
    },


    async enqueueCallNotification({ entryId, queueId }) {
      return prisma.$transaction(async (tx) => {
        const entry = await tx.entry.findUnique({ where: { id: entryId } });
        if (!entry || entry.queueId !== queueId || entry.status !== 'called') return { status: 'cancelled' };
        return tx.outbox.create({ data: {
          operationType: 'chat.call', entityType: 'entry', entityId: entryId,
          idempotencyKey: `chat.call:${entryId}`, payload: {}, entryId,
        } });
      });
    },

    async resendCallNotification({ entryId, actorId = null }) {
      const entry = await prisma.entry.findUnique({ where: { id: entryId } });
      if (!entry) return { status: 'entry_not_found' };
      return withQueueTransaction(prisma, entry.queueId, async (tx) => {
        const current = await tx.entry.findUnique({ where: { id: entryId } });
        if (!current || current.status !== 'called') return { status: 'entry_not_called' };
        const task = await tx.outbox.findUnique({ where: { idempotencyKey: `chat.call:${entryId}` } });
        if (!task) return { status: 'notification_not_found' };
        if (task.status === 'processing') return { status: 'already_processing' };
        if (['pending'].includes(task.status)) return { status: 'already_queued' };
        await tx.outbox.update({ where: { id: task.id }, data: {
          status: 'pending', attempts: 0, nextAttemptAt: clock(), lastError: null, leaseToken: null, leaseUntil: null,
        } });
        await tx.auditLog.create({ data: {
          queueId: entry.queueId, entryId, event: 'entry.call_notification_resent', actorId, origin: 'panel',
          previousState: task.status, nextState: 'pending', reason: 'operator_call_notification_resend',
          safeDetail: { callDeadlinePreserved: true },
        } });
        return { status: 'queued', entryId };
      });
    },

    async recordCallNotificationResult({ entryId, sent, timeoutMin }) {
      if (!sent) return null;
      return prisma.$transaction(async (tx) => {
        const entry = await tx.entry.findUnique({ where: { id: entryId }, include: { queue: { select: { callTimeoutMin: true, uidMode: true, showUidOnCall: true } } } });
        if (!entry || entry.status !== 'called' || entry.callNotifiedAt) return null;
        const now = clock();
        const duration = Number.isInteger(timeoutMin) ? timeoutMin : entry.queue.callTimeoutMin;
        const deadline = duration === null ? null : new Date(now.getTime() + duration * 60_000);
        const updated = await tx.entry.update({ where: { id: entryId }, data: { callNotifiedAt: now, callDeadlineAt: deadline, version: { increment: 1 } } });
        await tx.auditLog.create({ data: { queueId: entry.queueId, entryId, redemptionId: entry.redemptionId, event: 'entry.call_notified', origin: 'chat', reason: 'chat_delivery_confirmed', safeDetail: { deadlineConfigured: deadline !== null } } });
        return updated;
      });
    },

    async listPendingCallNotifications() {
      return prisma.outbox.findMany({ where: { operationType: 'chat.call', status: { in: ['pending', 'retry'] } }, include: { entry: { include: { queue: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    },

    async claimNextChatNotification({ now = clock(), leaseMs = 30_000 } = {}) {
      const leaseUntil = new Date(now.getTime() + leaseMs);
      const rows = await prisma.$queryRaw`
        WITH candidate AS (
          SELECT outbox.id FROM outbox
          WHERE operation_type = 'chat.call'
            AND ((status IN ('pending', 'retry') AND next_attempt_at <= ${now})
              OR (status = 'processing' AND lease_until <= ${now}))
          ORDER BY next_attempt_at ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE outbox AS task
        SET status = 'processing', attempts = task.attempts + 1,
            lease_until = ${leaseUntil}, lease_token = gen_random_uuid(), updated_at = ${now}
        FROM candidate
        WHERE task.id = candidate.id
        RETURNING task.id, task.entry_id AS "entryId", task.attempts, task.lease_token AS "leaseToken"
      `;
      const claimed = rows[0];
      if (!claimed) return null;
      const entry = await prisma.entry.findUnique({ where: { id: claimed.entryId }, include: { queue: true } });
      if (!entry || entry.status !== 'called') {
        await this.finishCallNotification(claimed.id, { status: 'cancelled', errorCode: 'entry_not_called' });
        return { ...claimed, entry: null };
      }
      return { ...claimed, entry, callPosition: entry.position };
    },

    async finishCallNotification(outboxId, { status, errorCode = null, nextAttemptAt = null }) {
      return prisma.outbox.updateMany({ where: { id: outboxId, status: { in: ['pending', 'retry', 'processing'] } }, data: {
        status, lastError: errorCode, leaseToken: null, leaseUntil: null,
        ...(status === 'retry' && nextAttemptAt instanceof Date ? { nextAttemptAt } : {}),
      } });
    },

    async getQueueByKey(key) {
      return prisma.queue.findFirst({ where: { keys: { some: { key } }, lifecycleStatus: { not: 'deleted' } } });
    },

    async getQueueById(id) { return prisma.queue.findUnique({ where: { id } }); },
    async getEntry(id) { return prisma.entry.findUnique({ where: { id } }); },

    async updateLocalQueueSettings({ queueId, expectedVersion, settings, actorId = null, origin = 'panel' }) {
      const localSettings = new Set(['callTimeoutMin', 'callMessage', 'showUidInList', 'showUidInOverlay', 'showUidOnCall', 'autoSwitchAccount', 'refundIfRemovedWhileCalled', 'refundOnNoShow', 'refundIfViewerLeavesCalled']);
      if (Object.keys(settings).some((key) => !localSettings.has(key))) throw repositoryError('INVALID_LOCAL_QUEUE_SETTING', 'A local settings update contains a Twitch-managed field');
      return withQueueTransaction(prisma, queueId, async (tx) => {
        const queue = await tx.queue.findUnique({ where: { id: queueId } });
        if (!queue || queue.lifecycleStatus === 'deleted') throw repositoryError('QUEUE_NOT_FOUND', 'Queue was not found');
        if (queue.lifecycleStatus !== 'active') throw repositoryError('QUEUE_NOT_AVAILABLE', 'Queue cannot be edited');
        if (queue.version !== expectedVersion) throw repositoryError('STALE_QUEUE_VERSION', 'Queue changed since it was loaded');
        const updated = await tx.queue.update({ where: { id: queueId }, data: { ...settings, version: { increment: 1 } } });
        await tx.auditLog.create({ data: {
          queueId, event: 'queue.settings_updated', actorId, origin,
          safeDetail: { updatedFields: Object.keys(settings).sort(), uidMode: updated.uidMode },
        } });
        return updated;
      });
    },

    async updateQueueRewardSettings({ queueId, expectedVersion, settings, actorId = null, origin = 'panel' }) {
      return withQueueTransaction(prisma, queueId, async (tx) => {
        const queue = await tx.queue.findUnique({ where: { id: queueId } });
        if (!queue || queue.lifecycleStatus === 'deleted') throw repositoryError('QUEUE_NOT_FOUND', 'Queue was not found');
        if (queue.lifecycleStatus !== 'active') throw repositoryError('QUEUE_NOT_AVAILABLE', 'Queue cannot be edited');
        if (queue.version !== expectedVersion) throw repositoryError('STALE_QUEUE_VERSION', 'Queue changed since it was loaded');
        const activeUpdate = await tx.outbox.findFirst({ where: { entityId: queueId, operationType: 'reward.update', status: { in: ['pending', 'retry', 'processing', 'unknown'] } }, select: { id: true } });
        if (activeUpdate) throw repositoryError('QUEUE_REWARD_UPDATE_PENDING', 'A reward update is already pending');
        if (!queue.rewardId || !['synced', 'synced_manual'].includes(queue.remoteSyncStatus)) throw repositoryError('QUEUE_REWARD_NOT_READY', 'Managed Twitch reward is not synchronized');
        const previous = {
          title: queue.title, cost: queue.cost, prompt: queue.rewardPrompt, uidMode: queue.uidMode,
          maxRedemptionsPerStream: queue.maxRedemptionsPerStream,
          maxRedemptionsPerUserPerStream: queue.maxRedemptionsPerUserPerStream,
          globalCooldownSeconds: queue.globalCooldownSeconds,
        };
        const nextVersion = queue.version + 1;
        const nextUidMode = settings.uidMode ?? queue.uidMode;
        const updated = await tx.queue.update({ where: { id: queueId }, data: {
          ...settings, remoteSyncStatus: 'pending_update', version: nextVersion,
        } });
        if (nextUidMode === 'hidden') {
          await tx.entry.updateMany({ where: { queueId, uid: { not: null } }, data: { uid: null, version: { increment: 1 } } });
          await tx.outbox.updateMany({
            where: { operationType: 'chat.call', status: { in: ['pending', 'retry', 'processing'] }, entry: { is: { queueId } } },
            data: { status: 'cancelled', payload: {} },
          });
        }
        await tx.outbox.create({ data: {
          operationType: 'reward.update', entityType: 'queue', entityId: queueId,
          idempotencyKey: `queue:${queueId}:reward.update:${nextVersion}`,
          payload: { queueVersion: nextVersion, requestMayHaveReachedTwitch: false, previous },
        } });
        await tx.auditLog.create({ data: {
          queueId, event: 'queue.reward_settings_requested', actorId, origin,
          previousState: 'synced', nextState: 'pending_update', reason: 'managed_reward_settings_changed',
          safeDetail: { rewardId: queue.rewardId, updatedFields: Object.keys(settings).sort(), uidMode: updated.uidMode },
        } });
        return { status: 'pending', queue: updated };
      });
    },

    async callSpecificEntry({ queueId, entryId, actorId = null, calledAt = clock(), decideTransition }) {
      if (typeof decideTransition !== 'function') throw repositoryError('DOMAIN_TRANSITION_REQUIRED', 'Queue transitions must use the domain service');
      return withQueueTransaction(prisma, queueId, async (tx) => {
        const queue = await tx.queue.findUnique({ where: { id: queueId } });
        if (!queue || queue.lifecycleStatus !== 'active') throw repositoryError('QUEUE_NOT_AVAILABLE', 'Queue cannot call entries');
        const entry = await tx.entry.findFirst({ where: { id: entryId, queueId, status: 'waiting' } });
        if (!entry) throw repositoryError('ENTRY_NOT_WAITING', 'Entry is not waiting in this queue');
        decideTransition({ entry, queue, input: { to: 'called', origin: 'panel', actorId, reason: 'operator_call' } });
        const updated = await tx.entry.update({ where: { id: entryId }, data: { status: 'called', position: null, calledAt, callNotifiedAt: null, callDeadlineAt: null, version: { increment: 1 } } });
        await renumberWaitingEntries(tx, queueId);
        await tx.auditLog.create({ data: { queueId, entryId, redemptionId: entry.redemptionId, event: 'entry.transitioned', actorId, origin: 'panel', previousState: 'waiting', nextState: 'called', reason: 'operator_call', safeDetail: { previousPosition: entry.position } } });
        return { ...updated, previousPosition: entry.position };
      });
    },

    async listEntriesByStatus(queueId, statuses) {
      return prisma.entry.findMany({ where: { queueId, status: { in: statuses } }, orderBy: [{ priorityClass: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] });
    },

    async listQueueChatEntries(queueId) {
      const [waiting, called, inProgress, totalWaiting] = await Promise.all([
        prisma.entry.findMany({ where: { queueId, status: 'waiting' }, orderBy: [{ priorityClass: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], take: 5 }),
        prisma.entry.findMany({ where: { queueId, status: 'called' }, orderBy: [{ calledAt: 'asc' }, { createdAt: 'asc' }] }),
        prisma.entry.findMany({ where: { queueId, status: 'in_progress' }, orderBy: [{ startedAt: 'asc' }, { createdAt: 'asc' }] }),
        prisma.entry.count({ where: { queueId, status: 'waiting' } }),
      ]);
      return { waiting, called, inProgress, totalWaiting };
    },

    async callNext({ queueId, count = 1, calledAt = clock(), actorId = null, decideTransition }) {
      if (typeof decideTransition !== 'function') throw repositoryError('DOMAIN_TRANSITION_REQUIRED', 'Queue transitions must use the domain service');
      if (!Number.isInteger(count) || count < 1 || count > 10) throw repositoryError('INVALID_CALL_COUNT', 'Call count must be between one and ten');
      return withQueueTransaction(prisma, queueId, async (tx) => {
        const queue = await tx.queue.findUnique({ where: { id: queueId } });
        if (!queue || queue.lifecycleStatus !== 'active') throw repositoryError('QUEUE_NOT_AVAILABLE', 'Queue cannot call entries');
        const waiting = await tx.entry.findMany({ where: { queueId, status: 'waiting' }, orderBy: [{ priorityClass: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], take: count });
        const selected = [];
        for (const entry of waiting) {
          decideTransition({ entry, queue, input: { to: 'called', origin: 'panel', actorId, reason: 'operator_call' } });
          const updated = await tx.entry.update({ where: { id: entry.id }, data: { status: 'called', position: null, calledAt, callNotifiedAt: null, callDeadlineAt: null, version: { increment: 1 } } });
          await tx.auditLog.create({ data: { queueId, entryId: entry.id, redemptionId: entry.redemptionId, event: 'entry.transitioned', origin: 'panel', previousState: 'waiting', nextState: 'called', reason: 'operator_call', safeDetail: { previousPosition: entry.position } } });
          selected.push({ ...updated, previousPosition: entry.position });
        }
        if (count === 1 && selected.length === 1 && queue.autoSwitchAccount) {
          await lockCurrentAccount(tx);
          const accountSetting = await tx.setting.findUnique({ where: { key: 'account_state' } });
          const previousAccount = accountSetting?.value ?? { label: 'Streamer', source: 'default', ownerEntryId: null, defaultLabel: 'Streamer' };
          const nextAccount = { ...previousAccount, label: selected[0].displayName, source: 'queue_auto', ownerEntryId: selected[0].id };
          await tx.setting.upsert({ where: { key: 'account_state' }, create: { key: 'account_state', value: nextAccount }, update: { value: nextAccount } });
          await tx.auditLog.create({ data: { queueId, entryId: selected[0].id, event: 'account.auto_switched', actorId, origin: 'panel', previousState: previousAccount.label, nextState: nextAccount.label, reason: 'single_entry_called', safeDetail: { ownerEntryId: selected[0].id } } });
        }
        await renumberWaitingEntries(tx, queueId);
        return selected;
      });
    },

    async getActiveEntryForUser(queueId, twitchUserId) {
      return prisma.entry.findFirst({ where: { queueId, twitchUserId, status: { in: activeStatuses } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    },

    async listExpiredCalledEntries(cutoff = clock()) {
      return prisma.entry.findMany({ where: { status: 'called', callDeadlineAt: { lte: cutoff } }, orderBy: [{ callDeadlineAt: 'asc' }, { id: 'asc' }] });
    },

    async listQueueProjection() {
      const queues = await prisma.queue.findMany({
        where: { lifecycleStatus: { not: 'deleted' } },
        include: { keys: true, entries: { where: { status: { in: activeStatuses } }, orderBy: [{ status: 'asc' }, { priorityClass: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }] } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      return queues.map((queue) => ({
        id: queue.id, slug: queue.slug, aliases: queue.keys.filter(({ keyType }) => keyType === 'alias').map(({ key }) => key),
        title: queue.title, rewardPrompt: queue.rewardPrompt, cost: queue.cost, uidMode: queue.uidMode,
        maxRedemptionsPerStream: queue.maxRedemptionsPerStream,
        maxRedemptionsPerUserPerStream: queue.maxRedemptionsPerUserPerStream,
        globalCooldownSeconds: queue.globalCooldownSeconds,
        showUidInList: queue.showUidInList, showUidInOverlay: queue.showUidInOverlay, showUidOnCall: queue.showUidOnCall,
        isOpen: queue.isOpen, isArchived: queue.isArchived, lifecycleStatus: queue.lifecycleStatus,
        remoteSyncStatus: queue.remoteSyncStatus, version: queue.version,
        entries: queue.entries.map((entry) => ({
          id: entry.id, userId: entry.twitchUserId, userLogin: entry.userLogin, displayName: entry.displayName,
          uid: queue.uidMode === 'visible' && queue.showUidInOverlay ? entry.uid : null,
          status: entry.status, priorityClass: entry.priorityClass, priorityReason: entry.priorityReason,
          position: entry.position, version: entry.version,
          calledAt: entry.calledAt, callDeadlineAt: entry.callDeadlineAt,
        })),
      }));
    },

    async listQueueHistoryProjection(queueId, { limit = 100 } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw repositoryError('INVALID_HISTORY_LIMIT', 'History limit must be between 1 and 200');
      const entries = await prisma.entry.findMany({
        where: { queueId, status: { in: ['completed', 'removed', 'no_show'] } },
        select: { id: true, userLogin: true, displayName: true, status: true, finishedAt: true, terminalReason: true },
        orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
        take: limit,
      });
      return entries;
    },

    async listManagedQueues() {
      return prisma.queue.findMany({ where: { rewardId: { not: null }, lifecycleStatus: { not: 'deleted' } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    },

    async listActiveRedemptionEntries(queueId) {
      return prisma.entry.findMany({
        where: { queueId, source: 'redemption', status: { in: activeStatuses } },
        include: { redemption: { select: { rewardId: true, remoteStatus: true } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
    },

    async markQueueRemoteDivergence(queueId, reason) {
      if (!isSafeReason(reason)) throw repositoryError('INVALID_AUDIT_REASON', 'Remote divergence reason is invalid');
      return prisma.$transaction(async (tx) => {
        const queue = await tx.queue.update({ where: { id: queueId }, data: { remoteSyncStatus: 'diverged', version: { increment: 1 } } });
        await tx.auditLog.create({ data: { queueId, event: 'queue.remote_divergence', origin: 'reconciliation', reason, safeDetail: {} } });
        return queue;
      });
    },

    async markRedemptionUnknown(redemptionId, reason) {
      if (!isSafeReason(reason)) throw repositoryError('INVALID_AUDIT_REASON', 'Unknown redemption reason is invalid');
      return prisma.$transaction(async (tx) => {
        const redemption = await tx.redemption.update({ where: { redemptionId }, data: { syncStatus: 'unknown' } });
        await tx.outbox.updateMany({ where: { redemptionId, status: { in: ['pending', 'retry', 'processing'] } }, data: { status: 'unknown', leaseToken: null, leaseUntil: null, lastError: reason } });
        await tx.auditLog.create({ data: { queueId: redemption.queueId, redemptionId, event: 'redemption.state_unknown', origin: 'reconciliation', reason, safeDetail: {} } });
        return { status: 'unknown', redemptionId };
      });
    },

    async clearActiveEntries({ queueId, snapshot, actorId = null, origin = 'panel', decideTransition }) {
      if (typeof decideTransition !== 'function') throw repositoryError('DOMAIN_TRANSITION_REQUIRED', 'Queue transitions must use the domain service');
      return withQueueTransaction(prisma, queueId, async (tx) => {
        const queue = await tx.queue.findUnique({ where: { id: queueId } });
        if (!queue) throw repositoryError('QUEUE_NOT_FOUND', 'Queue was not found');
        const active = await tx.entry.findMany({ where: { queueId, status: { in: activeStatuses } }, orderBy: { id: 'asc' } });
        const actualSnapshot = active.map(({ id, version, status, source, redemptionId }) => ({ id, version, status, source, redemptionId }));
        const expectedSnapshot = [...snapshot].sort((left, right) => left.id.localeCompare(right.id));
        if (JSON.stringify(actualSnapshot) !== JSON.stringify(expectedSnapshot)) return { status: 'stale' };
        let refundsRequested = 0;
        const now = clock();
        for (const entry of active) {
          const decision = decideTransition({ entry, queue, input: { to: 'removed', origin, actorId, reason: 'queue_cleared' } });
          await tx.entry.update({ where: { id: entry.id }, data: { status: 'removed', position: null, finishedAt: now, terminalReason: 'queue_cleared', callDeadlineAt: null, version: { increment: 1 } } });
          await tx.auditLog.create({ data: { queueId, entryId: entry.id, redemptionId: entry.redemptionId, event: 'entry.transitioned', actorId, origin, previousState: entry.status, nextState: 'removed', reason: 'queue_cleared', safeDetail: { policySnapshot: decision.policySnapshot, financialDecision: decision.financialDecision } } });
          if (decision.financialDecision === 'request_cancel' && entry.redemptionId) {
            await createCancellationIntent(tx, entry.redemptionId, entry.id);
            refundsRequested += 1;
          }
        }
        await renumberWaitingEntries(tx, queueId);
        return { status: 'cleared', count: active.length, refundsRequested };
      });
    },

    async createQueue({ slug, aliases = [], title, cost, ...settings }) {
      const normalizedKeys = normalizeQueueKeys({ slug, aliases });
      try {
        return await prisma.$transaction(async (tx) => {
          const queue = await tx.queue.create({ data: { ...settings, slug: normalizedKeys.slug, title, cost } });
          await tx.queueKey.createMany({
            data: normalizedKeys.keys.map(({ key, keyType }) => ({ key, keyType, queueId: queue.id })),
          });
          return queue;
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw repositoryError('DUPLICATE_QUEUE_KEY', 'Queue slug or alias is already in use');
        }
        throw error;
      }
    },

    async createQueueWithRewardIntent({ slug, aliases = [], title, cost, actorId = null, ...settings }) {
      const normalizedKeys = normalizeQueueKeys({ slug, aliases });
      try {
        return await prisma.$transaction(async (tx) => {
          const queue = await tx.queue.create({
            data: {
              ...settings,
              slug: normalizedKeys.slug,
              title,
              cost,
              remoteSyncStatus: 'pending_create',
            },
          });
          await tx.queueKey.createMany({
            data: normalizedKeys.keys.map(({ key, keyType }) => ({ key, keyType, queueId: queue.id })),
          });
          await tx.outbox.create({
            data: {
              operationType: 'reward.create',
              entityType: 'queue',
              entityId: queue.id,
              idempotencyKey: `queue:${queue.id}:reward.create`,
              payload: {
                title: queue.title,
                cost: queue.cost,
                prompt: queue.rewardPrompt,
                uidMode: queue.uidMode,
                maxRedemptionsPerStream: queue.maxRedemptionsPerStream,
                maxRedemptionsPerUserPerStream: queue.maxRedemptionsPerUserPerStream,
                globalCooldownSeconds: queue.globalCooldownSeconds,
              },
            },
          });
          await tx.auditLog.create({
            data: {
              queueId: queue.id,
              event: 'queue.reward_creation_requested',
              actorId,
              origin: 'panel',
              safeDetail: { remoteSyncStatus: 'pending_create' },
            },
          });
          return { queue, status: 'pending' };
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw repositoryError('DUPLICATE_QUEUE_KEY', 'Queue slug or alias is already in use');
        }
        throw error;
      }
    },

    async claimNextRewardOperation({ now = clock(), leaseMs = 30_000 } = {}) {
      const leaseUntil = new Date(now.getTime() + leaseMs);
      const rows = await prisma.$queryRaw`
        WITH candidate AS (
          SELECT outbox.id, outbox.entity_id FROM outbox
          WHERE (
            (operation_type = 'reward.create'
              AND EXISTS (SELECT 1 FROM queues WHERE queues.id::text = outbox.entity_id
                AND queues.remote_sync_status IN ('pending_create', 'create_unknown')))
            OR (operation_type = 'reward.update'
              AND EXISTS (SELECT 1 FROM queues WHERE queues.id::text = outbox.entity_id
                AND queues.remote_sync_status IN ('pending_update', 'update_unknown')))
            OR (operation_type = 'reward.set_open'
              AND EXISTS (SELECT 1 FROM queues WHERE queues.id::text = outbox.entity_id
                AND queues.remote_sync_status IN ('pending_open', 'pending_close')))
            OR (operation_type = 'reward.delete'
              AND EXISTS (SELECT 1 FROM queues WHERE queues.id::text = outbox.entity_id
                AND queues.lifecycle_status = 'deleting' AND queues.remote_sync_status = 'delete_pending'))
          )
            AND ((outbox.status IN ('pending', 'retry') AND outbox.next_attempt_at <= ${now})
              OR (outbox.status = 'processing' AND outbox.lease_until <= ${now}))
          ORDER BY outbox.created_at DESC, outbox.id ASC
          FOR UPDATE OF outbox SKIP LOCKED
          LIMIT 1
        )
        UPDATE outbox AS task
        SET status = 'processing', attempts = task.attempts + 1,
            lease_until = ${leaseUntil}, lease_token = gen_random_uuid(), updated_at = ${now}
        FROM candidate
        WHERE task.id = candidate.id
          AND task.entity_id = candidate.entity_id
        RETURNING task.id, task.operation_type AS "operationType", task.entity_id AS "entityId",
          task.payload, task.attempts, task.status, task.lease_until AS "leaseUntil", task.lease_token AS "leaseToken"
      `;
      const claimed = rows[0];
      if (!claimed) return null;
      const queue = await prisma.queue.findUnique({ where: { id: claimed.entityId } });
      return { ...claimed, queue };
    },

    async prepareRewardCreate(outboxId, payload, leaseToken) {
      const current = await prisma.outbox.findFirst({ where: { id: outboxId, status: 'processing', leaseToken } });
      if (!current) return false;
      const updated = await prisma.outbox.updateMany({ where: { id: outboxId, status: 'processing', leaseToken }, data: { payload: { ...current.payload, ...payload } } });
      return updated.count === 1;
    },

    async prepareRewardUpdate(outboxId, leaseToken) {
      const task = await prisma.outbox.findFirst({ where: { id: outboxId, status: 'processing', leaseToken, operationType: 'reward.update' } });
      if (!task) return false;
      const updated = await prisma.outbox.updateMany({ where: { id: outboxId, status: 'processing', leaseToken }, data: { payload: { ...task.payload, requestMayHaveReachedTwitch: true } } });
      return updated.count === 1;
    },

    async confirmRewardUpdated(outboxId, leaseToken) {
      return prisma.$transaction(async (tx) => {
        const task = await tx.outbox.findFirst({ where: { id: outboxId, status: 'processing', leaseToken, operationType: 'reward.update' } });
        if (!task?.entityId) return false;
        const queue = await tx.queue.findUnique({ where: { id: task.entityId } });
        if (!queue || !queue.rewardId || !['pending_update', 'update_unknown'].includes(queue.remoteSyncStatus)) return false;
        const updated = await tx.queue.updateMany({ where: { id: queue.id, remoteSyncStatus: { in: ['pending_update', 'update_unknown'] } }, data: { remoteSyncStatus: 'synced', version: { increment: 1 } } });
        if (updated.count !== 1) return false;
        await tx.outbox.update({ where: { id: outboxId }, data: { status: 'confirmed', lastError: null, leaseToken: null, leaseUntil: null } });
        await tx.auditLog.create({ data: { queueId: queue.id, event: 'queue.reward_settings_confirmed', origin: 'system', previousState: queue.remoteSyncStatus, nextState: 'synced', reason: 'twitch_reward_settings_confirmed', safeDetail: { rewardId: queue.rewardId } } });
        return true;
      });
    },

    async prepareRewardOpen(outboxId, leaseToken) {
      const current = await prisma.outbox.findFirst({ where: { id: outboxId, status: 'processing', leaseToken, operationType: 'reward.set_open' } });
      if (!current) return false;
      const updated = await prisma.outbox.updateMany({ where: { id: outboxId, status: 'processing', leaseToken }, data: { payload: { ...current.payload, requestMayHaveReachedTwitch: true } } });
      return updated.count === 1;
    },

    async confirmRewardOpen(outboxId, { isOpen }, leaseToken) {
      return prisma.$transaction(async (tx) => {
        const task = await tx.outbox.findFirst({ where: { id: outboxId, status: 'processing', leaseToken, operationType: 'reward.set_open' } });
        if (!task || !task.entityId || typeof task.payload?.isOpen !== 'boolean' || task.payload.isOpen !== isOpen) return false;
        const queue = await tx.queue.findUnique({ where: { id: task.entityId } });
        if (!queue || queue.version !== task.payload.queueVersion || queue.isOpen !== isOpen) return false;
        const deleting = task.payload?.deleteAfterConfirm === true && !isOpen;
        const updated = await tx.queue.updateMany({ where: { id: queue.id, version: task.payload.queueVersion, isOpen, remoteSyncStatus: isOpen ? 'pending_open' : 'pending_close' }, data: { remoteSyncStatus: deleting ? 'delete_pending' : 'synced', version: { increment: 1 } } });
        if (updated.count !== 1) return false;
        await tx.outbox.update({ where: { id: outboxId }, data: { status: 'confirmed', lastError: null, leaseToken: null, leaseUntil: null } });
        await tx.auditLog.create({ data: { queueId: queue.id, event: deleting ? 'queue.deletion_pause_confirmed' : 'queue.open_state_confirmed', origin: 'system', previousState: 'pending', nextState: deleting ? 'delete_pending' : String(isOpen), reason: deleting ? 'reward_paused_for_queue_deletion' : isOpen ? 'queue_open_confirmed' : 'queue_close_confirmed', safeDetail: { rewardId: queue.rewardId, remoteSyncStatus: deleting ? 'delete_pending' : 'synced' } } });
        if (deleting) await tx.outbox.create({ data: {
          operationType: 'reward.delete', entityType: 'queue', entityId: queue.id,
          idempotencyKey: `queue:${queue.id}:reward.delete`,
          payload: { requestMayHaveReachedTwitch: false, safeToDelete: false },
        } });
        return true;
      });
    },

    async recordQueueDeletionRedemptions({ queueId, redemptions }) {
      let recorded = 0;
      let conflicts = 0;
      for (let offset = 0; offset < redemptions.length; offset += 50) {
        const batch = redemptions.slice(offset, offset + 50);
        const result = await withQueueTransaction(prisma, queueId, async (tx) => {
          const queue = await tx.queue.findUnique({ where: { id: queueId } });
          if (!queue || queue.lifecycleStatus !== 'deleting' || !queue.rewardId) throw repositoryError('QUEUE_DELETION_NOT_PENDING', 'Queue deletion is not pending');
          let batchRecorded = 0;
          let batchConflicts = 0;
          for (const item of batch) {
            if (item.rewardId !== queue.rewardId || typeof item.id !== 'string' || !item.id || typeof item.userId !== 'string' || !item.userId || !(item.redeemedAt instanceof Date)) continue;
            const redemption = await tx.redemption.findUnique({ where: { redemptionId: item.id } });
            if (!redemption) {
              await tx.redemption.create({ data: {
                redemptionId: item.id, broadcasterId: item.broadcasterId, rewardId: item.rewardId, userId: item.userId,
                queueId, redeemedAt: item.redeemedAt, remoteStatus: 'UNFULFILLED', expectedStatus: 'CANCELED',
                syncStatus: 'pending', rejectionReason: 'queue_deleting',
              } });
              await tx.outbox.create({ data: {
                operationType: 'redemption.cancel', entityType: 'redemption', entityId: item.id,
                idempotencyKey: `financial:${item.id}`, payload: {}, redemptionId: item.id,
              } });
              batchRecorded += 1;
              continue;
            }
            const existingTask = await tx.outbox.findUnique({ where: { idempotencyKey: `financial:${item.id}` } });
            if (existingTask?.operationType === 'redemption.fulfill' && existingTask.status !== 'confirmed') {
              await tx.outbox.update({ where: { id: existingTask.id }, data: { status: 'conflict', lastError: 'queue_delete_conflicts_with_fulfillment', leaseToken: null, leaseUntil: null } });
              await tx.auditLog.create({ data: { queueId, redemptionId: item.id, event: 'queue.deletion_financial_conflict', origin: 'system', previousState: existingTask.status, nextState: 'conflict', reason: 'fulfillment_intent_exists', safeDetail: {} } });
              batchConflicts += 1;
              continue;
            }
            if (redemption.remoteStatus !== 'UNFULFILLED') continue;
            if (!existingTask) {
              await tx.redemption.update({ where: { redemptionId: item.id }, data: { queueId, expectedStatus: 'CANCELED', syncStatus: 'pending', rejectionReason: 'queue_deleting' } });
              await tx.outbox.create({ data: {
                operationType: 'redemption.cancel', entityType: 'redemption', entityId: item.id,
                idempotencyKey: `financial:${item.id}`, payload: {}, redemptionId: item.id,
              } });
              batchRecorded += 1;
            } else if (existingTask.operationType === 'redemption.cancel') {
              await tx.redemption.update({ where: { redemptionId: item.id }, data: { expectedStatus: 'CANCELED', syncStatus: 'pending', rejectionReason: 'queue_deleting' } });
            }
          }
          return { recorded: batchRecorded, conflicts: batchConflicts };
        });
        recorded += result.recorded;
        conflicts += result.conflicts;
      }
      return { status: conflicts ? 'conflict' : 'recorded', recorded, conflicts };
    },

    async getQueueDeletionBlockers(queueId) {
      const redemptions = await prisma.redemption.findMany({ where: { queueId }, include: { outbox: true } });
      let pending = 0;
      let blocked = 0;
      for (const redemption of redemptions) {
        if (redemption.remoteStatus !== 'UNFULFILLED') continue;
        const task = redemption.outbox.find(({ operationType }) => ['redemption.cancel', 'redemption.fulfill'].includes(operationType));
        if (!task || ['pending', 'retry', 'processing'].includes(task.status)) pending += 1;
        else blocked += 1;
      }
      return { pending, blocked };
    },

    async prepareRewardDelete(outboxId, leaseToken) {
      return prisma.$transaction(async (tx) => {
        const task = await tx.outbox.findFirst({ where: { id: outboxId, status: 'processing', leaseToken, operationType: 'reward.delete' } });
        if (!task?.entityId) return false;
        await lockQueue(tx, task.entityId);
        const queue = await tx.queue.findUnique({ where: { id: task.entityId } });
        if (!queue || queue.lifecycleStatus !== 'deleting' || queue.remoteSyncStatus !== 'delete_pending' || !queue.rewardId) return false;
        const unresolved = await tx.redemption.findFirst({
          where: { queueId: queue.id, rewardId: queue.rewardId, OR: [
            { remoteStatus: 'UNFULFILLED' },
            { outbox: { some: { operationType: { in: ['redemption.cancel', 'redemption.fulfill'] }, status: { not: 'confirmed' } } } },
          ] }, select: { redemptionId: true },
        });
        if (unresolved) return false;
        const payload = { ...task.payload, safeToDelete: true, requestMayHaveReachedTwitch: true };
        const updated = await tx.outbox.updateMany({ where: { id: outboxId, status: 'processing', leaseToken }, data: { payload } });
        return updated.count === 1;
      });
    },

    async completeQueueDeletion(outboxId, leaseToken) {
      return prisma.$transaction(async (tx) => {
        const task = await tx.outbox.findFirst({ where: { id: outboxId, status: 'processing', leaseToken, operationType: 'reward.delete' } });
        if (!task?.entityId || task.payload?.safeToDelete !== true) return false;
        await lockQueue(tx, task.entityId);
        const queue = await tx.queue.findUnique({ where: { id: task.entityId } });
        if (!queue || queue.lifecycleStatus !== 'deleting' || queue.remoteSyncStatus !== 'delete_pending') return false;
        const unresolved = await tx.redemption.findFirst({
          where: { queueId: queue.id, rewardId: queue.rewardId, OR: [
            { remoteStatus: 'UNFULFILLED' },
            { outbox: { some: { operationType: { in: ['redemption.cancel', 'redemption.fulfill'] }, status: { not: 'confirmed' } } } },
          ] }, select: { redemptionId: true },
        });
        if (unresolved) return false;
        const tombstoneSlug = `deleted-${queue.id}`;
        await tx.queue.update({ where: { id: queue.id }, data: { slug: tombstoneSlug, lifecycleStatus: 'deleted', isArchived: true, isOpen: false, remoteSyncStatus: 'deleted', deletedAt: clock(), version: { increment: 1 } } });
        await tx.queueKey.deleteMany({ where: { queueId: queue.id } });
        await tx.outbox.update({ where: { id: outboxId }, data: { status: 'confirmed', lastError: null, leaseToken: null, leaseUntil: null } });
        await tx.auditLog.create({ data: { queueId: queue.id, event: 'queue.deletion_confirmed', origin: 'system', previousState: 'deleting', nextState: 'deleted', reason: 'reward_deleted_after_refunds_confirmed', safeDetail: { rewardId: queue.rewardId, slugReleased: queue.slug } } });
        return true;
      });
    },

    async confirmRewardCreated(outboxId, { rewardId }, leaseToken) {
      return prisma.$transaction(async (tx) => {
        const task = await tx.outbox.findFirst({ where: { id: outboxId, status: 'processing', leaseToken, operationType: 'reward.create' } });
        if (!task || !task.entityId || typeof rewardId !== 'string' || rewardId.length === 0) return false;
        const queue = await tx.queue.findUnique({ where: { id: task.entityId } });
        if (!queue || queue.rewardId) return false;
        const updated = await tx.queue.updateMany({ where: { id: queue.id, rewardId: null, remoteSyncStatus: { in: ['pending_create', 'create_unknown'] } }, data: { rewardId, remoteSyncStatus: 'synced', version: { increment: 1 } } });
        if (updated.count !== 1) return false;
        await tx.outbox.update({ where: { id: outboxId }, data: { status: 'confirmed', lastError: null, leaseToken: null, leaseUntil: null } });
        await tx.auditLog.create({ data: { queueId: queue.id, event: 'queue.reward_creation_confirmed', origin: 'system', safeDetail: { remoteSyncStatus: 'synced' } } });
        return true;
      });
    },

    async retryRewardOperation(outboxId, { nextAttemptAt, errorCode, payloadUpdates = null }, leaseToken) {
      return prisma.$transaction(async (tx) => {
        const current = await tx.outbox.findFirst({ where: { id: outboxId, status: 'processing', leaseToken } });
        if (!current) return false;
        const updated = await tx.outbox.updateMany({ where: { id: outboxId, status: 'processing', leaseToken }, data: {
          status: 'retry', nextAttemptAt, lastError: errorCode,
          ...(payloadUpdates ? { payload: { ...current.payload, ...payloadUpdates } } : {}),
          leaseToken: null, leaseUntil: null,
        } });
        return updated.count === 1;
      });
    },

    async failedRewardOperation(outboxId, errorCode, leaseToken) {
      return prisma.$transaction(async (tx) => {
        const task = await tx.outbox.findFirst({ where: { id: outboxId, status: 'processing', leaseToken, operationType: { in: ['reward.create', 'reward.update', 'reward.set_open', 'reward.delete'] } } });
        if (!task) return false;
        await tx.outbox.update({ where: { id: outboxId }, data: { status: 'failed', lastError: errorCode, leaseToken: null, leaseUntil: null } });
        if (task.entityId && task.operationType === 'reward.create') await tx.queue.updateMany({ where: { id: task.entityId, rewardId: null }, data: { remoteSyncStatus: 'create_failed', version: { increment: 1 } } });
        if (task.entityId && task.operationType === 'reward.update') {
          const queue = await tx.queue.findUnique({ where: { id: task.entityId } });
          await tx.queue.updateMany({ where: { id: task.entityId, remoteSyncStatus: { in: ['pending_update', 'update_unknown'] } }, data: { remoteSyncStatus: 'update_failed', version: { increment: 1 } } });
          await tx.auditLog.create({ data: { queueId: task.entityId, event: 'queue.reward_settings_failed', origin: 'system', previousState: queue?.remoteSyncStatus ?? 'unknown', nextState: 'update_failed', reason: errorCode, safeDetail: { rewardId: queue?.rewardId ?? null } } });
        }
        if (task.entityId && task.operationType === 'reward.set_open') {
          const queue = await tx.queue.findUnique({ where: { id: task.entityId } });
          const state = task.payload?.isOpen === true ? 'open' : 'close';
          await tx.queue.updateMany({ where: { id: task.entityId, version: task.payload?.queueVersion }, data: { remoteSyncStatus: `${state}_failed`, version: { increment: 1 } } });
          await tx.auditLog.create({ data: { queueId: task.entityId, event: 'queue.open_state_failed', origin: 'system', previousState: queue?.remoteSyncStatus ?? 'unknown', nextState: `${state}_failed`, reason: errorCode, safeDetail: { rewardId: queue?.rewardId ?? null } } });
        }
        return true;
      });
    },

    async unknownRewardOperation(outboxId, errorCode, leaseToken) {
      return prisma.$transaction(async (tx) => {
        const task = await tx.outbox.findFirst({ where: { id: outboxId, status: 'processing', leaseToken, operationType: { in: ['reward.create', 'reward.update', 'reward.set_open', 'reward.delete'] } } });
        if (!task) return false;
        await tx.outbox.update({ where: { id: outboxId }, data: { status: 'unknown', lastError: errorCode, leaseToken: null, leaseUntil: null } });
        if (task.entityId && task.operationType === 'reward.create') await tx.queue.updateMany({ where: { id: task.entityId, rewardId: null }, data: { remoteSyncStatus: 'create_unknown', version: { increment: 1 } } });
        if (task.entityId && task.operationType === 'reward.update') {
          const queue = await tx.queue.findUnique({ where: { id: task.entityId } });
          await tx.queue.updateMany({ where: { id: task.entityId, remoteSyncStatus: { in: ['pending_update', 'update_unknown'] } }, data: { remoteSyncStatus: 'update_unknown', version: { increment: 1 } } });
          await tx.auditLog.create({ data: { queueId: task.entityId, event: 'queue.reward_settings_unknown', origin: 'system', previousState: queue?.remoteSyncStatus ?? 'unknown', nextState: 'update_unknown', reason: errorCode, safeDetail: { rewardId: queue?.rewardId ?? null } } });
        }
        if (task.entityId && task.operationType === 'reward.set_open') {
          const queue = await tx.queue.findUnique({ where: { id: task.entityId } });
          const state = task.payload?.isOpen === true ? 'open' : 'close';
          const status = `${state}_unknown`;
          await tx.queue.updateMany({ where: { id: task.entityId, version: task.payload?.queueVersion }, data: { remoteSyncStatus: status, version: { increment: 1 } } });
          await tx.auditLog.create({ data: { queueId: task.entityId, event: 'queue.open_state_unknown', origin: 'system', previousState: queue?.remoteSyncStatus ?? 'unknown', nextState: status, reason: errorCode, safeDetail: { rewardId: queue?.rewardId ?? null } } });
        }
        return true;
      });
    },

    async resolveUnknownRewardCreation({ queueId, rewardId, actorId }) {
      if (typeof actorId !== 'string' || !actorId || typeof rewardId !== 'string' || !rewardId) {
        throw repositoryError('REWARD_ASSOCIATION_ACTOR_REQUIRED', 'Reward association requires an operator and a Twitch reward ID');
      }
      return withQueueTransaction(prisma, queueId, async (tx) => {
        const queue = await tx.queue.findUnique({ where: { id: queueId } });
        if (!queue || queue.rewardId || queue.remoteSyncStatus !== 'create_unknown') {
          throw repositoryError('REWARD_ASSOCIATION_NOT_PENDING', 'Queue has no unresolved reward creation');
        }
        const task = await tx.outbox.findFirst({ where: { operationType: 'reward.create', entityType: 'queue', entityId: queueId, status: 'unknown' } });
        if (!task) throw repositoryError('REWARD_ASSOCIATION_NOT_PENDING', 'Queue has no unresolved reward creation');
        const updated = await tx.queue.updateMany({ where: { id: queueId, rewardId: null, remoteSyncStatus: queue.remoteSyncStatus }, data: { rewardId, remoteSyncStatus: 'synced_manual', version: { increment: 1 } } });
        if (updated.count !== 1) throw repositoryError('REWARD_ASSOCIATION_NOT_PENDING', 'Queue reward association changed concurrently');
        await tx.outbox.update({ where: { id: task.id }, data: { status: 'resolved_manual', lastError: null, leaseToken: null, leaseUntil: null } });
        const resolvedQueue = await tx.queue.findUnique({ where: { id: queueId } });
        await tx.auditLog.create({ data: {
          queueId, actorId, origin: 'panel', event: 'queue.reward_creation_resolved_manually',
          previousState: 'create_unknown', nextState: 'synced_manual', reason: 'operator_selected_managed_reward',
          safeDetail: { rewardId, remoteConfirmed: false },
        } });
        return { status: 'resolved', queue: resolvedQueue };
      });
    },

    async replaceQueueKeys({ queueId, slug, aliases = [] }) {
      const normalizedKeys = normalizeQueueKeys({ slug, aliases });
      try {
        return await withQueueTransaction(prisma, queueId, async (tx) => {
          const queue = await tx.queue.findUnique({ where: { id: queueId } });
          if (!queue) throw repositoryError('QUEUE_NOT_FOUND', 'Queue was not found');
          await tx.queue.update({
            where: { id: queueId },
            data: { slug: normalizedKeys.slug, version: { increment: 1 } },
          });
          await tx.queueKey.deleteMany({ where: { queueId } });
          await tx.queueKey.createMany({
            data: normalizedKeys.keys.map(({ key, keyType }) => ({ key, keyType, queueId })),
          });
          return normalizedKeys;
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw repositoryError('DUPLICATE_QUEUE_KEY', 'Queue slug or alias is already in use');
        }
        throw error;
      }
    },

    async addManualEntry({ queueId, twitchUserId, userLogin, displayName, uid, actorId = null, origin = 'system', priorityReason = null }) {
      try {
        if (priorityReason !== null && !['subscription', 'bits', 'external_payment', 'operator_override'].includes(priorityReason)) {
          throw repositoryError('INVALID_PRIORITY', 'Priority verification data is invalid');
        }
        return await withQueueTransaction(prisma, queueId, async (tx) => {
          const queue = await tx.queue.findUnique({ where: { id: queueId } });
          if (!queue || queue.lifecycleStatus !== 'active' || queue.isArchived) {
            throw repositoryError('QUEUE_NOT_AVAILABLE', 'Queue does not accept new manual entries');
          }
          const validatedUid = validateUidInput({ value: uid, mode: queue.uidMode, required: false });
          const existing = await tx.entry.findFirst({
            where: { queueId, twitchUserId, status: { in: activeStatuses } },
            select: { id: true },
          });
          if (existing) return { status: 'duplicate_active_entry', entryId: existing.id };

          const tail = await tx.entry.findFirst({
            where: { queueId, status: 'waiting', priorityClass: priorityReason ? 'priority' : 'standard' },
            orderBy: [{ position: 'desc' }, { createdAt: 'desc' }],
            select: { position: true },
          });
          const entry = await tx.entry.create({
            data: {
              queueId,
              twitchUserId,
              userLogin: userLogin.toLowerCase(),
              displayName,
              uid: validatedUid.uid,
              source: 'manual',
              status: 'waiting',
              priorityClass: priorityReason ? 'priority' : 'standard',
              priorityReason,
              position: (tail?.position ?? 0) + 1,
            },
          });
          await tx.auditLog.create({ data: {
            queueId, entryId: entry.id, actorId, origin, event: 'entry.manual_added',
            previousState: null, nextState: 'waiting', reason: 'manual_admission', safeDetail: { source: 'manual', priorityClass: entry.priorityClass, verification: priorityReason ? 'operator' : null, benefitCategory: priorityReason },
          } });
          if (priorityReason) await tx.auditLog.create({ data: {
            queueId, entryId: entry.id, actorId, origin, event: 'entry.priority_changed', previousState: 'standard', nextState: 'priority',
            reason: priorityReason, safeDetail: { priorityClass: 'priority', verification: 'operator', benefitCategory: priorityReason },
          } });
          await renumberWaitingEntries(tx, queueId);
          const persistedEntry = await tx.entry.findUnique({ where: { id: entry.id } });
          return { status: 'created', entry: persistedEntry };
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) return { status: 'duplicate_active_entry' };
        throw error;
      }
    },

    async listWaiting(queueId) {
      return prisma.entry.findMany({
        where: { queueId, status: 'waiting' },
        orderBy: [{ priorityClass: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
    },

    async setEntryPriority({ queueId, entryId, priority, reason, actorId = null, origin = 'panel' }) {
      if (typeof priority !== 'boolean' || !['subscription', 'bits', 'external_payment', 'operator_override'].includes(reason)) {
        throw repositoryError('INVALID_PRIORITY', 'Priority verification data is invalid');
      }
      return withQueueTransaction(prisma, queueId, async (tx) => {
        const entry = await tx.entry.findFirst({ where: { id: entryId, queueId, status: 'waiting' } });
        if (!entry) throw repositoryError('ENTRY_NOT_WAITING', 'Entry is not waiting in this queue');
        const nextClass = priority ? 'priority' : 'standard';
        if (entry.priorityClass === nextClass && entry.priorityReason === reason) return { status: 'unchanged', entry };
        await tx.entry.update({ where: { id: entryId }, data: {
          priorityClass: nextClass, priorityReason: priority ? reason : null, version: { increment: 1 },
        } });
        const laneTail = await tx.entry.findFirst({ where: { queueId, status: 'waiting', priorityClass: nextClass, id: { not: entryId } }, orderBy: [{ position: 'desc' }, { createdAt: 'desc' }], select: { position: true } });
        await tx.entry.update({ where: { id: entryId }, data: { position: (laneTail?.position ?? 0) + 1 } });
        await renumberWaitingEntries(tx, queueId);
        await tx.auditLog.create({ data: {
          queueId, entryId, redemptionId: entry.redemptionId, event: 'entry.priority_changed', actorId, origin,
          previousState: entry.priorityClass, nextState: nextClass,
          reason: priority ? reason : 'priority_removed',
          safeDetail: { priorityClass: nextClass, verification: 'operator', benefitCategory: priority ? reason : null },
        } });
        const updated = await tx.entry.findUnique({ where: { id: entryId } });
        return { status: 'updated', priorityClass: nextClass, position: updated.position, entry: updated };
      });
    },

    async moveWaitingEntry({ queueId, entryId, position }) {
      return withQueueTransaction(prisma, queueId, async (tx) => {
        const waiting = await tx.entry.findMany({
          where: { queueId, status: 'waiting' },
          orderBy: [{ priorityClass: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true, priorityClass: true },
        });
        const current = waiting.find(({ id }) => id === entryId);
        if (!current) throw repositoryError('ENTRY_NOT_WAITING', 'Entry is not waiting in this queue');
        const lane = waiting.filter(({ priorityClass }) => priorityClass === current.priorityClass);
        if (!Number.isInteger(position) || position < 1 || position > lane.length) {
          throw repositoryError('INVALID_QUEUE_POSITION', 'Requested queue position is invalid');
        }
        const laneIndex = lane.findIndex(({ id }) => id === entryId);
        if (laneIndex + 1 === position) return { status: 'unchanged' };

        const [moved] = lane.splice(laneIndex, 1);
        lane.splice(position - 1, 0, moved);
        const priorityLane = current.priorityClass === 'priority' ? lane : waiting.filter(({ priorityClass }) => priorityClass === 'priority');
        const standardLane = current.priorityClass === 'standard' ? lane : waiting.filter(({ priorityClass }) => priorityClass === 'standard');
        const reordered = [...priorityLane, ...standardLane];
        await Promise.all(reordered.map(({ id }, index) => tx.entry.update({
          where: { id },
          data: { position: index + 1, version: { increment: 1 } },
        })));
        return { status: 'moved', entryId, position };
      });
    },

    async applyEntryTransition({ input, decideTransition }) {
      if (typeof decideTransition !== 'function') throw repositoryError('DOMAIN_TRANSITION_REQUIRED', 'Queue transitions must use the domain service');
      const { entryId, to, origin = 'system', actorId = null, reason } = input;
      if (!isSafeReason(reason)) throw repositoryError('INVALID_AUDIT_REASON', 'Transition reason is invalid');
      const initial = await prisma.entry.findUnique({ where: { id: entryId }, select: { queueId: true } });
      if (!initial) throw repositoryError('ENTRY_NOT_FOUND', 'Entry was not found');

      return withQueueTransaction(prisma, initial.queueId, async (tx) => {
        const entry = await tx.entry.findUnique({ where: { id: entryId } });
        const queue = await tx.queue.findUnique({ where: { id: initial.queueId } });
        if (!entry || !queue) throw repositoryError('ENTRY_NOT_FOUND', 'Entry was not found');
        const decision = decideTransition({ entry, queue, input });

        const now = clock();
        const data = {
          status: to,
          position: null,
          version: { increment: 1 },
        };
        if (to === 'called') data.calledAt = now;
        if (to === 'in_progress') {
          data.startedAt = now;
          data.callDeadlineAt = null;
        }
        if (['completed', 'removed', 'no_show'].includes(to)) {
          data.finishedAt = now;
          data.terminalReason = reason;
          data.callDeadlineAt = null;
        }
        const updated = await tx.entry.update({ where: { id: entryId }, data });
        if (entry.status === 'waiting') await renumberWaitingEntries(tx, entry.queueId);
        await tx.auditLog.create({
          data: {
            queueId: entry.queueId,
            entryId,
            redemptionId: entry.redemptionId,
            event: 'entry.transitioned',
            actorId,
            origin,
            previousState: entry.status,
            nextState: to,
            reason,
            safeDetail: {
              policySnapshot: decision.policySnapshot,
              financialDecision: decision.financialDecision,
            },
          },
        });
        if (origin === 'external' && entry.redemptionId && input.remoteStatus) {
          const remoteStatus = normalizeRedemptionStatus(input.remoteStatus);
          if (!['FULFILLED', 'CANCELED'].includes(remoteStatus)) {
            throw repositoryError('INVALID_EXTERNAL_REDEMPTION_STATUS', 'External redemption state is invalid');
          }
          if ((to === 'completed' && remoteStatus !== 'FULFILLED') || (to === 'removed' && remoteStatus !== 'CANCELED')) {
            throw repositoryError('CONFLICTING_EXTERNAL_REDEMPTION_STATUS', 'External redemption state conflicts with the requested transition');
          }
          await tx.redemption.update({
            where: { redemptionId: entry.redemptionId },
            data: { remoteStatus, expectedStatus: null, syncStatus: 'confirmed' },
          });
        }
        if (decision.financialDecision !== 'no_operation' && entry.source === 'redemption' && entry.redemptionId) {
          const expectedStatus = decision.financialDecision === 'request_cancel' ? 'CANCELED' : 'FULFILLED';
          const operationType = decision.financialDecision === 'request_cancel'
            ? 'redemption.cancel'
            : 'redemption.fulfill';
          await tx.redemption.update({
            where: { redemptionId: entry.redemptionId },
            data: { expectedStatus, syncStatus: 'pending' },
          });
          await tx.outbox.create({
            data: {
              operationType,
              entityType: 'redemption',
              entityId: entry.redemptionId,
              idempotencyKey: `financial:${entry.redemptionId}`,
              payload: {},
              entryId: entry.id,
              redemptionId: entry.redemptionId,
            },
          });
        }
        if (['completed', 'removed', 'no_show'].includes(to)) {
          await lockCurrentAccount(tx);
          const accountSetting = await tx.setting.findUnique({ where: { key: 'account_state' } });
          const currentAccount = accountSetting?.value;
          if (currentAccount?.ownerEntryId === entry.id) {
            const nextAccount = { ...currentAccount, label: currentAccount.defaultLabel || 'Streamer', source: 'default', ownerEntryId: null, updatedBy: actorId };
            await tx.setting.update({ where: { key: 'account_state' }, data: { value: nextAccount } });
            await tx.auditLog.create({ data: { queueId: entry.queueId, entryId: entry.id, event: 'account.auto_reset', actorId, origin, previousState: currentAccount.label, nextState: nextAccount.label, reason: 'owner_entry_ended', safeDetail: { ownerEntryId: entry.id } } });
          }
        }
        return { ...updated, financialDecision: decision.financialDecision, policySnapshot: decision.policySnapshot };
      });
    },

    async claimNext({ now = clock(), leaseMs = 30_000 } = {}) {
      const leaseUntil = new Date(now.getTime() + leaseMs);
      const rows = await prisma.$queryRaw`
        WITH candidate AS (
          SELECT id FROM outbox
          WHERE operation_type IN ('redemption.cancel', 'redemption.fulfill')
            AND ((outbox.status IN ('pending', 'retry') AND outbox.next_attempt_at <= ${now})
              OR (outbox.status = 'processing' AND outbox.lease_until <= ${now}))
          ORDER BY next_attempt_at ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE outbox AS task
        SET status = 'processing', attempts = task.attempts + 1,
            lease_until = ${leaseUntil}, lease_token = gen_random_uuid(), updated_at = ${now}
        FROM candidate, redemptions AS redemption
        WHERE task.id = candidate.id AND redemption.redemption_id = task.redemption_id
        RETURNING task.id, task.redemption_id AS "redemptionId", task.operation_type AS "operationType",
          task.attempts, task.status, task.lease_token AS "leaseToken", redemption.reward_id AS "rewardId"
      `;
      return rows[0] ?? null;
    },

    async confirm(outboxId, remoteStatus, leaseToken) {
      return prisma.$transaction(async (tx) => {
        const task = await tx.outbox.findFirst({ where: { id: outboxId, status: 'processing', leaseToken } });
        if (!task) return false;
        const updated = await tx.outbox.updateMany({
          where: { id: outboxId, status: 'processing', leaseToken },
          data: { status: 'confirmed', leaseUntil: null, leaseToken: null, lastError: null },
        });
        if (!updated.count) return false;
        if (task.redemptionId) {
          await tx.redemption.update({
            where: { redemptionId: task.redemptionId },
            data: { remoteStatus, syncStatus: 'confirmed' },
          });
        }
        return true;
      });
    },

    async retry(outboxId, { nextAttemptAt, errorCode }, leaseToken) {
      return prisma.outbox.updateMany({
        where: { id: outboxId, status: 'processing', leaseToken },
        data: { status: 'retry', nextAttemptAt, leaseUntil: null, leaseToken: null, lastError: errorCode },
      });
    },

    async conflict(outboxId, errorCode, leaseToken) {
      return prisma.outbox.updateMany({
        where: { id: outboxId, status: 'processing', leaseToken },
        data: { status: 'conflict', leaseUntil: null, leaseToken: null, lastError: errorCode },
      });
    },

    async unknown(outboxId, errorCode, leaseToken) {
      return prisma.outbox.updateMany({
        where: { id: outboxId, status: 'processing', leaseToken },
        data: { status: 'unknown', leaseUntil: null, leaseToken: null, lastError: errorCode },
      });
    },

    async failed(outboxId, errorCode, leaseToken) {
      return prisma.outbox.updateMany({
        where: { id: outboxId, status: 'processing', leaseToken },
        data: { status: 'failed', leaseUntil: null, leaseToken: null, lastError: errorCode },
      });
    },

    async recordRejectedRedemption({ redemptionId, broadcasterId, rewardId, userId, redeemedAt, reason }) {
      if (!isSafeReason(reason)) throw repositoryError('INVALID_REJECTION_REASON', 'Rejection reason is invalid');
      try {
        await prisma.$transaction(async (tx) => {
          await tx.redemption.create({ data: {
            redemptionId,
            broadcasterId,
            rewardId,
            userId,
            redeemedAt,
            remoteStatus: 'UNFULFILLED',
            expectedStatus: 'CANCELED',
            syncStatus: 'pending',
            rejectionReason: reason,
          } });
          await tx.outbox.create({ data: {
            operationType: 'redemption.cancel',
            entityType: 'redemption',
            entityId: redemptionId,
            idempotencyKey: `financial:${redemptionId}`,
            payload: {},
            redemptionId,
          } });
        });
        return { status: 'cancellation_pending', redemptionId };
      } catch (error) {
        if (isUniqueConstraintError(error)) return { status: 'already_recorded', redemptionId };
        throw error;
      }
    },

    async retryOutboxManually(outboxId) {
      return prisma.$transaction(async (tx) => {
        const task = await tx.outbox.findFirst({ where: { id: outboxId, status: { in: ['unknown', 'conflict', 'failed'] } } });
        if (!task) return { count: 0 };
        const updated = await tx.outbox.updateMany({
          where: { id: outboxId, status: task.status },
          data: { status: 'pending', nextAttemptAt: clock(), lastError: null, leaseUntil: null, leaseToken: null },
        });
        if (!updated.count || !task.entityId) return updated;
        const queue = ['reward.delete', 'reward.set_open', 'reward.update'].includes(task.operationType)
          ? await tx.queue.findUnique({ where: { id: task.entityId } })
          : null;
        if (task.operationType === 'reward.update' && queue?.lifecycleStatus === 'active') {
          await tx.queue.updateMany({ where: { id: queue.id, remoteSyncStatus: { in: ['update_failed', 'update_unknown'] } }, data: { remoteSyncStatus: 'pending_update', version: { increment: 1 } } });
        } else if (task.operationType === 'reward.delete' && queue?.lifecycleStatus === 'deleting') {
          await tx.queue.updateMany({ where: { id: queue.id, lifecycleStatus: 'deleting' }, data: { remoteSyncStatus: 'delete_pending', version: { increment: 1 } } });
        } else if (task.operationType === 'reward.set_open' && task.payload?.deleteAfterConfirm === true && queue?.lifecycleStatus === 'deleting') {
          await tx.queue.updateMany({ where: { id: queue.id, lifecycleStatus: 'deleting' }, data: { remoteSyncStatus: 'pending_close', version: { increment: 1 } } });
        }
        return updated;
      });
    },

    async resolveUnknownFinancialOperation(outboxId, actorId) {
      return prisma.$transaction(async (tx) => {
        const task = await tx.outbox.findFirst({
          where: { id: outboxId, operationType: { in: ['redemption.cancel', 'redemption.fulfill'] }, status: 'unknown' },
        });
        if (!task) return { status: 'not_unknown' };
        const redemption = task.redemptionId
          ? await tx.redemption.findUnique({ where: { redemptionId: task.redemptionId } })
          : null;
        if (!redemption) return { status: 'redemption_missing' };
        const updated = await tx.outbox.updateMany({
          where: { id: outboxId, operationType: { in: ['redemption.cancel', 'redemption.fulfill'] }, status: 'unknown' },
          data: { status: 'resolved_manual', leaseToken: null, leaseUntil: null },
        });
        if (!updated.count) return { status: 'not_unknown' };
        await tx.redemption.update({ where: { redemptionId: redemption.redemptionId }, data: { syncStatus: 'operator_resolved' } });
        await tx.auditLog.create({ data: {
          queueId: redemption.queueId,
          redemptionId: redemption.redemptionId,
          event: 'financial.operation_resolved_manually',
          actorId,
          origin: 'panel',
          previousState: 'unknown',
          nextState: 'resolved_manual',
          reason: 'operator_acknowledged_unknown',
          safeDetail: { remoteConfirmed: false, expectedStatus: redemption.expectedStatus },
        } });
        return { status: 'resolved_manual', redemptionId: redemption.redemptionId };
      });
    },

    async recordTerminalRedemption(event) {
      const status = normalizeRedemptionStatus(event.status);
      if (!['FULFILLED', 'CANCELED'].includes(status)) {
        throw repositoryError('INVALID_TERMINAL_REDEMPTION', 'Redemption is not in a terminal state');
      }
      const queue = await prisma.queue.findUnique({ where: { rewardId: event.rewardId } });
      if (!queue || queue.lifecycleStatus === 'deleted') return { status: 'unmanaged_reward' };
      return withQueueTransaction(prisma, queue.id, async (tx) => {
        const existing = await tx.redemption.findUnique({ where: { redemptionId: event.id } });
        if (existing) {
          if (existing.remoteStatus === status) return { status: 'already_recorded', redemptionId: event.id };
          return { status: 'already_recorded', redemptionId: event.id };
        }
        await tx.redemption.create({ data: {
          redemptionId: event.id,
          broadcasterId: event.broadcasterId,
          rewardId: event.rewardId,
          userId: event.userId,
          queueId: queue.id,
          redeemedAt: event.redeemedAt,
          remoteStatus: status,
          syncStatus: 'confirmed',
        } });
        await tx.auditLog.create({ data: {
          queueId: queue.id,
          redemptionId: event.id,
          event: 'redemption.external_terminal_observed',
          origin: 'eventsub',
          previousState: 'UNFULFILLED',
          nextState: status,
          reason: status === 'CANCELED' ? 'external_cancellation' : 'external_fulfillment',
          safeDetail: { remoteStatus: status },
        } });
        return { status: 'terminal_observed', redemptionId: event.id };
      });
    },

    async findEntryByRedemption(redemptionId) {
      return prisma.entry.findUnique({ where: { redemptionId } });
    },

    async recordExternalRedemptionState(event) {
      const status = normalizeRedemptionStatus(event.status);
      if (!['FULFILLED', 'CANCELED'].includes(status)) return { status: 'ignored_nonterminal' };
      let existing = await prisma.redemption.findUnique({ where: { redemptionId: event.id } });
      if (!existing) return this.recordTerminalRedemption(event);
      if (existing.remoteStatus !== 'UNFULFILLED' && existing.remoteStatus !== status) {
        return { status: 'conflict', redemptionId: event.id };
      }
      const updated = await prisma.$transaction(async (tx) => {
        if (existing.queueId) await lockQueue(tx, existing.queueId);
        const current = await tx.redemption.findUnique({ where: { redemptionId: event.id } });
        if (!current) return { status: 'unknown_redemption', redemptionId: event.id };
        if (current.remoteStatus !== 'UNFULFILLED' && current.remoteStatus !== status) {
          return { status: 'conflict', redemptionId: event.id };
        }
        await tx.redemption.update({
          where: { redemptionId: event.id },
          data: { remoteStatus: status, syncStatus: 'confirmed' },
        });
        const task = await tx.outbox.findUnique({ where: { idempotencyKey: `financial:${event.id}` } });
        let outboxStatus = null;
        if (task && ['pending', 'retry', 'processing', 'unknown', 'resolved_manual'].includes(task.status)) {
          const expected = task.operationType === 'redemption.cancel' ? 'CANCELED' : 'FULFILLED';
          outboxStatus = expected === status ? 'confirmed' : 'conflict';
          await tx.outbox.update({ where: { id: task.id }, data: {
            status: outboxStatus,
            lastError: outboxStatus === 'conflict' ? `remote_${status.toLowerCase()}_opposes_${expected.toLowerCase()}` : null,
            leaseUntil: null,
            leaseToken: null,
          } });
        }
        await tx.auditLog.create({ data: {
          queueId: current.queueId,
          redemptionId: event.id,
          event: 'redemption.external_state_observed',
          origin: 'eventsub',
          previousState: current.remoteStatus,
          nextState: status,
          reason: status === 'CANCELED' ? 'external_cancellation' : 'external_fulfillment',
          safeDetail: { outboxStatus },
        } });
        return { status: outboxStatus === 'conflict' ? 'conflict' : 'external_state_recorded', redemptionId: event.id };
      });
      return updated;
    },

    async importRedemption(event) {
      const status = normalizeRedemptionStatus(event.status);
      if (status === 'FULFILLED' || status === 'CANCELED') return this.recordTerminalRedemption(event);
      if (status !== 'UNFULFILLED') return { status: 'unknown_remote_state', redemptionId: event.id };
      const queue = await prisma.queue.findUnique({ where: { rewardId: event.rewardId } });
      if (!queue || queue.lifecycleStatus === 'deleted') return { status: 'unmanaged_reward' };

      try {
        return await withQueueTransaction(prisma, queue.id, async (tx) => {
          const existing = await tx.redemption.findUnique({ where: { redemptionId: event.id } });
          if (existing) return { status: 'already_recorded', redemptionId: event.id };
          const currentQueue = await tx.queue.findUnique({ where: { id: queue.id } });
          let rejectionReason = null;
          if (currentQueue.lifecycleStatus !== 'active' || currentQueue.isArchived) rejectionReason = 'queue_unavailable';
          else if (!currentQueue.isOpen) rejectionReason = 'queue_closed';
          let uid = null;
          if (!rejectionReason) {
            try {
              uid = validateUidInput({ value: event.userInput, mode: currentQueue.uidMode, required: currentQueue.uidMode === 'visible' }).uid;
            } catch {
              rejectionReason = 'invalid_uid';
            }
          }
          if (!rejectionReason) {
            const duplicate = await tx.entry.findFirst({
              where: { queueId: queue.id, twitchUserId: event.userId, status: { in: activeStatuses } },
              select: { id: true },
            });
            if (duplicate) rejectionReason = 'duplicate_active_entry';
          }

          await tx.redemption.create({ data: {
            redemptionId: event.id,
            broadcasterId: event.broadcasterId,
            rewardId: event.rewardId,
            userId: event.userId,
            queueId: queue.id,
            redeemedAt: event.redeemedAt,
            remoteStatus: 'UNFULFILLED',
            syncStatus: rejectionReason ? 'pending' : 'observed',
            rejectionReason,
          } });

          if (rejectionReason) {
            await createCancellationIntent(tx, event.id);
            await tx.auditLog.create({ data: {
              queueId: queue.id,
              redemptionId: event.id,
              event: 'redemption.rejected',
              origin: 'eventsub',
              reason: rejectionReason,
              safeDetail: { cancellationStatus: 'pending' },
            } });
            return { status: 'cancellation_pending', reason: rejectionReason, redemptionId: event.id };
          }

          const tail = await tx.entry.findFirst({
            where: { queueId: queue.id, status: 'waiting', priorityClass: 'standard' },
            orderBy: [{ position: 'desc' }, { createdAt: 'desc' }],
            select: { position: true },
          });
          const position = (tail?.position ?? 0) + 1;
          const entry = await tx.entry.create({ data: {
            queueId: queue.id,
            twitchUserId: event.userId,
            userLogin: event.userLogin.toLowerCase(),
            displayName: event.displayName,
            uid,
            source: 'redemption',
            redemptionId: event.id,
            status: 'waiting',
            priorityClass: 'standard',
            priorityReason: null,
            position,
          } });
          await tx.auditLog.create({ data: {
            queueId: queue.id,
            entryId: entry.id,
            redemptionId: event.id,
            event: 'redemption.imported',
            origin: 'eventsub',
            nextState: 'waiting',
            safeDetail: { position },
          } });
          return { status: 'added', position, entryId: entry.id, redemptionId: event.id };
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) return { status: 'already_recorded', redemptionId: event.id };
        throw error;
      }
    },
  };
}

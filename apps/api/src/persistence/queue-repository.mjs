import { normalizeQueueKeys } from '../domain/queue-keys.mjs';
import { validateUidInput } from '../domain/uid.mjs';

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

async function withQueueTransaction(prisma, queueId, callback) {
  return prisma.$transaction(async (tx) => {
    await lockQueue(tx, queueId);
    return callback(tx);
  });
}

async function renumberWaitingEntries(tx, queueId) {
  const waiting = await tx.entry.findMany({
    where: { queueId, status: 'waiting' },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
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

/** @param {PrismaClientLike} prisma */
export function createQueueRepository(prisma, { clock = () => new Date() } = {}) {
  return {
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

    async addManualEntry({ queueId, twitchUserId, userLogin, displayName, uid }) {
      try {
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
            where: { queueId, status: 'waiting' },
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
              position: (tail?.position ?? 0) + 1,
            },
          });
          return { status: 'created', entry };
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) return { status: 'duplicate_active_entry' };
        throw error;
      }
    },

    async listWaiting(queueId) {
      return prisma.entry.findMany({
        where: { queueId, status: 'waiting' },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
    },

    async moveWaitingEntry({ queueId, entryId, position }) {
      return withQueueTransaction(prisma, queueId, async (tx) => {
        const waiting = await tx.entry.findMany({
          where: { queueId, status: 'waiting' },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true },
        });
        const currentIndex = waiting.findIndex(({ id }) => id === entryId);
        if (currentIndex < 0) throw repositoryError('ENTRY_NOT_WAITING', 'Entry is not waiting in this queue');
        if (!Number.isInteger(position) || position < 1 || position > waiting.length) {
          throw repositoryError('INVALID_QUEUE_POSITION', 'Requested queue position is invalid');
        }
        if (currentIndex + 1 === position) return { status: 'unchanged' };

        const [moved] = waiting.splice(currentIndex, 1);
        waiting.splice(position - 1, 0, moved);
        await Promise.all(waiting.map(({ id }, index) => tx.entry.update({
          where: { id },
          data: { position: index + 1, version: { increment: 1 } },
        })));
        return { status: 'moved', entryId, position };
      });
    },

    async setUidMode({ queueId, uidMode, actorId = null, origin = 'panel' }) {
      if (uidMode !== 'visible' && uidMode !== 'hidden') {
        throw repositoryError('INVALID_UID_MODE', 'UID mode is invalid');
      }
      return withQueueTransaction(prisma, queueId, async (tx) => {
        const queue = await tx.queue.findUnique({ where: { id: queueId } });
        if (!queue) throw repositoryError('QUEUE_NOT_FOUND', 'Queue was not found');
        const updatedQueue = await tx.queue.update({
          where: { id: queueId },
          data: { uidMode, version: { increment: 1 } },
        });
        if (uidMode === 'hidden') {
          await tx.entry.updateMany({
            where: { queueId, uid: { not: null } },
            data: { uid: null, version: { increment: 1 } },
          });
          await tx.outbox.updateMany({
            where: {
              operationType: 'chat.call',
              status: { in: ['pending', 'retry', 'processing'] },
              entry: { is: { queueId } },
            },
            data: { status: 'cancelled', payload: {} },
          });
        }
        await tx.auditLog.create({
          data: {
            queueId,
            event: 'queue.uid_mode_changed',
            actorId,
            origin,
            safeDetail: { previousMode: queue.uidMode, nextMode: uidMode },
          },
        });
        return updatedQueue;
      });
    },

    async applyEntryTransition({ input, decideTransition }) {
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
        return { ...updated, financialDecision: decision.financialDecision, policySnapshot: decision.policySnapshot };
      });
    },
  };
}

import { normalizeOverlayWidgetStyle, validateOverlayWidgetConfiguration } from '../domain/overlay-widget-policy.mjs';

/** @typedef {Record<string, any>} PrismaClientLike */

function repositoryError(code, message) {
  return Object.assign(new Error(message), { code });
}

const editableFields = new Set(['sourceType', 'queueId', 'fixedText', 'fallbackText', 'style']);

function assertExpectedVersion(expectedVersion) {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw repositoryError('INVALID_OVERLAY_WIDGET_VERSION', 'Overlay widget version is invalid');
  }
}

async function updateVersioned(prisma, { id, expectedVersion, data }) {
  assertExpectedVersion(expectedVersion);
  const result = await prisma.overlayWidget.updateMany({
    where: { id, version: expectedVersion, deletedAt: null },
    data: { ...data, version: { increment: 1 } },
  });
  if (result.count !== 1) {
    throw repositoryError('OVERLAY_WIDGET_VERSION_CONFLICT', 'Overlay widget changed or is no longer active');
  }
  return prisma.overlayWidget.findUnique({ where: { id } });
}

/** @param {PrismaClientLike} prisma */
export function createOverlayWidgetRepository(prisma, { clock = () => new Date() } = {}) {
  return {
    async list() {
      return prisma.overlayWidget.findMany({
        where: { deletedAt: null },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      });
    },

    async create({ sourceType, queueId = null, fixedText = null, fallbackText = '', style = {}, capabilityHash = null }) {
      const normalizedStyle = normalizeOverlayWidgetStyle(style);
      validateOverlayWidgetConfiguration({ sourceType, queueId, fixedText, fallbackText, style: normalizedStyle });
      const data = { sourceType, fixedText, fallbackText, style: normalizedStyle, capabilityHash };
      if (queueId) data.queue = { connect: { id: queueId } };
      return prisma.overlayWidget.create({
        data,
      });
    },

    async update({ id, expectedVersion, changes }) {
      if (!changes || typeof changes !== 'object' || Array.isArray(changes)
          || Object.keys(changes).length === 0
          || Object.keys(changes).some((key) => !editableFields.has(key))) {
        throw repositoryError('INVALID_OVERLAY_WIDGET_UPDATE', 'Overlay widget update is invalid');
      }
      const current = await prisma.overlayWidget.findUnique({ where: { id } });
      if (!current || current.deletedAt || current.version !== expectedVersion) {
        throw repositoryError('OVERLAY_WIDGET_VERSION_CONFLICT', 'Overlay widget changed or is no longer active');
      }
      const normalizedChanges = { ...changes };
      if (Object.hasOwn(changes, 'style')) normalizedChanges.style = normalizeOverlayWidgetStyle({ ...current.style, ...changes.style });
      validateOverlayWidgetConfiguration({
        sourceType: Object.hasOwn(changes, 'sourceType') ? changes.sourceType : current.sourceType,
        queueId: Object.hasOwn(changes, 'queueId') ? changes.queueId : current.queueId,
        fixedText: Object.hasOwn(changes, 'fixedText') ? changes.fixedText : current.fixedText,
        fallbackText: Object.hasOwn(changes, 'fallbackText') ? changes.fallbackText : current.fallbackText,
        style: normalizedChanges.style ?? current.style,
      });
      return updateVersioned(prisma, { id, expectedVersion, data: normalizedChanges });
    },

    async rotateCapability({ id, expectedVersion, capabilityHash }) {
      if (typeof capabilityHash !== 'string' || capabilityHash.length < 16) {
        throw repositoryError('INVALID_OVERLAY_CAPABILITY_HASH', 'Overlay capability hash is invalid');
      }
      return updateVersioned(prisma, {
        id,
        expectedVersion,
        data: { capabilityHash, revokedAt: null, capabilityVersion: { increment: 1 } },
      });
    },

    async revokeCapability({ id, expectedVersion }) {
      return updateVersioned(prisma, {
        id,
        expectedVersion,
        data: { capabilityHash: null, revokedAt: clock() },
      });
    },

    async delete({ id, expectedVersion }) {
      return updateVersioned(prisma, {
        id,
        expectedVersion,
        data: { capabilityHash: null, revokedAt: clock(), deletedAt: clock() },
      });
    },

    async findActiveByCapabilityHash(capabilityHash) {
      return prisma.overlayWidget.findFirst({
        where: { capabilityHash, revokedAt: null, deletedAt: null },
      });
    },

    async projectWithActiveCapability(capabilityHash, project) {
      return prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw`
          SELECT id FROM overlay_widgets
          WHERE capability_hash = ${capabilityHash} AND revoked_at IS NULL AND deleted_at IS NULL
          FOR SHARE
        `;
        if (!locked.length) return null;
        const widget = await tx.overlayWidget.findUnique({ where: { id: locked[0].id } });
        if (!widget || widget.revokedAt || widget.deletedAt) return null;
        return project(widget, tx);
      });
    },

    async getById(id) {
      return prisma.overlayWidget.findUnique({ where: { id } });
    },
  };
}

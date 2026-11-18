// OPS-31 P5 (FT-74, AC 10): the own refund list, ONE per channel (design D-31-7). It stores only the numeric Twitch user id and
// an optional label; the id never leaves this module toward the panel, logs or audit (audit carries counts only). The 500
// person limit is a configuration constant; two connections adding the 501st are serialized by a dedicated advisory lock, so
// exactly 500 rows can exist and the loser gets a stable code.
export const REFUND_LIST_MAX = 500;
export const REFUND_LIST_LABEL_MAX = 40;
/** Advisory lock class of the refund list (two-integer form; the account lock uses class 1868787013). */
const REFUND_LIST_LOCK_CLASS = 1868787031;
const TWITCH_ID_PATTERN = /^[0-9]{1,20}$/;

function storeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function cleanLabel(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw storeError('REFUND_LIST_INVALID', 'The label is invalid');
  const label = value.trim();
  if (!label) return null;
  if ([...label].length > REFUND_LIST_LABEL_MAX || [...label].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  })) throw storeError('REFUND_LIST_INVALID', 'The label is invalid');
  return label;
}

const view = (row) => ({ id: row.id, label: row.label ?? null, createdAt: row.createdAt });

/** @param {{prisma: any, transact: (callback: (tx: any) => Promise<any>) => Promise<any>}} deps */
export function createRefundListStore({ prisma, transact }) {
  const lock = (tx) => tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(${REFUND_LIST_LOCK_CLASS}::int, 1::int)) AS refund_list_lock`;
  const audit = (tx, event, actorId, count) => tx.auditLog.create({ data: { event, actorId, origin: 'panel', safeDetail: { count } } });
  return {
    /** The list for the authenticated panel: internal id, label and date; never the Twitch user id. */
    async listRefundList() {
      const rows = await prisma.refundListMember.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
      return { items: rows.map(view), count: rows.length, max: REFUND_LIST_MAX };
    },

    /** @returns {Promise<{member: {id:string,label:string|null,createdAt:Date}, count:number}>} */
    async addRefundListMember({ twitchUserId, label, actorId = null }) {
      if (typeof twitchUserId !== 'string' || !TWITCH_ID_PATTERN.test(twitchUserId)) throw storeError('REFUND_LIST_INVALID', 'The Twitch user id is invalid');
      const cleaned = cleanLabel(label);
      return transact(async (tx) => {
        await lock(tx);
        if (await tx.refundListMember.findUnique({ where: { twitchUserId }, select: { id: true } })) throw storeError('REFUND_LIST_DUPLICATE', 'The person is already on the list');
        const before = await tx.refundListMember.count();
        if (before >= REFUND_LIST_MAX) throw storeError('REFUND_LIST_FULL', 'The list is full');
        const row = await tx.refundListMember.create({ data: { twitchUserId, label: cleaned, createdBy: actorId } });
        await audit(tx, 'refund_list.member_added', actorId, before + 1);
        return { member: view(row), count: before + 1 };
      });
    },

    /** @returns {Promise<{count:number}>} */
    async removeRefundListMember({ id, actorId = null }) {
      return transact(async (tx) => {
        await lock(tx);
        const removed = await tx.refundListMember.deleteMany({ where: { id } });
        if (removed.count === 0) throw storeError('REFUND_LIST_MEMBER_NOT_FOUND', 'The person is not on the list');
        const count = await tx.refundListMember.count();
        await audit(tx, 'refund_list.member_removed', actorId, count);
        return { count };
      });
    },

    /** Idempotent: clearing an empty list removes nothing and still answers. @returns {Promise<{removed:number}>} */
    async clearRefundList({ actorId = null } = {}) {
      return transact(async (tx) => {
        await lock(tx);
        const removed = await tx.refundListMember.deleteMany({});
        if (removed.count > 0) await audit(tx, 'refund_list.cleared', actorId, removed.count);
        return { removed: removed.count };
      });
    },
  };
}

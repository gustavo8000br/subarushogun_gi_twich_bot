// OPS-31 P2 (AC 1-5, design 7): pure composition of the queue chat notices. Rendered at send time in the product locale
// from the `chat` catalog; the text never reaches a log. A message never exceeds 500 characters and is never cut blindly.
import { translateCatalog, translatePluralCatalog } from '../../../shared/browser/translate-catalog.mjs';

export const CHAT_NOTICE_MAX_LENGTH = 500;

/** Switch column of each notice kind (five switches, UX 7.2) and the delivery priority (design 7.1). */
export const CHAT_NOTICE_KINDS = Object.freeze({
  joined: { key: 'chat.notice.joined', switch: 'noticeJoined', priority: 1, placeholders: ['user', 'queue', 'position'] },
  joined_many: { key: 'chat.notice.joined_many', switch: 'noticeJoined', priority: 1, placeholders: ['count', 'queue'] },
  refused_queue_closed: { key: 'chat.notice.refused.queue_closed', switch: 'noticeJoined', priority: 1, placeholders: ['user', 'queue'] },
  refused_duplicate_entry: { key: 'chat.notice.refused.duplicate_entry', switch: 'noticeJoined', priority: 1, placeholders: ['user', 'queue'] },
  refused_unavailable: { key: 'chat.notice.refused.unavailable', switch: 'noticeJoined', priority: 1, placeholders: ['user', 'queue'] },
  refused_invalid_uid: { key: 'chat.notice.refused.invalid_uid', switch: 'noticeJoined', priority: 1, placeholders: ['user', 'queue'] },
  service_ended: { key: 'chat.notice.service_ended', switch: 'noticeService', priority: 1, placeholders: ['user', 'queue'] },
  queue_closed: { key: 'chat.notice.queue_closed', switch: 'noticeState', priority: 2, placeholders: ['queue'] },
  queue_reopened: { key: 'chat.notice.queue_reopened', switch: 'noticeState', priority: 2, placeholders: ['queue'] },
  cleared: { key: 'chat.notice.cleared', switch: 'noticeState', priority: 2, placeholders: ['queue', 'count'], plural: true },
});

/** The refusal reasons of the redemption import mapped to the (at most four) refusal texts. */
export const REFUSAL_NOTICE_KIND_BY_REASON = Object.freeze({
  queue_closed: 'refused_queue_closed',
  duplicate_active_entry: 'refused_duplicate_entry',
  queue_unavailable: 'refused_unavailable',
  queue_mode_transition: 'refused_unavailable',
  channel_points_disabled: 'refused_unavailable',
  invalid_uid: 'refused_invalid_uid',
});

export const CHAT_NOTICE_PLACEHOLDERS = Object.freeze(Object.fromEntries(
  Object.values(CHAT_NOTICE_KINDS).map((kind) => [kind.key, kind.placeholders]),
));

/** @param {string} kind */
export function isChatNoticeKind(kind) { return Object.hasOwn(CHAT_NOTICE_KINDS, kind); }

function clean(value, limit) {
  const text = Array.from(String(value ?? ''), (char) => (char.charCodeAt(0) < 32 ? ' ' : char)).join('').trim();
  const characters = Array.from(text);
  return characters.length > limit ? `${characters.slice(0, limit - 1).join('')}…` : text;
}

/**
 * @param {{kind: string, locale: string, catalogs: Record<string, Record<string, string>>, params: {user?: string, queue: string, position?: number, count?: number}}} input
 * @returns {string|null} null when the kind is unknown or the text cannot fit in 500 characters
 */
export function composeChatNotice({ kind, locale, catalogs, params }) {
  const definition = CHAT_NOTICE_KINDS[kind];
  if (!definition) return null;
  // A long queue title or name is shortened (with an ellipsis) before interpolation, never the finished sentence.
  for (const limit of [60, 20]) {
    const values = {};
    for (const name of definition.placeholders) {
      if (name === 'user') values.user = clean(params.user, 40);
      else if (name === 'queue') values.queue = clean(params.queue, limit);
      else if (name === 'position' || name === 'count') values[name] = Number.isFinite(params[name]) ? params[name] : 0;
    }
    const options = { values, placeholders: CHAT_NOTICE_PLACEHOLDERS };
    const text = definition.plural
      ? translatePluralCatalog(catalogs, locale, definition.key, Number(values.count), { values: { queue: values.queue }, placeholders: CHAT_NOTICE_PLACEHOLDERS })
      : translateCatalog(catalogs, locale, definition.key, options);
    if (Array.from(text).length <= CHAT_NOTICE_MAX_LENGTH) return text;
  }
  return null;
}

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
  // OPS-31 P3 (AC 6, 7): the service group also tells about an absence, a skip and a restore; the reorder has its own switch.
  no_show: { key: 'chat.notice.no_show', switch: 'noticeService', priority: 1, placeholders: ['user', 'queue'] },
  skipped: { key: 'chat.notice.skipped', switch: 'noticeService', priority: 1, placeholders: ['user', 'queue', 'position'] },
  restored: { key: 'chat.notice.restored', switch: 'noticeService', priority: 1, placeholders: ['user', 'queue', 'position'] },
  reordered: { key: 'chat.notice.reordered', switch: 'noticeReordered', priority: 2, placeholders: ['queue'], names: true },
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

/** Text of the reorder notice that lists the people who moved (its names end with the `chat.queue.more` suffix). */
export const CHAT_NOTICE_LIST_KEYS = Object.freeze({ reordered: 'chat.notice.reordered_list' });
/** Most names a reorder notice lists before "and N more" (the 500-character check can lower it further). */
export const CHAT_NOTICE_MAX_LISTED_NAMES = 5;
const MORE_SUFFIX_KEY = 'chat.queue.more';

export const CHAT_NOTICE_PLACEHOLDERS = Object.freeze({
  ...Object.fromEntries(Object.values(CHAT_NOTICE_KINDS).map((kind) => [kind.key, kind.placeholders])),
  'chat.notice.reordered_list': ['queue', 'names'],
  [MORE_SUFFIX_KEY]: ['count'],
});

/** @param {string} kind */
export function isChatNoticeKind(kind) { return Object.hasOwn(CHAT_NOTICE_KINDS, kind); }

function clean(value, limit) {
  const text = Array.from(String(value ?? ''), (char) => (char.charCodeAt(0) < 32 ? ' ' : char)).join('').trim();
  const characters = Array.from(text);
  return characters.length > limit ? `${characters.slice(0, limit - 1).join('')}…` : text;
}

/** "@a, @b and 3 more": names are listed whole, never cut; the remainder becomes the `chat.queue.more` suffix. */
function composeNameList({ names, shown, locale, catalogs }) {
  const listed = names.slice(0, shown).map((name) => `@${clean(name, 40)}`).join(', ');
  const rest = names.length - shown;
  if (rest <= 0) return listed;
  return `${listed}${translatePluralCatalog(catalogs, locale, MORE_SUFFIX_KEY, rest, { values: {}, placeholders: CHAT_NOTICE_PLACEHOLDERS })}`;
}

/**
 * @param {{kind: string, locale: string, catalogs: Record<string, Record<string, string>>, params: {user?: string, queue: string, position?: number, count?: number, names?: string[]}}} input
 * @returns {string|null} null when the kind is unknown or the text cannot fit in 500 characters
 */
export function composeChatNotice({ kind, locale, catalogs, params }) {
  const definition = CHAT_NOTICE_KINDS[kind];
  if (!definition) return null;
  if (definition.names) return composeReorderedNotice({ definition, locale, catalogs, params });
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

function composeReorderedNotice({ definition, locale, catalogs, params }) {
  const names = (Array.isArray(params.names) ? params.names : []).filter((name) => typeof name === 'string' && name.trim());
  for (const limit of [60, 20]) {
    const queue = clean(params.queue, limit);
    // Longest list first; the first form that fits in 500 characters wins. Without names the plain text is used.
    for (let shown = Math.min(names.length, CHAT_NOTICE_MAX_LISTED_NAMES); shown >= 1; shown -= 1) {
      const text = translateCatalog(catalogs, locale, CHAT_NOTICE_LIST_KEYS.reordered, {
        values: { queue, names: composeNameList({ names, shown, locale, catalogs }) }, placeholders: CHAT_NOTICE_PLACEHOLDERS,
      });
      if (Array.from(text).length <= CHAT_NOTICE_MAX_LENGTH) return text;
    }
    const plain = translateCatalog(catalogs, locale, definition.key, { values: { queue }, placeholders: CHAT_NOTICE_PLACEHOLDERS });
    if (Array.from(plain).length <= CHAT_NOTICE_MAX_LENGTH) return plain;
  }
  return null;
}

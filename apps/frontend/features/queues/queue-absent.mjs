// OPS-31 K72-01b: pure helpers of the "Absent" group in the live list (read side). Kept apart from the component for testing.

/** Error keys that make a restore row show a note instead of the button (the refusal is certain: do not repeat it). */
export const ABSENT_RESTORE_REFUSAL_KEYS = Object.freeze(['panel.error.entry_restore_intent_recorded', 'panel.error.entry_restore_other_active']);

const ABSENT_LIST_LIMIT = 20;

/**
 * Validates the additive operator field `absent: {total, entries}` of one queue. A missing or invalid field means the count is
 * unknown (the group is not rendered), never "nobody is absent".
 * @param {{absent?: unknown}|null|undefined} queue
 * @returns {{total:number, entries:Array<{id:string,userLogin?:string,displayName?:string,version:number,finishedAt?:string|null}>}|null}
 */
export function readAbsentGroup(queue) {
  const absent = /** @type {any} */ (queue?.absent);
  if (!absent || typeof absent !== 'object' || Array.isArray(absent)) return null;
  const { total, entries } = absent;
  if (!Number.isSafeInteger(total) || total < 0 || !Array.isArray(entries)
    || entries.length > ABSENT_LIST_LIMIT || entries.length > total) return null;
  const valid = entries.every((item) => item && typeof item.id === 'string' && item.id
    && Number.isSafeInteger(item.version) && item.version >= 1
    && ((typeof item.displayName === 'string' && item.displayName) || (typeof item.userLogin === 'string' && item.userLogin)));
  return valid ? { total, entries } : null;
}

/** Plural form of the screen-reader counter: native ECMA-402 rules, 0 as "other" (same mechanism as `panel.operation.attempts`). */
export function absentCountKey(count, locale) {
  let category = 'other';
  try { if (count !== 0) category = new Intl.PluralRules(locale).select(count); } catch { category = 'other'; }
  return `panel.queue.absent.count.${category}`;
}

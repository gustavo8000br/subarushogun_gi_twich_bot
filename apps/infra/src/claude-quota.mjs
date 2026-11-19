// Pure logic for the Claude Code quota automation. No I/O: clock and paths are injected by the CLI
// (apps/infra/scripts/claude-quota.mjs). See docs/process/claude-quota-automation.md.

/** @typedef {{ used_percentage: number|string|null, resets_at?: number|null }} QuotaWindow */
/** @typedef {{ five_hour?: QuotaWindow|null, seven_day?: QuotaWindow|null }} RateLimits */
/** @typedef {{ updated_at: string, rate_limits: RateLimits, model: string|null }} QuotaRecord */
/**
 * @typedef {object} ParsedInput
 * @property {boolean} hasRateLimits true when at least one window carries a usable percentage
 * @property {RateLimits|null} rateLimits the raw rate_limits object (kept as delivered)
 * @property {string|null} model
 */

export const STATES = Object.freeze({ OK: 'OK', HOLD: 'HOLD', LIMIT: 'LIMIT', STALE: 'STALE', MISSING: 'MISSING' });
export const EXIT_CODES = Object.freeze({ OK: 0, HOLD: 10, LIMIT: 20, STALE: 30, MISSING: 31 });
export const DEFAULT_LIMIT = 80;
export const DEFAULT_HOLD = 70;
export const DEFAULT_MAX_AGE_MIN = 30;

/**
 * Converts a percentage (number or numeric string) to a finite number, or null.
 * @param {unknown} value
 * @returns {number|null}
 */
export function toPercent(value) {
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** @param {unknown} value */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads the statusLine JSON delivered by Claude Code (string or object). Never throws.
 * @param {unknown} json
 * @returns {ParsedInput}
 */
export function parseStatuslineInput(json) {
  let data = json;
  if (typeof json === 'string') {
    try {
      data = JSON.parse(json);
    } catch {
      data = null;
    }
  }
  if (!isObject(data)) return { hasRateLimits: false, rateLimits: null, model: null };
  const model = isObject(data.model) ? (data.model.display_name ?? data.model.id ?? null) : null;
  const rateLimits = isObject(data.rate_limits) ? /** @type {RateLimits} */ (data.rate_limits) : null;
  const usable = (window) => isObject(window) && toPercent(window.used_percentage) !== null;
  const hasRateLimits = rateLimits !== null && (usable(rateLimits.five_hour) || usable(rateLimits.seven_day));
  return { hasRateLimits, rateLimits, model: typeof model === 'string' && model !== '' ? model : null };
}

/**
 * Builds the file record ({updated_at, rate_limits, model}); null when there is nothing to record,
 * so callers never overwrite a good file with an empty one.
 * @param {ParsedInput|unknown} input raw JSON/object or an already parsed input
 * @param {string} nowIso
 * @returns {QuotaRecord|null}
 */
export function buildQuotaRecord(input, nowIso) {
  const parsed = input && typeof input === 'object' && 'hasRateLimits' in input ? input : parseStatuslineInput(input);
  if (!parsed.hasRateLimits || parsed.rateLimits === null) return null;
  return { updated_at: nowIso, rate_limits: parsed.rateLimits, model: parsed.model };
}

/**
 * Normalized windows of a record. An absent/null five_hour window is a window that has not started: 0%.
 * @param {QuotaRecord|null|undefined} record
 */
export function readWindows(record) {
  const limits = record && isObject(record.rate_limits) ? record.rate_limits : {};
  const five = isObject(limits.five_hour) ? limits.five_hour : null;
  const week = isObject(limits.seven_day) ? limits.seven_day : null;
  return {
    five: toPercent(five?.used_percentage) ?? 0,
    week: toPercent(week?.used_percentage),
    fiveResetsAt: toPercent(five?.resets_at),
    weekResetsAt: toPercent(week?.resets_at),
  };
}

/**
 * @param {QuotaRecord|null|undefined} record
 * @param {{ now: Date|number|string, limit?: number, hold?: number, maxAgeMin?: number }} options
 * @returns {{ state: string, five: number|null, week: number|null, fiveResetsAt: number|null,
 *   weekResetsAt: number|null, ageMin: number|null, reason: string|null }}
 */
export function classify(record, { now, limit = DEFAULT_LIMIT, hold = DEFAULT_HOLD, maxAgeMin = DEFAULT_MAX_AGE_MIN }) {
  const empty = { five: null, week: null, fiveResetsAt: null, weekResetsAt: null, ageMin: null };
  const hasWindow = record && isObject(record.rate_limits) && (isObject(record.rate_limits.five_hour) || isObject(record.rate_limits.seven_day));
  const updated = record ? Date.parse(record.updated_at) : Number.NaN;
  if (!hasWindow || Number.isNaN(updated)) {
    return { state: STATES.MISSING, ...empty, reason: 'no readable quota record' };
  }
  const windows = readWindows(record);
  const ageMin = Math.max(0, (new Date(now).getTime() - updated) / 60000);
  const base = { ...windows, ageMin };
  if (ageMin > maxAgeMin) {
    return { state: STATES.STALE, ...base, reason: `record is ${Math.floor(ageMin)} min old (max ${maxAgeMin})` };
  }
  if (windows.five >= limit) return { state: STATES.LIMIT, ...base, reason: `5h window at ${windows.five}% (limit ${limit}%)` };
  if (windows.week !== null && windows.week >= limit) {
    return { state: STATES.LIMIT, ...base, reason: `weekly window at ${windows.week}% (limit ${limit}%)` };
  }
  if (windows.five >= hold) return { state: STATES.HOLD, ...base, reason: `5h window at ${windows.five}% (hold ${hold}%)` };
  return { state: STATES.OK, ...base, reason: null };
}

/**
 * Status bar line: `model | 5h: X% | sem: Y%`. Missing five_hour prints 0%; missing week prints ?.
 * @param {{ model?: string|null, five?: number|null, week?: number|null }} values
 */
export function formatStatusLine({ model, five, week }) {
  const pct = (value, fallback) => (value === null || value === undefined ? fallback : `${Math.round(value)}%`);
  return `${model || 'claude'} | 5h: ${pct(five, '0%')} | sem: ${pct(week, '?')}`;
}

/**
 * Epoch seconds to local `YYYY-MM-DD HH:MM` (timezone injected through `date` getters of the host).
 * @param {number|null} epochSeconds
 */
export function formatLocalTime(epochSeconds) {
  if (epochSeconds === null || epochSeconds === undefined) return 'n/a';
  const d = new Date(epochSeconds * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Registers the statusLine command in a settings object without mutating it. Idempotent; a different
 * existing statusLine is kept (with a warning) unless `force`.
 * @param {Record<string, unknown>} settings
 * @param {string} command
 * @param {{ force?: boolean }} [options]
 * @returns {{ settings: Record<string, unknown>, changed: boolean, warning: string|null }}
 */
export function mergeStatusLine(settings, command, { force = false } = {}) {
  const current = isObject(settings) ? settings : {};
  const wanted = { type: 'command', command };
  const existing = current.statusLine;
  if (isObject(existing) && existing.type === 'command' && existing.command === command) {
    return { settings: { ...current }, changed: false, warning: null };
  }
  if (existing !== undefined && existing !== null && !force) {
    return {
      settings: { ...current },
      changed: false,
      warning: 'a different statusLine is already configured; it was kept (use --force to replace it)',
    };
  }
  const warning = existing === undefined || existing === null ? null : 'the previous statusLine was replaced (--force)';
  return { settings: { ...current, statusLine: wanted }, changed: true, warning };
}

// Pure logic for the research index (docs/research-index.md and its pt-BR copy).
// No I/O and no system clock: callers inject "today". All dates are UTC calendar dates.
// Specification: docs/process/research-learning-flow.md (sections 6, 10 and 11).

export const COLUMN_COUNT = 14;
export const WAIVER_CAP_DAYS = 30;
export const VOLATILE_MAX_DAYS = 42;
export const DEFAULT_SOON_DAYS = 14;

export const STATUS_ORDER = ['FORMAT-ERROR', 'WAIVER-EXPIRED', 'OVERDUE', 'WAIVED', 'DUE-SOON', 'OK', 'RETIRED'];

/** @typedef {'en' | 'pt-BR'} IndexLanguage */
/** @typedef {{ code: string, message: string }} RowError */

/** Tokens each language accepts (the CLI normalizes verdicts, but a file only uses its own tokens). */
export const LANGUAGES = {
  en: {
    header: 'verified on',
    verdicts: { SUFFICIENT: 'SUFFICIENT', 'REFRESH IF': 'REFRESH_IF', GAP: 'GAP' },
    confidence: ['High', 'Medium', 'Low'],
    waiverNone: 'none',
    waiverUntil: 'until',
    defaultReason: 'default 3 months',
  },
  'pt-BR': {
    header: 'verificado em',
    verdicts: { SUFICIENTE: 'SUFFICIENT', 'REVISAR SE': 'REFRESH_IF', LACUNA: 'GAP' },
    confidence: ['Alta', 'Média', 'Baixa'],
    waiverNone: 'nenhuma',
    waiverUntil: 'até',
    defaultReason: 'padrão 3 meses',
  },
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/**
 * Returns the UTC day number of an ISO date, or null when it is not a real calendar date.
 * @param {string} iso
 * @returns {number | null}
 */
export function isoToDays(iso) {
  const match = ISO_DATE.exec(String(iso));
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, day);
  const date = new Date(ms);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return ms / DAY_MS;
}

/** @param {number} days @returns {string} */
export function daysToIso(days) {
  return new Date(days * DAY_MS).toISOString().slice(0, 10);
}

/** @param {string} iso @param {number} n @returns {string} */
export function addDays(iso, n) {
  const days = isoToDays(iso);
  if (days === null) throw new RangeError(`Invalid ISO date: ${iso}`);
  return daysToIso(days + n);
}

/**
 * Adds calendar months and clamps the day to the end of the target month
 * (2026-11-30 + 3 months = 2027-02-28).
 * @param {string} iso
 * @param {number} n
 * @returns {string}
 */
export function addCalendarMonths(iso, n) {
  if (isoToDays(iso) === null) throw new RangeError(`Invalid ISO date: ${iso}`);
  const [year, month, day] = iso.split('-').map(Number);
  const index = year * 12 + (month - 1) + n;
  const targetYear = Math.floor(index / 12);
  const targetMonth = index % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return daysToIso(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)) / DAY_MS);
}

/**
 * Normalizes a verdict token of either language to SUFFICIENT | REFRESH_IF | GAP (null when unknown).
 * @param {string} token
 * @returns {'SUFFICIENT' | 'REFRESH_IF' | 'GAP' | null}
 */
export function normalizeVerdict(token) {
  const key = String(token).replaceAll('*', '').trim().toUpperCase().replace(/\s+/g, ' ');
  for (const language of Object.values(LANGUAGES)) {
    if (Object.hasOwn(language.verdicts, key)) return /** @type {any} */ (language.verdicts[key]);
  }
  return null;
}

/** @param {string} line */
function splitCells(line) {
  let body = line.trim();
  if (body.startsWith('|')) body = body.slice(1);
  if (body.endsWith('|')) body = body.slice(0, -1);
  return body.split('|').map((cell) => cell.trim());
}

/**
 * Parses a waiver cell against the language tokens.
 * @param {string} cell
 * @param {IndexLanguage} language
 * @returns {{ kind: 'none' } | { kind: 'until', until: string, reason: string } | { kind: 'invalid', other: boolean }}
 */
export function parseWaiver(cell, language) {
  const own = LANGUAGES[language];
  const other = LANGUAGES[language === 'en' ? 'pt-BR' : 'en'];
  const text = cell.trim();
  const lower = text.toLowerCase();
  if (lower === own.waiverNone) return { kind: 'none' };
  const match = /^(\S+)\s+(\d{4}-\d{2}-\d{2})\s*:\s*(.*)$/u.exec(text);
  if (match && match[1].toLowerCase() === own.waiverUntil) {
    return { kind: 'until', until: match[2], reason: match[3].trim() };
  }
  const isOther = lower === other.waiverNone || (match !== null && match[1].toLowerCase() === other.waiverUntil);
  return { kind: 'invalid', other: isOther };
}

/**
 * Parses the first table whose header has "Verified on" or "Verificado em".
 * The language comes from that header. Rows carry format errors instead of throwing.
 * @param {string} markdown
 * @param {{ language?: IndexLanguage }} [options]
 */
export function parseResearchIndex(markdown, options = {}) {
  const lines = markdown.split(/\r?\n/);
  const errors = [];
  let headerIndex = -1;
  let language = /** @type {IndexLanguage | null} */ (null);
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].trimStart().startsWith('|')) continue;
    const lower = lines[i].toLowerCase();
    if (lower.includes(LANGUAGES.en.header)) language = 'en';
    else if (lower.includes(LANGUAGES['pt-BR'].header)) language = 'pt-BR';
    if (language) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex < 0 || !language) {
    return { language: null, header: [], rows: [], errors: [{ line: 0, message: 'No index table with a "Verified on" or "Verificado em" header was found.' }] };
  }
  if (options.language && options.language !== language) {
    errors.push({ line: headerIndex + 1, message: `Expected a ${options.language} index but the header is ${language}.` });
  }
  const header = splitCells(lines[headerIndex]);
  if (header.length !== COLUMN_COUNT) {
    errors.push({ line: headerIndex + 1, message: `Header has ${header.length} columns, expected ${COLUMN_COUNT}.` });
  }
  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw.trimStart().startsWith('|')) break;
    const cells = splitCells(raw);
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    rows.push(parseRow(cells, i + 1, language));
  }
  return { language, header, rows, errors };
}

/**
 * @param {string[]} cells
 * @param {number} line
 * @param {IndexLanguage} language
 */
function parseRow(cells, line, language) {
  const spec = LANGUAGES[language];
  /** @type {RowError[]} */
  const errors = [];
  const fail = (code, message) => errors.push({ code, message });
  const [n, topic, verdictRaw, verifiedOn, reviewAfter, termClass, reason, triggers, confidence, note, author, evidence, answers, waiverRaw] =
    cells.map((cell) => cell ?? '');
  const row = {
    line, cells, n: Number(n), topic, verdictRaw, verdict: /** @type {string | null} */ (null), verifiedOn, reviewAfter,
    class: termClass, reason, triggers, confidence, note, author, evidence, answers, waiverRaw,
    retired: /^RETIRED\b/.test(triggers), waiver: /** @type {ReturnType<typeof parseWaiver> | null} */ (null), errors,
  };
  if (cells.length !== COLUMN_COUNT) {
    fail('CELL_COUNT', `Row has ${cells.length} cells, expected ${COLUMN_COUNT}.`);
    return row;
  }
  if (!/^\d+$/.test(n)) fail('N', `"#" must be an integer, got "${n}".`);
  if (!topic) fail('TOPIC', 'Topic is empty.');
  const verdictToken = verdictRaw.replaceAll('*', '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (Object.hasOwn(spec.verdicts, verdictToken)) row.verdict = spec.verdicts[verdictToken];
  else fail('VERDICT', `Verdict "${verdictRaw}" is not a ${language} token${normalizeVerdict(verdictRaw) ? ' (token of the other language)' : ''}.`);
  const verifiedDays = verifiedOn === 'unknown' ? null : isoToDays(verifiedOn);
  if (verifiedOn !== 'unknown' && verifiedDays === null) fail('VERIFIED_ON', `Verified on "${verifiedOn}" is not YYYY-MM-DD or "unknown".`);
  const reviewDays = isoToDays(reviewAfter);
  if (reviewDays === null) fail('REVIEW_AFTER', `Review after "${reviewAfter}" is not a valid YYYY-MM-DD date.`);
  if (verifiedDays !== null && reviewDays !== null && reviewDays <= verifiedDays) {
    fail('DATE_ORDER', 'Review after must be later than Verified on.');
  }
  if (termClass !== 'STD' && termClass !== 'VOL') fail('CLASS', `Term class "${termClass}" must be STD or VOL.`);
  if (!reason) fail('REASON', 'Term reason is empty.');
  if (!triggers) fail('TRIGGERS', 'Triggers is empty.');
  if (!spec.confidence.includes(confidence)) fail('CONFIDENCE', `Confidence "${confidence}" is not one of ${spec.confidence.join('/')}.`);
  if (!note) fail('NOTE', 'Note is empty.');
  if (!author) fail('AUTHOR', 'Author is empty.');
  const waiver = parseWaiver(waiverRaw, language);
  row.waiver = waiver;
  if (waiver.kind === 'invalid') {
    fail('WAIVER', `Waiver "${waiverRaw}" is malformed${waiver.other ? ' (token of the other language)' : ''}.`);
  } else if (waiver.kind === 'until') {
    const untilDays = isoToDays(waiver.until);
    if (untilDays === null) fail('WAIVER', `Waiver date "${waiver.until}" is not a valid date.`);
    else if (!waiver.reason) fail('WAIVER', 'Waiver has no reason.');
    else if (reviewDays !== null && untilDays > reviewDays + WAIVER_CAP_DAYS) {
      fail('WAIVER_CAP', `Waiver ends ${waiver.until}, more than ${WAIVER_CAP_DAYS} days after Review after.`);
    }
  }
  return row;
}

/**
 * Classifies one parsed row against an injected date.
 * @param {ReturnType<typeof parseRow>} row
 * @param {string} today YYYY-MM-DD (UTC)
 * @param {number} [soonDays]
 * @returns {{ status: string, daysOverdue: number, waiverUntil: string | null }}
 */
export function classifyRow(row, today, soonDays = DEFAULT_SOON_DAYS) {
  const todayDays = isoToDays(today);
  if (todayDays === null) throw new RangeError(`Invalid today: ${today}`);
  const waiverUntil = row.waiver?.kind === 'until' ? row.waiver.until : null;
  if (row.errors.length > 0) return { status: 'FORMAT-ERROR', daysOverdue: 0, waiverUntil };
  if (row.retired) return { status: 'RETIRED', daysOverdue: 0, waiverUntil };
  const reviewDays = /** @type {number} */ (isoToDays(row.reviewAfter));
  const daysOverdue = Math.max(0, todayDays - reviewDays);
  if (todayDays <= reviewDays - soonDays) return { status: 'OK', daysOverdue, waiverUntil };
  if (todayDays <= reviewDays) return { status: 'DUE-SOON', daysOverdue, waiverUntil };
  if (waiverUntil === null) return { status: 'OVERDUE', daysOverdue, waiverUntil };
  const untilDays = /** @type {number} */ (isoToDays(waiverUntil));
  return { status: untilDays < todayDays ? 'WAIVER-EXPIRED' : 'WAIVED', daysOverdue, waiverUntil };
}

/**
 * Rows whose topic contains every word (case-insensitive). Retired rows are included.
 * @param {Array<{ topic: string }>} rows
 * @param {string} text
 */
export function filterByTopic(rows, text) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => words.every((word) => row.topic.toLowerCase().includes(word)));
}

/**
 * Builds the classified report for a parsed index.
 * @param {ReturnType<typeof parseResearchIndex>} parsed
 * @param {string} today
 * @param {number} [soonDays]
 */
export function buildReport(parsed, today, soonDays = DEFAULT_SOON_DAYS) {
  const rows = parsed.rows.map((row) => ({ row, ...classifyRow(row, today, soonDays) }));
  const summary = { rows: rows.length };
  for (const status of STATUS_ORDER) summary[status] = rows.filter((entry) => entry.status === status).length;
  return { rows, summary };
}

/**
 * Compares two indexes of different languages: #, dates, class and normalized verdict.
 * @param {ReturnType<typeof parseResearchIndex>} first
 * @param {ReturnType<typeof parseResearchIndex>} second
 * @returns {string[]} mismatch descriptions
 */
export function compareIndexes(first, second) {
  const problems = [];
  const byN = (parsed) => new Map(parsed.rows.map((row) => [row.n, row]));
  const a = byN(first);
  const b = byN(second);
  for (const n of a.keys()) if (!b.has(n)) problems.push(`Row #${n} exists only in the ${first.language} index.`);
  for (const n of b.keys()) if (!a.has(n)) problems.push(`Row #${n} exists only in the ${second.language} index.`);
  for (const [n, left] of a) {
    const right = b.get(n);
    if (!right) continue;
    for (const [label, key] of [['Verified on', 'verifiedOn'], ['Review after', 'reviewAfter'], ['Term class', 'class'], ['Verdict', 'verdict']]) {
      if (left[key] !== right[key]) problems.push(`Row #${n}: ${label} differs (${left[key]} vs ${right[key]}).`);
    }
  }
  return problems;
}

#!/usr/bin/env node
// Thin CLI for the research index freshness check. Logic lives in ../src/research-index.mjs.
// Read-only, no network. Exit codes: 0 ok, 1 only with --strict (OVERDUE / WAIVER-EXPIRED), 2 format or usage error.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  DEFAULT_SOON_DAYS,
  STATUS_ORDER,
  buildReport,
  compareIndexes,
  filterByTopic,
  isoToDays,
  parseResearchIndex,
} from '../src/research-index.mjs';

const DEFAULT_INDEX = 'docs/research-index.md';

/** Path of the index in the other language (docs/x <-> docs/pt-BR/x). */
function otherLanguagePath(indexPath) {
  const normalized = indexPath.replaceAll('\\', '/');
  if (normalized.includes('/pt-BR/')) return normalized.replace('/pt-BR/', '/');
  if (normalized.startsWith('pt-BR/')) return normalized.slice('pt-BR/'.length);
  const slash = normalized.lastIndexOf('/');
  return slash < 0 ? `pt-BR/${normalized}` : `${normalized.slice(0, slash)}/pt-BR${normalized.slice(slash)}`;
}

function usageError(message) {
  process.stderr.write(`research:stale: ${message}\n`);
  process.exitCode = 2;
}

async function loadIndex(root, path) {
  const text = await readFile(resolve(root, path), 'utf8');
  return parseResearchIndex(text);
}

function formatTable({ index, today, soon, entries, summary }) {
  const lines = [`research:stale  index=${index}  today=${today}  soon=${soon}d`, 'STATUS          #   REVIEW AFTER  CLASS  VERDICT      TOPIC'];
  for (const { row, status, waiverUntil } of entries) {
    const suffix = waiverUntil ? ` (until ${waiverUntil})` : '';
    lines.push(
      `${status.padEnd(15)} ${String(row.n).padEnd(3)} ${row.reviewAfter.padEnd(13)} ${row.class.padEnd(6)} ${(row.verdict ?? '?').padEnd(12)} ${row.topic}${suffix}`,
    );
  }
  const counts = STATUS_ORDER.map((status) => `${status} ${summary[status]}`).join(' | ');
  lines.push(`Summary: ${summary.rows} rows | ${counts}`);
  return `${lines.join('\n')}\n`;
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      strict: true,
      allowPositionals: false,
      options: {
        index: { type: 'string', default: DEFAULT_INDEX },
        root: { type: 'string' },
        today: { type: 'string' },
        soon: { type: 'string', default: String(DEFAULT_SOON_DAYS) },
        topic: { type: 'string' },
        json: { type: 'boolean', default: false },
        'check-both': { type: 'boolean', default: false },
        strict: { type: 'boolean', default: false },
      },
    }));
  } catch (error) {
    return usageError(error.message);
  }

  const today = values.today ?? new Date().toISOString().slice(0, 10);
  if (isoToDays(today) === null) return usageError(`--today must be a real YYYY-MM-DD date, got "${today}".`);
  if (!/^\d+$/.test(values.soon)) return usageError(`--soon must be a non-negative integer, got "${values.soon}".`);
  const soon = Number(values.soon);
  if (values.topic !== undefined && !values.topic.trim()) return usageError('--topic requires a non-empty quoted string.');
  const root = resolve(values.root ?? process.cwd());

  let parsed;
  try {
    parsed = await loadIndex(root, values.index);
  } catch (error) {
    return usageError(`cannot read ${values.index}: ${error.code ?? error.message}`);
  }

  const problems = parsed.errors.map((error) => `${values.index}:${error.line}: ${error.message}`);
  const { rows } = buildReport(parsed, today, soon);
  for (const entry of rows) {
    for (const error of entry.row.errors) problems.push(`${values.index}:${entry.row.line}: row ${entry.row.n}: ${error.message}`);
  }

  if (values['check-both']) {
    const otherPath = otherLanguagePath(values.index);
    try {
      const other = await loadIndex(root, otherPath);
      for (const error of other.errors) problems.push(`${otherPath}:${error.line}: ${error.message}`);
      for (const row of other.rows) for (const error of row.errors) problems.push(`${otherPath}:${row.line}: row ${row.n}: ${error.message}`);
      problems.push(...compareIndexes(parsed, other));
    } catch (error) {
      problems.push(`cannot read ${otherPath}: ${error.code ?? error.message}`);
    }
  }

  let shown = rows;
  if (values.topic !== undefined) {
    const matches = new Set(filterByTopic(parsed.rows, values.topic));
    shown = rows.filter((entry) => matches.has(entry.row));
  }
  const severity = (status) => STATUS_ORDER.indexOf(status);
  const sorted = [...shown].sort(
    (a, b) => severity(a.status) - severity(b.status) || a.row.reviewAfter.localeCompare(b.row.reviewAfter) || a.row.n - b.row.n,
  );
  const shownSummary = { rows: sorted.length };
  for (const status of STATUS_ORDER) shownSummary[status] = sorted.filter((entry) => entry.status === status).length;

  if (values.json) {
    const payload = {
      schemaVersion: 1,
      index: values.index,
      today,
      rows: sorted.map(({ row, status, daysOverdue, waiverUntil }) => ({
        n: row.n, topic: row.topic, verdict: row.verdict, verifiedOn: row.verifiedOn, reviewAfter: row.reviewAfter,
        class: row.class, status, daysOverdue, waiverUntil,
      })),
      summary: shownSummary,
      problems,
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(formatTable({ index: values.index, today, soon, entries: sorted, summary: shownSummary }));
  }

  for (const entry of sorted) {
    if (entry.status === 'OVERDUE' || entry.status === 'WAIVER-EXPIRED') {
      process.stderr.write(`WARN row ${entry.row.n} ${entry.status} (${entry.daysOverdue} days past Review after ${entry.row.reviewAfter}): ${entry.row.topic}\n`);
    }
  }
  for (const problem of problems) process.stderr.write(`ERROR ${problem}\n`);

  const hasFormatProblem = problems.length > 0;
  const gateFails = shownSummary.OVERDUE + shownSummary['WAIVER-EXPIRED'] > 0;
  if (hasFormatProblem) process.exitCode = 2;
  else if (values.strict && gateFails) process.exitCode = 1;
}

await main();

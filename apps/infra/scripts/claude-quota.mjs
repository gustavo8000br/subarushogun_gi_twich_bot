#!/usr/bin/env node
// Thin CLI for the Claude Code quota automation. Logic lives in ../src/claude-quota.mjs.
// Subcommands: statusline (stdin -> quota file, never fails), check, install.
// check exit codes: 0 OK, 10 HOLD, 20 LIMIT, 30 STALE, 31 MISSING, 2 usage error.
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  DEFAULT_HOLD,
  DEFAULT_LIMIT,
  DEFAULT_MAX_AGE_MIN,
  EXIT_CODES,
  buildQuotaRecord,
  classify,
  formatLocalTime,
  formatStatusLine,
  mergeStatusLine,
  parseStatuslineInput,
  readWindows,
} from '../src/claude-quota.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

function defaultQuotaFile() {
  return process.env.CLAUDE_QUOTA_FILE || join(tmpdir(), 'claude_quota.json');
}

/** Atomic write: temporary file in the same directory, then rename. */
function writeAtomic(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, content);
    renameSync(tmp, file);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      // temporary file already gone
    }
    throw error;
  }
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function runStatusline() {
  let line = formatStatusLine({ model: null, five: null, week: null });
  try {
    const parsed = parseStatuslineInput(readStdin());
    const windows = readWindows(parsed.hasRateLimits ? { rate_limits: parsed.rateLimits } : null);
    line = formatStatusLine({ model: parsed.model, five: windows.five, week: windows.week });
    const record = buildQuotaRecord(parsed, new Date().toISOString());
    if (record) writeAtomic(defaultQuotaFile(), `${JSON.stringify(record, null, 2)}\n`);
  } catch {
    // the status bar must never fail
  }
  process.stdout.write(line);
}

function parseNumber(name, value, fallback) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`--${name} must be a non-negative number`);
  return number;
}

function runCheck(args) {
  const { values } = parseArgs({
    args,
    options: {
      file: { type: 'string' },
      limit: { type: 'string' },
      hold: { type: 'string' },
      'max-age-min': { type: 'string' },
      json: { type: 'boolean', default: false },
      now: { type: 'string' }, // test hook: injected clock (ISO)
    },
    strict: true,
    allowPositionals: false,
  });
  const limit = parseNumber('limit', values.limit, DEFAULT_LIMIT);
  const hold = parseNumber('hold', values.hold, DEFAULT_HOLD);
  const maxAgeMin = parseNumber('max-age-min', values['max-age-min'], DEFAULT_MAX_AGE_MIN);
  const now = values.now ? new Date(values.now) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error('--now must be an ISO date');
  const file = resolve(values.file ?? defaultQuotaFile());

  let record = null;
  let readError = null;
  try {
    record = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    readError = error?.code === 'ENOENT' ? 'quota file not found' : 'quota file unreadable';
  }
  const result = classify(record, { now, limit, hold, maxAgeMin });
  const reason = readError ?? result.reason;
  const exitCode = EXIT_CODES[result.state];
  const iso = (epoch) => (epoch === null ? null : new Date(epoch * 1000).toISOString());

  if (values.json) {
    process.stdout.write(
      `${JSON.stringify({
        state: result.state,
        exit_code: exitCode,
        five_hour_pct: result.five,
        seven_day_pct: result.week,
        five_hour_resets_at: iso(result.fiveResetsAt),
        seven_day_resets_at: iso(result.weekResetsAt),
        updated_at: record?.updated_at ?? null,
        age_min: result.ageMin === null ? null : Math.floor(result.ageMin),
        reason,
        file,
      })}\n`,
    );
  } else {
    const lines = [`state: ${result.state}`];
    if (result.five !== null) {
      lines.push(`5h: ${result.five}% (resets ${formatLocalTime(result.fiveResetsAt)})`);
      lines.push(`week: ${result.week === null ? '?' : `${result.week}%`} (resets ${formatLocalTime(result.weekResetsAt)})`);
      lines.push(`updated: ${record.updated_at} (${Math.floor(result.ageMin)} min ago)`);
    }
    if (reason) lines.push(`reason: ${reason}`);
    process.stdout.write(`${lines.join('\n')}\n`);
  }
  process.exitCode = exitCode;
}

function quoteIfNeeded(path) {
  return /\s/.test(path) ? `"${path}"` : path;
}

function runInstall(args) {
  const { values } = parseArgs({
    args,
    options: {
      settings: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  const settingsPath = resolve(values.settings ?? join(homedir(), '.claude', 'settings.json'));
  let settings = {};
  const exists = existsSync(settingsPath);
  if (exists) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      throw new Error(`${settingsPath} is not valid JSON; nothing was changed`);
    }
    if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
      throw new Error(`${settingsPath} is not a JSON object; nothing was changed`);
    }
  }
  const command = `node ${quoteIfNeeded(SCRIPT_PATH)} statusline`;
  const merged = mergeStatusLine(settings, command, { force: values.force });
  const out = (text) => process.stdout.write(`${text}\n`);
  out(`settings: ${settingsPath}`);
  if (merged.warning) process.stderr.write(`warning: ${merged.warning}\n`);
  if (!merged.changed) {
    out(merged.warning ? 'unchanged (conflict)' : 'unchanged (statusLine already installed)');
    if (merged.warning) process.exitCode = 1;
    return;
  }
  out(`previous statusLine: ${JSON.stringify(settings.statusLine ?? null)}`);
  out(`new statusLine: ${JSON.stringify(merged.settings.statusLine)}`);
  if (values['dry-run']) {
    out('dry-run: nothing written');
    return;
  }
  if (exists) {
    const backup = `${settingsPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    copyFileSync(settingsPath, backup);
    out(`backup: ${backup}`);
  }
  writeAtomic(settingsPath, `${JSON.stringify(merged.settings, null, 2)}\n`);
  out('written. Restart the Claude Code session to load the new statusLine.');
}

function main(argv) {
  const [command, ...rest] = argv;
  if (command === 'statusline') return runStatusline();
  try {
    if (command === 'check') return runCheck(rest);
    if (command === 'install') return runInstall(rest);
    throw new Error('usage: claude-quota.mjs <statusline|check|install> [options]');
  } catch (error) {
    process.stderr.write(`claude-quota: ${error.message}\n`);
    process.exitCode = 2;
  }
}

main(process.argv.slice(2));

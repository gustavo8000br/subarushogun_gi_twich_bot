// Contract test for the research index (docs/research-index.md and its pt-BR copy).
// Specification: docs/process/research-learning-flow.md section 11 (T1..T5, T6', T7..T13).
// No assertion on the live files uses the system clock: deadlines are the job of `npm run research:stale`.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  VOLATILE_MAX_DAYS,
  addCalendarMonths,
  compareIndexes,
  isoToDays,
  parseResearchIndex,
} from '../../apps/infra/src/research-index.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

const EN_PATH = 'docs/research-index.md';
const PT_PATH = 'docs/pt-BR/research-index.md';
const FLOW_FILES = ['docs/process/research-learning-flow.md', 'docs/pt-BR/process/research-learning-flow.md'];
const DEFAULT_REASONS = ['default 3 months', 'padrão 3 meses'];

const enText = read(EN_PATH);
const ptText = read(PT_PATH);
const en = parseResearchIndex(enText, { language: 'en' });
const pt = parseResearchIndex(ptText, { language: 'pt-BR' });

const errorCodes = (parsed) => parsed.rows.flatMap((row) => row.errors.map((error) => `#${row.n}:${error.code}`));
const withCode = (parsed, ...wanted) => errorCodes(parsed).filter((entry) => wanted.includes(entry.split(':')[1]));

/** Returns violations of the checks that need more than the parser (T7 to T10), without the clock. */
function derivedViolations(parsed) {
  const found = [];
  let previous = 0;
  const seen = new Set();
  for (const row of parsed.rows) {
    if (seen.has(row.n)) found.push(`#${row.n}: duplicated #`);
    seen.add(row.n);
    found.push(...(row.n > previous || seen.size === 1 ? [] : [`#${row.n}: not increasing`]));
    previous = Math.max(previous, row.n);
    if (row.errors.length > 0 || row.retired) continue;
    const verified = row.verifiedOn === 'unknown' ? null : row.verifiedOn;
    if (row.class === 'STD' && verified && !/^(shortened|extended):/.test(row.reason)) {
      if (row.reviewAfter !== addCalendarMonths(verified, 3)) found.push(`#${row.n}: STD term drift`);
    }
    if (row.class === 'VOL' && verified && !/^extended:/.test(row.reason)) {
      if (isoToDays(row.reviewAfter) - isoToDays(verified) > VOLATILE_MAX_DAYS) found.push(`#${row.n}: VOL term too long`);
    }
    if (row.class === 'VOL' && DEFAULT_REASONS.includes(row.reason)) found.push(`#${row.n}: VOL with default reason`);
  }
  return found;
}

function docPaths(row) {
  return [...row.note.matchAll(/`([^`]+)`/g)].map((match) => match[1]).filter((path) => path.startsWith('docs/'));
}

describe('research index: format of both files (T1 to T6, T3)', () => {
  it('finds the table and the right language in each file', () => {
    expect(en.language).toBe('en');
    expect(pt.language).toBe('pt-BR');
    expect(en.errors).toEqual([]);
    expect(pt.errors).toEqual([]);
    expect(en.rows.length).toBeGreaterThanOrEqual(38);
  });

  for (const [label, parsed] of [['en', en], ['pt-BR', pt]]) {
    describe(label, () => {
      it('T1: 14 cells per row', () => {
        expect(withCode(parsed, 'CELL_COUNT')).toEqual([]);
        expect(parsed.header).toHaveLength(14);
      });

      it('T2: valid dates, Review after later than Verified on', () => {
        expect(withCode(parsed, 'VERIFIED_ON', 'REVIEW_AFTER', 'DATE_ORDER')).toEqual([]);
      });

      it('T3: class STD/VOL and non-empty reason; VOL reason is not the default text', () => {
        expect(withCode(parsed, 'CLASS', 'REASON')).toEqual([]);
        expect(derivedViolations(parsed).filter((entry) => entry.includes('default reason'))).toEqual([]);
      });

      it('T4: verdict uses only the tokens of the file language', () => {
        expect(withCode(parsed, 'VERDICT')).toEqual([]);
      });

      it('T5: confidence uses only the values of the file language', () => {
        expect(withCode(parsed, 'CONFIDENCE')).toEqual([]);
      });

      it("T6': waiver syntax and the 30-day cap from Review after (never compared with today)", () => {
        expect(withCode(parsed, 'WAIVER', 'WAIVER_CAP')).toEqual([]);
      });

      it('has no other row-level format error', () => {
        expect(errorCodes(parsed)).toEqual([]);
      });
    });
  }
});

describe('research index: parity, term rules and links (T7 to T10)', () => {
  it('T7: unique, increasing # in each file', () => {
    expect(derivedViolations(en).filter((entry) => /duplicated|increasing/.test(entry))).toEqual([]);
    expect(derivedViolations(pt).filter((entry) => /duplicated|increasing/.test(entry))).toEqual([]);
  });

  it('T7: en and pt-BR agree on #, dates, class and normalized verdict', () => {
    expect(compareIndexes(en, pt)).toEqual([]);
  });

  it('T8 and T9: STD is +3 calendar months, VOL is at most 42 days', () => {
    expect(derivedViolations(en).filter((entry) => /term/.test(entry))).toEqual([]);
    expect(derivedViolations(pt).filter((entry) => /term/.test(entry))).toEqual([]);
  });

  it('T10: every backticked docs/ path in the Note column exists on disk', () => {
    const missing = [];
    for (const [label, parsed] of [['en', en], ['pt-BR', pt]]) {
      for (const row of parsed.rows) {
        const paths = docPaths(row);
        if (paths.length === 0) missing.push(`${label} #${row.n}: no docs/ path in the Note column`);
        for (const path of paths) if (!existsSync(join(root, path))) missing.push(`${label} #${row.n}: ${path}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('research index: contract checks detect mutations (non-vacuous)', () => {
  const firstDataLine = enText.split('\n').findIndex((line, i, all) => /^\|\s*\d+\s*\|/.test(line) && /^\|[-| ]+\|$/.test(all[i - 1] ?? ''));
  const mutate = (text, edit) => {
    const lines = text.split('\n');
    lines[firstDataLine] = edit(lines[firstDataLine]);
    return lines.join('\n');
  };
  const cell = (line, index, value) => {
    const cells = line.split('|');
    cells[index + 1] = ` ${value} `;
    return cells.join('|');
  };

  it('finds the first data row (guards the mutation helper itself)', () => {
    expect(firstDataLine).toBeGreaterThan(0);
    expect(enText.split('\n')[firstDataLine]).toMatch(/^\| 1 \|/);
  });

  it('T1: a removed cell is caught', () => {
    const parsed = parseResearchIndex(mutate(enText, (line) => line.replace(/ \|[^|]*\|$/, ' |')));
    expect(withCode(parsed, 'CELL_COUNT')).toEqual(['#1:CELL_COUNT']);
  });

  it('T2: a malformed and an inverted date are caught', () => {
    expect(withCode(parseResearchIndex(mutate(enText, (l) => cell(l, 3, '2026-13-45'))), 'VERIFIED_ON')).toHaveLength(1);
    expect(withCode(parseResearchIndex(mutate(enText, (l) => cell(l, 4, '2020-01-01'))), 'DATE_ORDER')).toHaveLength(1);
  });

  it('T3 and T5: a bad class and a bad confidence are caught', () => {
    expect(withCode(parseResearchIndex(mutate(enText, (l) => cell(l, 5, 'MONTHLY'))), 'CLASS')).toHaveLength(1);
    expect(withCode(parseResearchIndex(mutate(enText, (l) => cell(l, 8, 'Alta'))), 'CONFIDENCE')).toHaveLength(1);
  });

  it('T4: a pt-BR token in the en file is caught, and the reverse', () => {
    expect(withCode(parseResearchIndex(mutate(enText, (l) => cell(l, 2, '**SUFICIENTE**'))), 'VERDICT')).toHaveLength(1);
    const ptFirst = ptText.split('\n').findIndex((line, i, all) => /^\|\s*1\s*\|/.test(line) && /^\|[-| ]+\|$/.test(all[i - 1] ?? ''));
    const lines = ptText.split('\n');
    lines[ptFirst] = cell(lines[ptFirst], 2, '**GAP**');
    expect(withCode(parseResearchIndex(lines.join('\n')), 'VERDICT')).toHaveLength(1);
  });

  it("T6': a waiver above the 30-day cap, without reason or in the wrong language is caught", () => {
    expect(withCode(parseResearchIndex(mutate(enText, (l) => cell(l, 13, 'until 2099-01-01: far'))), 'WAIVER_CAP')).toHaveLength(1);
    expect(withCode(parseResearchIndex(mutate(enText, (l) => cell(l, 13, 'until 2026-12-02:'))), 'WAIVER')).toHaveLength(1);
    expect(withCode(parseResearchIndex(mutate(enText, (l) => cell(l, 13, 'nenhuma'))), 'WAIVER')).toHaveLength(1);
  });

  it('T7: drift between the files is caught', () => {
    const ptFirst = ptText.split('\n').findIndex((line, i, all) => /^\|\s*1\s*\|/.test(line) && /^\|[-| ]+\|$/.test(all[i - 1] ?? ''));
    const lines = ptText.split('\n');
    lines[ptFirst] = cell(lines[ptFirst], 4, '2031-01-01');
    expect(compareIndexes(en, parseResearchIndex(lines.join('\n'))).join('\n')).toMatch(/Row #1: Review after differs/);
    const shorter = parseResearchIndex(ptText.split('\n').filter((_, i) => i !== ptFirst).join('\n'));
    expect(compareIndexes(en, shorter).join('\n')).toMatch(/Row #1 exists only in the en index/);
  });

  it('T7: duplicated and decreasing # are caught', () => {
    const lines = enText.split('\n');
    const second = firstDataLine + 1;
    lines[second] = cell(lines[second], 0, '1');
    expect(derivedViolations(parseResearchIndex(lines.join('\n'))).join('\n')).toMatch(/duplicated #/);
    lines[second] = cell(enText.split('\n')[second], 0, '0');
    expect(derivedViolations(parseResearchIndex(lines.join('\n'))).join('\n')).toMatch(/not increasing/);
  });

  it('T8 and T9: a silent STD drift and a long VOL term are caught, shortened/extended are allowed', () => {
    const std = enText.split('\n').findIndex((line) => /\| STD \|/.test(line));
    const vol = firstDataLine;
    const lines = enText.split('\n');
    lines[std] = cell(lines[std], 4, addCalendarMonths(lines[std].split('|')[4].trim(), 1));
    expect(derivedViolations(parseResearchIndex(lines.join('\n'))).join('\n')).toMatch(/STD term drift/);
    lines[std] = cell(lines[std], 6, 'shortened: security advisory');
    expect(derivedViolations(parseResearchIndex(lines.join('\n'))).join('\n')).not.toMatch(/STD term drift/);
    const volLines = enText.split('\n');
    volLines[vol] = cell(volLines[vol], 4, '2099-01-01');
    const longTerm = cell(volLines[vol], 13, 'none');
    volLines[vol] = longTerm;
    expect(derivedViolations(parseResearchIndex(volLines.join('\n'))).join('\n')).toMatch(/#1: VOL term too long/);
    volLines[vol] = cell(longTerm, 6, 'extended: owner decision');
    expect(derivedViolations(parseResearchIndex(volLines.join('\n'))).join('\n')).not.toMatch(/#1: VOL term too long/);
  });

  it('T10: a broken docs/ link is detected by the path extraction', () => {
    const row = parseResearchIndex(mutate(enText, (l) => cell(l, 9, '`docs/does-not-exist.md`'))).rows[0];
    expect(docPaths(row)).toEqual(['docs/does-not-exist.md']);
    expect(existsSync(join(root, docPaths(row)[0]))).toBe(false);
  });
});

describe('T12: no secrets or Claude session URLs in research memory and notes', () => {
  const PATTERNS = [
    ['claude session url', /claude\.ai\/code\/session/i],
    ['claude-session trailer', /Claude-Session:/],
    ['github token', /gh[pousr]_[A-Za-z0-9]{20,}/],
    ['api key', /sk-[A-Za-z0-9]{20,}/],
    ['bearer token', /Bearer [A-Za-z0-9._-]{20,}/],
    ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY/],
    ['token query parameter', /[?&](token|access_token|client_secret)=/],
  ];
  const TEXT_FILE = /\.(md|json|ya?ml|txt)$/;
  const walk = (dir) => {
    const absolute = join(root, dir);
    if (!existsSync(absolute)) return [];
    return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return walk(path);
      return TEXT_FILE.test(entry.name) && statSync(join(root, path)).isFile() ? [path] : [];
    });
  };
  const scan = (text) => PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  // The flow files cite these names as prohibitions, so they are exempt per file.
  const files = [
    ...walk('.claude/agent-memory'),
    ...walk('docs/research'),
    ...walk('docs/pt-BR/research'),
    EN_PATH,
    PT_PATH,
  ].filter((path) => !FLOW_FILES.includes(path));

  it('scans a non-empty file set that includes the analyst memory', () => {
    expect(files).toContain('.claude/agent-memory/aiox-analyst/MEMORY.md');
    expect(files.length).toBeGreaterThan(5);
  });

  it('finds no secret or session URL pattern', () => {
    const hits = files.flatMap((path) => scan(read(path)).map((name) => `${path}: ${name}`));
    expect(hits).toEqual([]);
  });

  it('the scanner detects each pattern (non-vacuous)', () => {
    const samples = [
      'https://claude.ai/code/session_ABC', 'Claude-Session: x', `ghp_${'a'.repeat(24)}`, `sk-${'b'.repeat(24)}`,
      `Bearer ${'c'.repeat(24)}`, '-----BEGIN RSA PRIVATE KEY-----', 'https://x.test/cb?access_token=1',
    ];
    expect(samples.map((sample) => scan(sample).length)).toEqual(samples.map(() => 1));
    expect(scan('plain research text about tokens and sessions')).toEqual([]);
  });
});

describe('T13: the rule is present in AGENTS.md and the analyst agent', () => {
  it('AGENTS.md carries the research:stale rule and the Revisar depois de column', () => {
    const agents = read('AGENTS.md');
    expect(agents, 'AGENTS.md must mention `research:stale`').toContain('research:stale');
    expect(agents, 'AGENTS.md must mention `Revisar depois de`').toContain('Revisar depois de');
    expect(agents).toContain('docs/pt-BR/process/research-learning-flow.md');
  });

  // Pending the Orion edit of .claude/agents/aiox-analyst.md (governance path, subagents cannot edit it):
  // until then these two assertions fail on purpose with a clear message.
  const analyst = read('.claude/agents/aiox-analyst.md');
  it('the analyst agent mentions research:stale (needs the Orion edit of .claude/agents/aiox-analyst.md)', () => {
    expect(analyst, 'aiox-analyst.md must mention `research:stale`; waiting for the Orion edit').toContain('research:stale');
  });

  it('the analyst maxTurns is at least 100 (needs the Orion edit: 60 -> 150)', () => {
    const maxTurns = Number(analyst.match(/^maxTurns:\s*(\d+)\s*$/m)?.[1]);
    expect(Number.isFinite(maxTurns), 'maxTurns must be a number').toBe(true);
    expect(maxTurns, 'aiox-analyst.md maxTurns must be >= 100; waiting for the Orion edit').toBeGreaterThanOrEqual(100);
  });
});

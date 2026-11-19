import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  addCalendarMonths,
  addDays,
  buildReport,
  classifyRow,
  compareIndexes,
  filterByTopic,
  isoToDays,
  normalizeVerdict,
  parseResearchIndex,
} from '../../apps/infra/src/research-index.mjs';

const script = fileURLToPath(new URL('../../apps/infra/scripts/research-stale.mjs', import.meta.url));

const EN_HEADER =
  '| # | Topic | Verdict | Verified on | Review after | Term class | Term reason | Triggers | Confidence | Note | Author | Evidence | Answers | Waiver |';
const PT_HEADER =
  '| # | Tema | Veredito | Verificado em | Revisar depois de | Classe do prazo | Motivo do prazo | Gatilhos | Confiança | Nota | Autoria | Evidência | Responde | Dispensa |';
const SEPARATOR = `|${'---|'.repeat(14)}`;

const EN_DEFAULTS = {
  n: '1', topic: 'Topic one', verdict: '**SUFFICIENT**', verified: '2026-11-01', review: '2026-12-13', klass: 'VOL',
  reason: 'Twitch API', triggers: 'REFRESH IF it changes', confidence: 'Medium', note: '`docs/a.md`', author: '@analyst',
  evidence: 'e', answers: 'a', waiver: 'none',
};
const PT_DEFAULTS = { ...EN_DEFAULTS, verdict: '**SUFICIENTE**', confidence: 'Média', waiver: 'nenhuma' };

function makeRow(overrides = {}, language = 'en') {
  const v = { ...(language === 'en' ? EN_DEFAULTS : PT_DEFAULTS), ...overrides };
  return `| ${v.n} | ${v.topic} | ${v.verdict} | ${v.verified} | ${v.review} | ${v.klass} | ${v.reason} | ${v.triggers} | ${v.confidence} | ${v.note} | ${v.author} | ${v.evidence} | ${v.answers} | ${v.waiver} |`;
}

function makeIndex(rows, language = 'en') {
  return ['# Research Index', '', language === 'en' ? EN_HEADER : PT_HEADER, SEPARATOR, ...rows, '', 'prose after'].join('\n');
}

const parseOne = (overrides, language = 'en') => parseResearchIndex(makeIndex([makeRow(overrides, language)], language), {}).rows[0];
const codes = (row) => row.errors.map((error) => error.code);

describe('date helpers', () => {
  it('validates real UTC calendar dates only', () => {
    expect(isoToDays('2026-11-18')).toBeTypeOf('number');
    expect(isoToDays('2026-02-30')).toBeNull();
    expect(isoToDays('2026-13-01')).toBeNull();
    expect(isoToDays('26-11-18')).toBeNull();
    expect(isoToDays('2026-11-18T00:00')).toBeNull();
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-11-18', 14)).toBe('2026-12-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(() => addDays('nope', 1)).toThrow(RangeError);
  });

  it('adds calendar months clamping to month end, including leap years', () => {
    expect(addCalendarMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(addCalendarMonths('2027-11-30', 3)).toBe('2028-02-29');
    expect(addCalendarMonths('2026-10-03', 3)).toBe('2027-01-03');
    expect(addCalendarMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addCalendarMonths('2026-11-18', 12)).toBe('2027-11-18');
    expect(() => addCalendarMonths('2026-02-31', 1)).toThrow(RangeError);
  });
});

describe('normalizeVerdict', () => {
  it('maps both languages to the canonical codes', () => {
    expect(normalizeVerdict('**SUFFICIENT**')).toBe('SUFFICIENT');
    expect(normalizeVerdict('SUFICIENTE')).toBe('SUFFICIENT');
    expect(normalizeVerdict('REFRESH IF')).toBe('REFRESH_IF');
    expect(normalizeVerdict('**REVISAR SE**')).toBe('REFRESH_IF');
    expect(normalizeVerdict('GAP')).toBe('GAP');
    expect(normalizeVerdict('LACUNA')).toBe('GAP');
    expect(normalizeVerdict('MAYBE')).toBeNull();
  });
});

describe('parseResearchIndex', () => {
  it('parses a valid en row and detects the language', () => {
    const parsed = parseResearchIndex(makeIndex([makeRow()]));
    expect(parsed.language).toBe('en');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ n: 1, verdict: 'SUFFICIENT', class: 'VOL', retired: false });
    expect(parsed.rows[0].errors).toEqual([]);
    expect(parsed.rows[0].waiver).toEqual({ kind: 'none' });
  });

  it('parses a valid pt-BR row', () => {
    const parsed = parseResearchIndex(makeIndex([makeRow({}, 'pt-BR')], 'pt-BR'));
    expect(parsed.language).toBe('pt-BR');
    expect(parsed.rows[0].errors).toEqual([]);
    expect(parsed.rows[0].verdict).toBe('SUFFICIENT');
  });

  it('reports a missing index table', () => {
    const parsed = parseResearchIndex('# nothing here\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(parsed.language).toBeNull();
    expect(parsed.errors).toHaveLength(1);
  });

  it('flags a language mismatch with the expected one', () => {
    expect(parseResearchIndex(makeIndex([makeRow()]), { language: 'pt-BR' }).errors).toHaveLength(1);
  });

  it('flags a missing cell with the line number', () => {
    const text = makeIndex([makeRow().replace(/ \| none \|$/, ' |')]);
    const row = parseResearchIndex(text).rows[0];
    expect(codes(row)).toEqual(['CELL_COUNT']);
    expect(row.line).toBe(5);
  });

  it('flags a bad date and an inverted date range', () => {
    expect(codes(parseOne({ review: '2026-02-30' }))).toContain('REVIEW_AFTER');
    expect(codes(parseOne({ verified: 'yesterday' }))).toContain('VERIFIED_ON');
    expect(codes(parseOne({ review: '2026-11-01' }))).toContain('DATE_ORDER');
    expect(codes(parseOne({ review: '2026-10-01' }))).toContain('DATE_ORDER');
  });

  it('accepts unknown only in Verified on', () => {
    expect(codes(parseOne({ verified: 'unknown' }))).toEqual([]);
    expect(codes(parseOne({ review: 'unknown' }))).toContain('REVIEW_AFTER');
  });

  it('rejects a verdict token of the other language and an unknown token', () => {
    expect(codes(parseOne({ verdict: '**SUFICIENTE**' }))).toContain('VERDICT');
    expect(codes(parseOne({ verdict: 'LACUNA' }))).toContain('VERDICT');
    expect(codes(parseOne({ verdict: 'MAYBE' }), 'en')).toContain('VERDICT');
    expect(codes(parseOne({ verdict: '**SUFFICIENT**' }, 'pt-BR'))).toContain('VERDICT');
  });

  it('rejects confidence of the other language', () => {
    expect(codes(parseOne({ confidence: 'Média' }))).toContain('CONFIDENCE');
    expect(codes(parseOne({ confidence: 'Medium' }, 'pt-BR'))).toContain('CONFIDENCE');
  });

  it('rejects a bad class and empty required cells', () => {
    expect(codes(parseOne({ klass: 'WEEKLY' }))).toContain('CLASS');
    expect(codes(parseOne({ reason: '' }))).toContain('REASON');
    expect(codes(parseOne({ topic: '' }))).toContain('TOPIC');
    expect(codes(parseOne({ triggers: '' }))).toContain('TRIGGERS');
    expect(codes(parseOne({ n: 'x' }))).toContain('N');
  });

  it('validates the waiver syntax, reason and the 30-day cap from Review after', () => {
    expect(codes(parseOne({ waiver: 'until 2026-12-20: batch renewal pending' }))).toEqual([]);
    expect(codes(parseOne({ waiver: 'until 2027-01-12: at the cap' }))).toEqual([]);
    expect(codes(parseOne({ waiver: 'until 2027-01-13: one day too long' }))).toContain('WAIVER_CAP');
    expect(codes(parseOne({ waiver: 'until 2026-12-20:' }))).toContain('WAIVER');
    expect(codes(parseOne({ waiver: 'until 2026-12-20' }))).toContain('WAIVER');
    expect(codes(parseOne({ waiver: 'until 2026-02-30: bad date' }))).toContain('WAIVER');
    expect(codes(parseOne({ waiver: 'soon' }))).toContain('WAIVER');
    expect(codes(parseOne({ waiver: 'nenhuma' }))).toContain('WAIVER');
    expect(codes(parseOne({ waiver: 'até 2026-12-20: motivo' }))).toContain('WAIVER');
    expect(codes(parseOne({ waiver: 'até 2026-12-20: motivo' }, 'pt-BR'))).toEqual([]);
    expect(codes(parseOne({ waiver: 'none' }, 'pt-BR'))).toContain('WAIVER');
  });

  it('marks RETIRED rows', () => {
    expect(parseOne({ triggers: 'RETIRED: replaced by row 40' }).retired).toBe(true);
    expect(parseOne({ triggers: 'REFRESH IF RETIRED words' }).retired).toBe(false);
  });
});

describe('classifyRow with an injected date', () => {
  const row = (overrides) => parseOne({ review: '2026-11-18', verified: '2026-10-07', ...overrides });

  it('OK when today is at or before Review after minus the soon window', () => {
    expect(classifyRow(row({}), '2026-11-04', 14).status).toBe('OK');
    expect(classifyRow(row({}), '2026-11-05', 14).status).toBe('DUE-SOON');
  });

  it('DUE-SOON up to and including Review after', () => {
    expect(classifyRow(row({}), '2026-11-18', 14).status).toBe('DUE-SOON');
    expect(classifyRow(row({}), '2026-11-19', 14).status).toBe('OVERDUE');
  });

  it('OVERDUE reports days overdue', () => {
    expect(classifyRow(row({}), '2026-11-21')).toMatchObject({ status: 'OVERDUE', daysOverdue: 3, waiverUntil: null });
  });

  it('WAIVED while the waiver date is today or later, WAIVER-EXPIRED after', () => {
    const waived = row({ waiver: 'until 2026-12-02: renewal pending' });
    expect(classifyRow(waived, '2026-12-02')).toMatchObject({ status: 'WAIVED', waiverUntil: '2026-12-02' });
    expect(classifyRow(waived, '2026-12-03').status).toBe('WAIVER-EXPIRED');
  });

  it('a waiver on a row not yet overdue does not change its status', () => {
    expect(classifyRow(row({ waiver: 'until 2026-11-25: early' }), '2026-11-10').status).toBe('DUE-SOON');
  });

  it('FORMAT-ERROR wins over dates, RETIRED rows are skipped', () => {
    expect(classifyRow(row({ klass: 'X' }), '2030-01-01').status).toBe('FORMAT-ERROR');
    expect(classifyRow(row({ triggers: 'RETIRED: old' }), '2030-01-01').status).toBe('RETIRED');
  });

  it('rejects an invalid today', () => {
    expect(() => classifyRow(row({}), '2026-13-40')).toThrow(RangeError);
  });
});

describe('topic filter, report and parity', () => {
  const parsed = parseResearchIndex(makeIndex([
    makeRow({ n: '1', topic: 'Helix group lookup' }),
    makeRow({ n: '2', topic: 'OBS overlay', triggers: 'RETIRED: old' }),
  ]));

  it('filters by all words, case-insensitive, and keeps retired rows findable', () => {
    expect(filterByTopic(parsed.rows, 'LOOKUP helix')).toHaveLength(1);
    expect(filterByTopic(parsed.rows, 'helix obs')).toHaveLength(0);
    expect(filterByTopic(parsed.rows, 'overlay')).toHaveLength(1);
  });

  it('summarises by status', () => {
    const { summary } = buildReport(parsed, '2026-11-18');
    expect(summary).toMatchObject({ rows: 2, OK: 1, RETIRED: 1, OVERDUE: 0 });
  });

  it('compareIndexes detects drift in dates, class, verdict and row set', () => {
    const en = parseResearchIndex(makeIndex([makeRow({ n: '1' }), makeRow({ n: '2' })]));
    const same = parseResearchIndex(makeIndex([makeRow({ n: '1' }, 'pt-BR'), makeRow({ n: '2' }, 'pt-BR')], 'pt-BR'));
    expect(compareIndexes(en, same)).toEqual([]);
    const drift = parseResearchIndex(makeIndex([
      makeRow({ n: '1', review: '2026-12-14', klass: 'STD', verdict: '**LACUNA**' }, 'pt-BR'),
    ], 'pt-BR'));
    const problems = compareIndexes(en, drift);
    expect(problems.join('\n')).toMatch(/Review after differs/);
    expect(problems.join('\n')).toMatch(/Term class differs/);
    expect(problems.join('\n')).toMatch(/Verdict differs/);
    expect(problems.join('\n')).toMatch(/Row #2 exists only in the en index/);
  });
});

describe('research:stale CLI', () => {
  const dir = mkdtempSync(join(tmpdir(), 'research-stale-'));
  mkdirSync(join(dir, 'docs', 'pt-BR'), { recursive: true });
  const rows = (language) => [
    makeRow({ n: '1', topic: 'Overdue topic', review: '2026-11-10', verified: '2026-09-29' }, language),
    makeRow({ n: '2', topic: 'Waived topic', review: '2026-11-10', verified: '2026-09-29', waiver: language === 'en' ? 'until 2026-12-01: pending' : 'até 2026-12-01: pendente' }, language),
    makeRow({ n: '3', topic: 'Fresh topic' }, language),
  ];
  writeFileSync(join(dir, 'docs', 'research-index.md'), makeIndex(rows('en')));
  writeFileSync(join(dir, 'docs', 'pt-BR', 'research-index.md'), makeIndex(rows('pt-BR'), 'pt-BR'));
  writeFileSync(join(dir, 'docs', 'bad.md'), makeIndex([makeRow({ klass: 'X' })]));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const run = (...args) => spawnSync(process.execPath, [script, '--root', dir, ...args], { encoding: 'utf8' });

  it('default mode warns about overdue rows and exits 0', () => {
    const result = run('--today', '2026-11-18');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/OVERDUE\s+1 /);
    expect(result.stdout).toMatch(/WAIVED\s+2 .*\(until 2026-12-01\)/);
    expect(result.stderr).toMatch(/WARN row 1 OVERDUE \(8 days/);
    expect(result.stderr).not.toMatch(/row 2/);
  });

  it('--strict exits 1 for OVERDUE and for WAIVER-EXPIRED, accepts WAIVED', () => {
    expect(run('--today', '2026-11-18', '--strict').status).toBe(1);
    const onlyWaived = run('--today', '2026-11-18', '--strict', '--topic', 'waived');
    expect(onlyWaived.status).toBe(0);
    expect(run('--today', '2026-12-02', '--strict', '--topic', 'waived').status).toBe(1);
  });

  it('--json is stable and carries the schema version', () => {
    const result = run('--today', '2026-11-18', '--json');
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({ schemaVersion: 1, today: '2026-11-18', index: 'docs/research-index.md' });
    expect(payload.rows[0]).toMatchObject({ n: 1, status: 'OVERDUE', daysOverdue: 8, class: 'VOL', waiverUntil: null });
    expect(payload.summary).toMatchObject({ rows: 3, OVERDUE: 1, WAIVED: 1, OK: 1 });
  });

  it('--topic takes a single quoted string', () => {
    const result = run('--today', '2026-11-18', '--topic', 'fresh TOPIC');
    expect(result.stdout).toMatch(/Fresh topic/);
    expect(result.stdout).not.toMatch(/Overdue topic/);
  });

  it('--check-both passes on identical indexes and exits 2 on drift', () => {
    expect(run('--today', '2026-11-18', '--check-both').status).toBe(0);
    writeFileSync(
      join(dir, 'docs', 'pt-BR', 'research-index.md'),
      makeIndex([...rows('pt-BR').slice(0, 2), makeRow({ n: '3', topic: 'Fresh topic', review: '2026-12-20' }, 'pt-BR')], 'pt-BR'),
    );
    const drift = run('--today', '2026-11-18', '--check-both');
    expect(drift.status).toBe(2);
    expect(drift.stderr).toMatch(/Row #3: Review after differs/);
  });

  it('exits 2 for a format error, a bad flag, a bad date and a missing file', () => {
    expect(run('--index', 'docs/bad.md', '--today', '2026-11-18').status).toBe(2);
    expect(run('--nope').status).toBe(2);
    expect(run('--today', '2026-02-30').status).toBe(2);
    expect(run('--index', 'docs/missing.md').status).toBe(2);
    expect(run('--topic', '  ').status).toBe(2);
  });

  it('never modifies the index (read-only)', () => {
    const before = readFileSync(join(dir, 'docs', 'research-index.md'), 'utf8');
    run('--today', '2026-11-18', '--strict', '--check-both');
    expect(readFileSync(join(dir, 'docs', 'research-index.md'), 'utf8')).toBe(before);
  });
});

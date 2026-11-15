import { describe, expect, it } from 'vitest';
import {
  MAX_DELETIONS, deletePlannedBranches, isSafeBranchName, renderPlanSummary, selectBranchesToDelete,
} from '../../apps/infra/scripts/branch-cleanup.mjs';

const now = new Date('2026-11-15T00:00:00Z');
const old = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();
const branch = (name, extra = {}) => ({
  name, sha: `sha-${name}`, protected: false, merged: true, date: old(30), ...extra,
});
const select = (branches, openPrHeads = []) => selectBranchesToDelete({
  branches, defaultBranch: 'main', openPrHeads, now,
});
const reasons = (result) => Object.fromEntries(result.skipped.map((entry) => [entry.name, entry.reason]));

describe('branch cleanup selection', () => {
  it('deletes only old fully merged branches and reports why the others are kept', () => {
    const result = select([
      branch('main'),
      branch('release', { protected: true }),
      branch('feat/open-pr'),
      branch('feat/unmerged', { merged: false }),
      branch('feat/old-merged'),
      branch('feat/recent-merged', { date: old(1) }),
    ], ['feat/open-pr']);
    expect(result.selected.map((entry) => entry.name)).toEqual(['feat/old-merged']);
    expect(reasons(result)).toEqual({
      main: 'default-branch',
      release: 'protected',
      'feat/open-pr': 'open-pr',
      'feat/unmerged': 'not-merged',
      'feat/recent-merged': 'too-recent',
    });
  });

  it('never selects a non-main default branch', () => {
    const result = selectBranchesToDelete({
      branches: [branch('trunk')], defaultBranch: 'trunk', openPrHeads: [], now,
    });
    expect(result.selected).toEqual([]);
  });

  it('caps a run at 20 branches, oldest first, and reports the overflow', () => {
    // Shuffled input: the oldest (b00) must still come first, so the ordering is what is under test.
    const ordered = Array.from({ length: 25 }, (_, index) => branch(`feat/b${String(index).padStart(2, '0')}`, { date: old(100 - index) }));
    const many = [...ordered.slice(12), ...ordered.slice(0, 12).reverse()];
    const result = select(many);
    expect(result.selected).toHaveLength(MAX_DELETIONS);
    expect(result.selected.map((entry) => entry.name)).toEqual(ordered.slice(0, 20).map((entry) => entry.name));
    expect(result.overflow).toEqual(['feat/b20', 'feat/b21', 'feat/b22', 'feat/b23', 'feat/b24']);
    expect(renderPlanSummary(result, { dryRun: true })).toContain('5 remain for the next run');
  });

  it.each(['-rf', 'a b', 'feat/$(id)', 'feat;rm', 'a`b`', 'feat/..x', 'a\nb', '', 'feat/x.lock', 'feat//x'])(
    'skips the unsafe branch name %j',
    (name) => {
      expect(isSafeBranchName(name)).toBe(false);
      const result = select([branch(name)]);
      expect(result.selected).toEqual([]);
      expect(result.skipped[0].reason).toBe('unsafe-name');
    },
  );

  it('accepts ordinary names with slashes, dots and dashes', () => {
    expect(isSafeBranchName('feat/ops-15_v1.2')).toBe(true);
  });

  it('treats a missing or invalid commit date as too recent', () => {
    expect(reasons(select([branch('feat/x', { date: '' })]))).toEqual({ 'feat/x': 'too-recent' });
  });

  it('writes name, tip hash and date in the summary and says when nothing qualifies', () => {
    const text = renderPlanSummary(select([branch('feat/old')]), { dryRun: true });
    expect(text).toContain('| `feat/old` | `sha-feat/old` |');
    expect(text).toContain('dry run');
    expect(renderPlanSummary(select([]), { dryRun: false })).toContain('No fully merged branch');
  });
});

describe('branch cleanup deletion', () => {
  const repo = 'owner/repo';
  // Fake GitHub API: `refs` maps branch -> current tip, `openPrs` lists branches with an open PR,
  // `failDelete` lists branches whose DELETE call throws.
  const makeApi = ({ refs, openPrs = [], failDelete = [] }) => {
    const calls = [];
    const api = async (method, path) => {
      calls.push(`${method} ${path}`);
      const ref = path.match(/^repos\/owner\/repo\/git\/(?:ref|refs)\/heads\/(.+)$/);
      if (ref) {
        const name = ref[1].split('/').map(decodeURIComponent).join('/');
        if (method === 'GET') {
          if (!(name in refs)) throw new Error('Not Found (HTTP 404)');
          return `${refs[name]}\n`;
        }
        if (failDelete.includes(name)) throw new Error('boom (HTTP 422)\nsecond line');
        return '';
      }
      const head = decodeURIComponent(path.match(/head=([^&]+)/)[1]);
      return String(openPrs.includes(head.replace('owner:', '')) ? 1 : 0);
    };
    return { api, calls };
  };
  const plannedOf = (...names) => names.map((name) => ({ name, sha: `sha-${name}` }));

  it('deletes branches whose tip still matches and reports the counts', async () => {
    const { api, calls } = makeApi({ refs: { 'feat/a': 'sha-feat/a' } });
    const out = await deletePlannedBranches({ planned: plannedOf('feat/a'), repo, api });
    expect(out.counts).toEqual({ deleted: 1, skipped: 0, failed: 0 });
    expect(out.failed).toBe(false);
    expect(calls).toContain('DELETE repos/owner/repo/git/refs/heads/feat/a');
    expect(out.summary).toContain('Deleted: 1. Skipped: 0. Failed: 0.');
  });

  it('skips and never deletes a branch whose tip moved since the plan', async () => {
    const { api, calls } = makeApi({ refs: { 'feat/a': 'newer' } });
    const out = await deletePlannedBranches({ planned: plannedOf('feat/a'), repo, api });
    expect(out.results[0]).toMatchObject({ status: 'skipped' });
    expect(out.results[0].detail).toContain('moved to newer');
    expect(calls.some((call) => call.startsWith('DELETE'))).toBe(false);
  });

  it('skips a branch that gained an open pull request', async () => {
    const { api, calls } = makeApi({ refs: { 'feat/a': 'sha-feat/a' }, openPrs: ['feat/a'] });
    const out = await deletePlannedBranches({ planned: plannedOf('feat/a'), repo, api });
    expect(out.results[0].detail).toContain('pull request is open');
    expect(calls.some((call) => call.startsWith('DELETE'))).toBe(false);
  });

  it('treats an empty, missing or non-numeric open-PR answer as an error, never as no pull request', async () => {
    for (const answer of ['', undefined, 'abc', ' ', '-1', '1.5', 'NaN']) {
      const calls = [];
      const api = async (method, path) => {
        calls.push(`${method} ${path}`);
        if (path.includes('/git/ref/')) return 'sha-feat/a\n';
        if (path.includes('/pulls?')) return answer;
        return '';
      };
      const out = await deletePlannedBranches({ planned: plannedOf('feat/a'), repo, api });
      expect(out.results[0]).toMatchObject({ status: 'skipped', detail: 'could not confirm that no pull request is open' });
      expect(calls.some((call) => call.startsWith('DELETE'))).toBe(false);
    }
  });

  it('deletes only when the open-PR answer is the number 0', async () => {
    const reply = (answer) => async (method, path) => {
      if (path.includes('/git/ref/')) return 'sha-feat/a';
      return path.includes('/pulls?') ? answer : '';
    };
    const zero = await deletePlannedBranches({ planned: plannedOf('feat/a'), repo, api: reply('0') });
    expect(zero.counts.deleted).toBe(1);
    const zeroNumber = await deletePlannedBranches({ planned: plannedOf('feat/a'), repo, api: reply(0) });
    expect(zeroNumber.counts.deleted).toBe(1);
    const one = await deletePlannedBranches({ planned: plannedOf('feat/a'), repo, api: reply('1') });
    expect(one.results[0].detail).toContain('pull request is open');
  });

  it('refuses invalid names and main without calling the API', async () => {
    const { api, calls } = makeApi({ refs: {} });
    const out = await deletePlannedBranches({ planned: plannedOf('main', 'feat/$(id)', '-rf'), repo, api });
    expect(out.counts).toEqual({ deleted: 0, skipped: 3, failed: 0 });
    expect(out.summary).toContain('refused: unsafe name');
    expect(calls).toEqual([]);
  });

  it('encodes the head filter of the open-PR lookup and keeps ref slashes in the ref path', async () => {
    const { api, calls } = makeApi({ refs: { 'feat/a.b-c': 'sha-feat/a.b-c' } });
    await deletePlannedBranches({ planned: plannedOf('feat/a.b-c'), repo, api });
    expect(calls).toContain('GET repos/owner/repo/pulls?state=open&per_page=1&head=owner%3Afeat%2Fa.b-c');
    expect(calls).toContain('GET repos/owner/repo/git/ref/heads/feat/a.b-c');
  });

  it('continues after a failure, records every branch and flags the run as failed', async () => {
    const refs = { 'feat/a': 'sha-feat/a', 'feat/b': 'sha-feat/b', 'feat/c': 'sha-feat/c', 'feat/d': 'moved' };
    const { api } = makeApi({ refs, failDelete: ['feat/b'] });
    const out = await deletePlannedBranches({ planned: plannedOf('feat/a', 'feat/b', 'feat/c', 'feat/d', 'feat/gone'), repo, api });
    expect(out.results.map((entry) => entry.status)).toEqual(['deleted', 'failed', 'deleted', 'skipped', 'failed']);
    expect(out.counts).toEqual({ deleted: 2, skipped: 1, failed: 2 });
    expect(out.failed).toBe(true);
    expect(out.summary).toContain('Deleted: 2. Skipped: 1. Failed: 2.');
    expect(out.summary).not.toContain('second line');
  });
});

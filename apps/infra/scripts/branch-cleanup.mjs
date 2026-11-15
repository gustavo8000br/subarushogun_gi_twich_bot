#!/usr/bin/env node
// Weekly remote branch cleanup (P5). The selection logic is pure (selectBranchesToDelete) so it can be
// tested with fixtures; the GitHub/git calls live in the CLI section below and never use a shell.
import { execFile } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const MAX_DELETIONS = 20;
export const MIN_AGE_DAYS = 7;
// Only plain ref names are ever deleted; anything else is reported and skipped (names are data, not code).
const SAFE_BRANCH_NAME = /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/;

/**
 * Decides dry run vs real deletion from the raw workflow inputs. Fail-safe and case-sensitive: the only way
 * to delete is an exact 'false' dispatch input, or (on any other event) the variable being exactly 'true'.
 * Anything else ('TRUE', ' true', '1', '', missing) stays a dry run. Actions' `==` ignores case, so the
 * comparison lives here instead of in the workflow expression.
 * @param {{EVENT_NAME?:string, DISPATCH_DRY_RUN?:string, BRANCH_CLEANUP_ENABLED?:string}} env
 */
export function resolveDryRun(env) {
  if (env.EVENT_NAME === 'workflow_dispatch') return env.DISPATCH_DRY_RUN !== 'false';
  return env.BRANCH_CLEANUP_ENABLED !== 'true';
}

export function isSafeBranchName(name) {
  return typeof name === 'string'
    && name.length <= 200
    && SAFE_BRANCH_NAME.test(name)
    && !name.includes('..')
    && !name.includes('//')
    && !name.endsWith('/')
    && !name.endsWith('.lock');
}

/**
 * @param {object} input
 * @param {Array<{name:string, sha:string, protected:boolean, merged:boolean, date:string}>} input.branches
 *   `merged` means the branch tip is an ancestor of the default branch; `date` is the tip commit date (ISO).
 * @param {string} input.defaultBranch
 * @param {Iterable<string>} input.openPrHeads names of branches that are the head of an open PR
 * @param {Date} input.now
 * @param {number} [input.limit]
 * @param {number} [input.minAgeDays]
 */
export function selectBranchesToDelete({
  branches, defaultBranch, openPrHeads, now, limit = MAX_DELETIONS, minAgeDays = MIN_AGE_DAYS,
}) {
  const openHeads = new Set(openPrHeads);
  const skipped = [];
  const candidates = [];
  const cutoff = now.getTime() - minAgeDays * 24 * 60 * 60 * 1000;
  for (const branch of branches) {
    const skip = (reason) => skipped.push({ name: branch.name, reason });
    if (branch.name === 'main' || branch.name === defaultBranch) skip('default-branch');
    else if (branch.protected) skip('protected');
    else if (openHeads.has(branch.name)) skip('open-pr');
    else if (!isSafeBranchName(branch.name)) skip('unsafe-name');
    else if (!branch.merged) skip('not-merged');
    else if (!Number.isFinite(Date.parse(branch.date)) || Date.parse(branch.date) > cutoff) skip('too-recent');
    else candidates.push(branch);
  }
  candidates.sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.name.localeCompare(b.name));
  const selected = candidates.slice(0, limit);
  const overflow = candidates.slice(limit).map((branch) => branch.name);
  return { selected, skipped, overflow };
}

export function renderPlanSummary({ selected, skipped, overflow }, { dryRun, limit = MAX_DELETIONS }) {
  const lines = [`## Branch cleanup plan (${dryRun ? 'dry run: nothing is deleted' : 'deletion enabled'})`, ''];
  if (selected.length === 0) lines.push('No fully merged branch qualifies for deletion.');
  else {
    lines.push('| Branch | Tip commit | Last commit date |', '| --- | --- | --- |');
    for (const branch of selected) lines.push(`| \`${branch.name}\` | \`${branch.sha}\` | ${branch.date} |`);
    lines.push('', 'Restore a deleted branch with `git push origin <tip commit>:refs/heads/<branch>`.');
  }
  if (overflow.length > 0) {
    lines.push('', `Warning: more than ${limit} branches qualify. The ${limit} oldest are listed; ${overflow.length} remain for the next run.`);
  }
  if (skipped.some((entry) => entry.reason === 'unsafe-name')) {
    lines.push('', `Skipped for an unsafe name: ${skipped.filter((entry) => entry.reason === 'unsafe-name').length} branch(es). Review them manually.`);
  }
  return `${lines.join('\n')}\n`;
}

// --- CLI (GitHub API + git); not unit tested, exercised by the real workflow run ---

const encodeRefPath = (name) => name.split('/').map(encodeURIComponent).join('/');

async function gh(args) {
  const { stdout } = await run('gh', args, { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

async function ghJson(args) {
  const text = await gh(args);
  // `--paginate` with `--jq '.[]'` emits one JSON document per line.
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

async function isAncestor(sha, ref) {
  try {
    await run('git', ['merge-base', '--is-ancestor', sha, ref]);
    return true;
  } catch {
    return false;
  }
}

function writeOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

function writeSummary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  else process.stdout.write(`${text}\n`);
}

async function plan() {
  const repo = process.env.GITHUB_REPOSITORY;
  const dryRun = resolveDryRun(process.env);
  const defaultBranch = (await gh(['api', `repos/${repo}`, '--jq', '.default_branch'])).trim();
  const remote = await ghJson(['api', '--paginate', `repos/${repo}/branches?per_page=100`, '--jq',
    '.[] | {name: .name, sha: .commit.sha, protected: .protected}']);
  const prs = await ghJson(['api', '--paginate', `repos/${repo}/pulls?state=open&per_page=100`, '--jq',
    '.[] | {head: .head.ref}']);
  const openPrHeads = prs.map((pr) => pr.head);
  const branches = [];
  for (const branch of remote) {
    const eligible = branch.name !== defaultBranch && branch.name !== 'main' && !branch.protected
      && !openPrHeads.includes(branch.name) && isSafeBranchName(branch.name);
    let merged = false;
    let date = '';
    if (eligible) {
      merged = await isAncestor(branch.sha, `origin/${defaultBranch}`);
      if (merged) {
        const commit = await gh(['api', `repos/${repo}/commits/${branch.sha}`, '--jq', '.commit.committer.date']);
        date = commit.trim();
      }
    }
    branches.push({ ...branch, merged, date });
  }
  const result = selectBranchesToDelete({ branches, defaultBranch, openPrHeads, now: new Date() });
  writeSummary(renderPlanSummary(result, { dryRun }));
  writeOutput('dry_run', String(dryRun));
  writeOutput('count', String(result.selected.length));
  writeOutput('plan', JSON.stringify(result.selected.map(({ name, sha, date }) => ({ name, sha, date }))));
}

const cell = (value) => String(value).replace(/[^\w./-]/g, '?');

/**
 * Deletes the planned branches one by one. `api(method, path, jq)` is injected (the real one calls `gh api`)
 * so the whole path is testable. A failure on one branch is recorded and the loop continues.
 * @returns {Promise<{results: Array<{name:string, sha:string, status:'deleted'|'skipped'|'failed', detail:string}>,
 *   counts: {deleted:number, skipped:number, failed:number}, summary:string, failed:boolean}>}
 */
export async function deletePlannedBranches({ planned, repo, api }) {
  const owner = repo.split('/')[0];
  const results = [];
  const record = (name, sha, status, detail) => results.push({ name, sha, status, detail });
  for (const { name, sha } of planned) {
    if (!isSafeBranchName(name) || name === 'main') {
      record(cell(name), sha, 'skipped', 'refused: unsafe name');
      continue;
    }
    try {
      const encoded = encodeRefPath(name);
      const current = String(await api('GET', `repos/${repo}/git/ref/heads/${encoded}`, '.object.sha')).trim();
      if (current !== sha) {
        record(name, sha, 'skipped', `the branch moved to ${current} since the plan`);
        continue;
      }
      const answer = String(await api(
        'GET', `repos/${repo}/pulls?state=open&per_page=1&head=${encodeURIComponent(`${owner}:${name}`)}`, 'length',
      )).trim();
      // Only a plain count is an answer. An empty or garbled reply is an error, never "no pull request".
      if (!/^\d+$/.test(answer)) {
        record(name, sha, 'skipped', 'could not confirm that no pull request is open');
        continue;
      }
      if (Number(answer) !== 0) {
        record(name, sha, 'skipped', 'a pull request is open for this branch');
        continue;
      }
      await api('DELETE', `repos/${repo}/git/refs/heads/${encoded}`);
      record(name, sha, 'deleted', 'deleted');
    } catch (error) {
      record(name, sha, 'failed', `failed: ${String(error.message).split('\n')[0].slice(0, 160)}`);
    }
  }
  const counts = { deleted: 0, skipped: 0, failed: 0 };
  for (const result of results) counts[result.status] += 1;
  const lines = ['## Branch cleanup result', '', '| Branch | Tip commit | Result |', '| --- | --- | --- |'];
  for (const result of results) lines.push(`| \`${result.name}\` | \`${result.sha}\` | ${result.status}: ${result.detail} |`);
  lines.push('', `Deleted: ${counts.deleted}. Skipped: ${counts.skipped}. Failed: ${counts.failed}.`);
  return { results, counts, summary: lines.join('\n'), failed: counts.failed > 0 };
}

async function deletePlanned() {
  const repo = process.env.GITHUB_REPOSITORY;
  const planned = JSON.parse(process.env.PLAN || '[]');
  const api = (method, path, jq) => gh(['api', '--method', method, path, ...(jq ? ['--jq', jq] : [])]);
  const outcome = await deletePlannedBranches({ planned, repo, api });
  writeSummary(outcome.summary);
  if (outcome.failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2];
  try {
    if (command === 'plan') await plan();
    else if (command === 'delete') await deletePlanned();
    else throw new Error('Usage: branch-cleanup.mjs <plan|delete>');
  } catch (error) {
    process.stderr.write(`Branch cleanup failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

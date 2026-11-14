#!/usr/bin/env node
'use strict';

/**
 * Read-only Bash allowlist for the AIOX read agents (aiox-search, aiox-grep,
 * aiox-audit). Fail-closed: anything not explicitly allowed is denied.
 * Usage in agent frontmatter: node ".../read-only-bash-guard.cjs" --role=audit
 *
 * Besides the command allowlist it keeps the agents inside the repository
 * (no absolute paths that exist outside it, no `~`, no `..`, no symlink
 * escape, glob and brace expansion checked), away from credential files, and
 * away from options that run a program or write a file. It is a guardrail:
 * the hook sees the command text, not what a child process does (AGENTS.md,
 * "Limite dos hooks").
 */

const fs = require('node:fs');
const path = require('node:path');
const { splitSegments, baseName } = require(path.join(__dirname, 'lib', 'shell-words.cjs'));

const READ_COMMANDS = new Set([
  'grep', 'rg', 'ugrep', 'ls', 'find', 'wc', 'head', 'tail', 'cat', 'sed', 'sort', 'uniq', 'cut', 'tr',
  'diff', 'cmp', 'stat', 'file', 'jq', 'sha256sum', 'basename', 'dirname', 'realpath', 'tree', 'pwd',
  'echo', 'printf', 'test', 'true',
]);
const GREP_FAMILY = new Set(['grep', 'rg', 'ugrep']);
const GIT_READ_VERBS = new Set([
  'status', 'log', 'show', 'diff', 'grep', 'ls-files', 'ls-tree', 'rev-parse', 'branch', 'blame', 'cat-file',
  'merge-base', 'describe', 'shortlog', 'worktree', 'stash', 'remote', 'config', 'rev-list', 'name-rev',
]);
// The audit agent may run only these fixed project scripts. They execute
// project code (lint rules, type checks); the hook cannot see inside them,
// so `npx vitest` is not offered (AGENTS.md, "Limite dos hooks").
const AUDIT_NPM_SCRIPTS = new Set([
  'lint', 'typecheck', 'typecheck:api', 'typecheck:infra', 'typecheck:frontend',
  'validate:localization', 'validate:version', 'validate:port-denylist', 'review:static',
]);
const SECRET_PATH = new RegExp([
  '(^|/)\\.env(\\.[\\w.-]+)?$',
  '^(\\./)?(runtime-secrets|backups|data)(/|$)',
  '\\.(pem|key)$',
  '(^|/)(\\.npmrc|\\.netrc|\\.pgpass|\\.git-credentials|\\.ssh|\\.aws|\\.gnupg|\\.kube|\\.claude\\.json|hosts\\.yml)(/|$)',
  '(^|/)\\.docker/config\\.json$',
  '(^|/)\\.config/gh(/|$)',
  '(^|/)id_(rsa|dsa|ecdsa|ed25519)(\\.pub)?$',
  '(^|/)\\.git/config$',
  '(^|/)\\.claude/settings\\.local\\.json$',
].join('|'));
const VARIABLE_REFERENCE = /\$(\{|[A-Za-z_@*#?!$0-9])/;
const SED_COMMAND_LETTER = /(^|[;{}!\s\d$,])[rRwWeE](\s+\S|$|;)/;
const SED_S_FLAG = /s([^\w\s])(?:(?!\1).)*\1(?:(?!\1).)*\1[a-zA-Z0-9]*[wWeE]/;

function deny(reason) {
  return { ok: false, reason };
}

function isInside(candidate, root) {
  return candidate === root || candidate.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
}

function safeRealpath(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return null;
  }
}

function segmentToRegExp(segment) {
  let source = '';
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index];
    if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else if (char === '[') {
      const end = segment.indexOf(']', index + 2);
      if (end === -1) source += '\\[';
      else {
        source += `[${segment.slice(index + 1, end).replace(/^!/, '^').replace(/\\/g, '\\\\')}]`;
        index = end;
      }
    } else source += char.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

/** Expand a glob the way a shell would (dotfiles only when the segment starts with a dot). */
function expandGlob(pattern, cwd) {
  const absolute = pattern.startsWith('/');
  let current = [{ shown: absolute ? '/' : '', real: absolute ? '/' : cwd }];
  for (const segment of pattern.split('/').filter((part) => part !== '' && part !== '.')) {
    const next = [];
    for (const base of current) {
      const join = (name) => ({ shown: base.shown === '' ? name : `${base.shown}${base.shown.endsWith('/') ? '' : '/'}${name}`, real: path.join(base.real, name) });
      if (!/[*?[]/.test(segment)) {
        const entry = join(segment);
        if (fs.existsSync(entry.real)) next.push(entry);
        continue;
      }
      let matcher;
      try {
        matcher = segmentToRegExp(segment);
      } catch {
        continue;
      }
      let names = [];
      try {
        names = fs.readdirSync(base.real);
      } catch {
        names = [];
      }
      for (const name of names) {
        if (matcher.test(name) && (segment.startsWith('.') || !name.startsWith('.'))) next.push(join(name));
      }
    }
    current = next.slice(0, 2000);
  }
  return current;
}

function braceExpand(token, depth = 0) {
  const match = token.match(/^(.*?)\{([^{}]*,[^{}]*)\}(.*)$/s);
  if (!match || depth > 3) return [token];
  return match[2].split(',').slice(0, 20).flatMap((alternative) => braceExpand(`${match[1]}${alternative}${match[3]}`, depth + 1));
}

function checkPathCandidate(candidate) {
  if (!candidate) return null;
  if (/^~/.test(candidate)) return 'paths in the home directory are not readable by read agents';
  if (candidate.split('/').includes('..')) return 'parent directory paths are not readable by read agents';
  if (SECRET_PATH.test(candidate) && !/\.example$/.test(candidate)) return 'secret or data paths are not readable by read agents';
  return null;
}

function checkPathTokens(texts, ctx, skipGlobAt) {
  for (let position = 0; position < texts.length; position += 1) {
    const token = texts[position];
    const raw = [token];
    if (token.startsWith('-') && token.includes('=')) raw.push(token.slice(token.indexOf('=') + 1));
    // `HEAD:.env`, `:.env`: a revision plus a path (git show, git cat-file).
    if (!token.startsWith('-') && token.includes(':')) raw.push(token.slice(token.indexOf(':') + 1));
    for (const value of raw.flatMap((item) => braceExpand(item))) {
      const problem = checkPathCandidate(value);
      if (problem) return problem;
      if (value.startsWith('-')) continue;
      const hasGlob = /[*?[]/.test(value);
      if (hasGlob && position !== skipGlobAt) {
        for (const entry of expandGlob(value, ctx.cwd)) {
          const shown = entry.shown;
          if (SECRET_PATH.test(shown) && !/\.example$/.test(shown)) return 'secret or data paths are not readable by read agents';
          const real = safeRealpath(entry.real);
          if (real && !isInside(real, ctx.rootReal)) return 'paths outside the repository are not readable by read agents';
        }
        continue;
      }
      if (hasGlob) continue;
      const full = path.resolve(ctx.cwd, value);
      if (!fs.existsSync(full)) continue;
      const real = safeRealpath(full);
      if (real && !isInside(real, ctx.rootReal)) return 'paths outside the repository are not readable by read agents';
    }
  }
  return null;
}

function checkGit(args) {
  if (args.some((a) => a === '-c' || a.startsWith('--config-env') || a.startsWith('--exec-path') || a.startsWith('--git-dir') || a.startsWith('--work-tree')
    || /^--ou/.test(a) || a.startsWith('-O') || a.startsWith('--open-files-in-pager') || a.startsWith('--ext-diff') || a.startsWith('--textconv'))) {
    return deny('git option not allowed for read agents');
  }
  let index = 0;
  while (index < args.length && args[index].startsWith('-')) index += args[index] === '-C' ? 2 : 1;
  const verb = args[index];
  const rest = args.slice(index + 1);
  if (!GIT_READ_VERBS.has(verb)) return deny(`git ${verb || ''} is not a read verb`);
  if (verb === 'branch' && rest.some((a) => !/^(--show-current|-a|-r|-v|-vv|--list|--contains|--merged|--no-merged|--all)$/.test(a) && !a.startsWith('--format') && !a.startsWith('--sort'))) {
    return deny('git branch may only list');
  }
  if (verb === 'worktree' && rest[0] !== 'list') return deny('git worktree may only list');
  if (verb === 'stash' && rest[0] !== 'list') return deny('git stash may only list');
  if (verb === 'remote' && !(rest.length === 0 || rest[0] === '-v' || rest[0] === 'get-url')) return deny('git remote may only list');
  if (verb === 'config' && !rest.some((a) => ['--get', '--get-all', '--get-regexp', '-l', '--list'].includes(a))) return deny('git config may only read');
  return { ok: true };
}

/**
 * True when the command has an unquoted redirection (output or input), a
 * process substitution, or a command substitution (`$(...)` or backticks,
 * which the shell also runs inside double quotes). Quoted `>` in a grep
 * pattern is fine.
 */
function hasUnsafeShellSyntax(raw) {
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];
    if (char === '\\' && !inSingle) {
      index += 1;
      continue;
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (inSingle) continue;
    if (char === '`' || (char === '$' && next === '(')) return true;
    if (!inDouble && (char === '>' || char === '<')) return true;
    if (!inDouble && char === '&' && next !== '&' && raw[index - 1] !== '&') return true;
  }
  return false;
}

function checkOptions(name, args) {
  const some = (test) => args.some(test);
  if (name === 'find' && some((a) => /^-(delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)$/.test(a))) return 'find actions are not allowed';
  if (name === 'sed') {
    if (!args.includes('-n') || some((a) => a.startsWith('-i') || a.startsWith('--in-place') || /^-[a-zA-Z]*i/.test(a))) return 'sed must be "sed -n" without in-place';
    // The script is the value of -e/--expression, or else the first non-option word.
    const scripts = [];
    args.forEach((a, position) => {
      if (a === '-e' || a === '--expression') scripts.push(args[position + 1] || '');
      else if (a.startsWith('--expression=')) scripts.push(a.slice('--expression='.length));
    });
    if (scripts.length === 0) scripts.push(args.find((a) => !a.startsWith('-')) || '');
    if (scripts.some((a) => SED_COMMAND_LETTER.test(a) || SED_S_FLAG.test(a))) return 'sed commands r, R, w, W and e are not allowed';
  }
  if (name === 'tail' && some((a) => /^-(f|F)$|^--follow/.test(a))) return 'tail -f is not allowed';
  if (name === 'sort' && some((a) => /^--(o|comp|te)/.test(a) || /^-[a-zA-Z]*[oT]/.test(a))) return 'sort output, temporary directory and compress program options are not allowed';
  if (name === 'tree' && some((a) => /^-[a-zA-Z]*[oR]/.test(a) || a.startsWith('--fromfile'))) return 'tree output options are not allowed';
  if (name === 'uniq' && args.filter((a) => !a.startsWith('-')).length > 1) return 'uniq with an output file is not allowed';
  if (name === 'rg' && some((a) => /^--(pre|search-zip|hostname-bin)/.test(a) || /^-[a-zA-Z]*z/.test(a))) return 'rg options that run a program are not allowed';
  if (name === 'ugrep' && some((a) => /^--(fil|save-config|pager|query)/.test(a) || /^-[a-zA-Z]*Q/.test(a))) return 'ugrep options that run a program or write a file are not allowed';
  if (name === 'file' && some((a) => a === '--compile' || /^-[a-zA-Z]*C/.test(a))) return 'file --compile is not allowed';
  if (name === 'jq' && some((a) => /\benv\b|\$ENV|input_filename|\$__prog_args/.test(a))) return 'jq may not read the environment';
  return null;
}

function patternIndex(name, texts) {
  if (!GREP_FAMILY.has(name)) return -1;
  if (texts.some((t) => t === '-e' || t === '-f' || t === '--regexp' || t === '--file' || t.startsWith('--regexp=') || t.startsWith('--file='))) return -1;
  return texts.findIndex((t) => !t.startsWith('-'));
}

const RECURSIVE_SKIP = new Set(['node_modules', '.next', 'coverage']);

/**
 * A recursive content search reads every file under its directories, so the
 * secret-path rule must apply to what the recursion would reach, not only to the
 * words typed. Walks the directories (bounded) and reports the first secret path.
 */
function recursiveSecretProblem(name, args, ctx) {
  const recursive = name === 'rg'
    || args.some((a, i) => /^(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive|--dereference-recursive|--directories=recurse)$/.test(a) || (a === '-d' && args[i + 1] === 'recurse'));
  if (!recursive) return null;
  const skip = patternIndex(name, args);
  const candidates = args.filter((a, i) => !a.startsWith('-') && i !== skip).map((a) => path.resolve(ctx.cwd, a)).filter((full) => fs.existsSync(full));
  const roots = candidates.length > 0 ? candidates : [ctx.cwd];
  let budget = 50000;
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      if ((budget -= 1) < 0) return 'recursive search is too large to verify; name a subdirectory';
      const full = path.join(dir, entry.name);
      const shown = path.relative(ctx.root, full).split(path.sep).join('/');
      if (entry.name === '.git') {
        if (fs.existsSync(path.join(full, 'config'))) return 'recursive search would reach secret or data paths; name a subdirectory';
        continue;
      }
      if (SECRET_PATH.test(shown) && !/\.example$/.test(shown)) return 'recursive search would reach secret or data paths; name a subdirectory';
      if (entry.isDirectory() && !RECURSIVE_SKIP.has(entry.name)) {
        const inner = walk(full);
        if (inner) return inner;
      }
    }
    return null;
  };
  for (const root of roots) {
    const shown = path.relative(ctx.root, root).split(path.sep).join('/');
    if (shown && SECRET_PATH.test(shown) && !/\.example$/.test(shown)) return 'recursive search would reach secret or data paths; name a subdirectory';
    try {
      if (!fs.statSync(root).isDirectory()) continue;
    } catch {
      continue;
    }
    const found = walk(root);
    if (found) return found;
  }
  return null;
}

function checkSegment(words, role, ctx) {
  if (words.length === 0) return { ok: true };
  // A program name built at run time is never allowed.
  if (words[0].dynamic) return deny('a program name built at run time is not allowed');
  const texts = words.map((word) => word.text);
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(texts[0])) return deny('environment assignment is not allowed');
  // A variable reference can name any path or print a secret; a bare `$` in a regex is fine.
  if (words.slice(1).some((word) => word.dynamic && VARIABLE_REFERENCE.test(word.text))) return deny('variable references are not allowed');
  const name = baseName(texts[0]);
  const args = texts.slice(1);
  const problem = checkPathTokens(args, ctx, patternIndex(name, args));
  if (problem) return deny(problem);

  if (name === 'git') return checkGit(args);
  if (name === 'npm') {
    if (role === 'audit' && args.length === 2 && args[0] === 'run' && AUDIT_NPM_SCRIPTS.has(args[1])) return { ok: true };
    return deny('npm is allowed only for the audit checks listed in the agent definition');
  }
  if (name === 'npx') return deny('npx is not allowed for read agents');
  if (!READ_COMMANDS.has(name)) return deny(`${name} is not in the read-only allowlist`);
  const optionProblem = checkOptions(name, args);
  if (optionProblem) return deny(optionProblem);
  if (GREP_FAMILY.has(name)) {
    const recursiveProblem = recursiveSecretProblem(name, args, ctx);
    if (recursiveProblem) return deny(recursiveProblem);
  }
  return { ok: true };
}

function buildContext(ctx) {
  const root = String((ctx && ctx.root) || process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const cwd = String((ctx && ctx.cwd) || root);
  return { root, cwd, rootReal: safeRealpath(root) || root };
}

/**
 * @param {string} command
 * @param {string} role search | grep | audit
 * @param {{ root?: string, cwd?: string }} [context]
 */
function checkCommand(command, role, context) {
  const ctx = buildContext(context);
  const raw = String(command || '').replace(/(^|\s)2>\s*\/dev\/null(?=\s|$)/g, '$1');
  if (hasUnsafeShellSyntax(raw)) return deny('redirection, background jobs and command substitution are not allowed');
  for (const segment of splitSegments(raw)) {
    const verdict = checkSegment(segment, role, ctx);
    if (!verdict.ok) return verdict;
  }
  return { ok: true };
}

function main() {
  const roleArg = process.argv.find((arg) => arg.startsWith('--role='));
  const role = roleArg ? roleArg.slice('--role='.length) : 'search';
  let input = null;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8') || 'null');
  } catch {
    input = null;
  }
  const command = input && input.tool_input ? input.tool_input.command : '';
  const verdict = input ? checkCommand(command, role, { cwd: input.cwd }) : deny('no readable hook input');
  if (verdict.ok) return;
  const reason = `Read-only agent (${role}): ${verdict.reason}. Ask the orchestrator instead.`;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
  process.stderr.write(reason);
  process.exitCode = 2;
}

if (require.main === module) main();

module.exports = { checkCommand };

#!/usr/bin/env node
'use strict';

/**
 * Project PreToolUse guard for Git/GitHub authority (SubaruShogun Twitch Bot).
 *
 * Deny by default for everyone who is not @devops (owner decision 2026-11-14):
 * a Git/GitHub command is let through for a non-devops caller only when it is
 * on the read allowlist below. Everything else is a write class or "U".
 *
 *   A  remote publication (push, PR/issue writes, gh api writes)  -> @devops only
 *   B  local history/state writes (add, commit, stash, fetch...)   -> @devops only
 *   C  owner-reserved (merge PR, release, tags, push to main,
 *      rare issue/PR comments, dynamic push targets)               -> ask the owner
 *   D  destructive or forbidden (force push, reset --hard, alias,
 *      config/env that runs code, hook bypass)                     -> deny for all
 *   E  not verifiable (git/gh verb built at run time)              -> deny for all
 *   U  not on the read allowlist (unlisted git/gh verb or group)    -> @devops only
 *   G  write to a governance file through the shell                -> ask (deny for subagents)
 * Writes to the guard's own files with the Write/Edit tools (.claude/settings.json,
 * hooks, agents) -> ask.
 *
 * Identity: the subagent type supplied by the harness in the hook input
 * (`agent_type`), or AIOX_ACTIVE_AGENT in the Claude Code process
 * environment for the main session. A prefix typed inside the command is
 * ignored on purpose. Without a subagent type the caller is the main session.
 *
 * This is a governance guardrail, not a security boundary: the hook sees the
 * command text only. Child processes it starts (`npm run`, `npx`, `node`,
 * interpreters, build tools) run code the hook never inspects, so credentials
 * and branch protection are the real boundary (AGENTS.md, "Limite dos hooks").
 * Messages never contain paths, user names or host names.
 */

const fs = require('node:fs');
const path = require('node:path');
const { commandSegments, baseName, hasOutputRedirect } = require(path.join(__dirname, 'lib', 'shell-words.cjs'));

const DEVOPS_AGENT_TYPES = new Set(['aiox-devops']);
const DEVOPS_ENV_IDS = new Set(['devops', '@devops', 'aiox-devops', 'gage']);
const GOVERNANCE_PATHS = [/^\.claude\/settings(\.local)?\.json$/, /^\.claude\/hooks\//, /^\.claude\/agents\//];
const GOVERNANCE_IN_WORD = /\.claude\/(settings(\.local)?\.json|hooks(\/|$)|agents(\/|$))/;
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

const GIT_OPTIONS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix']);
const GIT_HISTORY_VERBS = new Set([
  'add', 'commit', 'merge', 'rebase', 'cherry-pick', 'revert', 'am', 'rm', 'mv', 'update-ref', 'replace', 'pull', 'gc',
  'fetch', 'commit-tree', 'write-tree', 'mktree', 'update-index', 'read-tree',
]);
const GIT_DESTRUCTIVE_VERBS = new Set(['filter-branch', 'filter-repo']);
// Read allowlist for non-devops callers. Verbs with sub-rules are handled in the switch.
const GIT_READ_VERBS = new Set([
  'status', 'log', 'show', 'diff', 'grep', 'ls-files', 'ls-tree', 'rev-parse', 'blame', 'cat-file', 'merge-base', 'describe',
  'shortlog', 'rev-list', 'name-rev', 'ls-remote', 'show-ref', 'for-each-ref', 'show-branch', 'diff-tree', 'diff-index',
  'diff-files', 'check-ignore', 'check-attr', 'count-objects', 'var', 'whatchanged', 'range-diff', 'cherry', 'verify-commit',
  'verify-tag', 'version', 'help', 'fsck', 'get-tar-commit-id', 'check-ref-format', 'merge-tree', 'show-index', 'annotate',
]);
// Config keys that make Git run a program or change identity/transport.
const CODE_CONFIG = /^(core\.(hookspath|sshcommand|fsmonitor|pager|editor|askpass|gitproxy)|credential\.|sequence\.editor|diff\.(external|[^=]*\.(textconv|command))|merge\.[^=]*\.driver|filter\.|include\.|includeif\.|url\.|http\.proxy|protocol\.|gpg\.|pager\.)/i;
const READ_UNSAFE_OPTION = /^--(output|open-files-in-pager|ext-diff|textconv|exec)/;
// Environment variables that redirect Git config, hooks, transport or identity.
const ENV_BYPASS = /^(GIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+|PARAMETERS|GLOBAL|SYSTEM|NOSYSTEM)|GIT_(SSH|SSH_COMMAND|EXTERNAL_DIFF|PAGER|ASKPASS|EXEC_PATH|DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|TEMPLATE_DIR|PROXY_COMMAND)|SSH_ASKPASS|GH_(TOKEN|ENTERPRISE_TOKEN|HOST|PAGER|EDITOR|BROWSER|CONFIG_DIR)|GITHUB_(TOKEN|ENTERPRISE_TOKEN)|HOME|XDG_CONFIG_HOME)=/;
const ENV_EXPORTERS = new Set(['export', 'declare', 'typeset', 'readonly', 'local', 'set', 'setenv']);

const GH_OPTIONS_WITH_VALUE = new Set(['-R', '--repo', '--hostname']);
// Groups with no write subcommand at all. `ruleset` and `attestation` are checked
// subcommand by subcommand in GH_READ_SUBS.
const GH_READ_GROUPS = new Set(['search', 'browse', 'status', 'help', 'version', 'completion']);
// Read subcommands for non-devops callers. A group or subcommand outside this
// table and outside GH_WRITE_TABLE is class U.
const GH_READ_SUBS = {
  pr: ['view', 'list', 'status', 'diff', 'checks'],
  issue: ['view', 'list', 'status'],
  release: ['view', 'list'],
  repo: ['view', 'list'],
  label: ['list'],
  project: ['list', 'view', 'field-list', 'item-list'],
  workflow: ['list', 'view'],
  run: ['list', 'view', 'watch'],
  cache: ['list'],
  secret: ['list'],
  variable: ['list', 'get'],
  'ssh-key': ['list'],
  'gpg-key': ['list'],
  gist: ['list', 'view'],
  auth: ['status'],
  alias: ['list'],
  extension: ['list', 'search', 'browse'],
  config: ['get', 'list'],
  org: ['list'],
  ruleset: ['list', 'view', 'check'],
  attestation: ['download', 'inspect', 'verify', 'trusted-root'],
};
const GH_WRITE_TABLE = {
  pr: { A: ['create', 'edit', 'ready', 'review', 'close', 'reopen', 'lock', 'unlock', 'update-branch'], C: ['merge', 'comment'] },
  issue: { A: ['create', 'edit', 'close', 'reopen', 'delete', 'transfer', 'lock', 'unlock', 'pin', 'unpin', 'develop'], C: ['comment'] },
  release: { C: ['create', 'edit', 'upload', 'delete-asset'], D: ['delete'] },
  repo: { A: ['sync', 'edit', 'create', 'fork', 'rename', 'archive', 'unarchive', 'deploy-key'], D: ['delete'] },
  label: { A: ['create', 'edit', 'delete', 'clone'] },
  project: { A: ['create', 'edit', 'delete', 'close', 'copy', 'link', 'unlink', 'mark-template', 'item-add', 'item-edit', 'item-delete', 'item-archive', 'item-create', 'field-create', 'field-delete'] },
  workflow: { A: ['run', 'enable', 'disable'] },
  run: { A: ['rerun', 'cancel', 'delete'] },
  cache: { A: ['delete'] },
  secret: { C: ['set', 'delete', 'remove'] },
  variable: { C: ['set', 'delete', 'remove'] },
  'ssh-key': { C: ['add', 'delete'] },
  'gpg-key': { C: ['add', 'delete'] },
  gist: { D: ['create', 'edit', 'delete', 'rename'] },
  auth: { D: ['login', 'logout', 'refresh', 'setup-git', 'token', 'switch'] },
  alias: { D: ['set', 'import', 'delete'] },
  extension: { D: ['install', 'upgrade', 'remove', 'create', 'exec'] },
};

// Programs that only read when called without write options; used by the
// governance-file write check (class G).
const GOVERNANCE_READERS = new Set([
  'cat', 'grep', 'rg', 'ugrep', 'ls', 'head', 'tail', 'wc', 'sha256sum', 'diff', 'cmp', 'stat', 'file', 'jq', 'tree',
  'realpath', 'basename', 'dirname', 'echo', 'printf', 'test', 'true', 'pwd', 'git', 'gh', 'sed', 'find', 'sort', 'uniq',
  'cut', 'tr',
]);

function result(cls, operation) {
  return { cls, operation };
}

function words(list) {
  return list.map((word) => word.text);
}

function classifyGitVerb(verb, args, index) {
  const rest = words(args.slice(index + 1));
  const restWords = args.slice(index + 1);
  const has = (...flags) => rest.some((token) => flags.includes(token));
  const shortCluster = (letter) => rest.some((token) => new RegExp(`^-[a-zA-Z]*${letter}[a-zA-Z]*$`).test(token));

  if (has('--no-verify') || rest.some((token) => /^--no-v/.test(token)) || (verb === 'commit' && shortCluster('n'))) {
    return result('D', `git ${verb} --no-verify`);
  }
  if (GIT_DESTRUCTIVE_VERBS.has(verb)) return result('D', `git ${verb}`);

  switch (verb) {
    case 'push': {
      const targets = rest.filter((token) => !token.startsWith('-'));
      if (
        has('--mirror', '--force-if-includes') || shortCluster('f') || rest.some((t) => /^--for/.test(t) || /^--mi/.test(t))
        || targets.some((t) => t.startsWith('+'))
      ) {
        return result('D', 'git push --force/--mirror');
      }
      if (has('--delete', '--tags', '--follow-tags') || rest.some((t) => /^--(del|ta|fol)/.test(t)) || shortCluster('d') || targets.some((t) => t.startsWith(':'))) {
        return result('C', 'git push (delete or tags)');
      }
      if (targets.some((t) => /(^|:)(refs\/heads\/)?(main|master)$/.test(t) || /^refs\/tags\//.test(t) || /^v\d+\.\d+\.\d+/.test(t))) {
        return result('C', 'git push to main or a tag');
      }
      if (restWords.some((word) => word.dynamic)) return result('C', 'git push (target built at run time)');
      return result('A', 'git push');
    }
    case 'send-pack':
      return result('A', 'git send-pack');
    case 'tag': {
      if (has('-d', '--delete')) return result('C', 'git tag --delete');
      const positional = rest.filter((t) => !t.startsWith('-'));
      const listing = positional.length === 0 || has('-l', '--list');
      return listing ? null : result('C', 'git tag (create)');
    }
    case 'reset':
      if (has('--hard')) return result('D', 'git reset --hard');
      return result('B', 'git reset');
    case 'clean':
      if (has('--force') || shortCluster('f')) return result('D', 'git clean --force');
      return null;
    case 'checkout':
    case 'switch':
    case 'restore': {
      if (verb !== 'restore' && (has('-f', '--force', '--discard-changes') || shortCluster('f'))) return result('D', `git ${verb} --force`);
      const massDiscard = rest.includes('.') || rest.includes(':/') || rest.includes('*');
      if (massDiscard && !has('--staged') && !has('-b', '-B')) return result('D', `git ${verb} (mass discard)`);
      return null;
    }
    case 'branch':
      if (has('-D') || (has('-d', '--delete') && (has('-f', '--force')))) return result('D', 'git branch -D');
      if (has('-d', '--delete')) return result('C', 'git branch --delete');
      if (has('-m', '-M', '--move', '-c', '-C', '--copy')) return result('B', 'git branch (rename/copy)');
      return null;
    case 'stash':
      if (rest[0] === 'drop' || rest[0] === 'clear') return result('D', `git stash ${rest[0]}`);
      if (rest[0] === 'list' || rest[0] === 'show') return null;
      return result('B', 'git stash (write)');
    case 'reflog':
      if (rest[0] === 'expire' || rest[0] === 'delete') return result('D', `git reflog ${rest[0]}`);
      return null;
    case 'notes':
      if (['add', 'edit', 'append', 'copy', 'remove', 'merge', 'prune'].includes(rest[0])) return result('B', 'git notes (write)');
      return null;
    case 'config': {
      const reading = rest.some((t) => ['--get', '--get-all', '--get-regexp', '-l', '--list', 'get', 'list'].includes(t));
      if (reading) return null;
      if (rest.some((t) => /^alias\./i.test(t)) || has('--global', '--system')) return result('D', 'git config (alias/global)');
      return rest.length > 0 ? result('B', 'git config (write)') : null;
    }
    case 'remote':
      if (['add', 'set-url', 'remove', 'rm', 'rename', 'set-head', 'set-branches', 'prune', 'update'].includes(rest[0])) return result('B', `git remote ${rest[0]}`);
      return null;
    case 'worktree':
      if (rest.length === 0 || rest[0] === 'list') return null;
      return result('B', `git worktree ${rest[0]}`);
    case 'submodule':
      if (rest.length === 0 || ['status', 'summary'].includes(rest[0])) return null;
      return result('U', `git submodule ${rest[0]}`);
    case 'apply':
      if (has('--index', '--cached')) return result('B', 'git apply --index');
      return null;
    case 'hash-object':
      return has('-w') || shortCluster('w') ? result('B', 'git hash-object -w') : null;
    case 'symbolic-ref':
      return rest.filter((t) => !t.startsWith('-')).length >= 2 ? result('B', 'git symbolic-ref (write)') : null;
    default:
      if (GIT_HISTORY_VERBS.has(verb)) return result('B', `git ${verb}`);
      if (GIT_READ_VERBS.has(verb)) {
        if (rest.some((t) => READ_UNSAFE_OPTION.test(t)) || (verb === 'grep' && rest.some((t) => t.startsWith('-O')))) {
          return result('U', `git ${verb} (option that writes or runs a program)`);
        }
        return null;
      }
      return result('U', `git ${verb}`);
  }
}

function classifyGit(args) {
  let index = 0;
  let aliasOverride = false;
  let codeConfig = false;
  let configOverride = false;
  const inspectConfig = (value) => {
    configOverride = true;
    if (/^alias\./i.test(value)) aliasOverride = true;
    else if (CODE_CONFIG.test(value)) codeConfig = true;
  };
  while (index < args.length) {
    const text = args[index].text;
    if (GIT_OPTIONS_WITH_VALUE.has(text)) {
      const value = args[index + 1] ? args[index + 1].text : '';
      if (text === '-c' || text === '--config-env') inspectConfig(value);
      index += 2;
      continue;
    }
    const inline = text.match(/^--config-env=(.*)$/);
    if (inline) inspectConfig(inline[1]);
    // `-ccore.pager=x`: the attached form of `-c`.
    if (/^-c.+/.test(text)) inspectConfig(text.slice(2));
    if (/^--exec-path=/.test(text)) codeConfig = true;
    if (text.startsWith('-')) {
      index += 1;
      continue;
    }
    break;
  }
  const verbWord = args[index];
  if (!verbWord) return null;
  if (verbWord.dynamic) return result('E', 'git <verb built at run time>');
  if (aliasOverride) return result('D', 'git -c alias.*');
  if (codeConfig) return result('D', 'git -c <config that runs a program>');

  const verb = verbWord.text.toLowerCase();
  const found = classifyGitVerb(verb, args, index);
  if (found === null && configOverride) return result('U', 'git -c <config override>');
  return found;
}

function readFieldFile(file, ctx) {
  try {
    const full = path.resolve(String((ctx && ctx.cwd) || process.cwd()), String(file));
    if (fs.statSync(full).size > 200000) return null;
    return fs.readFileSync(full, 'utf8');
  } catch {
    return null;
  }
}

function classifyGhApi(args, ctx) {
  const rest = words(args);
  let method = '';
  let hasFields = false;
  let endpoint = '';
  let unreadable = false;
  const texts = [];
  const collect = (value) => {
    const text = String(value || '');
    texts.push(text);
    const fromFile = text.match(/^[^=]+=@(.+)$/);
    if (fromFile) {
      const content = fromFile[1] === '-' ? null : readFieldFile(fromFile[1], ctx);
      if (content === null) unreadable = true;
      else texts.push(content);
    }
  };
  const setInput = (file) => {
    hasFields = true;
    const content = file === '-' ? null : readFieldFile(file, ctx);
    if (content === null) unreadable = true;
    else texts.push(content);
  };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === '-X' || token === '--method') {
      method = String(rest[index + 1] || '').toUpperCase();
      index += 1;
      continue;
    }
    const inline = token.match(/^(?:-X|--method=)(\w+)$/);
    if (inline) {
      method = inline[1].toUpperCase();
      continue;
    }
    if (['-f', '-F', '--field', '--raw-field'].includes(token)) {
      hasFields = true;
      collect(rest[index + 1]);
      index += 1;
      continue;
    }
    const longField = token.match(/^--(?:field|raw-field)=(.*)$/);
    if (longField) {
      hasFields = true;
      collect(longField[1]);
      continue;
    }
    const shortField = token.match(/^-[fF](.+)$/);
    if (shortField) {
      hasFields = true;
      collect(shortField[1]);
      continue;
    }
    if (token === '--input') {
      setInput(rest[index + 1] || '');
      index += 1;
      continue;
    }
    if (token.startsWith('--input=')) {
      setInput(token.slice('--input='.length));
      continue;
    }
    if (['-H', '--header', '-q', '--jq', '-t', '--template', '--hostname', '--cache', '-p', '--preview'].includes(token)) {
      index += 1;
      continue;
    }
    if (!token.startsWith('-') && !endpoint) endpoint = token;
  }
  const isGraphql = endpoint.replace(/^\/+/, '').toLowerCase() === 'graphql';
  const body = texts.join('\n');
  const graphqlMutation = isGraphql && (unreadable || /\bmutation\b/i.test(body));
  const restMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || (hasFields && method !== 'GET' && !isGraphql);
  if (/[$`]/.test(method)) return result('C', 'gh api (method built at run time)');
  // A dynamic argument (`$FLAGS`, `"$EP"`) may carry `-X DELETE`: same rule as a dynamic push target.
  if (!graphqlMutation && !restMutation && args.some((word) => word.dynamic)) return result('C', 'gh api (argument built at run time)');
  if (!graphqlMutation && !restMutation) return isGraphql ? result('U', 'gh api graphql') : null;
  if (/\/merges\b|\/merge$|\/git\/refs|\/releases\b|\/git\/tags/.test(endpoint) || (graphqlMutation && /mergePullRequest|createRef|deleteRef|updateRef/.test(body))) {
    return result('C', 'gh api (merge, refs or release write)');
  }
  if (rest.some((t) => /addComment|\/comments\b/.test(t)) || /\/comments\b/.test(endpoint) || /add\w*Comment/.test(body)) return result('C', 'gh api (comment)');
  return result('A', 'gh api (write)');
}

function classifyGh(args, ctx) {
  let index = 0;
  while (index < args.length && args[index].text.startsWith('-')) {
    index += GH_OPTIONS_WITH_VALUE.has(args[index].text) ? 2 : 1;
  }
  const groupWord = args[index];
  if (!groupWord) return null;
  if (groupWord.dynamic) return result('E', 'gh <command built at run time>');
  const group = groupWord.text.toLowerCase();
  if (group === 'api') return classifyGhApi(args.slice(index + 1), ctx);
  if (GH_READ_GROUPS.has(group)) return null;

  let subIndex = index + 1;
  while (subIndex < args.length && args[subIndex].text.startsWith('-')) {
    subIndex += GH_OPTIONS_WITH_VALUE.has(args[subIndex].text) ? 2 : 1;
  }
  const subWord = args[subIndex];
  if (subWord && subWord.dynamic) return result('E', `gh ${group} <command built at run time>`);
  const sub = subWord ? subWord.text.toLowerCase() : '';
  const table = GH_WRITE_TABLE[group];
  if (table) {
    for (const cls of ['D', 'C', 'A']) {
      if ((table[cls] || []).includes(sub)) return result(cls, `gh ${group} ${sub}`);
    }
  }
  if (args.some((word) => word.text === '--help')) return null;
  if (!sub) return null;
  if ((GH_READ_SUBS[group] || []).includes(sub)) return null;
  return result('U', `gh ${group} ${sub}`);
}

const SEVERITY = { E: 6, D: 5, C: 4, G: 3, A: 2, U: 2, B: 1 };
const DYNAMIC_PROGRAM_VERBS = new Set([
  'push', 'commit', 'merge', 'tag', 'pr', 'release', 'api', 'add', 'rebase', 'reset', 'stash', 'issue', 'repo', 'workflow', 'run', 'send-pack',
  'fetch', 'pull', 'clone', 'checkout', 'switch', 'restore', 'clean', 'cherry-pick', 'revert', 'am', 'rm', 'mv', 'update-ref', 'config',
  'remote', 'branch', 'worktree', 'submodule', 'secret', 'variable', 'label', 'auth', 'alias', 'extension',
]);

const NET_CLIENTS = new Set(['curl', 'wget', 'http', 'https', 'xh', 'httpie']);
const NET_WRITE_FLAG = /^(-d|--data(-[a-z]+)?|-F|--form(-string)?|-T|--upload-file|--post-data|--post-file|--body-data|--body-file|--json)(=.*)?$/;
const NET_METHOD_FLAG = /^(?:-X|--request=?|--method=?)(.*)$/;
const INLINE_INTERPRETERS = /^(python[\d.]*|node|nodejs|deno|bun|perl|ruby|php)$/;

// Writes to GitHub that bypass `gh` (curl/wget/httpie with a body or a non-GET
// method) are remote publication (A). An interpreter with inline code that names
// GitHub cannot be verified (U).
function classifyGithubHttp(name, segment) {
  if (!segment.some((word) => /github\.com/i.test(word.text))) return null;
  const args = words(segment.slice(1));
  if (NET_CLIENTS.has(name)) {
    const writes = args.some((arg, position) => {
      const method = arg.match(NET_METHOD_FLAG);
      if (method) {
        const value = method[1] || args[position + 1] || '';
        return !/^(GET|HEAD)$/i.test(value);
      }
      return NET_WRITE_FLAG.test(arg) || /^(POST|PUT|PATCH|DELETE)$/i.test(arg);
    });
    return writes ? result('A', `${name} write to GitHub`) : null;
  }
  if (INLINE_INTERPRETERS.test(name) && args.some((arg) => /^(-[a-zA-Z]*[ceEp]|--eval|--print)$/.test(arg))) {
    return result('U', `${name} inline code that calls GitHub`);
  }
  return null;
}

function exportsEnvBypass(segment) {
  const head = segment[0] ? baseName(segment[0].text) : '';
  const candidates = [...(segment.dropped || [])];
  if (ENV_EXPORTERS.has(head)) candidates.push(...words(segment.slice(1)));
  return candidates.some((text) => ENV_BYPASS.test(text));
}

// `cd .claude`, `cd .claude/hooks`, `pushd .claude/agents`: later relative paths
// reach the governance files without naming `.claude/...`.
const GOVERNANCE_DIR = /(^|\/)\.claude(\/(hooks|agents))?\/?$/;
// Inline interpreter code that names the governance area and calls a write API
// (the path may be built from pieces, so the literal path check is not enough).
const INLINE_GOVERNANCE_TARGET = /claude|settings|hooks|agents|\.cl/i;
const INLINE_WRITE_CALL = /open\(|write|unlink|rename|copy|move|\brm\b|chmod|truncate|append|symlink|fs\.|Path\(|os\.|shutil|subprocess|system|exec/i;

function isInlineGovernanceWrite(segment, name) {
  if (!INLINE_INTERPRETERS.test(name)) return false;
  const args = words(segment.slice(1));
  if (!args.some((arg) => /^(-[a-zA-Z]*[ceEp]|--eval|--print)$/.test(arg))) return false;
  return args.some((arg) => INLINE_GOVERNANCE_TARGET.test(arg) && INLINE_WRITE_CALL.test(arg));
}

function isGovernanceWrite(segment, name, inGovernanceDir = false) {
  if (isInlineGovernanceWrite(segment, name)) return true;
  if (!inGovernanceDir && !segment.some((word) => GOVERNANCE_IN_WORD.test(word.text))) return false;
  if (name === 'git' || name === 'gh') return false;
  if (!GOVERNANCE_READERS.has(name)) return true;
  const args = words(segment.slice(1));
  if (name === 'sed') return args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'));
  if (name === 'find') return args.some((a) => /^-(delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)$/.test(a));
  if (name === 'sort') return args.some((a) => /^-[a-zA-Z]*o/.test(a) || /^--o/.test(a));
  if (name === 'uniq') return args.filter((a) => !a.startsWith('-')).length > 1;
  return false;
}

/**
 * @param {string} command
 * @param {{ cwd?: string }} [ctx] working directory used to read `gh api` query files
 * @returns {{ cls: string, operation: string } | null} the most severe match
 */
function classifyCommand(command, ctx = {}) {
  let worst = null;
  const consider = (found) => {
    if (found && (!worst || SEVERITY[found.cls] > SEVERITY[worst.cls])) worst = found;
  };
  let governanceMention = false;
  let inGovernanceDir = false;
  for (const segment of commandSegments(command)) {
    const head = segment[0];
    if (!head) continue;
    const name = baseName(head.text);
    if (exportsEnvBypass(segment)) consider(result('D', 'environment override of Git/GitHub config, hooks or credentials'));
    if (inGovernanceDir || segment.some((word) => GOVERNANCE_IN_WORD.test(word.text))) governanceMention = true;
    if (isGovernanceWrite(segment, name, inGovernanceDir)) consider(result('G', 'write to a governance file through the shell'));
    let found = null;
    if ((name === 'cd' || name === 'pushd') && segment[1] && GOVERNANCE_DIR.test(segment[1].text)) inGovernanceDir = true;
    if (head.dynamic && segment.slice(1).some((word) => DYNAMIC_PROGRAM_VERBS.has(word.text))) {
      found = result('E', '<program built at run time>');
    } else if (name === 'git') {
      found = classifyGit(segment.slice(1));
    } else if (/^git-[a-z]/.test(name) && name !== 'git-lfs') {
      found = classifyGit([{ text: name.slice(4), dynamic: false }, ...segment.slice(1)]);
    } else if (name === 'gh') {
      found = classifyGh(segment.slice(1), ctx);
    } else {
      found = classifyGithubHttp(name, segment);
    }
    consider(found);
  }
  if (governanceMention && hasOutputRedirect(command)) consider(result('G', 'write to a governance file through the shell'));
  return worst;
}

/**
 * @param {Record<string, unknown>} input hook payload
 * @param {NodeJS.ProcessEnv} env
 * @returns {'devops' | 'main-devops' | 'main' | 'other'}
 */
function resolveRole(input, env) {
  const agentType = String((input && (input.agent_type || input.agentType)) || '').toLowerCase();
  if (agentType) return DEVOPS_AGENT_TYPES.has(agentType) ? 'devops' : 'other';
  const declared = String(env.AIOX_ACTIVE_AGENT || '').toLowerCase();
  return DEVOPS_ENV_IDS.has(declared) ? 'main-devops' : 'main';
}

/**
 * @param {string} cls
 * @param {'devops' | 'main-devops' | 'main' | 'other'} role
 * @returns {'allow' | 'ask' | 'deny'}
 */
function decide(cls, role) {
  if (cls === 'D' || cls === 'E') return 'deny';
  if (cls === 'G') return role === 'other' ? 'deny' : 'ask';
  if (role === 'other') return 'deny';
  if (cls === 'C') return 'ask';
  if (cls === 'U') return role === 'main' ? 'ask' : 'allow';
  if (role === 'devops' || role === 'main-devops') return 'allow';
  return 'ask';
}

function relativeToProject(filePath, input, env) {
  const root = String((input && input.cwd) || env.CLAUDE_PROJECT_DIR || process.cwd());
  const absolute = path.resolve(root, String(filePath || ''));
  return path.relative(root, absolute).split(path.sep).join('/');
}

/**
 * @returns {{ decision: 'ask' | 'deny', reason: string } | null}
 */
function evaluate(input, env) {
  const tool = String((input && (input.tool_name || input.toolName)) || '');
  const toolInput = (input && (input.tool_input || input.toolInput)) || {};

  if (WRITE_TOOLS.has(tool)) {
    const target = relativeToProject(toolInput.file_path || toolInput.notebook_path || '', input, env);
    if (GOVERNANCE_PATHS.some((pattern) => pattern.test(target))) {
      return { decision: 'ask', reason: 'This file is part of the Git authority guardrail (AGENTS.md). The owner confirms changes to it.' };
    }
    return null;
  }

  const command = String(toolInput.command || toolInput.cmd || '');
  if (!command) return null;
  const cwd = String((input && input.cwd) || env.CLAUDE_PROJECT_DIR || process.cwd());
  const match = classifyCommand(command, { cwd });
  if (!match) return null;
  const role = resolveRole(input, env);
  const decision = decide(match.cls, role);
  if (decision === 'allow') return null;
  const reasons = {
    A: 'is exclusive to @devops (AGENTS.md "Git e commits").',
    B: 'is exclusive to @devops, after the @qa verdict, with an explicit pathspec (AGENTS.md "Git e commits").',
    C: 'is reserved to the owner (merge to main, tag, release, deletion, a rare issue/PR comment, or a target built at run time). Confirm only with the owner OK.',
    D: 'is forbidden in this project (destructive, alias, hook bypass or config/environment that runs a program).',
    E: 'cannot be verified because the Git/GitHub command is built at run time. Write it literally.',
    U: 'is not on the read allowlist for this caller; only @devops runs Git/GitHub verbs that are not plain reads (AGENTS.md "Git e commits").',
    G: 'writes to a governance file (settings, hooks, agents) through the shell. Use the Write/Edit tools, which ask the owner (AGENTS.md).',
  };
  return { decision, reason: `${match.operation} ${reasons[match.cls]}` };
}

function emit(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason },
  }));
  if (decision === 'deny') {
    process.stderr.write(reason);
    process.exitCode = 2;
  }
}

function main() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    raw = '';
  }
  let input = null;
  try {
    input = JSON.parse(raw || 'null');
  } catch {
    input = null;
  }
  if (!input || typeof input !== 'object') {
    emit('deny', 'Git authority guard received no readable input; blocking for safety.');
    return;
  }
  const verdict = evaluate(input, process.env);
  if (verdict) emit(verdict.decision, verdict.reason);
}

if (require.main === module) main();

module.exports = { classifyCommand, resolveRole, decide, evaluate };

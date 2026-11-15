import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const guard = require('../../.claude/hooks/git-authority-guard.cjs');
const readOnly = require('../../.claude/hooks/read-only-bash-guard.cjs');
const shellWords = require('../../.claude/hooks/lib/shell-words.cjs');

const cls = (command) => guard.classifyCommand(command)?.cls ?? null;

describe('shell-words: tokenization', () => {
  const texts = (command) => shellWords.commandSegments(command).map((segment) => segment.map((word) => word.text));

  it('removes quotes and backslashes from words', () => {
    expect(texts("git p''ush origin")).toEqual([['git', 'push', 'origin']]);
    expect(texts('git "push" origin')).toEqual([['git', 'push', 'origin']]);
    expect(texts('git pu\\sh origin')).toEqual([['git', 'push', 'origin']]);
  });

  it('splits segments on separators and opens shell wrappers, eval and find -exec', () => {
    expect(texts('a && b | c; d')).toEqual([['a'], ['b'], ['c'], ['d']]);
    expect(texts('bash -c "git push origin x"')).toContainEqual(['git', 'push', 'origin', 'x']);
    expect(texts('eval git push origin x')).toContainEqual(['git', 'push', 'origin', 'x']);
    expect(texts('find . -exec git push \\;')).toContainEqual(['git', 'push', ';']);
  });

  it('drops assignments and wrapper commands before the program', () => {
    expect(texts('FOO=1 env BAR=2 command git status')).toContainEqual(['git', 'status']);
    expect(texts('timeout 5 sudo git status')).toContainEqual(['git', 'status']);
  });

  it('marks words built at run time as dynamic', () => {
    const [segment] = shellWords.splitSegments('git $VERB origin');
    expect(segment[1].dynamic).toBe(true);
    const [single] = shellWords.splitSegments("git '$VERB' origin");
    expect(single[1].dynamic).toBe(false);
  });
});

describe('git-authority-guard: classification', () => {
  it.each([
    ['git push origin feat/x', 'A'],
    ["git p''ush origin feat/x", 'A'],
    ['git "push" origin feat/x', 'A'],
    ['git pu\\sh origin feat/x', 'A'],
    ['git -C . --no-pager push origin feat/x', 'A'],
    ['bash -c "git push origin feat/x"', 'A'],
    ["sh -c 'git push origin feat/x'", 'A'],
    ['eval "git push origin feat/x"', 'A'],
    ['cd apps && git push origin feat/x', 'A'],
    ['echo ok; git push origin feat/x', 'A'],
    ['command git push origin feat/x', 'A'],
    ['env FOO=1 git push origin feat/x', 'A'],
    ['sudo git push origin feat/x', 'A'],
    ['/usr/bin/git push origin feat/x', 'A'],
    ['find . -exec git push origin feat/x \\;', 'A'],
    ['git send-pack origin', 'A'],
    ['git -c alias.p=push p origin', 'D'],
    ['git $VERB origin', 'E'],
    ['$PROG push origin', 'E'],
    ['git push --force origin feat/x', 'D'],
    ['git push -f origin feat/x', 'D'],
    ['git push -uf origin feat/x', 'D'],
    ['git push origin +feat/x', 'D'],
    ['git push --mirror', 'D'],
    ['git push --force-with-lease=feat/x origin feat/x', 'D'],
    ['git push origin main', 'C'],
    ['git push origin HEAD:main', 'C'],
    ['git push origin refs/heads/main', 'C'],
    ['git push --tags', 'C'],
    ['git push origin v0.4.0-beta', 'C'],
    ['git push origin --delete feat/x', 'C'],
    ['git push origin :feat/x', 'C'],
    ['git add -- apps/a.mjs', 'B'],
    ['git add -A', 'B'],
    ['git commit -m "feat: x" -- apps/a.mjs', 'B'],
    ['git commit -n -m x', 'D'],
    ['git commit --no-verify -m x', 'D'],
    ['git merge feat/x', 'B'],
    ['git rebase main', 'B'],
    ['git cherry-pick abc', 'B'],
    ['git revert abc', 'B'],
    ['git am patch.mbox', 'B'],
    ['git rm a.js', 'B'],
    ['git update-ref refs/heads/x abc', 'B'],
    ['git apply --index patch.diff', 'B'],
    ['git worktree add .claude/worktrees/x abc', 'B'],
    ['git tag v1.0.0-beta', 'C'],
    ['git tag -d v1', 'C'],
    ['git reset --hard HEAD', 'D'],
    ['git clean -fdx', 'D'],
    ['git checkout -- .', 'D'],
    ['git restore .', 'D'],
    ['git stash drop', 'D'],
    ['git stash clear', 'D'],
    ['git branch -D feat/x', 'D'],
    ['git branch -d feat/x', 'C'],
    ['git config alias.p push', 'D'],
    ['git config --global user.name x', 'D'],
    ['git filter-branch --all', 'D'],
    ['gh pr create --title x --body-file b.md', 'A'],
    ['gh --repo o/r pr edit 1 --body-file b.md', 'A'],
    ['gh pr -R o/r ready 1', 'A'],
    ['gh pr merge 1 --squash', 'C'],
    ['gh pr comment 1 --body x', 'C'],
    ['gh issue comment 1 --body x', 'C'],
    ['gh issue create --title x', 'A'],
    ['gh issue edit 1 --body-file b.md', 'A'],
    ['gh issue close 1', 'A'],
    ['gh label create x', 'A'],
    ['gh project item-edit --id 1', 'A'],
    ['gh workflow run ci.yml', 'A'],
    ['gh run rerun 1', 'A'],
    ['gh repo edit --description x', 'A'],
    ['gh release create v1', 'C'],
    ['gh release delete v1', 'D'],
    ['gh secret set X', 'C'],
    ['gh repo delete o/r', 'D'],
    ['gh gist create f', 'D'],
    ['gh auth login', 'D'],
    ['gh $SUB list', 'E'],
    ['gh api repos/o/r/pulls -f title=x', 'A'],
    ['gh api repos/o/r/issues/1 -X PATCH -f state=closed', 'A'],
    ['gh api -X DELETE repos/o/r/issues/1', 'A'],
    ['gh api -X PUT repos/o/r/pulls/1/merge', 'C'],
    ['gh api repos/o/r/git/refs -f ref=refs/heads/x -f sha=abc', 'C'],
    ['gh api repos/o/r/issues/1/comments -f body=x', 'C'],
    ['gh api graphql -f query="mutation { addComment(input: {}) { clientMutationId } }"', 'C'],
    ['gh api graphql -f query="mutation { updateIssue(input: {}) { clientMutationId } }"', 'A'],
  ])('%s -> %s', (command, expected) => {
    expect(cls(command)).toBe(expected);
  });

  it.each([
    'grep -rn "git push" docs',
    'echo "gh pr merge 1"',
    "python3 -c 'print(\"git commit\")'",
    'git status --porcelain=v1 -uall',
    'git log --oneline -5',
    'git diff HEAD --binary',
    'git checkout -b feat/x',
    'git checkout feat/x',
    'git stash list',
    'git stash show',
    'git tag -l',
    'git tag --list "v*"',
    'git branch --show-current',
    'git config --get user.name',
    'git remote -v',
    'git worktree list',
    'git apply --check patch.diff',
    'gh pr view 1',
    'gh pr list --state open',
    'gh issue list --state open',
    'gh issue view 1',
    'gh run list',
    'gh api repos/o/r/issues',
    'gh api -X GET search/issues -f q=repo:o/r',
    'gh auth status',
  ])('read or unrelated command is not classified: %s', (command) => {
    expect(cls(command)).toBeNull();
  });

  it('returns the most severe class when a pipeline mixes operations', () => {
    expect(cls('git status && git push origin feat/x && git reset --hard')).toBe('D');
    expect(cls('git add -- a && git push origin main')).toBe('C');
  });
});

describe('git-authority-guard: identity and decision', () => {
  const run = (agentType, command, env = {}) =>
    guard.evaluate({ tool_name: 'Bash', tool_input: { command }, ...(agentType ? { agent_type: agentType } : {}) }, env);

  it('lets the aiox-devops subagent publish a branch and commit', () => {
    expect(run('aiox-devops', 'git push origin feat/x')).toBeNull();
    expect(run('aiox-devops', 'git commit -m x -- a.js')).toBeNull();
    expect(run('aiox-devops', 'gh pr create --title x --body-file b.md')).toBeNull();
  });
  it('asks the owner when aiox-devops merges, tags, releases or comments', () => {
    expect(run('aiox-devops', 'gh pr merge 1')?.decision).toBe('ask');
    expect(run('aiox-devops', 'git tag v1.0.0-beta')?.decision).toBe('ask');
    expect(run('aiox-devops', 'git push origin main')?.decision).toBe('ask');
    expect(run('aiox-devops', 'gh issue comment 1 --body x')?.decision).toBe('ask');
  });
  it('denies destructive commands even for aiox-devops', () => {
    expect(run('aiox-devops', 'git push --force origin feat/x')?.decision).toBe('deny');
    expect(run('aiox-devops', 'git commit --no-verify -m x')?.decision).toBe('deny');
    expect(run('aiox-devops', 'git $X origin')?.decision).toBe('deny');
  });
  it('denies other subagents and ignores a self-declared prefix', () => {
    expect(run('aiox-dev', 'git commit -m x -- a.js')?.decision).toBe('deny');
    expect(run('aiox-qa', 'git add -- a.js')?.decision).toBe('deny');
    expect(run('aiox-dev', 'gh pr comment 1 --body x')?.decision).toBe('deny');
    expect(run('aiox-dev', 'AIOX_ACTIVE_AGENT=devops git push origin feat/x')?.decision).toBe('deny');
    expect(run('aiox-dev', 'export AIOX_ACTIVE_AGENT=devops && git push origin feat/x')?.decision).toBe('deny');
  });
  it('does not trust a bridge file or an agent name typed in the command', () => {
    expect(run('aiox-search', 'git push origin feat/x')?.decision).toBe('deny');
    expect(run('aiox-dev', 'env AIOX_AGENT=devops git push origin feat/x')?.decision).toBe('deny');
  });
  it('asks the owner in the main session and allows it when the process env declares devops', () => {
    expect(run(null, 'git push origin feat/x')?.decision).toBe('ask');
    expect(run(null, 'git commit -m x -- a.js')?.decision).toBe('ask');
    expect(run(null, 'AIOX_ACTIVE_AGENT=devops git push origin feat/x')?.decision).toBe('ask');
    expect(run(null, 'git push origin feat/x', { AIOX_ACTIVE_AGENT: 'devops' })).toBeNull();
    expect(run(null, 'git push --force origin feat/x', { AIOX_ACTIVE_AGENT: 'devops' })?.decision).toBe('deny');
  });
  it('lets read-only Git pass for everyone', () => {
    expect(run('aiox-dev', 'git status --porcelain=v1 -uall')).toBeNull();
    expect(run(null, 'gh pr view 1')).toBeNull();
  });
  it('asks before writing the guard files and ignores ordinary files', () => {
    const write = (file, tool = 'Write') => guard.evaluate({ tool_name: tool, tool_input: { file_path: file }, cwd: '/repo' }, {});
    expect(write('/repo/.claude/settings.json')?.decision).toBe('ask');
    expect(write('/repo/.claude/settings.local.json', 'Edit')?.decision).toBe('ask');
    expect(write('/repo/.claude/hooks/git-authority-guard.cjs', 'MultiEdit')?.decision).toBe('ask');
    expect(write('/repo/.claude/agents/aiox-dev.md')?.decision).toBe('ask');
    expect(write('/repo/apps/api/src/server.mjs')).toBeNull();
    expect(write('/repo/.claude/skills/x/SKILL.md')).toBeNull();
  });
  it('returns no verdict for input without a command', () => {
    expect(guard.evaluate(null, {})).toBeNull();
  });
  it('keeps reasons free of paths and user names', () => {
    for (const [agent, command] of [['aiox-dev', 'git push origin feat/x'], ['aiox-devops', 'git push -f x'], [null, 'git tag v1']]) {
      const verdict = run(agent, command);
      expect(verdict?.reason).not.toMatch(/\/home\/|\/Users\/|C:\\\\Users/);
    }
  });
});

describe('read-only-bash-guard', () => {
  const projectRoot = new URL('../../', import.meta.url).pathname;
  const ok = (command, role = 'search') => readOnly.checkCommand(command, role, { root: projectRoot, cwd: projectRoot }).ok;

  it.each([
    'git status --porcelain=v1 -uall',
    'git diff HEAD --binary | sha256sum',
    'git -C . log --oneline -5',
    'git grep -n "foo" -- apps',
    'git branch --show-current',
    'git worktree list',
    'grep -rn "=>" apps/api/src',
    'grep -n "foo$" apps/a.mjs',
    'rg -n "foo" apps | head -20',
    'sed -n 1,40p apps/a.mjs',
    'find apps -name "*.mjs" | wc -l',
    'ls apps 2>/dev/null',
    'cat .env.example',
  ])('allows %s', (command) => {
    expect(ok(command)).toBe(true);
  });

  it.each([
    'ls > out.txt',
    'ls >> out.txt',
    'cat a.txt | tee b.txt',
    'rm -rf apps',
    'mv a b',
    'git commit -m x',
    'git add -- a',
    'git push origin x',
    'git branch -D x',
    'git branch new-branch',
    'git log --output=x.txt',
    'git -c core.pager=x log',
    'git stash',
    'git worktree add x',
    'find . -name x -delete',
    'find . -exec rm {} ;',
    "sed -i 's/a/b/' f",
    'sed -n "w out" f',
    'sort -o out f',
    'cat .env',
    'cat .env.local',
    'cat runtime-secrets/token',
    'cat data/x',
    'cat backups/x',
    'cat key.pem',
    'echo $(id)',
    'echo `id`',
    'X=1 git status',
    'sleep 5 &',
    'sh -c "ls"',
    'bash -c ls',
    'eval ls',
    'xargs ls',
    'curl http://x',
    'docker ps',
    'npm run lint',
    'npm test',
    'node -e "1"',
    'tail -f log',
  ])('denies %s for search', (command) => {
    expect(ok(command)).toBe(false);
  });

  it('allows only the listed checks for audit', () => {
    for (const command of [
      'npm run lint',
      'npm run typecheck',
      'npm run typecheck:api',
      'npm run validate:localization',
      'npm run validate:version',
      'npm run validate:port-denylist',
      'npm run review:static',
    ]) {
      expect(ok(command, 'audit'), command).toBe(true);
    }
    for (const command of [
      'npx vitest run tests/unit/a.test.js',
      'npx vitest run tests/unit/a.test.js tests/unit/b.test.jsx',
      'npm test',
      'npm run test:unit',
      'npm run dev:start',
      'npx vitest run tests/integration/x.test.js',
      'npx vitest run',
      'npx vitest run tests/unit/../integration/x.test.js',
      'npx vitest run tests/unit/a.test.js; docker ps',
      'npm run lint > out.txt',
    ]) {
      expect(ok(command, 'audit'), command).toBe(false);
    }
  });

  it('keeps the audit checks out of the search and grep roles', () => {
    for (const role of ['search', 'grep']) {
      expect(ok('npm run lint', role)).toBe(false);
      expect(ok('npx vitest run tests/unit/a.test.js', role)).toBe(false);
    }
  });

  it('treats an empty command as nothing to run', () => {
    expect(readOnly.checkCommand('', 'search').ok).toBe(true);
    expect(readOnly.checkCommand(undefined, 'search').ok).toBe(true);
  });
});

describe('hook processes (stdin contract)', () => {
  const hook = (file, payload, args = []) => {
    const run = spawnSync(process.execPath, [new URL(`../../.claude/hooks/${file}`, import.meta.url).pathname, ...args], {
      input: typeof payload === 'string' ? payload : JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, AIOX_ACTIVE_AGENT: '' },
    });
    const output = run.stdout ? JSON.parse(run.stdout) : null;
    return { status: run.status, decision: output?.hookSpecificOutput?.permissionDecision ?? null, stderr: run.stderr };
  };
  const bash = (command, extra = {}) => ({ tool_name: 'Bash', tool_input: { command }, ...extra });

  it('exits 2 with a deny decision for a forbidden command', () => {
    const result = hook('git-authority-guard.cjs', bash("git p''ush origin x", { agent_type: 'aiox-dev' }));
    expect(result).toMatchObject({ status: 2, decision: 'deny' });
    expect(result.stderr).not.toMatch(/\/home\/|\/Users\//);
  });
  it('exits 0 with an ask decision in the main session', () => {
    expect(hook('git-authority-guard.cjs', bash('git commit -m x -- a.js'))).toMatchObject({ status: 0, decision: 'ask' });
  });
  it('stays silent and exits 0 for read-only Git and for the devops subagent', () => {
    expect(hook('git-authority-guard.cjs', bash('git status'))).toMatchObject({ status: 0, decision: null });
    expect(hook('git-authority-guard.cjs', bash('git push origin feat/x', { agent_type: 'aiox-devops' }))).toMatchObject({ status: 0, decision: null });
  });
  it('blocks when the input is not readable JSON', () => {
    expect(hook('git-authority-guard.cjs', 'not json')).toMatchObject({ status: 2, decision: 'deny' });
    expect(hook('read-only-bash-guard.cjs', 'not json', ['--role=search'])).toMatchObject({ status: 2, decision: 'deny' });
  });
  it('lets the read-only guard pass a read command and block a write', () => {
    expect(hook('read-only-bash-guard.cjs', bash('git status --porcelain=v1 -uall'), ['--role=search'])).toMatchObject({ status: 0, decision: null });
    expect(hook('read-only-bash-guard.cjs', bash('rm -rf apps'), ['--role=grep'])).toMatchObject({ status: 2, decision: 'deny' });
  });
});

describe('git-authority-guard: deny by default for non-devops (audit F2, F3, F5, F6)', () => {
  const projectRoot = new URL('../../', import.meta.url).pathname;
  mkdirSync(join(projectRoot, '.local'), { recursive: true });
  const sandbox = mkdtempSync(join(projectRoot, '.local', 'guard-test-'));
  const rel = (name) => `.local/${basename(sandbox)}/${name}`;
  writeFileSync(join(sandbox, 'mutation.graphql'), 'mutation { createIssue(input: {}) { clientMutationId } }');
  writeFileSync(join(sandbox, 'comment.graphql'), 'mutation { addComment(input: {}) { clientMutationId } }');
  writeFileSync(join(sandbox, 'read.graphql'), 'query { viewer { login } }');
  afterAll(() => rmSync(sandbox, { recursive: true, force: true }));
  const clsIn = (command) => guard.classifyCommand(command, { cwd: projectRoot })?.cls ?? null;
  const run = (agentType, command, env = {}) =>
    guard.evaluate({ tool_name: 'Bash', tool_input: { command }, cwd: projectRoot, ...(agentType ? { agent_type: agentType } : {}) }, env);

  it.each([
    // gh api graphql with the query in a file (F2)
    [() => `gh api graphql -F query=@${rel('mutation.graphql')}`, 'A'],
    [() => `gh api graphql -f query=@${rel('comment.graphql')}`, 'C'],
    [() => `gh api graphql -F query=@${rel('missing.graphql')}`, 'A'],
    [() => `gh api graphql --input ${rel('mutation.graphql')}`, 'A'],
    [() => 'gh api graphql --input -', 'A'],
    [() => `gh api graphql -F query=@${rel('read.graphql')}`, 'U'],
    [() => 'gh api graphql -f query="query { viewer { login } }"', 'U'],
    [() => 'gh api graphql -f query="MUTATION { updateIssue(input: {}) { x } }"', 'A'],
    // gh groups outside the write table (F2)
    [() => 'gh codespace delete --all', 'U'],
    [() => 'gh pr checkout 1', 'U'],
    [() => 'gh config set editor vim', 'U'],
    [() => 'gh api repos/o/r/issues/$N/comments -f body=x', 'C'],
    // git stash writes (F2)
    [() => 'git stash', 'B'],
    [() => 'git stash push -m x', 'B'],
    [() => 'git stash pop', 'B'],
    [() => 'git stash -u', 'B'],
    // alias and config through the environment (F2)
    [() => 'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.p GIT_CONFIG_VALUE_0=push git p origin x', 'D'],
    [() => 'env GIT_CONFIG_COUNT=1 git status', 'D'],
    [() => 'export GIT_CONFIG_COUNT=1; git status', 'D'],
    [() => 'git --config-env=alias.p=PUSHER p origin', 'D'],
    [() => 'git --config-env alias.p=PUSHER p origin', 'D'],
    [() => 'git -c core.hooksPath=/x commit -m x', 'D'],
    [() => 'git -c core.pager=x log', 'D'],
    [() => 'git -c color.ui=always log', 'U'],
    // other verbs outside the allowlist
    [() => 'git fetch origin', 'B'],
    [() => 'git submodule update --init', 'U'],
    [() => 'git push-to-checkout', 'U'],
    [() => 'git log --output=x.txt', 'U'],
    [() => 'git grep -O"sh -c x" foo', 'U'],
    [() => 'git checkout -f other', 'D'],
    [() => 'git symbolic-ref HEAD refs/heads/x', 'B'],
    [() => 'git-push origin feat/x', 'A'],
    // dynamic refspec or destination is never class A (F5)
    [() => 'git push origin HEAD:$BR', 'C'],
    [() => 'git push origin "$BR"', 'C'],
    [() => 'git push $REMOTE feat/x', 'C'],
    // abbreviated options (F6)
    [() => 'git commit --no-v -m x', 'D'],
    [() => 'git commit --no-verif -m x', 'D'],
    [() => 'git push --no-v origin feat/x', 'D'],
    [() => 'git push --forc origin feat/x', 'D'],
    [() => 'git push --mir', 'D'],
    // writes to the governance files through the shell (F3)
    [() => 'sed -i s/a/b/ .claude/hooks/git-authority-guard.cjs', 'G'],
    [() => 'sed --in-place=.bak s/a/b/ .claude/settings.json', 'G'],
    [() => 'tee .claude/settings.json', 'G'],
    [() => 'echo x > .claude/hooks/x.cjs', 'G'],
    [() => 'echo x >> .claude/agents/aiox-dev.md', 'G'],
    [() => 'python3 -c "open(\'.claude/agents/aiox-dev.md\',\'w\').write(\'x\')"', 'G'],
    [() => 'cp /dev/null .claude/hooks/lib/shell-words.cjs', 'G'],
    [() => 'rm .claude/agents/aiox-dev.md', 'G'],
    [() => 'node .claude/hooks/git-authority-guard.cjs', 'G'],
    [() => 'find .claude/agents -delete', 'G'],
    // relative paths after a cd into the governance area, and paths built at run time (audit F3)
    [() => 'cd .claude && echo x > settings.json', 'G'],
    [() => 'cd .claude/hooks && sed -i s/a/b/ git-authority-guard.cjs', 'G'],
    [() => 'pushd .claude/agents && rm aiox-dev.md', 'G'],
    [() => 'python -c "p=\'.cl\'+\'aude/settings.json\'; open(p,\'w\').write(\'x\')"', 'G'],
    [() => 'node -e "require(\'fs\').writeFileSync(\'.cl\'+\'aude/settings.json\',\'x\')"', 'G'],
    // dynamic program with a verb anywhere in the arguments (audit F5)
    [() => '$G fetch origin', 'E'],
    [() => '$G -C x push origin feat/x', 'E'],
    [() => '$G pull', 'E'],
    // GitHub groups outside the read table are not reads (audit F2)
    [() => 'gh ruleset delete 1', 'U'],
    [() => 'gh attestation delete 1', 'U'],
    [() => 'curl -X POST https://api.github.com/repos/o/r/issues -d x', 'A'],
    [() => 'curl -XDELETE https://api.github.com/repos/o/r/issues/1', 'A'],
    [() => 'wget --post-data=a https://api.github.com/repos/o/r/issues', 'A'],
    [() => 'python3 -c "import urllib.request as u; u.urlopen(\'https://api.github.com/x\')"', 'U'],
  ])('%#: classifies as expected', (build, expected) => {
    expect(clsIn(build())).toBe(expected);
  });

  it.each([
    'cat .claude/hooks/git-authority-guard.cjs',
    'grep -n x .claude/settings.json',
    'sed -n 1,5p .claude/settings.json',
    'ls .claude/agents 2>/dev/null',
    'git diff HEAD -- .claude/agents/aiox-dev.md',
    'sha256sum .claude/agents/aiox-audit.md',
    'git log --oneline -3 -- .claude/hooks',
    'cd .claude && cat settings.json',
    'cd .claude && ls',
    'python3 -c "print(1)"',
    'gh ruleset list',
    'gh attestation verify x',
    'curl https://api.github.com/repos/o/r',
    'curl -X GET https://api.github.com/repos/o/r',
    'curl https://example.com -d x',
  ])('reading the governance files is not classified: %s', (command) => {
    expect(clsIn(command)).toBeNull();
  });

  it('denies unlisted Git/GitHub verbs and writes for non-devops, asks in the main session, allows devops', () => {
    for (const command of ['gh codespace delete --all', 'git stash', 'git submodule update', 'git fetch origin', 'gh api graphql -f query="query { v }"', 'gh ruleset delete 1', 'curl -X POST https://api.github.com/repos/o/r/issues -d x']) {
      expect(run('aiox-dev', command)?.decision, command).toBe('deny');
      expect(run('aiox-qa', command)?.decision, command).toBe('deny');
      expect(run(null, command)?.decision, command).toBe('ask');
    }
    expect(run('aiox-devops', 'gh codespace list')).toBeNull();
    expect(run('aiox-devops', 'gh api graphql -f query="query { v }"')).toBeNull();
    expect(run('aiox-devops', 'git push origin HEAD:$BR')?.decision).toBe('ask');
  });

  it('denies governance writes through the shell for subagents and asks everyone else', () => {
    const command = 'sed -i s/a/b/ .claude/settings.json';
    expect(run('aiox-dev', command)?.decision).toBe('deny');
    expect(run(null, command)?.decision).toBe('ask');
    expect(run('aiox-devops', command)?.decision).toBe('ask');
  });

  it('denies the environment override of Git config even for devops', () => {
    expect(run('aiox-devops', 'GIT_CONFIG_COUNT=1 git status')?.decision).toBe('deny');
  });

  describe('read-only guard path, credential and executing options (audit F4)', () => {
    const ok = (command, role = 'search') => readOnly.checkCommand(command, role, { root: projectRoot, cwd: projectRoot }).ok;
    mkdirSync(join(sandbox, 'cred'), { recursive: true });
    writeFileSync(join(sandbox, 'cred', '.npmrc'), 'x');
    try {
      symlinkSync(process.execPath, join(sandbox, 'link'));
    } catch {
      // symlinks may be unavailable on this platform
    }

    it.each([
      [() => `cat ${process.execPath}`],
      [() => 'cat ~/.npmrc'],
      [() => 'cat ~/.config/gh/hosts.yml'],
      [() => 'ls -R ~'],
      [() => 'ls ..'],
      [() => 'cat ../x'],
      [() => 'ls -la /'],
      [() => 'find / -name x'],
      [() => 'cat $HOME/.npmrc'],
      [() => 'echo $GH_TOKEN'],
      [() => 'cat .npmrc'],
      [() => 'cat .git/config'],
      [() => 'cat .claude/settings.local.json'],
      [() => `cat ${rel('cred')}/.np*`],
      [() => `cat ${rel('link')}`],
      [() => 'cat < package.json'],
      [() => 'sort --compress-program=sh f'],
      [() => 'sort --compress=sh f'],
      [() => 'sort -T x f'],
      [() => 'sort --o=out f'],
      [() => 'sort -uo out f'],
      [() => 'ugrep --filter="x:cat" foo apps'],
      [() => 'ugrep --save-config foo'],
      [() => 'ugrep --pager foo'],
      [() => 'file -C'],
      [() => 'file --compile x'],
      [() => 'git diff --textconv'],
      [() => 'git show --ext-diff HEAD'],
      [() => 'git --git-dir=x log'],
      [() => 'git --config-env=core.pager=X log'],
      [() => 'rg --pre cat foo'],
      [() => 'rg -z foo'],
      [() => 'rg --search-zip foo'],
      [() => "jq -n 'env'"],
      [() => "jq -n '$ENV'"],
      [() => 'sed -n "r /x" f'],
      [() => 'sed -n "1R f2" f'],
      // recursion reaches secret files that are never typed (audit F4)
      [() => 'grep -rn token .'],
      [() => 'grep -r token'],
      [() => 'rg token'],
      [() => 'ugrep -r token .'],
      [() => 'grep --recursive token .'],
    ])('%#: denies', (build) => {
      expect(ok(build())).toBe(false);
    });

    it.each([
      'cat package.json',
      'grep -rn "/api/v1" apps',
      'git diff HEAD -- apps',
      'git log main...HEAD --oneline',
      'git config --get user.name',
      'git remote -v',
      'git worktree list',
      'git stash list',
      'git show HEAD:package.json',
      'git -C . status',
      'ls .',
      'grep -rn "foo" apps',
      'rg -n foo docs',
    ])('still allows %s', (command) => {
      expect(ok(command)).toBe(true);
    });
  });

  it('exits 2 for a subagent unlisted verb through the hook process', () => {
    const child = spawnSync(process.execPath, [new URL('../../.claude/hooks/git-authority-guard.cjs', import.meta.url).pathname], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'gh codespace delete' }, agent_type: 'aiox-dev' }),
      encoding: 'utf8',
      env: { ...process.env, AIOX_ACTIVE_AGENT: '' },
    });
    expect(child.status).toBe(2);
  });
});

describe('git-authority-guard: audit 2026-11-14 findings (G-1, G-2, G-4, R-1, M5)', () => {
  it.each([
    'ls .claude/hooks 2>&1',
    'cat .claude/agents/x.md 2>&1 | head',
    'git diff -- .claude/settings.json 2>&1',
    'cat .claude/hooks/README.md >&2',
    'ls .claude/hooks 2>&1 >/dev/null',
  ])('G-2: %s is not a governance write', (command) => {
    expect(cls(command)).toBeNull();
  });

  it('G-2: a real redirect to a governance file stays class G', () => {
    expect(cls('echo x > .claude/hooks/a.cjs')).toBe('G');
    expect(cls('echo x 2>&1 > .claude/hooks/a.cjs')).toBe('G');
  });

  it.each([
    ['echo "$(git push origin feat/x)"', 'A'],
    ['echo `git push origin feat/x`', 'A'],
    ['`git push origin feat/x`', 'E'],
    ['echo "a `git commit -m x` b"', 'B'],
    ['echo "$(echo $(git push --force origin x))"', 'D'],
    ["echo '$(git push origin x)'", null],
    ['ionice -c 3 git push origin feat/x', 'A'],
    ['setsid git push origin feat/x', 'A'],
    ['flock /tmp/l git push origin feat/x', 'A'],
    ["flock -c 'git push origin feat/x' /tmp/l", 'A'],
    ['watch -n 5 git push origin feat/x', 'A'],
    ["watch 'git push origin feat/x'", 'A'],
    ['parallel -j 2 git push origin feat/x', 'A'],
    ["env -S 'git push origin feat/x'", 'A'],
    ['gh api $FLAGS repos/o/r/issues/1', 'C'],
    ['gh api "$EP"', 'C'],
    ['gh api repos/o/r/issues/1', null],
    ['git -ccore.pager=x log', 'D'],
    ['git -calias.p=push p', 'D'],
    ['HOME=/x git status', 'D'],
    ['env HOME=/x git status', 'D'],
  ])('G-1/G-4/M5: %s -> %s', (command, expected) => {
    expect(cls(command)).toBe(expected);
  });

  it('G-1: a subagent is denied for a push hidden in a substitution', () => {
    const verdict = guard.evaluate({ tool_name: 'Bash', tool_input: { command: 'echo "$(git push origin x)"' }, agent_type: 'aiox-dev' }, {});
    expect(verdict?.decision).toBe('deny');
  });

  it.each([
    'git show HEAD:.env',
    'git show :.env',
    'git cat-file -p HEAD:.env',
    'git diff HEAD -- .env',
  ])('R-1: read-only guard denies %s', (command) => {
    expect(readOnly.checkCommand(command, 'search', { root: process.cwd(), cwd: process.cwd() }).ok).toBe(false);
  });

  it('R-1: git show of a tracked normal path stays allowed', () => {
    expect(readOnly.checkCommand('git show HEAD:package.json', 'search', { root: process.cwd(), cwd: process.cwd() }).ok).toBe(true);
    expect(readOnly.checkCommand('git show HEAD:.env.example', 'search', { root: process.cwd(), cwd: process.cwd() }).ok).toBe(true);
  });
});

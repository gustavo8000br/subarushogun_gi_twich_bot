import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const agentFiles = readdirSync(new URL('.claude/agents/', root)).filter((name) => name.endsWith('.md'));
const frontmatter = (text) => text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
const field = (block, key) => block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? '';
const listField = (block, key) => {
  const match = block.match(new RegExp(`^${key}:\\n((?:[ ]+- .+\\n?)+)`, 'm'));
  return match ? match[1].split('\n').map((line) => line.replace(/^\s*-\s*/, '').trim()).filter(Boolean) : [];
};
const READ_AGENTS = { 'aiox-search.md': 'search', 'aiox-grep.md': 'grep', 'aiox-audit.md': 'audit' };
const PROJECT_GUARD = '$CLAUDE_PROJECT_DIR/.claude/hooks/git-authority-guard.cjs';

describe('.claude agents contract', () => {
  it('has the ten AIOX agents plus the three read agents', () => {
    expect(agentFiles.sort()).toEqual([
      'aiox-analyst.md', 'aiox-architect.md', 'aiox-audit.md', 'aiox-data-engineer.md', 'aiox-dev.md',
      'aiox-devops.md', 'aiox-grep.md', 'aiox-pm.md', 'aiox-po.md', 'aiox-qa.md', 'aiox-search.md',
      'aiox-sm.md', 'aiox-ux.md',
    ]);
  });

  it('pins every agent to sonnet, and haiku only for the three read agents', () => {
    for (const name of agentFiles) {
      const model = field(frontmatter(read(`.claude/agents/${name}`)), 'model');
      expect(model, name).toBe(name in READ_AGENTS ? 'haiku' : 'sonnet');
    }
  });

  it('never declares fable or opus in an agent frontmatter', () => {
    for (const name of agentFiles) {
      expect(frontmatter(read(`.claude/agents/${name}`)), name).not.toMatch(/\b(fable|opus)\b/i);
    }
  });

  it('keeps the read agents without write tools, memory or internet, behind the read-only guard', () => {
    for (const [name, role] of Object.entries(READ_AGENTS)) {
      const block = frontmatter(read(`.claude/agents/${name}`));
      const allowed = listField(block, 'tools');
      const blocked = listField(block, 'disallowedTools');
      for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'WebSearch', 'WebFetch', 'Agent', 'Task']) {
        expect(blocked, `${name} disallows ${tool}`).toContain(tool);
        expect(allowed, `${name} does not allow ${tool}`).not.toContain(tool);
      }
      expect(block, name).not.toMatch(/^memory:/m);
      expect(block, name).toContain(`read-only-bash-guard.cjs" --role=${role}`);
      expect(block, name).toContain('git-authority-guard.cjs');
      expect(field(block, 'maxTurns'), name).toMatch(/^\d+$/);
    }
  });

  it('gives the read agents a fixed output format and a no-verdict statement', () => {
    expect(read('.claude/agents/aiox-search.md')).toContain('## Map');
    expect(read('.claude/agents/aiox-grep.md')).toContain('## Impact points');
    const audit = read('.claude/agents/aiox-audit.md');
    expect(audit).toContain('## Fingerprint');
    expect(audit).toContain('Triage only. Final verdict: @qa.');
    expect(audit).toContain('STALE');
  });

  it('wires every agent to the project guard and never to the framework copy', () => {
    for (const name of agentFiles) {
      const text = read(`.claude/agents/${name}`);
      expect(text, name).toContain(PROJECT_GUARD);
      expect(text, name).not.toContain('enforce-git-push-authority');
      expect(text, name).not.toContain('the lead handles git');
    }
  });

  it('keeps foreign Git rules out of the devops agent', () => {
    const devops = read('.claude/agents/aiox-devops.md');
    expect(devops).not.toMatch(/Alan|Vercel|push -f\b|branches other than main|NEVER pull before push/);
    expect(devops).toContain('git commit -- <paths>');
    expect(devops).toContain('NEVER force push to any branch');
  });

  it('tells every non-devops AIOX agent not to run Git writes', () => {
    for (const name of agentFiles.filter((file) => !(file in READ_AGENTS) && file !== 'aiox-devops.md')) {
      expect(read(`.claude/agents/${name}`), name).toContain('exclusive to `@devops`, after the `@qa` verdict');
    }
  });
});

describe('.claude settings and hooks contract', () => {
  const settings = JSON.parse(read('.claude/settings.json'));

  it('wires the project guard on Bash and on writes, with the project dir variable', () => {
    const entry = settings.hooks.PreToolUse.find((item) => item.matcher.includes('Bash'));
    expect(entry.matcher).toBe('Bash|Write|Edit|MultiEdit|NotebookEdit');
    expect(entry.hooks[0].command).toBe('node "$CLAUDE_PROJECT_DIR/.claude/hooks/git-authority-guard.cjs"');
    expect(entry.hooks[0].type).toBe('command');
  });

  it('denies destructive Git commands and secret reads for everyone', () => {
    for (const rule of ['Bash(git push --force:*)', 'Bash(git push -f:*)', 'Bash(git reset --hard:*)', 'Bash(gh repo delete:*)', 'Read(./.env)', 'Read(./runtime-secrets/**)']) {
      expect(settings.permissions.deny).toContain(rule);
    }
    expect(settings.permissions.allow).toBeUndefined();
  });

  it('keeps the local settings file and worktrees out of version control', () => {
    const ignore = read('.gitignore');
    for (const entry of ['.claude/settings.local.json', '.claude/worktrees/', '.aiox/active-agent']) {
      expect(ignore).toContain(entry);
    }
  });

  it('keeps governance files free of session URLs and personal paths', () => {
    const files = [
      '.claude/settings.json',
      '.claude/hooks/git-authority-guard.cjs',
      '.claude/hooks/read-only-bash-guard.cjs',
      '.claude/hooks/lib/shell-words.cjs',
      '.claude/hooks/README.md',
      ...agentFiles.map((name) => `.claude/agents/${name}`),
      '.claude/skills/develop-story/SKILL.md',
      '.claude/skills/aiox-commit/SKILL.md',
    ];
    for (const file of files) {
      expect(read(file), file).not.toMatch(/claude\.ai\/(code|chat|share)|session_[0-9A-Za-z]{6,}|\/home\/|\/Users\/|C:\\Users|Alan\b/);
    }
  });
});

describe('project rules contract (multi-model operation)', () => {
  it('states lanes, read agents, the single model rule and the guard in AGENTS.md', () => {
    const agents = read('AGENTS.md');
    for (const phrase of ['Execução por faixas', 'Arquivos quentes', 'Fila de gates do `@qa`', 'Agentes de leitura', 'Haiku 5.5', 'git-authority-guard.cjs', 'Fable 5.1 está proibido']) {
      expect(agents).toContain(phrase);
    }
    expect(agents).not.toMatch(/\bum agente por vez\b/i);
    expect(agents).not.toMatch(/\*\*Execução em série\b/i);
  });

  it('aligns the issue comment rule across AGENTS.md and CLAUDE.md', () => {
    const agents = read('AGENTS.md');
    const claude = read('CLAUDE.md');
    expect(agents).toContain('comentários só são publicados se forem necessários');
    expect(agents).toContain('casos raros');
    expect(claude).toContain('casos raros');
    expect(claude).not.toContain('nunca comente em issues');
  });

  it('keeps agent memory versioned and only the orchestrator memory private', () => {
    const agents = read('AGENTS.md');
    expect(agents).toContain('Memória e handoff do orquestrador');
    expect(agents).not.toMatch(/reposit[óo]rio do projeto é público e não recebe a mem[óo]ria/i);
  });

  it('gives Claude Code the read-agent rules and the per-session advisor rule', () => {
    const claude = read('CLAUDE.md');
    expect(claude).toContain('## Agentes de leitura, faixas e advisor');
    expect(claude).toContain('claude --model sonnet --advisor opus');
    expect(claude).not.toContain('feat/ops-15-next-panel');
    expect(claude).not.toMatch(/\bum agente por vez\b/i);
    expect(claude).not.toMatch(/\bJEV\b/);
  });

  it('keeps the commit override in the generated skills', () => {
    expect(read('.claude/skills/develop-story/SKILL.md')).not.toContain('Local commits only');
    expect(read('.claude/skills/aiox-commit/SKILL.md')).toContain('only `@devops`');
  });

  it('keeps the framework config aligned with the model policy and manual worktrees', () => {
    const config = read('.aiox-core/core-config.yaml');
    expect(config).toContain('active: claude-sonnet-5-5');
    expect(config).toContain('autoCreate: manual');
    expect(config).not.toMatch(/claude-(sonnet|opus|haiku)-4/);
    expect(config).not.toMatch(/fable/i);
  });
});

describe('governance hardening contract (audit F7-F15)', () => {
  const READ_FIVE = ['aiox-search.md', 'aiox-grep.md', 'aiox-audit.md'];
  const WRITE_AGENTS = agentFiles.filter((name) => !READ_FIVE.includes(name));

  it('keeps the owner handle, the private memory repository name and personal paths out of the rules files', () => {
    for (const file of ['AGENTS.md', 'CLAUDE.md', '.claude/CLAUDE.md', '.claude/hooks/README.md']) {
      expect(read(file), file).not.toMatch(/gustavo8000br|(?<![./\w-])agent-memory(?![\w/*-])|\/home\/|\/Users\/|C:\\Users/);
    }
    const docsDir = new URL('docs/', root);
    const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      return entry.isDirectory() ? walk(child) : [child];
    });
    for (const file of walk(docsDir).filter((url) => /\.(md|json|ya?ml)$/.test(url.pathname))) {
      expect(readFileSync(file, 'utf8'), file.pathname).not.toMatch(/gustavo8000br\/agent-memory/);
    }
    expect(read('AGENTS.md')).toContain('repositório privado de memória');
    expect(read('CLAUDE.md')).toContain('repositório privado de memória');
  });

  it('fixes the fingerprint with the untracked-content hash in the audit, devops and AGENTS.md', () => {
    for (const file of ['.claude/agents/aiox-audit.md', '.claude/agents/aiox-devops.md', 'AGENTS.md']) {
      const text = read(file);
      expect(text, file).toContain('git ls-files --others --exclude-standard');
      expect(text, file).toMatch(/sha256sum <[^>]+> \| sha256sum/);
    }
  });

  it('keeps bypassPermissions on the ten write agents with a written justification and the pending V-HOOK', () => {
    for (const name of agentFiles) {
      const mode = field(frontmatter(read(`.claude/agents/${name}`)), 'permissionMode');
      expect(mode, name).toBe(READ_FIVE.includes(name) ? 'plan' : 'bypassPermissions');
    }
    expect(WRITE_AGENTS).toHaveLength(10);
    const agents = read('AGENTS.md');
    expect(agents).toMatch(/permissionMode: bypassPermissions/);
    expect(agents).toMatch(/V-HOOK/);
    for (const file of ['docs/research/2026-11-14-multimodel-governance/README.md', 'docs/pt-BR/research/2026-11-14-multimodel-governance/README.md']) {
      const note = read(file);
      expect(note, file).toContain('bypassPermissions');
      // A list item ties the pending V-HOOK-1 check to bypassPermissions (wording-independent).
      const pending = note.split('\n').filter((line) => /^- /.test(line) && line.includes('V-HOOK-1') && line.includes('bypassPermissions'));
      expect(pending.length, file).toBeGreaterThan(0);
    }
  });

  it('describes the real hook state in the hooks README', () => {
    const readme = read('.claude/hooks/README.md');
    for (const token of ['git-authority-guard.cjs', 'read-only-bash-guard.cjs', 'settings.local.json', 'enforce-git-push-authority.cjs', 'V-HOOK', 'frameworkProtection', 'AIOX_ACTIVE_AGENT=devops']) {
      expect(readme, token).toContain(token);
    }
    expect(readme).not.toMatch(/read-protection\.py|sql-governance\.py|mind-clone-governance\.py/);
    const settings = JSON.parse(read('.claude/settings.json'));
    expect(Object.keys(settings.hooks)).toEqual(['PreToolUse']);
    // The old owner hook is documented but must not be wired in the project settings.
    expect(JSON.stringify(settings)).not.toContain('enforce-git-push-authority');
    expect(JSON.stringify(settings)).toContain('git-authority-guard.cjs');
  });

  it('records the precedence of AGENTS.md and the frameworkProtection divergence in .claude/CLAUDE.md', () => {
    const text = read('.claude/CLAUDE.md');
    expect(text).toContain('`AGENTS.md`');
    expect(text).toMatch(/@devops/);
    expect(text).toMatch(/@qa/);
    expect(text).toContain('Synkra AIOX is a meta-framework');
    expect(read('.aiox-core/core-config.yaml')).toMatch(/frameworkProtection:\s*false/);
    expect(text).toMatch(/frameworkProtection.{0,40}false/s);
    // Framework text that contradicts the project rules was rewritten (audit F11, F13).
    expect(text).not.toMatch(/Use for PR creation: `gh pr create`/);
    expect(text).not.toMatch(/^- Run all tests before marking tasks complete/m);
    expect(text).not.toMatch(/default:\s*true/);
  });

  describe('Git read verbs have parity with the guards (audit F14)', () => {
    const require = createRequire(import.meta.url);
    const authority = require('../../.claude/hooks/git-authority-guard.cjs');
    const readOnly = require('../../.claude/hooks/read-only-bash-guard.cjs');
    const root = new URL('../../', import.meta.url).pathname;
    // Verbs that are reads only in a listed form; the other verbs run as typed.
    const FORMS = { branch: 'git branch --show-current', worktree: 'git worktree list', stash: 'git stash list', remote: 'git remote -v', config: 'git config --get user.name' };
    const WRITES = ['push', 'commit', 'add', 'merge', 'rebase', 'reset', 'fetch', 'pull', 'rm', 'mv', 'cherry-pick', 'revert'];
    const commandFor = (verb) => FORMS[verb] ?? `git ${verb}`;
    const verbsListed = (text) => {
      const list = text.match(/`git ((?:[a-z-]+\|)+[a-z-]+)`/)?.[1];
      return list ? list.split('|') : [];
    };
    const readOnlyAllows = (command) => readOnly.checkCommand(command, 'audit', { root, cwd: root }).ok;
    // The authority guard must not classify the same read for a non-devops caller.
    const authorityAllows = (command) => authority.evaluate({ tool_name: 'Bash', tool_input: { command }, cwd: root, agent_type: 'aiox-search' }, {}) === null;

    it.each(Object.keys(READ_AGENTS))('%s lists only verbs both guards accept, with their listed forms', (name) => {
      const text = read(`.claude/agents/${name}`);
      const verbs = verbsListed(text);
      expect(verbs.length, name).toBeGreaterThan(5);
      for (const verb of verbs) {
        expect(readOnlyAllows(commandFor(verb)), `${name}: read-only ${verb}`).toBe(true);
        expect(authorityAllows(commandFor(verb)), `${name}: authority ${verb}`).toBe(true);
      }
      for (const form of Object.values(FORMS)) {
        expect(readOnlyAllows(form), form).toBe(true);
        expect(authorityAllows(form), form).toBe(true);
      }
    });

    it('audit lists every plain verb the read-only guard accepts, and no write verb is accepted', () => {
      const listed = verbsListed(read('.claude/agents/aiox-audit.md'));
      const probe = ['status', 'log', 'show', 'diff', 'grep', 'ls-files', 'ls-tree', 'rev-parse', 'blame', 'cat-file', 'merge-base', 'describe', 'shortlog', 'rev-list', 'name-rev', 'ls-remote', 'show-ref'];
      for (const verb of probe) {
        if (readOnlyAllows(`git ${verb}`)) expect(listed, verb).toContain(verb);
      }
      for (const verb of WRITES) {
        expect(readOnlyAllows(`git ${verb}`), `read-only ${verb}`).toBe(false);
        expect(authorityAllows(`git ${verb}`), `authority ${verb}`).toBe(false);
      }
    });
  });

  it('keeps the English and Portuguese research notes structurally equal', () => {
    const en = read('docs/research/2026-11-14-multimodel-governance/README.md');
    const pt = read('docs/pt-BR/research/2026-11-14-multimodel-governance/README.md');
    const lines = (text, test) => text.split('\n').filter(test);
    expect(lines(pt, (l) => l.startsWith('|')).length).toBe(lines(en, (l) => l.startsWith('|')).length);
    expect(lines(pt, (l) => /^#{1,6} /.test(l)).length).toBe(lines(en, (l) => /^#{1,6} /.test(l)).length);
    expect(lines(pt, (l) => /^- /.test(l)).length).toBe(lines(en, (l) => /^- /.test(l)).length);
    const firstColumn = (text) => lines(text, (l) => /^\| \d+ \|/.test(l)).map((l) => l.split('|')[1].trim());
    expect(firstColumn(pt)).toEqual(firstColumn(en));
    const classColumn = (text) => lines(text, (l) => /^\| \d+ \|/.test(l)).map((l) => l.split('|').slice(-2)[0].trim());
    expect(classColumn(pt)).toEqual(classColumn(en));
    const ids = (text) => [...new Set(text.match(/V-[A-Z]+(-\d+)?/g) ?? [])].sort();
    expect(ids(pt)).toEqual(ids(en));
    expect(en).toContain('(../../pt-BR/research/2026-11-14-multimodel-governance/README.md)');
    expect(pt).toContain('(../../../research/2026-11-14-multimodel-governance/README.md)');
  });
});

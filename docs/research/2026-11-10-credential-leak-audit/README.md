# Claude Code "don't ask again" credential leak: article summary and repository audit (research note)

[Português brasileiro](../../pt-BR/research/2026-11-10-credential-leak-audit/README.md)

- Author: `@analyst` (Atlas). Date: 2026-11-10. Branch at audit time: `main` (`dcfe3da`).
- Labels: **VERIFIED** (read in this session or measured in the repository), **PARTIAL** (secondary source or incomplete), **UNVERIFIED** (inference).
- Scope: research and read-only audit. No file under version control was changed, nothing was committed, nothing was written to GitHub. No secret value appears in this note; findings are shown only as file, line or number, pattern and mask (`****`). `~/passwd.txt` was **not** read.
- Owner request (2026-11-10): read the CISO Advisor article and say whether the owner's credentials were pushed to the repository.

## 1. Verdict

**NO real credential found** (confidence: high for the formats scanned, moderate overall; see section 6).

- No `.claude/settings.local.json` has ever existed in any of the 225 commits of the repository (all refs). It is ignored by `.gitignore` line 36 and is not tracked.
- The only tracked `.claude/settings.json` has 31 bytes (`{"language": "portuguese"}`) and has one revision. It has no `permissions.allow` rules, so the mechanism of the article cannot have stored a command there.
- No GitHub, OpenAI, AWS, Slack, Twitch `live_`, OAuth, JWT, private-key, Bearer or Authorization secret was found in the history, in 55 PR bodies, 63 issue bodies, the release notes or the three release assets.
- Every credential-shaped hit is a placeholder, a test fixture or a disposable test-database string (section 4).
- Twitch Client ID/Secret are not in the repository (they live in the development database volume). They were already rotated by the owner, so even a hypothetical old leak would be harmless.

## 2. The article and the primary source

Article: CISO Advisor, "Opção do Claude Code pode vazar senhas e chaves de API no GitHub", page dated 2026-11-08 (read with WebFetch; VERIFIED as to content).

1. **Feature:** the option "Yes, and don't ask again" in the Claude Code command-approval prompt. It saves the approved command as a permanent allow rule in `.claude/settings.local.json` inside the project.
2. **How it leaks:** the saved rule stores the command text. If the command carried a password, API key, `PGPASSWORD=`, `sshpass -p`, an `Authorization` header or a connection string, the secret is stored in plain text. The file leaks when it is committed and pushed to a public GitHub repository. Shared `.claude/settings.json` can hold the same kind of content.
3. **Claude Code behavior:** per Anthropic's docs (as reported by iTWire), the first write inside a Git repository adds the file to the developer's **global** Git excludes. This is machine-specific, does not travel with the project, and does not cover files already tracked or folders that became repositories later.
4. **Scale (Apiiro):** 104,185 public copies of the file were examined; 1,122 (about 1.1%) held secrets (1,379 distinct values). Counting history, shared settings and transcripts: 2,539 secrets in 1,994 public repositories, 63 organizations. Examples: cloud admin key, production database passwords, Supabase keys, SSH logins.
5. **Scanner gap:** Gitleaks flagged 564 files and TruffleHog 643; 215 were caught by neither, because passwords after `PGPASSWORD=`, `sshpass -p` or in headers evade generic patterns.
6. **Versions:** the article names **no** affected Claude Code version. It names no CVE and no Anthropic advisory. Anthropic's response was not found (iTWire says none was reported; an August 2025 issue on the same behavior was auto-closed in January 2026).
7. **Mitigation:** rotate/revoke exposed credentials first (removal does not erase history, forks or clones); search current files and history for both settings files; `git rm --cached` plus a `.gitignore` entry; prefer a secret manager or runtime variable over literals (inline `VAR=secret cmd` still stores the secret); keep standing permissions narrow; clean history later and in coordination.
8. **Primary source:** Apiiro research by Shmulik Cohen and Matan Giladi, published 2026-11-05 (data collected 1 to 3 November), `https://apiiro.com/blog/coding-agents-leaking-secrets-github-dont-ask-again`. Apiiro did not test whether the secrets still work and used an LLM reviewer in its own classification.
9. **Limitations:** the Apiiro page and The Hacker News page answered HTTP 403 to WebFetch, so the figures above come from the CISO Advisor article, an iTWire article (`https://itwire.com/business-it-news/security/claude-code-approval-files-found-exposing-company-secrets-on-github-says-apirro-researchers`, dated 2026-11-07) and a WebSearch summary (PARTIAL). Disclosure dates differ by one or two days between outlets. The August 2025 report is also indexed at `https://claudeissues.com/issue/13106-bug-sensitive-tokens-stored-in-claude-settings-local-json-and-not-ignored-by-git`. No official Anthropic statement was found.

## 3. Where the mechanism could touch this project

| Place | Why it matters | Result |
|---|---|---|
| `.claude/settings.local.json` | The file the article is about | Never committed; ignored |
| `.claude/settings.json` | Shared settings | 31 bytes, language only |
| `.claude/agent-memory/**` (17 tracked files), `.claude/agents`, `.claude/commands`, `.claude/hooks`, `.claude/skills` | Text written by agents; could carry pasted terminal output | History scan clean (section 4) |
| Commit messages and authors | Trailers and metadata | No session URL; see low-severity note |
| PR/issue bodies, release notes and assets | Public text outside git history | Clean |
| `docs/**` (handoffs, QA gates, stories) | Agents paste command lines here | Placeholders only |
| `.github/**` | Workflows | Only `secrets.GITHUB_TOKEN` references (no values) |
| `.env*`, `.local/`, dumps, `*.pem`, `*.key` | Typical secret files | Only `.env.example`, `.env.product.example` tracked; no values |

## 4. Method and findings

Read-only commands: `git rev-list --all` (225 commits, 8,396 objects, refs `main`, `origin/main`, `legacy`, tag `v0.3.0-0d0b595-beta`), `git log --all -p -U0` over every added line (lockfiles excluded), `git grep`, `git ls-files`, `git check-ignore`, `gh pr list`, `gh issue list`, `gh release view`, `gh release download` (into the git-ignored `.local/`). Gitleaks and TruffleHog are not installed; nothing was installed. Scripts were kept outside the repository and printed only masked output.

Patterns (added lines of all revisions): GitHub tokens (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`), `sk-`, `AKIA`/`ASIA`, `xox[bpas]-`, `-----BEGIN ... PRIVATE KEY-----`, Twitch `live_<digits>_<key>`, `oauth:` plus 30 characters, URLs with `user:pass@`, `Bearer`, `Authorization:`, Twitch client secret shape (30 alphanumerics after `secret`), `access_token`/`refresh_token`/`api_key`/`password`/`stream_key` assignments, `sshpass -p`, `PGPASSWORD=`, `curl -u`, JWT, personal e-mail domains, personal paths, session URLs, and an entropy pass (24+ character tokens, entropy at or above 4.0 bits, hash and integrity lines skipped).

| Pattern | Hits | Classification |
|---|---|---|
| GitHub, `sk-`, AWS, Slack, private key, `live_`, `oauth:`, JWT, Bearer, Authorization, Twitch-secret shape, `sshpass`, `PGPASSWORD`, `curl -u` | 0 | none |
| URL with credentials | 30 files | Placeholders and disposable test DB strings: `postgresql://queuebot:****@127.0.0.1:...` in `tests/integration/*postgres*.test.js`, `Dockerfile` (build-only `prisma generate`), `apps/frontend/scripts/dev-runtime-config.mjs`; `dev:****@` in unit tests; docs repeats. The 22, 10 and 8 character passwords are made of plain words (for example "...-test-password"), not random strings. `.aiox-core` docs use `[PROJECT_REF]` and `postgres:postgres`. PR #9 uses `test:****@localhost`. |
| Token/password assignments | 6 files | All are code reading an environment variable or a literal fixture (`process.env.OBS_WS_PASSWORD`, `temporary-app-token`, `options.password`) |
| Entropy | 18 files | Prisma/story URLs, migration names, the OBS WebSocket auth test vector (inputs `secret`, `salt`, `challenge`), skill reference text. No credential |
| Session URL | 0 real URLs | `AGENTS.md` line 146 and 24 docs mention the rule or the word `Claude-Session`, never an actual Claude session link. 0 commit messages carry the trailer or a URL. Issue #104 only names the trailer in text |
| Personal data (low) | see below | `/home/gustavo` or `/media/gustavo` paths in 19 files; `~/passwd.txt` named as a path only in `docs/session-handoff.md` (en and pt-BR lines 98 and 109) and `docs/stories/OPS-15/qa-gate-2026-10-23.md`; no content |
| GitHub | 55 PRs, 63 issues, release body, 3 assets | 0 secrets. Release assets (`.bat`, `.command`, `.sh`) hold no `client_secret`, token or password assignment |
| Tracked sensitive files | 0 | `git ls-files` shows no `.env`, `.local/`, `settings.local.json`, `.pem`, `.key`, `.dump`, `.sqlite`, `.db`. Only the two `.env*.example` files; their secret-named keys have no values |
| Deleted sensitive files in history | 0 | `git log --diff-filter=D` shows none |
| `.github/workflows` | 2 references | `secrets.GITHUB_TOKEN` only |

Low-severity observations (not credential leaks):

1. Two author addresses appear in commit metadata: a personal mail domain (public by design in git) and a machine-hostname address on 2 commits (`@OptiPlex-790.local`). Treat as public; not a secret.
2. `.gitignore` covers `.env`, `.env.local`, `.env.*.local`, `runtime-secrets/`, `data/`, `backups/`, `*.dump`, `*.sql`, `*.key`, `*.pem`, `.claude/settings.local.json`, `.local/` but **not** `.env.production`, `.env.dev`, `.env.staging`, `secrets.json`, `credentials.json`. Nothing like that exists today; it is a prevention gap (see recommendations).
3. The path `~/passwd.txt` is named in docs. It reveals only that a password file exists in the owner's home, outside the repository. Consider rewording to "a local credentials file".

## 5. Recommendations

1. **No rotation or history rewrite is required by this audit.** Do not rewrite history for placeholders. Keep the rotated Twitch app secret as is.
2. Add `.env.*` (with `!.env.example`, `!.env.product.example`), `secrets.json` and `credentials.json` to `.gitignore` (a `@dev` change under the OPS-27 guard story).
3. Make the OPS-27 guard check also for `.claude/settings.local.json` and `.claude/settings.json` containing `permissions.allow` rules with `PASSWORD`, `TOKEN`, `SECRET`, `Authorization`, `sshpass`, `PGPASSWORD` or `://user:pass@` (the patterns Apiiro says scanners miss). Fit: it extends the existing OPS-27 scope; no new requirement is invented here.
4. Operational habit: never pick "don't ask again" for a command that contains a literal secret; use environment variables or a prompt for the secret instead (inline `VAR=secret cmd` still saves the secret).
5. Ask the owner to confirm on the machine (agents cannot see it): that `.claude/settings.local.json` in each worktree (including `backup-wt`, `backup-wt2`, `board-sync` under `.local/`) holds no pasted secret, and that Claude Code's global excludes file is in place. This is outside the repository and was not inspected.
6. Re-run this audit with a history-aware scanner after the owner approves one (gitleaks or TruffleHog) to cover entropy beyond this sample.

## 6. Limitations and confidence

- Regex and entropy scans are samples, not proof of absence. Secrets that were encoded (base64, URL-encoded, split across lines), compressed, or inside binary blobs are not covered. Lockfiles were skipped.
- Only reachable refs were scanned (`--all` includes `legacy`, `origin/main` and the tag). Dangling objects, forks, and GitHub's cached PR refs were not inspected.
- PR and issue **comments** and review text were included in the download (0 comments exist); GitHub Actions logs, Discussions, wiki and Projects board text were not scanned.
- The audit could not see untracked local files (`.local/` worktrees) or the developer machine.
- The article is third-party; the Apiiro primary page was not readable here (HTTP 403).
- Prior audit reused: `docs/research/2026-11-06-git-history-rewrite/README.md` (207 commits of `origin/main`, common token formats). This note extends it to all 225 commits, extra patterns, entropy, PR/issue bodies, release notes and assets, and the `.claude` tree.

## 7. Next steps (agents)

- `@sm`/`@po`: fold recommendations 2 and 3 into OPS-27 scope. `@dev`: implement after the story gate. `@qa`: validate. `@devops`: no GitHub change needed from this audit. Coordinator: ask the owner for recommendation 5.

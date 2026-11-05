---
name: project-cross-platform-sessions
description: Owner will provide future Claude Code sessions on Windows and macOS so cross-platform tests can be automated; until then no Windows/macOS result may be claimed
metadata:
  type: project
---

On 2026-10-27 the owner said they will release a Claude Code session on **Windows and macOS** in the future, so cross-platform tests can be automated.

**Why:** today the project is validated only on Ubuntu Linux; Windows (installer, dev flow, native OBS) is planned and macOS is not validated, and those were owner-manual items (OW-01…OW-07 in the backlog).

**How to apply:** keep the rule "never claim a Windows or macOS result without a real run". When those sessions exist, turn the owner-side Windows/macOS checklist (installer smoke, `npm run dev:start` flow, Docker Desktop path/Compose project name, line endings, NTFS secret protection, Ctrl+C handling, native OBS/CEF overlay) into scripted checks that the Windows/macOS session runs and reports with evidence; ask `@devops` for a `windows-latest`/`macos` CI job only with the owner's OK; record which platform was really tested in each QA gate. Until then keep those items as owner-side/pending. Related: [[project-incremental-cutover]], [[project-stage-no-users]].

**Exclusive handoffs (owner request 2026-10-27, Windows and macOS):** `docs/handoffs/windows-session-handoff.md` and `docs/handoffs/macos-session-handoff.md` (+ `docs/pt-BR/handoffs/` copies). Orion must **always keep them updated** whenever the platform plan, scripts, findings or the cutover/OPS-15 state change (update the Change log section of each, en = pt-BR, in the same increment), and tell `@devops` to commit them after `@qa`. Each Windows/macOS session reads its own file first.

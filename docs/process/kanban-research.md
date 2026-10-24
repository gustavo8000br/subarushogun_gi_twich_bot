# Kanban for implementation tracking — research note

[Português brasileiro](../pt-BR/process/kanban-research.md)

- Author: `@analyst` (Atlas). Date: 2026-10-24. Requested by the owner through `@aiox-master`.
- Research index: row 19 in [`docs/research-index.md`](../research-index.md). Before this note the topic was a GAP.
- Labels: **VERIFIED** means an official source, the installed CLI, or a read-only query on this repository confirmed it. **PARTIAL** means the source was incomplete or secondary. **UNVERIFIED** means it is an inference.
- Scope: this is desk research plus read-only checks with `gh`. Nothing was created or edited on GitHub. No sync script was written or tested.
- Owner premise (2026-10-24, received during the research): `@sm` **organizes** the board (priority, requirements, size, dependencies, order). `@devops` **keeps it up to date** (creates and moves items, syncs fields with story, issue and gate state). This note does not propose any other split.

## Problem

The owner loses the thread of each implementation: why it exists, which decision was taken, which gate it is in, and what comes next. That information is spread across the story, the `@qa` gates, research notes, the session handoff, issues and commits.

## Findings about this repository (read-only, 2026-10-24)

| # | Finding | Label |
|---|---|---|
| R1 | `gh` is 2.45.0. The account `gustavo8000br` has the scopes `gist`, `read:org`, `repo` and `workflow`. **`project` and `read:project` are missing.** Any `gh project` command, and any GraphQL read of project fields, fails with `INSUFFICIENT_SCOPES` / "missing required scopes [read:project]". | VERIFIED (`gh auth status`, GraphQL query) |
| R2 | The account already owns **5 user-level Projects (v2)**. Their names and contents cannot be read without `read:project`. Check them before creating a new one. | VERIFIED (count only) |
| R3 | The repository is public, user-owned and has `has_projects: true`. | VERIFIED (`gh api repos/...`) |
| R4 | There are 32 issues. **None** has a native parent or sub-issue (`parent` is null and `subIssuesSummary.total` is 0 on all of them). The "Parent issue" and "Sub-issue progress" project fields would therefore be empty today, and the roadmap law (parent issue with native sub-issues) is not reflected remotely. | VERIFIED (GraphQL `parent`, `subIssuesSummary`) |
| R5 | The issues use 4 labels (`accessibility`, `bug`, `documentation`, `enhancement`) and no milestones. | VERIFIED |
| R6 | `gh` 2.45.0 has `gh project` with `create`, `field-create`, `field-list`, `item-add`, `item-edit`, `item-list`, `link` and other subcommands. `field-create` only accepts `TEXT`, `SINGLE_SELECT`, `DATE` and `NUMBER` (no iteration field). `item-edit` changes **one field per call** and needs the item, project and field IDs, plus the option ID for single-select fields. `item-list` returns 30 items unless you pass `-L`. `gh issue create/edit --project` exist, but **there are no sub-issue flags**. | VERIFIED (`--help` of the installed binary) |
| R7 | Story status lines are free text and not uniform. Examples: "In Progress — implementation authorized…", "Draft refined — planning in progress…", "Ready (`@po` GO 2026-10-22, 9/10)…". A simple `^**Status:**` match found no status line in FND-1, FND-4, FND-7, OPS-1, OPS-2 or OPS-3, and the `**Issue:**` line is not present in every story. A deterministic sync cannot parse status from the prose reliably. | VERIFIED (grep over `docs/stories/*/story.md`) |
| R8 | The branch has local commits that have not been pushed. Anything written only to the repository (for example a Markdown kanban) is invisible on github.com until `@devops` pushes it. A Projects board changes on GitHub immediately. | VERIFIED (session handoff, git state) |

## Q1. GitHub Projects (v2): what can be automated

| Capability | Facts | Label |
|---|---|---|
| Layouts | Table, board (kanban) and roadmap (timeline). Views can be filtered, sorted, grouped and saved. | VERIFIED [about-projects] |
| Fields | Up to **50 fields**, built-in and custom together. Custom types: text, number, date, single select and iteration. | VERIFIED [about-projects] |
| Item limit | 50,000 items per project, raised from 1,200 (public preview, 2025-02-26). Up to 10,000 archived items. | PARTIAL [changelog-items], [ghes-archiving] (not rechecked on the current github.com page) |
| Parent and sub-issues | The "Parent issue" field can group and filter views (`parent-issue:"OWNER/REPO#N"`). "Sub-issue progress" shows how many sub-issues are completed. Both are enabled in table view under "Hidden fields". A parent can have up to 100 sub-issues, nested up to 8 levels. | VERIFIED [parent-fields], [adding-sub-issues]. Use in the board layout: UNVERIFIED |
| Built-in workflows | Set status on add, close issues on status change, set Done on close, auto-archive, auto-add. Two are enabled by default: closed issue or PR → Done, and merged PR → Done. | VERIFIED [built-in] |
| Auto-add | The plan sets the number of auto-add workflows: Free 1, Pro/Team 5, Enterprise 20. It **is not retroactive**. Filters are `is:`, `label:`, `reason:`, `assignee:` and `no:`. The owner's plan could not be read (`plan: null`). | VERIFIED [auto-add]; owner plan UNVERIFIED |
| API | `read:project` is enough for reads. `project` is needed for mutations. `addProjectV2ItemById` adds an issue or PR and returns the existing item if it is already there. `updateProjectV2ItemFieldValue` sets text, number, date, single-select or iteration values. **You cannot add and update an item in the same call.** Assignees, labels, milestone and repository are issue properties and are not changed through project mutations. | VERIFIED [api] |
| Project status updates | A project can carry status updates ("On track", "At risk", etc.) with start and target dates and a Markdown message. They show in the project header and in project lists. The GraphQL mutation is `createProjectV2StatusUpdate`. | VERIFIED for the GHES docs and the GraphQL reference [status-updates], [graphql-projects]; behavior on github.com PARTIAL |
| Visibility | Anyone can view a public project. A private project is visible only to people with read access. Items from private repositories stay hidden from people without repository access. | VERIFIED [visibility] |
| Actions | `GITHUB_TOKEN` cannot access projects. Automation from Actions needs a PAT for user-owned projects, or a GitHub App for organization projects. | VERIFIED [actions] (localized official pages) |
| Sub-issues from the CLI | `gh` **v2.94.0+** adds `--parent`, `--set-parent`, `--remove-parent`, `--blocked-by`, `--blocking` and JSON fields for parent, sub-issues and dependencies. With 2.45.0 you have to use the API, for example the REST sub-issues endpoint or the GraphQL `addSubIssue` mutation. | VERIFIED [cli-2.94] for the flags; the exact 2.45 workaround call is UNVERIFIED (not executed) |

**Pitfalls**

1. The token has no `project` scope today (R1). The owner has to run `gh auth refresh -s project` interactively. The `project` scope gives write access to **every** project the account owns, so it is broader than this repository. VERIFIED (scope behavior per [api]; the breadth is PARTIAL).
2. Editing one field per call means a full card update (about 8 fields) takes about 8 calls, plus ID lookups. A script should cache the IDs from `field-list --format json`. VERIFIED (R6).
3. The default "closed → Done" workflow also fires for issues closed as *not planned*. Use `reason:` or move such items by hand. PARTIAL (inferred from [built-in]).
4. Leave "Close issues on status change" **off**, so that only `@devops` closes issues, deliberately. Recommendation, not a fact.
5. Adding an issue to a project records an "added to project" event in the issue timeline. That is a timeline event, not a comment, so it does not break the no-comment rule. PARTIAL (common GitHub behavior; not rechecked in docs).
6. Using webhooks (`projects_v2_item`) for user-owned projects is not confirmed. The design below does not depend on them. UNVERIFIED [webhook-thread].
7. The text field length limit was not found. Keep text values to one line plus links. UNVERIFIED.
8. Whether a single-select field's options (for example the Status options) can be renamed from `gh` 2.45 is not confirmed. Plan to do it once in the UI. UNVERIFIED.

## Q2. Alternatives

| Option | Cost | External dependency | Owner can see it from anywhere | Keeps the thread of each implementation | Conflicts with project rules |
|---|---|---|---|---|---|
| (a) Markdown kanban in the repo (`docs/kanban.md` generated from stories, or the Obsidian Kanban format: `kanban-plugin: board` front matter, `##` lanes, `- [ ]` cards) | Free | None (Obsidian is optional) | Only after a push, and with no board UI on github.com (R8) | Yes, links stay in the repo | None. Must be bilingual (two files). `@sm` can write it directly. The format details are PARTIAL [obsidian-kanban] |
| (b) Issues + labels + milestones, no Projects | Free | GitHub | Yes | Weak. There is no board, no "next step" or "gate" fields, and labels would turn into status | Labels and milestones are issue edits, so only `@devops` makes them. No conflict, but noisy |
| (c1) Linear | Free tier: 250 active issues, 2 teams, GraphQL API | SaaS outside GitHub | Yes | Yes (custom states, projects) | Duplicates issues outside GitHub, so story↔issue traceability needs a sync. PARTIAL [linear-pricing] |
| (c2) Jira Cloud | Free up to 10 users | SaaS | Yes | Yes, but heavy | Same duplication. VERIFIED [jira-plans] |
| (c3) Trello | Free up to 10 collaborators per workspace | SaaS | Yes | Partly (cards and custom fields) | Same duplication. VERIFIED [trello-limit] |
| (c4) Notion | Not researched in depth | SaaS | Yes | Yes (databases) | Same duplication. UNVERIFIED |
| (d) Repo as the source of truth + a GitHub Projects mirror | Free | GitHub (already used) | Yes, live | Yes: the card holds short fields with links to the story, gate, research and PR | None, as long as only `@devops` writes to GitHub and nothing is written as a comment |

## Q3. Card design for the thread of an implementation

The design follows one principle: **the card does not repeat the story, it points to it.** Each card is the real story issue (not a draft item), so traceability stays native. Draft items are allowed only for ideas that have no story yet, and only if `@sm` asks for them.

| Field (type) | Owner | Content |
|---|---|---|
| Status (single select) | `@devops`, from the story | `Backlog`, `Draft`, `Ready`, `InProgress`, `InReview`, `Done`, plus `Blocked`. These mirror the story lifecycle |
| Gate (single select) | `@devops`, from the story | `PO`, `UX`, `Architect`, `Data`, `QA plan`, `Dev`, `QA gate`, `Owner`, `PR/merge` |
| Agent (single select) | `@devops`, from the story or handoff | Agent responsible for the next step |
| Next step (text) | `@devops`, from the story or handoff | One sentence |
| Why / decision (text) | `@sm` writes it, `@devops` publishes it | One sentence and a link to the decision anchor (story Change Log or decision file) |
| Evidence (text) | `@devops` | Links to the last `@qa` gate and to the research note |
| Story (text) | `@sm` | Path or URL of `docs/stories/<ID>/story.md` (the pt-BR copy is linked from it) |
| Priority (single select) | `@sm` | `P0` to `P3` |
| Size (single select) | `@sm` | `XS` to `XL` (difficulty) |
| Order (number) | `@sm` | Execution order inside a priority |
| Depends on (text) | `@sm` | Issue numbers. Native "blocked by" links need gh 2.94+ or the API |
| Updated (date) | `@devops` | Date of the last sync |
| Parent issue / Sub-issue progress (built-in) | GitHub | Roadmap grouping (needs the R4 gap fixed) |
| Linked PR (built-in) | GitHub | Automatic when the PR references the issue |

**Views:** `Board by Status` for daily tracking, `Table by Priority/Order` for `@sm` planning, `Roadmap by parent issue`, and `Blocked/Owner` to show what needs the owner.

**Narrative at session level:** at the end of each session, `@devops` posts a project status update with the handoff summary and links (an "On track"/"At risk" note). This is not an issue comment.

## Q4. Governance (owner decision applied)

The authority split is unchanged: GitHub writes stay with `@devops` (`agent-authority.md`, `AGENTS.md`), and `@sm` gains a planning artifact in the repository.

1. **`@sm` organizes, in the repository.** It keeps a machine-readable board plan with ID, priority, size, order, dependencies, requirements link and why/decision link. It is bilingual if it contains prose. The `docs/process/backlog-inventory.md` that `@sm` is writing could be the natural place for it, but `@sm` and `@po` decide that. Status and gate are **not** typed by `@sm`. They come from the story and the gate files.
2. **The story is the source of truth for status, gate and next step.** Because of R7, add a small normalized block (for example a fixed `Board` section or front matter with `status`, `gate`, `agent`, `next_step`, `issue`) to the story template. `@po` and `@sm` own that template change. Who updates the block follows `story-lifecycle.md`: `@po` sets Ready, `@dev` sets InProgress/InReview, `@qa` sets the verdict, and so on.
3. **`@devops` keeps the board up to date.** It runs the sync at fixed triggers: a story status transition, a `@qa` verdict, an issue created, a PR opened or merged, and the end of a session. It runs it by hand with `gh project item-add/item-edit` for now, and later with a deterministic script.
4. **The orchestrator stays in sync.** At each trigger, `@aiox-master` asks `@devops` to run the sync and tells it which story changed. A later story, with its own issue, `@dev` implementation and `@qa` gate, can add a script such as `npm run board:sync -- --dry-run`. The script would read the `@sm` plan and the story blocks, compare them with `gh project item-list --format json`, and apply only the differences. `@devops` would review the dry run before applying it. The script would be repository code, so it needs a story. It would never write issue comments.

## Recommendation

Option (d): the repository stays the source of truth, and a user-owned GitHub Project (v2), linked to the repository, is the owner's view. Do not adopt SaaS tools, because they would duplicate issues outside GitHub. Do not adopt a Markdown kanban as the main view, because it is invisible until pushed and has no board UI.

## Limitations

- The 5 existing projects and the owner's GitHub plan could not be inspected (missing `read:project`; `plan: null`).
- No `gh project` command or GraphQL mutation was executed. The command behavior comes from `--help` and the docs.
- Notion was not evaluated. The Linear and Obsidian details are partly from secondary sources.
- Using Projects in GitHub Mobile was not verified.

## Sources (accessed 2026-10-24)

- [about-projects] https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects
- [built-in] https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations
- [auto-add] https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/adding-items-automatically
- [api] https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects
- [parent-fields] https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-parent-issue-and-sub-issue-progress-fields
- [adding-sub-issues] https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues
- [cli-2.94] https://github.blog/changelog/2026-06-10-manage-sub-issues-types-and-dependencies-from-github-cli/
- [changelog-items] https://github.blog/changelog/2025-02-26-increased-items-in-github-projects-now-in-public-preview
- [ghes-archiving] https://docs.github.com/en/enterprise-server@3.15/issues/planning-and-tracking-with-projects/automating-your-project/archiving-items-automatically
- [visibility] https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-your-project/managing-visibility-of-your-projects
- [status-updates] https://docs.github.com/en/enterprise-server@3.20/issues/planning-and-tracking-with-projects/sharing-project-updates
- [graphql-projects] https://docs.github.com/en/graphql/reference/projects
- [actions] https://docs.github.com/de/enterprise-server@3.14/issues/planning-and-tracking-with-projects/automating-your-project/automating-projects-using-actions
- [webhook-thread] https://github.com/dessant/issue-states/issues/2
- [linear-pricing] https://linear.app/pricing
- [jira-plans] https://support.atlassian.com/jira-cloud-administration/docs/explore-jira-cloud-plans/
- [trello-limit] https://support.atlassian.com/trello/docs/workspace-user-limit/
- [obsidian-kanban] https://community.obsidian.md/plugins/kanban and https://community.obsidian.md/plugins/plain-text-kanban

# Kanban board design (GitHub Project #5)

[Português brasileiro](../pt-BR/process/kanban-board-design.md)

**Date:** 2026-10-24. **Author:** `@sm` (River). **Branch:** `feat/ops-15-next-panel`. **Scope:** design only. Nothing was created or edited on GitHub; no story, issue or the inventory was changed. `@devops` applies the design on GitHub; `@sm` organizes; `@devops` keeps it up to date.

**Update 2026-10-27 (`@sm`):** the design now reflects the 12 items added to the [inventory](backlog-inventory.md) (ST-15, ST-16, FT-21..FT-29, OW-16): new Fase options OPS-22 and OPS-23, 12 new issues to create now, 33 native links when everything exists, 87 cards. Nothing was created or edited on GitHub.

**Update 2026-10-27, second (`@sm`):** 7 more items from the [inventory](backlog-inventory.md) (ST-17 = OPS-24, and its slices FT-30..FT-35: backend to TypeScript and ESLint to Biome): new Fase option "OPS-24 TypeScript e Biome", 1 more issue to create now (13 in total), 6 more native links (39 when everything exists), Ordem extended to step 16, 94 cards. Nothing was created or edited on GitHub.

**Update 2026-10-27, third (`@sm`):** after the `@po` GO on OPS-22/23/24 and the issues created by `@devops`: cards ST-15, ST-16, ST-17 now show #80, #81, #91 and Situação Pronto; FT-24 shows #82 and Pronto; FT-21 and FT-22 show #89 and #90 (their issues exist; the "issue nova (agora)" label no longer applies). Card count: 95 (one draft added afterwards, FT-36 "cancel pending deletion", owner decision 2026-10-27; 26 issues + 67 drafts + 2 legacy); otherwise only Situação, Etapa and next-step text changed. FT-21 and FT-22 run in sequence after FT-24. `@devops` syncs the Project fields from these rows. Nothing was created or edited on GitHub by this change.

**Update 2026-10-27, fourth (`@sm`):** 7 draft cards added for the incremental OPS-15 cutover waves (FT-37..FT-43; plan in [cutover-plan](../stories/OPS-15/cutover-plan.md)), all in Fase "OPS-15 Migração Next": FT-37 (wave 0) Em revisão, FT-38 (wave 1) Pronto, FT-39..FT-43 Bloqueado. Ordem uses decimal sub-steps so the sequence 0, 1, 3, 2, 5, TS-10 ports, 4, 6 is exact (FT-37 = 4.1, FT-38 = 4.2, FT-39 = 4.3, FT-40 = 5, FT-41 = 5.1, FT-42 = 8.1, FT-43 = 8.2). Existing cards are linked, not duplicated (FT-05 and TS-04 run in FT-40; TS-01 and the script of FT-04 in FT-37; the aliases of FT-04 in FT-39; TS-12 in FT-42; TS-10 gates FT-42). OW-09 became Concluído (decided 2026-10-27). Cards: 102 (26 issues + 74 drafts + 2 legacy). Nothing was created or edited on GitHub by this change.

**Inputs:** [inventory](backlog-inventory.md) (IDs ST/FT/GV/TS/OW), [`@analyst` research](kanban-research.md), `.claude/rules/story-lifecycle.md`, and a read-only `gh issue list` on 2026-10-24.

**Owner decisions (2026-10-24):** the board is Project **#5** "SubaruShogun GI Twitch Bot — Planejamento" (owner `gustavo8000br`), reused and already linked to the repository. Today it has only the default `Status` field (Todo/In Progress/Done) and 4 items (#17 Done, #18 Done, #19 In Progress, #48 Todo). The field model follows the structure the owner indicated: single-select **Situação** (status), **Área**, **Fase** (phase), **Responsável** (responsible) and **Prioridade** (priority); the Área, Fase and Responsável options below were defined for this project. The repository is the source of truth; the board is a mirror.

Board values stay in Brazilian Portuguese because the board belongs to the owner. English glosses are given in parentheses.

## 1. Project #5 fields

### 1.1 Default Status × Situação (recommendation)

**Use a single status field:** rename the default `Status` field to **Situação** and replace its options with the AIOX lifecycle. Reason: the native workflows (set on add, item closed, PR merged) act on the default `Status` field; a second "Situação" field would put the board and the workflows on different fields and create two truths. Renaming and editing options is done once in the web UI (the research could not confirm it from the old CLI; the current `gh` is 2.103.2, but editing options from the CLI is still unverified). After renaming, `@devops` checks that the native workflows still point at the field.

| Situação option | Story status (`story-lifecycle.md`) | When to use |
|---|---|---|
| Backlog | Backlog / Planned / no story | No story yet, or not yet in Draft |
| Rascunho (Draft) | Draft | Story drafted or being refined, before `@po` validation |
| Aguardando decisão (Awaiting decision) | (any) | The next step is an owner decision |
| Pronto (Ready) | Ready | `@po` GO, issue exists, planning gates done; for slices and actions, can start now |
| Em andamento (In progress) | InProgress | Implementation or a gate is running |
| Em revisão (In review) | InReview | Ready for the `@qa` gate or owner acceptance |
| Bloqueado (Blocked) | (any) | The next step is impossible now because of a dependency; "Depende de" says which |
| Concluído (Done) | Done | After the PR is merged, with the `@qa` verdict recorded (rule GV-04) |

Rules: `Aguardando decisão` and `Bloqueado` override the story status, which stays in the story file. An item whose next step is still executable (for example planning while a dependency is open) keeps the story status instead of `Bloqueado`.

Native workflows: turn on "Item added → Situação = Backlog", "Item closed → Concluído" and "Pull request merged → Concluído"; **turn off "Close issues on status change"** (only `@devops` closes issues, deliberately); keep auto-add only with the filter `is:issue is:open` for the repository (PRs do not become cards; they show as linked PRs). An issue closed as "not planned" must be moved by hand.

### 1.2 Fields and options

GitHub limit: 50 fields. This design uses 15 custom fields.

| # | Field | Type | Options / format | Written by | Why (1 line) |
|---|---|---|---|---|---|
| 1 | **Situação** (renamed `Status`) | Single select | Backlog; Rascunho; Aguardando decisão; Pronto; Em andamento; Em revisão; Bloqueado; Concluído | `@devops` | Board column and bridge to the story lifecycle |
| 2 | **Fase** (phase) | Single select | OPS-15 Migração Next; Estabilização; OPS-21 Contrato da API; OPS-22 Recuperação financeira; OPS-23 Tempo real; OPS-24 TypeScript e Biome; OPS-20 Elegibilidade de devolução; Chat e mensagens; Documentação; Instalador; Governança; Qualidade e testes | `@sm` | Groups by delivery line (derived from the inventory and the roadmap order) |
| 3 | **Prioridade** (priority) | Single select | P0 (critical path now); P1 (before cutover); P2 (approved follow-up); P3 (gated / low value) | `@sm` | Inventory criteria; owner request |
| 4 | **Dificuldade** (difficulty) | Single select | P (up to half a day); M (1-3 days); G (several slices/gates); GG (COMPLEX, score >= 16) | `@sm` | Remaining effort; name requested by the owner (the research called it "Size") |
| 5 | **Responsável** (responsible) | Single select | @sm; @po; @dev; @qa; @devops; @architect; @data-engineer; @ux-design-expert; @analyst; Proprietário (owner) | `@devops` (from story/handoff) | Who does the NEXT step; the native Assignees field is for people, not agents |
| 6 | **Área** (area) | Single select | Painel Next; API; Banco de dados; Overlay/OBS; Twitch/worker; Infra/CI; Docs/processo | `@sm` | Where the work lands in the product; filters by specialist |
| 7 | **Tipo** (type) | Single select | História; Fatia; Governança; Teste; Ação do proprietário | `@sm` | Draft items have no labels; tells a story from a task |
| 8 | **Gate atual** (current gate) | Single select | Nenhum; Planejamento @po; Planejamento @ux; Planejamento @architect; Planejamento @data-engineer; Plano de testes @qa; Implementação @dev; Gate @qa; Aceite do proprietário; Commit/PR @devops | `@devops` | Answers "which gate is it in" without opening the story |
| 9 | **Próximo passo** (next step) | Text | One imperative sentence | `@devops` | The line of thought the owner loses; comes from the handoff/story |
| 10 | **Por quê / decisão** (why / decision) | Text | One sentence plus a link to the decision (story, audit, handoff) | `@sm` writes, `@devops` publishes | Keeps the reason and decision without repeating the story |
| 11 | **Evidência** (evidence) | Text | Links to the last `@qa` verdict, research note and PR | `@devops` | Proof of the current state; separates evidence from claim |
| 12 | **Story** | Text | Path `docs/stories/<ID>/story.md` (or "sem story") | `@sm` | Points to the source of truth instead of copying it |
| 13 | **Depende de** (depends on) | Text | Inventory IDs and #issues, comma separated | `@sm` | Dependencies of drafts and items without an issue; for issues also use the native "blocked by" link |
| 14 | **Ordem** (order) | Number | Step of the recommended order (1-16 plus decimal sub-steps 4.1 to 8.2 for the cutover waves, inventory section 2); ties broken by Prioridade and ID | `@sm` | Orders execution inside a priority |
| 15 | **Atualizado em** (updated on) | Date | YYYY-MM-DD of the last sync | `@devops` | Shows how stale the mirror is |

**Cut as redundant with native fields:** Parent issue and Sub-issues progress (hierarchy, section 3), Linked pull requests (automatic), Labels (`bug`/`enhancement`/`documentation`/`accessibility` already exist on the issue), Milestone (unused in this repository), Assignees and Repository (native), a "Size" field (it is Dificuldade), an "Iteration" field (no sprints) and a dedicated block field (it is the Bloqueado option plus "Depende de").

Text fields: one line plus links (field length limit not verified).

**Update 2026-10-27, fifth (`@sm`):** 6 cards added (ST-18, ST-19, GV-13 = issue #94, TS-13, TS-14, OW-17), ST-04 moved to Rascunho (P2) and ST-07 (#74) moved under OPS-22; the resolved decisions are in section 7.1. Cards: 108 (27 issues + 79 drafts + 2 legacy). Nothing was created or edited on GitHub by this change.

**Update 2026-10-28 (`@sm`):** 1 card added, **TS-15** (flaky Chromium queue-deletion test, finding M-1; Situação Backlog, P2, Ordem 11, Fase Qualidade e testes). Cards: 109 (27 issues + 80 drafts + 2 legacy); 107 inventory IDs. ST-04 text aligned with the OPS-13 story (it stays "Ready for Review"; the card is in Rascunho only because the validation is pending); ST-06 (#65) notes the pending owner decision about the missing OPS-14 story. Nothing was created or edited on GitHub by this change.

**Update 2026-10-30 (`@sm`):** owner-approved merges and three new items. **Batch A:** OPS-22 in a single cycle (FT-25 #98 absorbs FT-26 #99 and FT-36 #100; FT-23 travels in the same cycle and shares one UX plan with FT-36); FT-05 (#85) and FT-07 (#87) folded into FT-40 (#96), FT-07 subject to the `@po` confirmation; FT-08 into FT-02 (#84, #88); FT-03 into FT-06 (one test cycle); OPS-21 in 3 cycles after the `@architect` (FT-12 into FT-11, FT-16 into FT-13, FT-15 into FT-14; FT-17 apart); FT-29 into FT-28; ST-08 (OPS-16, #72) into ST-06 (OPS-14, #65); ST-04 into ST-18 (#57 becomes the follow-up of OPS-25). **Batch B:** TS-03, TS-05, TS-06, TS-09 and GV-09 into TS-02; TS-08 and TS-11 into TS-07; TS-10 and TS-12 travel with FT-42; TS-13 and TS-14 into ST-19 (OPS-26); GV-02..GV-08 and GV-10..GV-12 into GV-01 (one rules pass); owner actions in 4 lists (Windows OW-01; real OBS and Twitch OW-03; macOS OW-07; decisions OW-10) and OW-08 and OW-09 archived. Not merged: FT-30..FT-35 and the cutover waves 5, 4 and 6. **New cards:** TS-16 (Next panel JSX back to `typecheck:web`, inside OPS-24), FT-44 (read timeout and `AbortSignal` in the panel, candidate scope of OPS-23) and TS-17 (CI job for the 12 `*-browser-only` scripts, own story). **Concluded:** TS-15 (fix `0644cec`, PR #101) and TS-01 (executed in wave 0). Issue numbers now filled in the card column: #79, #83, #84, #86, #87, #88, #92, #93, #95, #98, #99, #100 (the label "issue nova" no longer exists). Inventory items: 110. Cards: 112 in total = 66 active (28 issues + 36 drafts + 2 legacy) + 46 archived (section 5.1). Nothing was created or edited on GitHub by this change.

**Update 2026-11-04 (`@sm`):** owner ticks of 2026-10-30 and pending corrections (nothing was created or edited on GitHub by this change). **D-01 = B:** ST-11 (#73) leaves "Aguardando decisão" and goes to Rascunho (fixed words per supported language, closed list kept by the project, no streamer configuration). **D-12 = A:** TS-02 goes to Pronto (the `@dev` removes the 3 historical-status tests, the `@qa` confirms that no current rule lost coverage). **D-13 = A:** TS-07 goes to Pronto with the order TS-11 measures first, then TS-07 implements if the gain is confirmed (the archived TS-11 card is not recreated). **D-14 = A:** the legacy cards #17 and #18 are archived (never deleted; the issues stay open or closed as they are). **Corrections:** FT-38 (#93, commit `384a7e7`, `@qa` CONCERNS 9.0) and FT-39 (#95, commit `906fd5c`, `@qa` CONCERNS 9.0) move to Em revisão, like FT-37 (#92, `08e84cb`, 9.2) and FT-40 (#96); the four have the gate "Aceite do proprietário" (merge) where the old gate was "Gate @qa" or "Implementação @dev"; ST-06 (#65) points to the issue under D-02 (default A); FT-23 gets the card of issue #103 (story drafted). **Counts:** 110 inventory items; **64 active cards** (29 issues + 35 drafts) and **48 archived** (46 by merge + the 2 legacy cards), 112 in total.

**Update 2026-11-04, second (`@sm`):** the improvement survey ([improvement-ideas](improvement-ideas-2026-11-04.md), [actions](improvement-actions-2026-11-04.md), [issue bodies](improvement-issue-bodies-2026-11-04.md)) enters the board; nothing was created or edited on GitHub by this change. **New cards:** ST-20..ST-23 (stories OPS-27..OPS-30, Situação Rascunho) and FT-45..FT-52 (slices, Situação Backlog), all in Fase "Qualidade e testes". **Ordem:** the decimal sub-steps follow the recommended order of the survey: ST-20, FT-45 and FT-46 = 8.3 (idea #5, first, right after the OPS-22 package); ST-23, FT-51, FT-52 and TS-17 = 8.4 (idea #1); ST-22, FT-49 and FT-50 = 8.5 (idea #10); ST-21, FT-47 and FT-48 = 8.6 (idea #4); FT-44 (idea #2) keeps its existing order 8. **Changed card:** TS-17 gets Ordem 8.4 and Depende de ST-23 (the story that delivers it). **Mapping:** idea #1 TS-17/ST-23; #2 FT-44; #3 TS-16 and ST-17; #6 ST-09; #7 ST-16; #8 the owner cards OW-03 (A-02), OW-07 (D-05), OW-16, OW-01; #9 OW-06 (A-05). **Counts:** 122 inventory items; **76 active** cards (29 issue cards + 47 drafts) and **48 archived**, 124 in total. The four new parent issues are to be created by `@devops` (17 to create now); the figures of the first update of 2026-11-04 (64 active, 112 cards) are superseded.

**Update 2026-11-05 (`@sm`):** findings of the [QA gate 2026-11-05](../stories/OPS-15/qa-gate-2026-11-05.md) (PASS 9.1) enter the board and the real board is reconciled with this design; nothing was created or edited on GitHub by this change. **New cards (5, Situação Backlog, Ordem 8.7):** FT-53 (L-2), FT-54 (L-3), TS-18 (L-1), TS-19 (M-2), TS-20 (lock order); `@devops` loads them as drafts. **Changed cards:** OW-07 moves from Aguardando decisão to **Bloqueado** (owner tick D-05 = B, recorded on 2026-11-05: get a Mac and validate before `rc`; "Depende de" = access to a Mac); ST-20..ST-23 now point to the issues #104, #107, #106 and #105; ST-18 is a draft (no #57 card exists on the real board); the index issue #102 gets a row (`IDX-102`, not an inventory item). The order of TS-11 (archived, merged into TS-07) and the note of ST-06 / D-02 (type Padrão, option A applies with no tick) do not change: the gate asks for neither. **Counts:** 127 inventory items; **82 active cards** (33 issues + 49 drafts) and **48 archived**, 130 in total; the real board has 77 today (section 5.3). The figures of the second update of 2026-11-04 (76 active, 124 cards) are superseded.

**Update 2026-11-05, second (`@sm`):** 7 cards added from the owner decisions of 2026-11-05 (nothing was created or edited on GitHub): FT-55 (Pronto, order 8.8; parent OPS-22 / #80), TS-21 and FT-56..FT-60 (Backlog, order 8.8; FT-56 and FT-57 wait for the owner OK); notes on ST-18 (widget subset on the local OBS before the bump) and ST-19 (slice A now, `status` in the 0.4.0-beta); the planned scope of the 0.4.0-beta is in section 5.4. `@devops` loads the 7 drafts. Counts: 134 items, 89 active (33 issue cards + 56 drafts), 48 archived, 137 cards.

**Update 2026-11-06 (`@sm`):** 13 cards added from the leftovers of the [qa-gate-2026-11-06](../stories/OPS-15/qa-gate-2026-11-06.md) and the UX addendum (nothing was created or edited on GitHub): TS-22..TS-26 and FT-61..FT-67 (all Backlog, order 8.8 or 17; FT-62 waits for the owner OK) and OW-18 (Pronto, order 3, P1 before streaming with the old scene); details in the [inventory](backlog-inventory.md). Cards: 150 (33 issues + 69 drafts + 48 archived).

**Update 2026-11-06, third (`@sm`):** reconciliation of OPS-15 with the evidence (nothing was created or edited on GitHub). **Changed cards:** FT-10 goes from Bloqueado to **Concluído** (fulfilled by the cutover waves 4 to 6, PR #101, merge `4488443`); FT-09 goes from Bloqueado to **Pronto** (pending: final `@qa` and `@architect` reviews, legacy-test audit repeat, OWN-16 to OWN-18 checks by agents in the browser); FT-01 keeps Pronto and gets the D-08 = A link (language selector position delegated to its UX plan); OW-06 is unchanged. **New cards (4, Backlog drafts):** FT-68, FT-69, FT-70 (P3, order 17) and TS-27 (P2, order 8.8), from the live test report g1106d; `@devops` loads them. The boxes of #69 are classified in [issue-body-changes-2026-11-06](issue-body-changes-2026-11-06.md). Cards: 154 (33 issues + 72 drafts + 49 archived).

**Update 2026-11-06, fourth (`@sm`, owner proposal):** 9 cards added (nothing was created or edited on GitHub): ST-24 (OPS-31, Rascunho, order 8.9) and FT-71..FT-78 (Backlog, order 8.9); `@devops` loads them. The refund moment is decided (only when the service ends). Cards: 163 (33 issues + 81 drafts + 49 archived).

**Update 2026-11-06, fifth (`@sm`, owner decisions):** 8 cards added and 1 corrected (nothing was created or edited on GitHub): ST-25 (OPS-32, queue cycle calendar with presets and the "Old queues" tab, Rascunho, order 9.0) and FT-79..FT-85 (Backlog, order 9.0); OPS-32 is a **candidate** for the 0.4.0-beta (owner decision pending). **ST-24 (OPS-31) corrected:** it is **Pronto**, issue #115, `@po` GO 8.7/10 (it was still shown as Rascunho with "Story em Draft"). Cards: 171 (36 issues + 86 drafts + 49 archived; the row count replaces the earlier 33 + 81 split, total unchanged).

## 2. What becomes a card

**Recommendation: card = real issue whenever the item is a story, a roadmap parent issue or a slice about to be implemented; Project draft item for everything else, until it becomes an issue.**

- **Issues (33 active cards, updated 2026-11-05; #94, #103, the index issue #102 and the four story issues #104 to #107 included; #57 has no card):** every issue that exists today has a card, except the issues folded into another card on 2026-10-30 (#72, #85, #87, #88, #99, #100: their cards are archived, the issues stay open until the owner decides). The rule stays: the issue exists before implementation.
- **Drafts (56 active cards, updated 2026-11-05, second):** 2 ST, 38 FT, 1 GV, 11 TS, 4 OW. None of these is a new story except the ones marked Draft in their own file; governance is audit remediation, tests wait for the owner decisions and OW lists are human actions. A draft carries title, body with links and the fields; `@devops` converts it to an issue when the slice leaves `Bloqueado`/enters `Pronto`, or when a GV/TS item gets a story.
- **Legacy (2 cards, archived by D-14 on 2026-10-30):** #17 and #18, already `Done`. The owner chose option A, so `@devops` archives them: archived, never deleted, and the issues are not closed.
- **Total:** 163 cards on the board plan = 114 active (33 issues + 81 drafts; includes the 9 cards of the fourth update of 2026-11-06) + 49 archived (OW-18 archived on 2026-11-05, dismissed by the owner) (46 by merge, section 5.1, and the 2 legacy cards #17 and #18 by D-14). The real board has 82 active after the load of 2026-11-05; the difference is the 20 drafts of the second update of 2026-11-05 (FT-55..FT-60, TS-21) and of the update of 2026-11-06 (TS-22..TS-26, FT-61..FT-67, OW-18) and the 4 drafts of the third update of 2026-11-06 (FT-68..FT-70, TS-27).
- Drafts take no issue comments, so the "never comment on issues" rule is not at risk; `@devops` edits the draft body. Pull requests are not cards.
- Inventory item with neither issue nor draft: none. All 127 inventory IDs map to one card; a merged ID maps to its archived card, which points to the surviving card. The only active card without an inventory ID is the index issue #102 (`IDX-102`).

## 3. Sub-issue hierarchy

Create with `gh issue edit <child> --parent <parent>` (or `--add-sub-issue`), `gh` 2.103.2. Today no issue has a parent (the research verified 0 sub-issues on #69, #76, #19, #57).

```text
#69 OPS-15 Panel/overlay migration to Next.js            (roadmap parent issue)
 ├── #72 OPS-16 Explain call-message variables
 ├── #77 OPS-18 Current Account as identity overlay
 ├── #78 OPS-19 Confirm reward when service starts
 ├── FT-01 Page polish                  (new issue now)
 ├── FT-21 D-1 confirmation, FT-22 D-2 position (new issues now)
 ├── FT-23 D-3/D-4 navigation/messages  (issue when it leaves Bloqueado)
 ├── FT-02 CH-2 placeholder validation  (new issue now)
 ├── FT-05 Catalogs to a neutral place  (new issue now)
 ├── FT-06 Endpoint traceability        (new issue now)
 ├── FT-07 Community catalog runtime proof (new issue now)
 ├── FT-08 QRA-13 and QRA-02            (new issue now)
 ├── FT-37..FT-43 Cutover waves 0, 1, 3, 2, 5, 4, 6 (drafts; FT-37 and FT-38 first)
 └── FT-03, FT-04, FT-09, FT-10         (issues when they leave Bloqueado)

OPS-21 API contract (new issue now)                      (story parent issue)
 └── FT-11 .. FT-17  slices 1 to 7      (issue when the slice becomes ready)

OPS-22 Financial recovery and queue deletion              (story parent issue, new now; native "blocks" the cutover of #69)
 ├── #74 Diagnose reconciliation (sub-issue of #80 since 2026-10-27; left #69)
 └── FT-24 (issue now), FT-25, FT-26, FT-36  slices 1 to 4 (issue when the slice becomes ready)

OPS-23 Real-time panel (SSE) and shared state                (story parent issue, new now; native "blocks" the cutover of #69)
 └── FT-27, FT-28, FT-29  slices 1 to 3 (issue when the slice becomes ready)

OPS-24 Backend to TypeScript and Biome                       (story parent issue, new now; does not block the cutover)
 └── FT-30 .. FT-35  slices TS-0 to TS-5 (issue when the slice becomes ready)

OPS-27 Leak guard                                           (story parent issue, new now; Draft; does not block the cutover)
 └── FT-45, FT-46  slices 1 and 2 (issue when the slice becomes ready)

OPS-30 Browser E2E job (delivers TS-17)                      (story parent issue, new now)
 └── FT-51, FT-52  slices 1 and 2

OPS-29 Clean install in CI                                   (story parent issue, new now)
 └── FT-49, FT-50  slices 1 and 2

OPS-28 Static-scan rules                                     (story parent issue, new now)
 └── FT-47, FT-48  slices 1 and 2

#94 ROADMAP Documentation and chat (DOC-2, DOC-3, OPS-14, OPS-17)   (roadmap parent issue, created 2026-10-27)
 ├── #40 DOC-2, #73 OPS-17, #65 OPS-14, #48 DOC-3

#76 OPS-20 Refund eligibility                            (story parent issue)
 └── FT-18, FT-19, FT-20  slices 1 to 3 (issue when the slice becomes ready)
```

Native links once everything exists: 47 (4 existing under #69, 20 OPS-15 slices (the 13 earlier plus the 7 cutover waves), 7 OPS-21, 3 OPS-20, 4 OPS-22, 3 OPS-23 and 6 OPS-24; updated 2026-10-27; fifth update: #74 moves from #69 to #80 and #94 adds 4 links, so 51). **Create now: 13** (#72, #74, #77, #78 and the 6 new slices plus FT-21 and FT-22 under #69, and FT-24 under the OPS-22 issue; the OPS-21 issue is born without a parent, as the story's parent issue). The rest are just-in-time.

Without a parent (independent, linked by native "blocked by" and by Depende de): #57 (OPS-13), #19 (FND-9), #60 (OPS-12); #65, #73, #40 and #48 have the parent #94 since 2026-10-27, and #57 stays open (ST-04 waits for ST-18). Suggested native dependencies: #65 blocked by #57; #73 by #65; #40 by #19; #48 by #40.

Update 2026-11-04 (second): the four stories OPS-27..OPS-30 add four parent issues to create now (17 in total) and eight slices as sub-issues just-in-time (FT-45..FT-52), so 59 native links when everything exists. They have no parent roadmap issue and block nothing in the cutover.

Note: the #69 → #72/#77/#78 relation is textual only in the issue bodies today ([inventory](backlog-inventory.md), section 3); the native link is what the roadmap rule requires.

## 4. Views

The default "View 1" is renamed to the first one below. Filters use the Projects filter syntax; verify in the UI because of the accented names.

| # | Name | Layout | Filter | Grouping | Sort | Visible fields |
|---|---|---|---|---|---|---|
| 1 | Quadro por Situação | Board | `-situação:Concluído` (Concluído in a limited column or archived after 14 days) | Columns = Situação | Ordem ↑ | Prioridade, Responsável, Gate atual, Dificuldade |
| 2 | Plano (prioridade e ordem) | Table | `-situação:Concluído` | Prioridade | Ordem ↑, ID | All fields |
| 3 | Hierarquia (issue-mãe) | Table | `-tipo:"Ação do proprietário"` | Parent issue | Ordem ↑ | Sub-issues progress, Situação, Gate atual |
| 4 | Proprietário (decisões e ações) | Table | `responsável:Proprietário -situação:Concluído` | Situação | Ordem ↑ | Próximo passo, Depende de, Por quê / decisão |
| 5 | Bloqueados | Table | `situação:Bloqueado` | Responsável | Ordem ↑ | Depende de, Próximo passo |
| 6 | Por fase | Table | `-situação:Concluído` | Fase | Prioridade ↑, Ordem ↑ | Situação, Responsável, Gate atual |
| 7 | Em curso por agente | Board | `situação:Pronto,"Em andamento","Em revisão"` | Columns = Responsável | Prioridade ↑ | Situação, Gate atual, Próximo passo |

The **Roadmap** (timeline) layout is not used: it needs planning date or iteration fields and this design does not invent dates (see decision D6). View 3 plays the "roadmap by parent issue" role.

## 5. Initial load

Fill rules (`@devops` loads; no value is invented):

- **Tipo:** by ID prefix: ST = História; FT = Fatia; GV = Governança; TS = Teste; OW = Ação do proprietário.
- **Story**, **Por quê / decisão** and **Evidência:** copied from the row of the same ID in the [inventory](backlog-inventory.md) (columns "Story / issue" and "Line of thought"; evidence = the `@qa` verdict links cited in the row), condensed to one line with a link. Leave empty where no evidence is recorded.
- **Atualizado em:** 2026-10-24 on all (2026-10-27 for FT-37..FT-43 and OW-09; 2026-10-30 for the rows touched by the merges and the new cards).
- **Card:** `#N` = existing issue; "issue nova (agora)" = create before the load; "rascunho" = draft item.
- **Prioridade, Dificuldade, Depende de:** from the inventory. **Ordem:** step of the recommended order (inventory section 2); items outside the listed steps got the closest step by dependency; the cutover waves got decimal sub-steps (FT-37 = 4.1, FT-38 = 4.2, FT-39 = 4.3, FT-40 = 5, FT-41 = 5.1, FT-42 = 8.1, FT-43 = 8.2), so equal values and ties break in execution order by ID (OW-03 = 3 because it closes ST-04; TS-01 to TS-03 = 11; TS-06/08/09 = 14; GV-09, GV-11 = 11; OW-07 = 10; OW-08 to OW-10 = 6; OW-14 = 15; OW-05 and ST-10 = 14).
- **Situação:** by the mapping in section 1.1. ST-02 and ST-03 stay `Em andamento` because the stories are `InProgress` (code implemented, `@qa` gate missing).
- The "Próximo passo" column is in Portuguese, as it will be stored on the board.

| ID | Card | Situação | Fase | Prio | Dif | Responsável | Área | Gate atual | Ordem | Depende de | Próximo passo |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ST-01 | #69 | Em andamento | OPS-15 Migração Next | P0 | GG | @dev | Painel Next | Implementação @dev | 8 | FT-01..FT-10, FT-21..FT-23, FT-37..FT-43, ST-15, ST-16, OW-01..OW-11 | Conduzir as fatias; revisões finais @qa/@architect (FT-09) |
| ST-02 | #77 | Em andamento | Estabilização | P1 | P | @qa | Overlay/OBS | Gate @qa | 3 | — | @qa mapeia AC a evidências e emite veredito |
| ST-03 | #78 | Em andamento | Estabilização | P1 | P | @qa | Twitch/worker | Gate @qa | 3 | — | @qa reexecuta a suíte completa e emite veredito |
| ST-05 | #19 | Backlog | Estabilização | P1 | P | Proprietário | Twitch/worker | Aceite do proprietário | 10 | OW-01, OW-04 | @po/@qa reconciliam checkboxes dos AC; proprietário agenda aceite |
| ST-06 | #65 | Backlog | Chat e mensagens | P2 | G | @sm | Twitch/worker | Planejamento @po | 15 | ST-04, ST-01 | D-02 (tipo Padrão; sem marca vale a opção A): o `@sm` recria a story bilíngue só a partir do corpo da issue #65 (nada é inventado) e o `@po` valida; se o proprietário devolver o arquivo original, vale a opção B. Absorve a OPS-16 (ST-08, #72): a #72 segue aberta até o OK do dono; o corpo da #65 deve citar a junção. |
| ST-07 | #74 | Backlog | OPS-22 Recuperação financeira | P1 | M | @devops | Twitch/worker | Nenhum | 6 | ST-15 | Incorporada à OPS-22 (#80), sem story própria; acompanhar pela ST-15 e manter a sub-issue sob a #80 |
| ST-09 | #79 | Rascunho | OPS-21 Contrato da API | P1 | GG | @devops | API | Planejamento @ux | 2 | GV-03 | @devops cria a issue-mãe; @ux e @qa concluem seus gates |
| ST-10 | #76 | Rascunho | OPS-20 Elegibilidade de devolução | P2 | GG | @po | Banco de dados | Planejamento @po | 14 | ST-01, ST-09, GV-03, OW-05 | Resolver CONCERNS do plano @qa; relabel via GV-03 |
| ST-11 | #73 | Rascunho | Chat e mensagens | P3 | G | @sm | Twitch/worker | Planejamento @po | 15 | ST-06, ST-01 | Política B decidida (D-01, 2026-10-30): palavras fixas por idioma suportado, lista fechada do projeto, sem configuração da pessoa streamer; o `@sm`/`@po` refinam a lista fechada, as colisões e a compatibilidade, depois o `@po` valida |
| ST-12 | #40 | Bloqueado | Documentação | P3 | M | @dev | Docs/processo | Nenhum | 15 | ST-05, FT-10 | Sem ação até a UI ser aceita |
| ST-13 | #48 | Bloqueado | Documentação | P3 | G | @po | Docs/processo | Nenhum | 15 | ST-05, ST-12 | Sem ação ainda |
| ST-14 | #60 | Bloqueado | Instalador | P3 | G | @ux-design-expert | Infra/CI | Nenhum | 15 | `.release-stage` = rc (proprietário) | Nenhuma até a promoção para rc |
| ST-15 | #80 | Em andamento | OPS-22 Recuperação financeira | P1 | GG | @dev | Twitch/worker | Implementação @dev | 4 | ST-01 (dependência do corte) | GO do @po 9,5; @architect e @data-engineer concluídos (ciclo de 6 tentativas 1/4/16/60/60 min, sem migration, 4 defeitos de código a absorver, deps `@twurple/common`/`@twurple/api-call` 8.2.0); falta o plano de testes do @qa; começar pela FT-24 |
| ST-16 | #81 | Pronto | OPS-23 Tempo real | P1 | GG | @architect | Painel Next | Planejamento @architect | 6 | ST-01, FT-01 | GO do @po 9,0; desenho do @architect e plano @ux >= 9,0; proprietário decide OD-23-1 (texto da OPS-15) e OD-23-2 (metas: caminho ao vivo 2 s p95, janela de 60 s) |
| ST-17 | #91 | Pronto | OPS-24 TypeScript e Biome | P2 | GG | @architect | API | Planejamento @architect | 16 | ST-15 (OPS-22 primeiro) | GO do @po 9,0; @architect, @data-engineer e @qa concluem seus gates; proprietário decide OD-24-1..3 (a OPS-23 espera só a TS-0 e a TS-2) |
| ST-18 | #109 | Bloqueado | Estabilização | P2 | M | @po | Overlay/OBS | Planejamento @po | 16 | ST-01, redução das tarefas do quadro, OW-03 | Story OPS-25 em Draft: validar o widget da conta no overlay Next (OBS nativo; @qa executa, @ux-design-expert ≥ 9,0); issue pelo @devops quando pronta. Absorve a ST-04 (OPS-13): a #57 segue aberta e vira acompanhamento da OPS-25 até existir a issue própria. Em 2026-11-05 o quadro real não tem card da #57 (a ST-18 é rascunho); o `@devops` só vincula a #57 quando existir a issue da OPS-25. **Owner decision 2026-11-05:** before the bump only the widget subset (AC-W-1..7) is checked, on this machine's local OBS; full validation stays after the migration. |
| ST-19 | #108 | Bloqueado | Chat e mensagens | P2 | M | @po | Twitch/worker | Planejamento @po | 16 | ST-01 (#69 integrada no main), ST-15 | Story OPS-26 em Draft: `ping` com latência real (D-8) e `status` do streamer; só depois do merge da branch no main; issue pelo @devops quando pronta. Inclui a TS-13 (teste obrigatório do D-8) e a TS-14 (testes do `status`) como parte da story OPS-26. **Owner decision 2026-11-05:** slice A (`ping`, D-8) goes now; `status` stays for the 0.4.0-beta. |
| ST-20 | #104 | Rascunho | Qualidade e testes | P1 | M | @po | Infra/CI | Planejamento @po | 8.3 | Pacote da OPS-22 comitado | Story OPS-27 em Draft (ideia nº 5, a primeira da ordem): hook local e job de CI que reprovam o host de sessão, o trailer de sessão e formatos de credencial em commits, arquivos e corpos de PR e de issue; o `@po` valida; o `@devops` cria a issue-mãe a partir de `improvement-issue-bodies-2026-11-04`; régua de 9,5 em `improvement-actions-2026-11-04` Issue #104 criada pelo `@devops` (verificada no quadro real em 2026-11-05). |
| ST-21 | #107 | Rascunho | Qualidade e testes | P2 | M | @po | Infra/CI | Planejamento @po | 8.6 | ST-20 (desenho da FT-45), FT-30 (ordem em `rules.yml`, branda) | Story OPS-28 em Draft (ideia nº 4): regras do OpenGrep para SQL cru, `eval`/`Function`, SSRF, segredo em código, `dangerouslySetInnerHTML` e cabeçalhos e cookies, cada uma com teste positivo e negativo; o OpenGrep segue como único revisor; o `@po` valida; o `@devops` cria a issue Issue #107 criada pelo `@devops` (verificada no quadro real em 2026-11-05). |
| ST-22 | #106 | Rascunho | Qualidade e testes | P2 | M | @po | Infra/CI | Planejamento @po | 8.5 | ST-20 e ST-23 (workflows em série), verificação da capacidade do runner | Story OPS-29 em Draft (ideia nº 10): clone limpo e primeiro uso (instalar, iniciar, abrir, atualizar) em Linux, macOS e Windows sem pasta preexistente; cada passo rotulado Docker real ou falso isolado; Windows e macOS reais seguem com o proprietário (OW-01, D-05); o `@po` valida; o `@devops` cria a issue Issue #106 criada pelo `@devops` (verificada no quadro real em 2026-11-05). |
| ST-23 | #105 | Rascunho | Qualidade e testes | P2 | M | @po | Infra/CI | Planejamento @po | 8.4 | ST-20 (workflows em série), TS-15 (concluída) | Story OPS-30 em Draft (ideia nº 1, entrega a TS-17): job de CI com os scripts `*-browser-only`; script instável é investigado e nunca repetido até passar; nenhuma mudança de workflow sem `@architect` e `@devops`; o `@po` valida; o `@devops` cria a issue Issue #105 criada pelo `@devops` (verificada no quadro real em 2026-11-05). |
| ST-24 | #115 | Pronto | Chat e mensagens | P2 | GG | @architect | Twitch/worker | Planejamento @architect | 8.9 | OPS-20 (união decidida pelo @architect) | GO do @po 8,7/10 e issue #115 (Story Pronta); `@architect`, `@data-engineer` e `@ux-design-expert` (≥ 9,0) planejam antes do `@dev`; plano de testes do `@qa` |
| ST-25 | rascunho | Rascunho | Chat e mensagens | P2 | GG | @po | Painel Next | Planejamento @po | 9.0 | ST-24 (avisos e devolução da OPS-31) | Story OPS-32 em Draft (decisões do dono, 2026-11-06): calendário de ciclos com reinício automático por jogo, presets de filas e recompensas e guia "Filas antigas" de 7 dias; candidata à 0.4.0-beta (decisão do dono pendente); o `@po` valida; issue #117 criada |
| FT-01 | #83 | Pronto | OPS-15 Migração Next | P0 | G | @ux-design-expert | Painel Next | Planejamento @ux | 8 | FT-02, FT-05 | Planos @ux por página (>= 9,0); depois @dev test-first. D-08 = A (2026-11-05): a posição do seletor de idioma fica neste plano |
| FT-02 | #84 | Pronto | OPS-15 Migração Next | P1 | P | @dev | API | Implementação @dev | 4 | — | Red em token desconhecido na criação de fila; depois @qa. Ciclo único com a FT-08 (#88): QRA-13 e QRA-02 conferidos no mesmo ciclo; #88 segue aberta. |
| FT-04 | rascunho | Pronto | OPS-15 Migração Next | P2 | P | @architect | Painel Next | Planejamento @architect | 11 | OW-09 (resolvida), FT-37, FT-39 | Coberta pelas ondas FT-37 (script) e FT-39 (aliases); fechar quando ambas passarem no @qa |
| FT-06 | #86 | Em andamento | OPS-15 Migração Next | P1 | G | @qa | API | Gate @qa | 8 | FT-01 (só E2E da FT-03) | Atualizar inventário de endpoints conforme as fatias entram. Ciclo de testes único com a FT-03 (E1-E8, depois da UI estabilizar); #86 cobre os dois. |
| FT-09 | rascunho | Pronto | OPS-15 Migração Next | P1 | M | @qa | Painel Next | Gate @qa | 12 | FT-06 (rastreabilidade; ver po-validation-ft-09) | Pendente (reconciliada em 2026-11-06): revisões independentes @qa e @architect da migração completa, repetição da auditoria de testes legados, checagens OWN-16..18 por agentes no navegador |
| FT-10 | rascunho | Concluído | OPS-15 Migração Next | P1 | G | @dev | Painel Next | Aceite do proprietário | 13 | FT-09, ST-15, ST-16, FT-21..FT-23, OW-01..OW-11, TS-10, TS-12 | Remoção decomposta nas ondas FT-37..FT-43 (2026-10-27); fica como proposta de fechamento e aceite; executar com autorização explícita. Cumprida em 2026-11-06 pelas ondas 4 a 6 (FT-42, FT-41, FT-43; PR #101, merge 4488443) |
| FT-11 | rascunho | Bloqueado | OPS-21 Contrato da API | P1 | M | @devops | API | Plano de testes @qa | 7 | FT-02, ST-09 | Criar sub-issue; @qa plano; depois @dev Red-first. Ciclo único com a FT-12 (fatias 1+2) após o @architect. |
| FT-13 | rascunho | Bloqueado | OPS-21 Contrato da API | P2 | G | @dev | Painel Next | Planejamento @ux | 9 | FT-12, OW-15 | @ux >= 9,0 e decisão 4 do proprietário. Ciclo único com a FT-16 (fatias 3+6) após o @architect; a fatia 6 depende das fatias 3-5, então o @architect fixa a ordem em relação ao ciclo da FT-14. |
| FT-14 | rascunho | Bloqueado | OPS-21 Contrato da API | P2 | G | @dev | Banco de dados | Planejamento @data-engineer | 9 | FT-12, OW-15 | @data-engineer coordena; nunca junto de trabalho de UI. Ciclo único com a FT-15 (fatias 4+5) após o @architect. FT-17 (fatia 7) segue à parte. |
| FT-17 | rascunho | Bloqueado | OPS-21 Contrato da API | P3 | P | @dev | API | Aceite do proprietário | 13 | FT-10, OW-15 | Junto da remoção do painel vanilla |
| FT-18 | rascunho | Bloqueado | OPS-20 Elegibilidade de devolução | P2 | G | @dev | Banco de dados | Planejamento @data-engineer | 14 | ST-01, FT-11, GV-03 | Só após a migração OPS-15 |
| FT-19 | rascunho | Bloqueado | OPS-20 Elegibilidade de devolução | P2 | G | @dev | Twitch/worker | Planejamento @data-engineer | 14 | FT-18, OW-05 | Só após FT-18 |
| FT-20 | rascunho | Bloqueado | OPS-20 Elegibilidade de devolução | P2 | G | @dev | Painel Next | Planejamento @ux | 14 | FT-19 | @ux >= 9,0; textos do painel só quando a fatia sair |
| FT-21 | #89 | Em revisão | OPS-15 Migração Next | P1 | P | @dev | Twitch/worker | Implementação @dev | 4 | FT-24 (sequência) | Red em parser+handler para `CONFIRMAR`/`Confirmar`/rótulo `en`; depois @qa |
| FT-22 | #90 | Em revisão | OPS-15 Migração Next | P1 | P | @data-engineer | Banco de dados | Planejamento @data-engineer | 4 | FT-21 (sequência, mesmo arquivo) | Confirmar `outbox.payload` sem DDL; depois @dev Red-first e @qa em PostgreSQL |
| FT-23 | #103 | Bloqueado | OPS-15 Migração Next | P1 | M | @ux-design-expert | Painel Next | Planejamento @ux | 8 | FT-25, FT-36 (ciclo da OPS-22; FT-26 absorvida); FT-28 é dependência branda (D-23-1) | Plano @ux >= 9,0 (textos, região viva, foco); depois @dev Red-first. Viaja no ciclo único da OPS-22 (FT-25) e divide com a FT-36 o plano de UX compartilhado (>= 9,0); mantém o card próprio (Fase OPS-15). Story da fatia redigida em 2026-11-04 (Rascunho) e issue #103; desacoplada da FT-28 (D-23-1). |
| FT-24 | #82 | Em revisão | OPS-22 Recuperação financeira | P0 | P | @dev | Twitch/worker | Implementação @dev | 4 | ST-15 | Red de contrato com instâncias reais do Twurple; depois @dev e @qa; acrescenta `@twurple/common` e `@twurple/api-call` 8.2.0 |
| FT-25 | #98 | Bloqueado | OPS-22 Recuperação financeira | P1 | G | @ux-design-expert | Banco de dados | Planejamento @ux | 8 | FT-24, ST-15, contrato OPS-21, plano de UX compartilhado (FT-23 + FT-36) | Planejamento fechado: ciclo de 6 tentativas (1/4/16/60/60 min), sem migration; absorver `markRedemptionUnknown` e a retentativa manual; Red em PostgreSQL após a FT-24. CICLO ÚNICO DA OPS-22 (dono, 2026-10-30): absorve FT-26 (#99) e FT-36 (#100); a FT-23 viaja no mesmo ciclo; UM plano de UX compartilhado (FT-23 + FT-36, @ux >= 9,0) antes do @dev; as issues #99 e #100 seguem abertas (nenhuma fecha sem OK do dono). |
| FT-27 | rascunho | Bloqueado | OPS-23 Tempo real | P1 | G | @analyst | API | Planejamento @architect | 8 | ST-16, `sse-research.md` | Ler a nota de SSE; @architect fixa modelo de eventos, fronteira de processo e proxy |
| FT-28 | rascunho | Bloqueado | OPS-23 Tempo real | P1 | M | @architect | Painel Next | Planejamento @architect | 8 | ST-16, ordem em relação à FT-01 | Definir a ordem com a FT-01 (mesmo conjunto de escrita); plano @ux >= 9,0. Ciclo único com a FT-29 (fatias 2+3 da OPS-23). |
| FT-30 | rascunho | Bloqueado | OPS-24 TypeScript e Biome | P2 | G | @architect | Infra/CI | Planejamento @architect | 16 | ST-17, OW-13 (evidência de CI) | @architect fixa a configuração e o texto do `AGENTS.md`; prova Red por gate; canário `credential-fingerprint.mjs` |
| FT-31 | rascunho | Bloqueado | OPS-24 TypeScript e Biome | P2 | G | @architect | Twitch/worker | Planejamento @architect | 16 | FT-30, FT-24 | Após a FT-24: medir erros do strict na pasta; depois Red com instâncias reais do Twurple |
| FT-32 | rascunho | Bloqueado | OPS-24 TypeScript e Biome | P2 | M | @architect | Twitch/worker | Planejamento @architect | 16 | FT-30, FT-25, FT-26 | Após FT-25 e FT-26; testes de outbox em PostgreSQL sem alteração |
| FT-33 | rascunho | Bloqueado | OPS-24 TypeScript e Biome | P2 | G | @architect | API | Planejamento @architect | 16 | FT-30, FT-27, FT-11, FT-12 | @architect escolhe as 5 rotas com schema e a ordem em relação à FT-27 |
| FT-34 | rascunho | Bloqueado | OPS-24 TypeScript e Biome | P2 | G | @data-engineer | Banco de dados | Planejamento @data-engineer | 16 | FT-30, FT-26, FT-14 | Contagem de erros do strict pelo @qa; decidir a divisão do repositório com @data-engineer |
| FT-35 | rascunho | Bloqueado | OPS-24 TypeScript e Biome | P2 | M | @architect | API | Planejamento @architect | 16 | FT-31..FT-34 | Após as fatias de pasta: `strict: true` global e troca da entrada |
| FT-37 | #92 | Em revisão | OPS-15 Migração Next | P0 | P | @dev | Painel Next | Aceite do proprietário | 4.1 | — (FT-23, ST-15, ST-16 bloqueiam a conclusão da OPS-15, não a onda) | Onda 0 comitada (08e84cb), @qa CONCERNS 9,2, em revisão até o merge. Absorve TS-01 e o script da FT-04 |
| FT-38 | #93 | Em revisão | OPS-15 Migração Next | P0 | M | @dev | Painel Next | Aceite do proprietário | 4.2 | FT-37 (comitada) | Onda 1 comitada (384a7e7), @qa CONCERNS 9,0, em revisão até o merge: `/` servida pelo Next, 3 rewrites e `registerWebRoutes` removidos; @qa com classe C (Compose) obrigatória |
| FT-39 | #95 | Em revisão | OPS-15 Migração Next | P1 | P | @dev | Overlay/OBS | Aceite do proprietário | 4.3 | FT-38 | Onda 3 comitada (906fd5c), @qa CONCERNS 9,0, em revisão até o merge: overlay vanilla e aliases de `/overlay.html` removidos (URL do OBS na rota do Next). Absorve os aliases da FT-04 |
| FT-40 | #96 | Em revisão | OPS-15 Migração Next | P1 | M | @dev | Painel Next | Aceite do proprietário | 5 | FT-39 (mesmo `server.mjs` da onda 1), FT-05, TS-04 | Onda 2 comitada (ec12ae0), @qa CONCERNS 9,3, em revisão; executa FT-05 e TS-04; `git mv` dos catálogos para `apps/shared/localization/catalogs/` (DP-3 do proprietário); `build:frontend` isolado e imagem; 3-5 h @dev, 1,5-2,5 h @qa. Absorve FT-05 (#85) e FT-07 (#87) (junção aprovada 2026-10-30; FT-07 sujeita à confirmação do @po: o caso de catálogo de comunidade instalado depois do build passou no compose-runtime); #85 e #87 seguem abertas até o OK do dono. |
| FT-41 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | M | @data-engineer | API | Planejamento @data-engineer | 5.1 | FT-40 | Onda 5: @data-engineer confirma linhas vivas `archiveAfterConfirm`; @po aceita a FR-10; depois @dev Red do 404 JSON e remove a rota e `archiveQueue`; 2-4 h @dev, 1,5-2 h @qa |
| FT-42 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | M | @dev | Painel Next | Implementação @dev | 8.1 | FT-41, TS-10 (6 ports provados não vazios) | Onda 4: remover painel vanilla e `apps/web`, reapontar o job `web`; antes do commit do Biome (FT-30); absorve TS-12; 3-5 h @dev, 3-4 h @qa. Inclui a TS-10 (ports classe B) e a TS-12 (testes classe C) como parte da onda 4 (viajam com ela); a TS-10 segue como pré-requisito da remoção. |
| FT-43 | rascunho | Bloqueado | OPS-15 Migração Next | P2 | P | @dev | Infra/CI | Implementação @dev | 8.2 | FT-38, FT-42 | Onda 6: remover `API_ONLY` e `@fastify/static`; @po fecha CA 9/15; 1-2 h @dev, 1 h @qa |
| FT-44 | rascunho | Backlog | OPS-23 Tempo real | P2 | M | @architect | Painel Next | Planejamento @architect | 8 | ST-16, FT-13 | Timeout/AbortSignal nas LEITURAS do painel (`lib/api/client.mjs:27` sem timeout; `loadPanelSnapshot` espera 5 requisições em `Promise.all`): API que aceita a conexão e não responde prende o painel em "Carregando idiomas…"; mutações mantêm o caminho de resultado incerto; severidade baixa-média; escopo candidato da OPS-23, liga à OPS-21; @ux-design-expert (>= 9,0) se mudar texto visível |
| FT-45 | rascunho | Backlog | Qualidade e testes | P1 | P | @architect | Infra/CI | Planejamento @architect | 8.3 | ST-20 | OPS-27 fatia 1: núcleo da verificação (função pura), hook local e ativação documentada; o `@architect` fixa padrões com fontes, hook e lista de exceções; depois `@dev` test-first e `@qa` com Git real |
| FT-46 | rascunho | Backlog | Qualidade e testes | P1 | M | @architect | Infra/CI | Planejamento @architect | 8.3 | FT-45; workflow em série com FT-49 e FT-51 | OPS-27 fatia 2: job de CI em pull requests e verificação dos corpos de PR e de issue (corpo como dado, nunca comentários); depois do desenho do `@architect` e da revisão do workflow pelo `@devops` |
| FT-47 | rascunho | Backlog | Qualidade e testes | P2 | M | @architect | Infra/CI | Planejamento @architect | 8.6 | ST-21 | OPS-28 fatia 1: regras de SQL cru, execução dinâmica de código e SSRF mais o mecanismo de teste das regras; cada regra com fixture positiva, negativa e de evasão |
| FT-48 | rascunho | Backlog | Qualidade e testes | P2 | M | @architect | Infra/CI | Planejamento @architect | 8.6 | FT-47, ST-20 (desenho) | OPS-28 fatia 2: regras de segredo em código, `dangerouslySetInnerHTML` (JSX) e cabeçalhos e cookies; sem lista de padrões duplicada com a OPS-27 |
| FT-49 | rascunho | Backlog | Qualidade e testes | P2 | M | @architect | Infra/CI | Planejamento @architect | 8.5 | ST-22; workflow em série com FT-46 e FT-51 | OPS-29 fatia 1: clone limpo e fluxo de primeiro uso no Linux com Docker real; asserção de estado limpo; regressão plantada deixa o job vermelho |
| FT-50 | rascunho | Backlog | Qualidade e testes | P2 | M | @architect | Infra/CI | Planejamento @architect | 8.5 | FT-49 | OPS-29 fatia 2: primeiro uso em diretório limpo no macOS e no Windows, cada passo rotulado; antes, verificar a capacidade do runner (índice de pesquisas primeiro) |
| FT-51 | rascunho | Backlog | Qualidade e testes | P2 | M | @architect | Infra/CI | Planejamento @architect | 8.4 | ST-23; workflow em série com FT-46 e FT-49 | OPS-30 fatia 1: job de CI dos scripts `*-browser-only` e o teste de contrato do workflow (lista vinda da pasta, sem repetição); nome distinto do job `web` que a onda 4 reaponta |
| FT-52 | rascunho | Backlog | Qualidade e testes | P2 | P | @architect | Infra/CI | Planejamento @architect | 8.4 | FT-51 | OPS-30 fatia 2: prova de estabilidade e política de instabilidade (investigar, nunca repetir até ficar verde); números 10 e 5 são propostas do `@architect` |
| FT-53 | rascunho | Backlog | OPS-22 Recuperação financeira | P3 | P | @architect | API | Planejamento @architect | 8.7 | Pacote da OPS-22 comitado | Gate de 2026-11-05, L-2: manter ou melhorar o 409 `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` depois de uma leitura 401 (hoje o painel diz "pode ter chegado à Twitch", não "reautorize") e o `@po` escreve o limite da pausa restaurada na story da OPS-22; se mudar texto visível, plano `@ux-design-expert` >= 9,0; sub-issue da #80 só na hora |
| FT-54 | rascunho | Backlog | OPS-22 Recuperação financeira | P2 | P | @ux-design-expert | Painel Next | Planejamento @ux | 8.7 | Pacote da OPS-22 comitado | Gate de 2026-11-05, L-3: registrar o reconhecimento de UX dos textos no singular `confirm.delete_local.one` e `confirm.delete_converted.one` (en/es/pt-BR) e trocar o "reward" herdado do pt-BR por "recompensa"; depois `@dev` test-first (paridade de localização); sub-issue da #80 só na hora |
| FT-55 | rascunho | Pronto | OPS-22 Recuperação financeira | P2 | P | @dev | API | Implementação @dev | 8.8 | — | Defeito D-6, só diagnóstico: logs estruturados `twitch_integration_degraded` em toda transição para `degraded` (nota do `@architect`, D-A3); causa raiz só com a stream ao vivo (proprietário); mãe OPS-22 (#80), sub-issue só na hora |
| FT-56 | rascunho | Backlog | Estabilização | P3 | P | @ux-design-expert | Painel Next | Planejamento @ux | 8.8 | OK do proprietário | Achado de UX: `--danger` indefinido no CSS (aviso de erro do seletor de idioma herda a cor); depende do OK do proprietário; pode dividir ciclo com a FT-57 |
| FT-57 | rascunho | Backlog | Estabilização | P3 | P | @ux-design-expert | Painel Next | Planejamento @ux | 8.8 | OK do proprietário | Achado de UX: select de idioma e aviso com texto de 10 px (mínimo 12 px); depende do OK do proprietário |
| FT-58 | rascunho | Backlog | Estabilização | P3 | P | @ux-design-expert | Painel Next | Planejamento @ux | 8.8 | — | Achado de UX: foco perdido ao desabilitar o select de idioma durante o salvamento; correção de acessibilidade, sem OK do proprietário |
| FT-59 | rascunho | Backlog | Estabilização | P3 | P | @ux-design-expert | Painel Next | Planejamento @ux | 8.8 | FT-54 | Achado de UX: 12 chaves do painel pt-BR ainda com "reward" fora da família da OPS-22 (regra: "recompensa"); sem OK do proprietário |
| FT-60 | rascunho | Backlog | Estabilização | P3 | P | @ux-design-expert | Painel Next | Planejamento @ux | 8.8 | FT-54 | Achado de UX: redação es de `confirm.delete_converted.*` ("la comunicación con Twitch" contra "solicitações de sincronização"); correção de paridade, sem OK do proprietário |
| FT-61 | rascunho | Backlog | Estabilização | P2 | P | @ux-design-expert | Overlay/OBS | Planejamento @ux | 8.8 | ST-18 | Achado de UX N-1: informar a altura mínima da Browser Source no formulário do widget e no runbook e colocar a linha de status dentro da caixa do widget; `@ux-design-expert` planeja, `@dev` aplica |
| FT-62 | rascunho | Backlog | Estabilização | P2 | P | @ux-design-expert | Overlay/OBS | Planejamento @ux | 8.8 | FT-61 | Achado de UX N-2: acrescentar sombra de texto ou fundo à linha de status do widget para que fique legível em cenas claras; OK do proprietário, depois `@ux-design-expert` planeja |
| FT-63 | rascunho | Backlog | Estabilização | P1 | P | @dev | Overlay/OBS | Implementação @dev | 3 | OW-18 | Achado de UX N-3: listar a URL legada `/overlay.html` no runbook da OPS-25 e verificar se existe um tipo de widget de nome da fila (se não, propor uma story); `@dev` edita o runbook; `@po` decide a story |
| FT-64 | rascunho | Backlog | Estabilização | P2 | P | @qa | Overlay/OBS | Gate @qa | 8.8 | ST-18 | Achado de UX N-4: verificar um build de produção (`next build`) no OBS nativo, incluindo a ausência do selo de desenvolvimento do Next; `@qa` executa |
| FT-65 | rascunho | Backlog | Estabilização | P3 | P | @dev | Overlay/OBS | Implementação @dev | 17 | — | Achado de UX N-5: nota no runbook: nunca transmitir com `dev:start` (selo de desenvolvimento do Next e comportamento só de desenvolvimento na Browser Source); `@dev` edita o runbook |
| FT-66 | rascunho | Backlog | Estabilização | P3 | P | @dev | Infra/CI | Implementação @dev | 17 | — | O banner do `dev:start` deve mostrar `https://localhost:3000` (o endereço em que a sessão vale), e não `127.0.0.1`; `@dev` corrige |
| FT-67 | rascunho | Backlog | Estabilização | P3 | P | @ux-design-expert | Painel Next | Planejamento @ux | 17 | — | O painel deve dizer que a sessão não vale em `127.0.0.1` em vez do texto genérico `panel.error.generic`; `@ux-design-expert` define o texto, `@dev` aplica |
| FT-68 | rascunho | Backlog | Estabilização | P3 | P | @dev | Infra/CI | Implementação @dev | 17 | — | O desligamento gracioso da API sob `node --watch` trava depois de trocar arquivos e a API não volta (só dev); `@architect` ou `@dev` confirma a causa, depois `@dev` test-first |
| FT-69 | rascunho | Backlog | OPS-22 Recuperação financeira | P3 | P | @dev | API | Implementação @dev | 17 | ST-15 | A reconciliação não deve sinalizar `partial`/`reward_verification_failed` para uma recompensa que o próprio produto excluiu (404 esperado); `@architect` decide, `@dev` aplica |
| FT-70 | rascunho | Backlog | Estabilização | P3 | P | @ux-design-expert | Painel Next | Planejamento @ux | 17 | — | Documentar que o segundo resgate de quem já tem entrada ativa é reembolsado automaticamente (`duplicate_active_entry`); `@ux-design-expert` define onde, depois docs en e pt-BR |
| FT-71 | rascunho | Backlog | Chat e mensagens | P2 | M | @ux-design-expert | Twitch/worker | Planejamento @ux | 8.9 | ST-24 | OPS-31 fatia a: avisos de chat (entrada, fim de atendimento, pausa/fechamento) e textos nos 3 idiomas; primeiro da ordem |
| FT-72 | rascunho | Backlog | Chat e mensagens | P2 | M | @ux-design-expert | Twitch/worker | Planejamento @ux | 8.9 | ST-24, FT-71 | OPS-31 fatia b: não compareceu, pular e reordenar com mensagem no chat; em entrada de grupo especial o painel pergunta ao streamer na hora se devolve (sem devolução automática) |
| FT-73 | rascunho | Backlog | Chat e mensagens | P2 | P | @ux-design-expert | Overlay/OBS | Planejamento @ux | 8.9 | ST-24; ST-16 | OPS-31 fatia c: "próximo" no widget da conta |
| FT-74 | rascunho | Backlog | OPS-22 Recuperação financeira | P2 | G | @architect | API | Planejamento @architect | 8.9 | ST-24 | OPS-31 fatia d: `settlement` por fila, grupos de devolução e lista própria (modelo de dados, painel); `@architect` e `@data-engineer` em um desenho só com a OPS-20 |
| FT-75 | rascunho | Backlog | OPS-22 Recuperação financeira | P2 | G | @architect | Twitch/worker | Planejamento @architect | 8.9 | FT-74 | OPS-31 fatia e: consulta de grupo, escopos opcionais (um por grupo ativado) e reautorização |
| FT-76 | rascunho | Backlog | OPS-22 Recuperação financeira | P2 | G | @dev | API | Implementação @dev | 8.9 | FT-74, FT-75 | OPS-31 fatia f: devolução ao terminar o atendimento (uma intenção terminal por resgate); cancelar/pular/não compareceu: o streamer decide na hora |
| FT-77 | rascunho | Backlog | OPS-22 Recuperação financeira | P2 | M | @ux-design-expert | Painel Next | Planejamento @ux | 8.9 | FT-75, FT-76 | OPS-31 fatia g: estado "verificar grupo" no painel (nunca devolver nem cumprir sozinho) |
| FT-78 | rascunho | Backlog | Qualidade e testes | P2 | M | @qa | Twitch/worker | Gate @qa | 8.9 | FT-71..FT-77 (por grupo); OW-03 | OPS-31 fatia h: testes no canal de testes SubaruShogun (seis itens que só um teste real fecha); `@qa` executa com veredito |
| FT-79 | rascunho | Backlog | Chat e mensagens | P2 | M | @analyst | Docs/processo | Planejamento @po | 9.0 | ST-24 | OPS-32 fatia a: catálogo versionado de jogos, modos e ciclos (esquema, fuso fixo, alarme de CI) e confirmação do dono por linha na contagem regressiva do jogo; primeiro da ordem |
| FT-80 | rascunho | Backlog | Chat e mensagens | P2 | M | @ux-design-expert | Painel Next | Planejamento @ux | 9.0 | FT-79 | OPS-32 fatia b: escolha do jogo e do servidor e sugestão de filas e recompensas (presets editáveis; só cria depois da confirmação) |
| FT-81 | rascunho | Backlog | Chat e mensagens | P2 | G | @architect | Twitch/worker | Planejamento @architect | 9.0 | FT-79, FT-82, FT-76 | OPS-32 fatia c: reinício automático idempotente por (fila, ciclo) e estado "calendário vencido" (recusa reiniciar sem linha futura confirmada) |
| FT-82 | rascunho | Backlog | Chat e mensagens | P2 | G | @architect | Banco de dados | Planejamento @architect | 9.0 | FT-74, FT-76 | OPS-32 fatia d: guia "Filas antigas" e retenção de 7 dias (arquivo atômico, devolução por pessoa ou em lote, expurgo de ids); `@data-engineer` no esquema |
| FT-83 | rascunho | Backlog | Chat e mensagens | P2 | M | @ux-design-expert | Painel Next | Planejamento @ux | 9.0 | FT-82 | OPS-32 fatia e: política padrão nas Configurações (devolver, manter, cumprir; valores finais do `@po`/`@architect`) e aviso nos dias 5 a 6 e 24 h antes do fim |
| FT-84 | rascunho | Backlog | Chat e mensagens | P2 | G | @dev | Twitch/worker | Implementação @dev | 9.0 | FT-82, FT-83 | OPS-32 fatia f: cancelamentos em lote no fim da retenção (50 ids por chamada, espera em 429, 404 como feito, retomada após parada) |
| FT-85 | rascunho | Backlog | Chat e mensagens | P2 | M | @qa | Twitch/worker | Gate @qa | 9.0 | FT-79..FT-84 (por grupo); OW-03 | OPS-32 fatia g: testes no canal de testes SubaruShogun (quatro itens que só um teste real fecha: T1 a T4); `@qa` executa com veredito |
| GV-01 | rascunho | Pronto | Governança | P0 | P | @architect | Docs/processo | Planejamento @architect | 1 | — | Reescrever "nunca comentar"; @dev atualiza o teste; @qa valida. PASSADA ÚNICA DE REGRAS (dono, 2026-10-30): GV-01..GV-08 e GV-10..GV-12; @architect aplica, @qa faz uma revisão de conteúdo (GV-10), @devops comita; GV-09 (CI) viaja com a TS-06 no ciclo da TS-02. |
| GV-13 | #94 | Backlog | Documentação | P2 | P | @sm | Docs/processo | Nenhum | 16 | — | Issue-mãe do roadmap Documentação e chat; @devops vincula as sub-issues #40, #73, #65, #48 (ST-12, ST-11, ST-06/OPS-14, ST-13/DOC-3); OPS-14 sem arquivo de story: lacuna de rastreabilidade |
| TS-01 | rascunho | Em revisão | Qualidade e testes | P2 | P | Proprietário | Painel Next | Nenhum | 11 | — | Executada na onda 0 (FT-37, 08e84cb) sob a autorização do cutover incremental. |
| TS-02 | rascunho | Pronto | Qualidade e testes | P2 | P | @dev | Docs/processo | Implementação @dev | 11 | — | D-12 = A (dono, 2026-10-30): o `@dev` remove os 3 testes de status histórico e o `@qa` confirma que nenhuma regra atual perdeu cobertura; o `@devops` abre a issue. CICLO ÚNICO DE TESTES (dono, 2026-10-30): TS-02, TS-03, TS-05, TS-06, TS-09 e a GV-09 (CI, junto da TS-06); a TS-01 já foi feita na onda 0. A TS-05 usa as medições do ciclo da TS-07 (TS-11). |
| TS-04 | rascunho | Bloqueado | Qualidade e testes | P1 | P | @dev | Painel Next | Implementação @dev | 5 | FT-05 | Parcial: checagem de caminho em string entregue na onda 2 (FT-40); fusão do teste de fronteira duplicado fica para a onda 4 (FT-42); segue Bloqueado |
| TS-07 | rascunho | Pronto | Qualidade e testes | P2 | G | @dev | Infra/CI | Implementação @dev | 14 | TS-11 (medições primeiro) | D-13 = A (dono, 2026-10-30). ORDEM: a TS-11 mede primeiro (tempos unitários isolados, contagem de integração, primeiro CI da branch) e só depois a TS-07 implementa, se o ganho se confirmar; o card arquivado da TS-11 não é recriado. CICLO ÚNICO (dono, 2026-10-30): TS-07, TS-08 e TS-11 (medições primeiro). |
| TS-15 | rascunho | Concluído | Qualidade e testes | P2 | P | @dev | Infra/CI | Nenhum | 11 | — | Concluída: correção 0644cec (PR #101); gate @qa de 2026-10-30; o defeito do harness M-2 foi resolvido em 8bb05d8. |
| TS-16 | rascunho | Bloqueado | OPS-24 TypeScript e Biome | P2 | M | @architect | Painel Next | Planejamento @architect | 16 | FT-30, FT-42 | Tipar o JSX do painel Next e devolvê-lo ao `typecheck:web` (59 erros em 14 arquivos, `frontend-jsx-typecheck-backlog.md`); dentro da OPS-24; sem cast nem ignore; a contagem não pode crescer |
| TS-17 | rascunho | Backlog | Qualidade e testes | P2 | M | @po | Infra/CI | Planejamento @po | 8.4 | ST-23 | Entregue pela ST-23 (OPS-30), story em Draft desde 2026-11-04 (ideia nº 1): job de CI com os scripts `*-browser-only` (12 no levantamento, 13 arquivos em 2026-11-04; Next dev em HTTPS + Chrome, ~10 s cada); hoje nenhum workflow os roda e o queue-lifecycle ficou quebrado 4/4 sem alerta; o `@po` valida; o `@devops` cria a issue na hora |
| TS-18 | rascunho | Backlog | Qualidade e testes | P2 | P | @dev | Banco de dados | Implementação @dev | 8.7 | Pacote da OPS-22 comitado | Gate de 2026-11-05, L-1: o PG36-16 afirma o `isOpen` local depois de um DELETE tardio (`open_unknown`) ou o `@data-engineer` documenta a semântica do flag; ciclo possível com TS-19 e TS-20 |
| TS-19 | rascunho | Backlog | Qualidade e testes | P2 | M | @qa | Infra/CI | Gate @qa | 8.7 | Pacote da OPS-22 comitado | Gate de 2026-11-05, M-2: o `@qa` reproduz as mutações M2, M3, M5, M7, M8, M11, M15, M16 e M19 do plano da OPS-22 em cópia isolada e restaura byte a byte; o `@dev` só entra se alguma sobreviver |
| TS-20 | rascunho | Backlog | Qualidade e testes | P3 | P | @data-engineer | Banco de dados | Planejamento @data-engineer | 8.7 | Pacote da OPS-22 comitado | Gate de 2026-11-05, item (g): sonda de deadlock para a ordem de locks `retryOutboxManually` x `requestQueueDeletion` em PostgreSQL isolado (um lado aborta com 40P01 e vira 5xx genérico, nunca trava); inversão aceita, não bloqueante |
| TS-21 | rascunho | Backlog | Qualidade e testes | P2 | P | @dev | Infra/CI | Implementação @dev | 8.8 | Workflows em série com FT-46, FT-49 e FT-51 | `queue: max` nos workflows do GitHub e `actionlint` verde; escopo da 0.4.0-beta (decisão do proprietário, 2026-11-05) |
| TS-22 | rascunho | Backlog | Qualidade e testes | P2 | P | @dev | Infra/CI | Pesquisa @analyst | 8.8 | TS-15 | Estabilizar `compose-runtime.test.js:1022` (M-2b): depois de `page.reload` o botão "Mostrar esta fila para viewers" do card da fila não ficou visível em 30 s (1 de 3 execuções completas); Nota de pesquisa do `@analyst`, depois correção do `@dev` |
| TS-23 | rascunho | Backlog | Estabilização | P2 | P | @qa | Overlay/OBS | Gate @qa | 8.8 | ST-18, produto Compose | Executar o AC-W-3 do runbook da OPS-25: reiniciar a API no mesmo banco e conferir que o widget se recupera; `@qa` executa em um produto Compose |
| TS-24 | rascunho | Backlog | Qualidade e testes | P3 | P | @dev | Twitch/worker | Implementação @dev | 17 | OW-03 | Sonda ao vivo do `!fila ping`: script que amostra o `/health` (`twitch_api_ping_ms`) em torno da resposta do chat para provar a igualdade dentro da janela de 30 s (AC-D8-9); `@dev` escreve a sonda, depois execução ao vivo com o proprietário |
| TS-25 | rascunho | Backlog | OPS-22 Recuperação financeira | P3 | P | @qa | API | Gate @qa | 17 | OW-03, ST-15 | Checagem ao vivo do cancelamento bem-sucedido da exclusão de uma fila (OPS-22), com um resgate ainda aguardando o reembolso; `@qa` agenda com o proprietário |
| TS-26 | rascunho | Backlog | Estabilização | P2 | M | @ux-design-expert | Painel Next | Planejamento @ux | 8.8 | ST-18, OW-03 | Executar o AC-W-6 (cenas escura e clara, legibilidade da linha de status em pixels) e o checklist mobile DP-4, com leitor de tela e teclado; `@ux-design-expert` e `@qa` executam |
| TS-27 | rascunho | Backlog | Estabilização | P2 | M | @qa | Twitch/worker | Gate @qa | 8.8 | ST-15, OW-03 | Testar a rejeição do resgate pelo criador na fila da Twitch (OWN-13 parcial) e o reembolso ao remover uma entrada chamada, no canal de testes exclusivo; `@qa` executa com veredito |
| OW-01 | rascunho | Pronto | OPS-15 Migração Next | P1 | M | Proprietário | Infra/CI | Aceite do proprietário | 10 | — | Agendar ciclo do instalador Windows em Docker real. LISTA WINDOWS (OW-01, OW-02): uma sessão do proprietário. |
| OW-03 | rascunho | Pronto | Estabilização | P1 | P | Proprietário | Overlay/OBS | Aceite do proprietário | 3 | — | Retestar o OBS nativo (certificado, transparência, recarga) LISTA OBS E TWITCH REAIS (OW-03, OW-04, OW-05, OW-06, OW-16, OW-17): uma sessão do proprietário; OW-06 depende da FT-01 e OW-17 da ST-19, então itens bloqueados esperam dentro da lista. |
| OW-07 | rascunho | Bloqueado | OPS-15 Migração Next | P3 | P | Proprietário | Infra/CI | Aceite do proprietário | 10 | acesso a um Mac (proprietário) | D-05 = B (dono, marcada na issue #69 e registrada em 2026-11-05): arranjar um Mac e validar antes do `rc`; sem acesso a um Mac o card fica Bloqueado e nenhum resultado de macOS é afirmado. LISTA macOS (OW-07). |
| OW-10 | rascunho | Concluído | OPS-15 Migração Next | P2 | P | Proprietário | Painel Next | Aceite do proprietário | 6 | — | Concluída em 2026-11-05: D-08 = A na issue #83 (seletor de idioma delegado ao plano de UX da FT-01). LISTA DE DECISÕES (OW-10..OW-15): OW-11 só depois da FT-09; a OW-13 (push) já foi feita, PR ou dispatch é decisão à parte. |
| IDX-102 | #102 | Aguardando decisão | Governança | P1 | P | Proprietário | Docs/processo | Nenhum | 17 | — | Issue índice "Decisões do dono" (ações A-01..A-08 e decisões sem issue de origem); NÃO é item do inventário (por isso não tem ID de inventário); o `@devops` a mantém e lê as marcações a cada sincronização |

**Counts (updated 2026-11-06, fifth):** 168 inventory items (25 ST, 85 FT, 13 GV, 27 TS, 18 OW). Active cards: **122** = 36 issue cards (including the index #102) + 86 drafts (1 ST, 63 FT, 1 GV, 17 TS, 4 OW; counted by rows, replacing the earlier 33 + 81 split); the 122 rows are the 121 active inventory IDs plus the index issue #102 (`IDX-102`); archived: **49** (unchanged); 171 cards in total. By Situação, the 122 active cards: Backlog 56, Rascunho 8, Aguardando decisão 1, Pronto 13, Em andamento 5, Em revisão 8, Bloqueado 28, Concluído 3. Changes in this update: ST-24 from Rascunho to Pronto (issue #115, correction); 8 cards added (ST-25 as Rascunho; FT-79..FT-85 as Backlog). Method (as `@qa` checks it): count the rows of the card table above (one per active card) and add the archived table of section 5.1; the sum by Situação must equal the active total.

**Counts (updated 2026-11-06, fourth; superseded above):** 160 inventory items (24 ST, 78 FT, 13 GV, 27 TS, 18 OW). Active cards: **114** = 33 issue cards + 81 drafts (3 ST, 56 FT, 1 GV, 17 TS, 4 OW); the 114 rows are the 113 active inventory IDs plus the index issue #102 (`IDX-102`); archived: **49** (unchanged); 163 cards in total. By Situação, the 114 active cards: Backlog 49, Rascunho 8, Aguardando decisão 1, Pronto 12, Em andamento 5, Em revisão 8, Bloqueado 28, Concluído 3. Changes in this update: 9 cards added (ST-24 as Rascunho; FT-71..FT-78 as Backlog). Method (as `@qa` checks it): count the rows of the card table above (one per active card) and add the archived table of section 5.1; the sum by Situação must equal the active total.

**Counts (updated 2026-11-06, third; superseded above):** 151 inventory items (23 ST, 70 FT, 13 GV, 27 TS, 18 OW). Active cards: **105** = 33 issue cards + 72 drafts (2 ST, 48 FT, 1 GV, 17 TS, 4 OW); the 105 rows are the 104 active inventory IDs plus the index issue #102 (`IDX-102`); archived: **49** = 46 by merge (section 5.1) + 2 legacy (#17, #18, D-14) + OW-18 (dismissed by the owner on 2026-11-05, archived, never deleted); 154 cards in total. By Situação, the 105 active cards: Backlog 41, Rascunho 7, Aguardando decisão 1, Pronto 12, Em andamento 5, Em revisão 8, Bloqueado 28, Concluído 3. Changes in this update: FT-10 from Bloqueado to Concluído; FT-09 from Bloqueado to Pronto; 4 cards added as Backlog (FT-68, FT-69, FT-70, TS-27). Method (as `@qa` checks it): count the rows of the card table above (one per active card) and add the archived table of section 5.1 (46 merged rows, the 2 legacy cards and OW-18); the sum by Situação must equal the active total.

**Counts (updated 2026-11-06, after the v0.3.0-beta release; superseded above):** 147 inventory items (23 ST, 67 FT, 13 GV, 26 TS, 18 OW). Active cards: **101** = 33 issue cards + 68 drafts (2 ST, 45 FT, 1 GV, 16 TS, 4 OW); the 101 rows are the 100 active inventory IDs plus the index issue #102 (`IDX-102`); archived: **49** = 46 by merge (section 5.1) + 2 legacy (#17, #18, D-14) + OW-18 (dismissed by the owner on 2026-11-05, archived, never deleted); 150 cards in total. By Situação, the 101 active cards: Backlog 37, Rascunho 7, Aguardando decisão 1, Pronto 11, Em andamento 5, Em revisão 8, Bloqueado 30, Concluído 2. Changes in this update: OW-18 (was Pronto) dismissed by the owner and archived; OW-10 (was Aguardando decisão) concluded by D-08 = A. Method (as `@qa` checks it): count the rows of the card table above (one per active card) and add the archived table of section 5.1 (46 merged rows, the 2 legacy cards and OW-18); the sum by Situação must equal the active total.

**Counts (updated 2026-11-06):** 147 inventory items (23 ST, 67 FT, 13 GV, 26 TS, 18 OW). Active cards: **102** = 33 issue cards + 69 drafts (2 ST, 45 FT, 1 GV, 16 TS, 5 OW); the 102 rows are the 101 active inventory IDs plus the index issue #102 (`IDX-102`); archived: **48** = 46 by merge (section 5.1) + 2 legacy (#17, #18, D-14); 150 cards in total. By Situação, the 102 active cards: Backlog 37, Rascunho 7, Aguardando decisão 2, Pronto 12, Em andamento 5, Em revisão 8, Bloqueado 30, Concluído 1. Changes in this update: 13 cards added (12 as Backlog, OW-18 as Pronto). Method (as `@qa` checks it): count the rows of the card table above (one per active card) and add the archived table of section 5.1 (46 merged rows plus the 2 legacy cards); the sum by Situação must equal the active total. The counts of the second update of 2026-11-05 (134 items, 89 active, 137 cards) are superseded.

**Counts (updated 2026-11-05, second; superseded above):** 134 inventory items (23 ST, 60 FT, 13 GV, 21 TS, 17 OW). Active cards: **89** = 33 issue cards + 56 drafts (2 ST, 38 FT, 1 GV, 11 TS, 4 OW); the 89 rows are the 88 active inventory IDs plus the index issue #102 (`IDX-102`); archived: **48** = 46 by merge (section 5.1) + 2 legacy (#17, #18, D-14); 137 cards in total. By Situação, the 89 active cards: Backlog 25, Rascunho 7, Aguardando decisão 2, Pronto 11, Em andamento 5, Em revisão 8, Bloqueado 30, Concluído 1. Changes in this update: 7 cards added (FT-55 as Pronto; FT-56..FT-60 and TS-21 as Backlog). Method (as `@qa` checks it): count the rows of the card table above (one per active card) and add the archived table of section 5.1 (46 merged rows plus the 2 legacy cards); the sum by Situação must equal the active total. The counts of the first update of 2026-11-05 (127 items, 82 active, 130 cards) are superseded.

**Counts (updated 2026-11-05, first; superseded above):** 127 inventory items (23 ST, 54 FT, 13 GV, 20 TS, 17 OW). Active cards: **82** = 33 issue cards + 49 drafts (2 ST, 32 FT, 1 GV, 10 TS, 4 OW); the 82 rows are the 81 active inventory IDs plus the index issue #102 (`IDX-102`); archived: **48** = 46 by merge (section 5.1) + 2 legacy (#17, #18, D-14); 130 cards in total. By Situação, the 82 active cards: Backlog 19, Rascunho 7, Aguardando decisão 2, Pronto 10, Em andamento 5, Em revisão 8, Bloqueado 30, Concluído 1. Changes in this update: 5 cards added as Backlog (FT-53, FT-54, TS-18, TS-19, TS-20), the row `IDX-102` added, OW-07 from Aguardando decisão to Bloqueado (D-05 = B), ST-20..ST-23 from draft to issue cards (#104, #107, #106, #105), ST-18 card from #57 to draft. Method (as `@qa` checks it): count the rows of the card table above (one per active card) and add the archived table of section 5.1 (46 merged rows plus the 2 legacy cards); the sum by Situação must equal the active total. The real board on 2026-11-05 is explained against these counts in section 5.3. Earlier counts (122 items, 76 active and 124 cards in the second update of 2026-11-04; 110 items, 64 active and 112 cards in the first; 66 active and 46 archived on 2026-10-30; 107 items and 109 cards on 2026-10-28) are superseded; the history of the earlier updates stays above.

**History (2026-10-28):** 107 inventory items (19 ST, 43 FT, 13 GV, 15 TS, 17 OW) = 28 issues + 79 drafts (109 cards with the 2 legacy). By Situação: Backlog 5 (TS-15 added), Rascunho 3, Aguardando decisão 18, Pronto 24, Em andamento 5, Em revisão 4, Bloqueado 47, Concluído 1 (OW-09). Fifth update: ST-18, ST-19, TS-13, TS-14 and OW-17 added as Bloqueado, GV-13 (#94) added as Backlog, ST-04 moved from Em revisão to Rascunho (validation pending, P2), ST-07 (#74) is incorporated into OPS-22 (Fase OPS-22, no story of its own). Changes in this update: FT-37..FT-43 added (Em revisão 1, Pronto 1, Bloqueado 5) and OW-09 moved from Aguardando decisão to Concluído. Earlier: ST-15, ST-16, ST-17 and FT-24 became Pronto after the @po GO (third update). Native dependencies to add: the OPS-22 and OPS-23 issues block the cutover item (FT-10); FT-23 is blocked by FT-28 and FT-26. Sixth update (2026-10-28): FT-40 (#96, wave 2 committed in ec12ae0, QA CONCERNS 9.3) and FT-05 (#85) moved to Em revisão; TS-04 stays Bloqueado (partial).

### 5.1 Archived cards (merged on 2026-10-30)

Owner-approved merges (two batches, recorded in the [inventory](backlog-inventory.md)). A merged ID stays in the inventory for traceability and its card is **archived, not deleted**; the surviving card carries the work. In the card table above, read a dependency on a merged ID as a dependency on the surviving card. No issue is closed by a merge: `@devops` only edits the main body of the issues involved to cite the merge, and closing needs the owner's OK. Archived cards: **46** by merge (the table below), plus the 2 legacy cards #17 and #18 archived by D-14 (2026-10-30, option A, not IDs of the inventory) = **48**.

| ID | Card at the merge | Situação at the merge | Merged into | Batch | Note |
|---|---|---|---|---|---|
| ST-04 | #57 | Rascunho | ST-18 | A | #57 stays open and becomes the follow-up of OPS-25. |
| ST-08 | #72 | Backlog | ST-06 | A | OPS-16 (#72) is folded into OPS-14 (#65). |
| FT-03 | rascunho | Bloqueado | FT-06 | A |  |
| FT-05 | #85 | Em revisão | FT-40 | A |  |
| FT-07 | #87 | Em andamento | FT-40 | A | Subject to `@po` confirming FT-07 (the community catalog installed after the build case passed in the compose-runtime run). |
| FT-08 | #88 | Pronto | FT-02 | A |  |
| FT-12 | rascunho | Bloqueado | FT-11 | A |  |
| FT-15 | rascunho | Bloqueado | FT-14 | A |  |
| FT-16 | rascunho | Bloqueado | FT-13 | A |  |
| FT-26 | #99 | Bloqueado | FT-25 | A |  |
| FT-29 | rascunho | Bloqueado | FT-28 | A |  |
| FT-36 | #100 | Bloqueado | FT-25 | A |  |
| GV-02 | rascunho | Pronto | GV-01 | B |  |
| GV-03 | rascunho | Pronto | GV-01 | B |  |
| GV-04 | rascunho | Pronto | GV-01 | B |  |
| GV-05 | rascunho | Pronto | GV-01 | B |  |
| GV-06 | rascunho | Pronto | GV-01 | B |  |
| GV-07 | rascunho | Pronto | GV-01 | B |  |
| GV-08 | rascunho | Pronto | GV-01 | B |  |
| GV-09 | rascunho | Pronto | TS-02 | B |  |
| GV-10 | rascunho | Bloqueado | GV-01 | B |  |
| GV-11 | rascunho | Pronto | GV-01 | B |  |
| GV-12 | rascunho | Pronto | GV-01 | B |  |
| TS-03 | rascunho | Aguardando decisão | TS-02 | B |  |
| TS-05 | rascunho | Aguardando decisão | TS-02 | B |  |
| TS-06 | rascunho | Aguardando decisão | TS-02 | B |  |
| TS-08 | rascunho | Bloqueado | TS-07 | B |  |
| TS-09 | rascunho | Aguardando decisão | TS-02 | B |  |
| TS-10 | rascunho | Bloqueado | FT-42 | B | Travels with wave 4; TS-10 still gates the removal. |
| TS-11 | rascunho | Bloqueado | TS-07 | B |  |
| TS-12 | rascunho | Bloqueado | FT-42 | B | Travels with wave 4; TS-10 still gates the removal. |
| TS-13 | rascunho | Bloqueado | ST-19 | B | Part of the OPS-26 story. |
| TS-14 | rascunho | Bloqueado | ST-19 | B | Part of the OPS-26 story. |
| OW-02 | rascunho | Pronto | OW-01 | B |  |
| OW-04 | rascunho | Aguardando decisão | OW-03 | B |  |
| OW-05 | rascunho | Aguardando decisão | OW-03 | B |  |
| OW-06 | rascunho | Bloqueado | OW-03 | B |  |
| OW-08 | rascunho | Aguardando decisão | — (arquivada) | B | Already decided; archived. |
| OW-09 | rascunho | Concluído | — (arquivada) | B | Already decided; archived. |
| OW-11 | rascunho | Bloqueado | OW-10 | B |  |
| OW-12 | rascunho | Aguardando decisão | OW-10 | B |  |
| OW-13 | rascunho | Aguardando decisão | OW-10 | B |  |
| OW-14 | rascunho | Aguardando decisão | OW-10 | B |  |
| OW-15 | rascunho | Aguardando decisão | OW-10 | B |  |
| OW-16 | rascunho | Aguardando decisão | OW-03 | B |  |
| OW-17 | rascunho | Bloqueado | OW-03 | B |  |
| OW-18 | rascunho | Pronto | — | — | Dismissed by the owner on 2026-11-05 (not a merge); archived, not deleted. |

### 5.2 How to decide from the board (Como decidir pelo quadro)

The owner decides in the **issue body**, not on the board. Each open issue has a `## Decisões do dono` section with checkboxes (one block per decision, recommended option first, an optional "Observação" field) and a `## Gates` section that only `@devops` ticks. Decisions with no origin issue live in the index issue "Decisões do dono". The ready blocks and the D-NN to issue map are in the [owner decisions panel](owner-decisions-panel.md); the body layout is in the [issue body template](issue-body-template.md).

- **Cards "Aguardando decisão":** the "Próximo passo" says where to decide: "Decidir D-NN na issue #N" (or "na issue Decisões do dono" for items with no origin issue). Today (after the ticks of 2026-10-30 and 2026-11-05): OW-10 (D-08, #83) and the index issue #102 (`IDX-102`); OW-07 left the column on 2026-11-05 (D-05 = B, now Bloqueado). ST-11 (D-01), TS-02 (D-12) and TS-07 (D-13) left the column; the other decisions (D-02..D-04, D-06, D-07, D-09..D-11) do not have a card in that column and show up only in the issue body.
- **After the owner ticks one option:** at the next sync `@devops` records the decision (section 6 of the panel), moves the card from Aguardando decisão to the Situação in "Efeito no quadro" and warns the orchestrator. Zero or two ticks, or free text, go back to the orchestrator.
- **Counts do not change** by this section: 82 active cards, 48 archived (46 by merge + the 2 legacy cards archived by D-14), 127 inventory items.

### 5.3 Reconciliation of the real board (2026-11-05)

Read-only `gh project item-list 5` on 2026-11-05: **77 active items = 33 issues + 44 drafts** (the QA gate L-5 reported 77 against the 76 of the design). The 77 and the 76 differ by exactly one card, and the five items of this update are not loaded yet:

| Step | Issues | Drafts | Total | Explanation |
|---|---|---|---|---|
| Design before this update (2026-11-04, second) | 29 | 47 | 76 | 29 issue cards (with #57 as the card of ST-18) + 47 drafts (with ST-20..ST-23) |
| ST-20..ST-23 became issues #104, #107, #106, #105 | +4 | -4 | 0 | `@devops` created the four story issues; their cards are issue cards now |
| ST-18: the card #57 never existed on the real board | -1 | +1 | 0 | ST-18 is a draft; #57 stays open without a card until the OPS-25 issue exists |
| Index issue #102 "Decisões do dono" | +1 | 0 | +1 | It has a card (Aguardando decisão, Ordem 17) but is not an inventory item; the design did not count it |
| **Real board 2026-11-05** | **33** | **44** | **77** | matches the item list read |
| The 5 new items of this update (FT-53, FT-54, TS-18, TS-19, TS-20), drafts to be loaded by `@devops` | 0 | +5 | +5 | |
| **Plan after this update** | **33** | **49** | **82** | the count of the section 5 table |

By Situação, the real board (Backlog 14, Bloqueado 29, Em andamento 5, Pronto 10, Em revisão 8, Rascunho 7, Aguardando decisão 3, Concluído 1) against the plan of this update without the 5 new cards (Backlog 13, Bloqueado 31, Em andamento 4, Pronto 13, Em revisão 5, Rascunho 7, Aguardando decisão 2, Concluído 2 = 77):

- OW-07: the board still says Aguardando decisão; the plan says Bloqueado (D-05 = B). `@devops` moves it at the next sync (Aguardando decisão 3 to 2, Bloqueado 29 to 30).
- Six cards are ahead of or different from the table, as the owner and `@devops` moved them on the board; the table keeps the planned value until `@devops` confirms the reason at the next sync (this update does not guess it): ST-05 (#19) table Em revisão, board Backlog; FT-21 (#89), FT-22 (#90) and FT-24 (#82) table Pronto, board Em revisão; ST-15 (#80) table Pronto, board Em andamento; FT-04 table Bloqueado, board Pronto; TS-01 table Concluído, board Em revisão. After OW-07 moves, these six explain every other difference (Backlog +1, Em revisão +3, Pronto -3, Em andamento +1, Bloqueado -1, Concluído -1).
- **Confirmed on 2026-11-05 by `@devops`:** on the seven cards (ST-05, FT-21, FT-22, FT-24, ST-15, FT-04, TS-01) the real board was right (owner moves or cleared gates) and the table was corrected to the board value; the owner Status, Priority and Order were preserved. OW-07 was moved to Bloqueado and the five drafts (FT-53, FT-54, TS-18, TS-19, TS-20) were loaded: the board has 82 active cards.
- The four archived-by-merge and legacy cards (48) do not appear in the item list and were not re-read; the archived total comes from section 5.1.

### 5.4 Planned scope of the 0.4.0-beta (owner decision, 2026-11-05)

The owner decided that the next bump (0.4.0-beta) carries the items below. Nothing here authorizes a bump: the version policy of `AGENTS.md` still applies (the Orion decides and `@devops` executes while alpha/beta, warning the owner).

| Item | IDs |
|---|---|
| D-7 real-time panel updates (SSE) | ST-16 / OPS-23 (FT-27..FT-29) |
| Read timeout in the panel requests | FT-44 |
| FT-41 line L1: fix `retryOutboxManually` for legacy rows | FT-41-L1 |
| `status` command (slice B of OPS-26; slice A, `ping`, goes before the bump) | ST-19 / OPS-26, TS-14 |
| Gate follow-ups of the OPS-22 package | TS-19, TS-20 |
| Type the Next panel JSX | TS-16 (OPS-24) |
| CI job for the `*-browser-only` scripts | TS-17 / ST-23 / OPS-30 (FT-51, FT-52) |
| `queue: max` in the workflows (`actionlint`) | TS-21 (new) |
| Test stability and checks from the gate of 2026-11-06 (quality) | TS-22 (M-2b), TS-23, TS-24, TS-25, TS-26, FT-64, FT-69 and TS-27 (proposed 2026-11-06) |
| Widget and panel findings of the UX addendum (product) | FT-61, FT-62 (owner OK), FT-63, FT-67, FT-70 (proposed 2026-11-06) |
| Runbook and `dev:start` notes (infra) | FT-65, FT-66, FT-68 (proposed 2026-11-06) |
| Quota recommendations R10 to R15 (R10 in a patch; R11 to R15 pending) | [research](../research/2026-11-05-claude-code-quota-saving/README.md) |
| Clean install in CI; static-scan rules | ST-22 / OPS-29 (FT-49, FT-50); ST-21 / OPS-28 (FT-47, FT-48) |
| Natural queue and refund of points by group (owner proposal 2026-11-06; OPS-27 stays out) | ST-24 / OPS-31 (FT-71..FT-78) |
| Queue cycle calendar, presets and "Old queues" tab (**candidate**; the owner has not decided if it enters the 0.4.0-beta or comes later; depends on OPS-31) | ST-25 / OPS-32 (FT-79..FT-85) |
| To close OPS-15 (not a bump item; reconciled 2026-11-06) | FT-09 (final `@qa` and `@architect` reviews, legacy-test audit repeat, OWN-16 to OWN-18 checks by agents in the browser); FT-10 is already done |

The items marked "proposed" were added by the `@sm` on 2026-11-06 for the owner to confirm. **Not in the scope:** OPS-27 / ST-20 (FT-45, FT-46); the owner did not mark it. The widget check of OPS-25 (ST-18) runs on this machine's local OBS (subset AC-W-1..7) and is not a bump item. FT-55 (D-6 logs) and FT-56..FT-60 (UX findings) are outside the list too.

## 6. Maintenance rules

**Principle:** the repository rules; the board mirrors. On divergence the story/gate in the repository wins and `@devops` fixes the board. The board is never a source of status. Nothing is written as an issue comment; `@devops` always edits the issue's (or draft's) main body and the Project fields.

### 6.1 `@devops` updates (events)

| Event | What `@devops` updates |
|---|---|
| Story status changes (`@po` Ready, `@dev` InProgress/InReview) | Situação, Gate atual, Responsável, Próximo passo, Atualizado em |
| `@qa` verdict (PASS/CONCERNS/FAIL/WAIVED) | Evidência (gate link), Gate atual, Situação, Próximo passo |
| Issue created | Add to the Project (auto-add), set initial Situação, parent/sub-issue and "blocked by" links; fill the `@sm` fields from this design |
| Draft converts to issue | Convert in the UI, link to the parent, keep the fields |
| PR opened / merged | Evidência (link); on merge: Situação = Concluído (only after the `@qa` verdict) |
| Owner decision | Move Situação (from Aguardando decisão to Pronto/Bloqueado/Concluído), record the decision in Por quê / decisão |
| End of session | Run the check (`gh project item-list -L 200 --format json`), fix drifts, update Atualizado em; publish the handoff summary as a Project status update (not an issue comment; see D7) |

**Routine note (2026-11-05):** `LEG-17` and `LEG-18` (the two legacy cards, issues #17 and #18) were archived by D-14 on 2026-10-30. Do **not** reload them when the board is reloaded or reconciled; they are history only and stay archived (never deleted, issues not closed).

### 6.2 `@sm` reorganizes (events)

- New story or issue: set Fase, Área, Tipo, Prioridade, Dificuldade, Depende de, Ordem and Story.
- After an owner decision that changes dependencies or priorities (for example OW-09, OW-12, OW-15, OW-11).
- After a `@qa` CONCERNS/FAIL verdict that creates new work or changes blocks.
- When a dependency closes: re-evaluate `Bloqueado` and Ordem; hand `@devops` the list of changes.
- At the start of each session and after every 5 items done: reconcile the inventory (`docs/process/backlog-inventory.md`, new dated snapshot) with the board. The inventory remains the tool-independent list.
- A change to the Prioridade/Dificuldade criteria is an `@sm` decision with `@po` and is recorded in the inventory first.

### 6.3 Field split

`@sm`: Fase, Prioridade, Dificuldade, Área, Tipo, Story, Por quê / decisão (text), Depende de, Ordem. `@devops`: Situação, Responsável, Gate atual, Próximo passo, Evidência, Atualizado em, and the whole hierarchy on GitHub. Nobody except `@devops` writes to GitHub.

### 6.4 Limits

- `@devops` needs the `project` scope on `gh` (the research recorded `project`/`read:project` as missing); the authorization is the owner's, via `gh auth refresh -s project`, and it grants write access to every Project of the account.
- Updating a whole card takes several `gh project item-edit` calls (one per field); `@devops` should cache the IDs from `field-list --format json`. A `board:sync` script would be repository code and needs its own story (outside this design).
- Evidence from other machines or the real browser/OBS cannot be inferred by the board; the Evidência field only receives what exists in the repository.

## 7. Decisions needed from the owner

| # | Decision | `@sm` recommendation |
|---|---|---|
| D1 | Rename the default `Status` to **Situação** with the 8 options of section 1.1 (instead of adding a second field)? | Yes: one field, native workflows keep working |
| D2 | Governance, tests and owner actions (40 items) stay as **drafts** until they become issues? | Yes: they are not new stories; they become issues only when they get a story or code work |
| D3 | Create **13 new issues** now (OPS-21 + 6 running OPS-15 slices + OPS-22, OPS-23, OPS-24, FT-21, FT-22, FT-24; updated 2026-10-27) and the other slices just-in-time? | Yes: satisfies "issue before implementation" without cluttering the repository with 14 idle issues |
| D4 | #77 (OPS-18) and #78 (OPS-19) as sub-issues of #69, or independent? | Sub-issues of #69: their bodies already treat them as part of the migration; #57 stays independent |
| D5 | Authorize the `project` scope on `gh` for `@devops` (`gh auth refresh -s project`) | Yes, it is the prerequisite for any board write; note it applies to all Projects of the account |
| D6 | Use dates/iteration and the Roadmap layout? | Not now: with no planned dates, view 3 by parent issue is enough; revisit if you want deadlines |
| D7 | Publish the handoff summary as a **Project status update** (not an issue comment) at each session end? | Yes, only if you accept that this does not count as commenting on an issue; otherwise keep the summary only in `docs/session-handoff.md` |
| D8 | Done = **merged PR** (GV-04): keep the "PR merged → Concluído" workflow on? | Yes, consistent with GV-04; slices without their own PR are moved by hand by `@devops` |
| D9 | Keep #17 and #18 (legacy, Done) on the board? | Yes, as history only; archive when the board passes 100 cards. **RESOLVED 2026-10-30 (D-14, option A): archived** |
| D10 | Accept that "Bloqueado/Aguardando decisão" override the story status? | Yes; the official status stays in the story |

### 7.1 Resolved by the owner on 2026-10-27 (cutover plan)

Recorded in the [cutover plan](../stories/OPS-15/cutover-plan.md), section 5. These no longer wait for an answer.

| ID | Decision | Resolution |
|---|---|---|
| DP-0 | Do OPS-22, OPS-23 and FT-23 block the vanilla **removal** or only the OPS-15 **completion**? | **RESOLVED:** only the completion of OPS-15 (recorded in AC 15). The board shows them in `Depende de` of ST-01 and FT-10, not of the cutover waves |
| DP-1 | Accept the current Next Overview as the production home before the FT-01 polish | **RESOLVED: accepted.** The first-use difference goes in the beta changelog (DP-7) |
| DP-2 | Wave 1: delete `registerWebRoutes` (A) or `API_ONLY=true` in Compose (B) | **RESOLVED: option A** (FT-38) |
| DP-6 | Delete `repository.archiveQueue` with the route | **RESOLVED: yes** (FT-41); `@data-engineer` and `@po` still confirm before the wave |
| OW-09 | Keep the `/overlay.html` aliases | **RESOLVED: not needed** (no active users, no compatibility shims until `rc`/`stable`); the card is Concluído and the aliases leave in FT-39 after the `@po` rewrites AC 3/AC 8 |

| DP-3 | Catalog path | **RESOLVED (2026-10-27):** `apps/shared/localization/catalogs/` (wave 2, FT-40) |
| DP-4 | Who validates focus/layout on the phone | **RESOLVED:** `@ux-design-expert` + `@qa` (wave 4, FT-42) |
| DP-5 | CI job `web` | **RESOLVED:** renamed to `frontend` (wave 4) |
| DP-7 | Beta changelog sentence about the first-use difference | **RESOLVED:** already applied |
| OD-23-2 | SSE targets | **RESOLVED:** p95 <= 2 s live; fallback polling 2 s for 60 s; keep-alive 15 s; aggregation 100-250 ms (the OPS-23 story is the `@po`'s) |
| OD-24-1 / OD-24-2 | Biome in the gates / formatting | **RESOLVED:** Biome through `lint` (`biome check`); formatting commit after wave 4 |
| OD-22-3 | May OPS-22 reach Done without the live check | **RESOLVED: yes** (separate acceptance; OW-16 authorized, live run automated after FT-25/FT-26) |
| OW-13 | Push of the branch | **RESOLVED:** done; CI does not run on branch pushes, so a PR or dispatch is a separate decision |
| Wave issues | FT-39..FT-43 | **RESOLVED:** an issue only when each wave is ready; wave 3 (FT-39) is ready for the `@dev` and validated manually by the owner; wave 1 (FT-38) is in `384a7e7`; wave 0 in `08e84cb` |
| #74 / #57 | Issue #74 and issue #57 | **RESOLVED:** #74 incorporated into OPS-22 (sub-issue of #80); #57 stays open, ST-04 waits for ST-18 (OPS-25) |

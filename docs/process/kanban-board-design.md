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

## 2. What becomes a card

**Recommendation: card = real issue whenever the item is a story, a roadmap parent issue or a slice about to be implemented; Project draft item for everything else, until it becomes an issue.**

- **Issues (27 inventory cards, #94 included):** the 13 issues open today (#19, #40, #48, #57, #60, #65, #69, #72, #73, #74, #76, #77, #78) plus **13 new issues** that `@devops` creates now (updated 2026-10-27; the 6 added are OPS-22, OPS-23 and OPS-24 as story parent issues, the OPS-15 slices FT-21 and FT-22, and the OPS-22 slice FT-24): the OPS-21 issue (ST-09, `Ready` today with no issue, a traceability gap) and the OPS-15 slices already running or ready (FT-01, FT-02, FT-05, FT-06, FT-07, FT-08). Rule: the issue exists before implementation.
- **Drafts (79 cards, updated 2026-10-27 fifth):** 2 draft stories (ST-18, ST-19), 34 slices not yet issues (FT-03, FT-04, FT-09 to FT-20, FT-23, FT-25 to FT-43; FT-37 and FT-38 are the waves already in review or ready: because the rule is issue before implementation, `@devops` converts them to sub-issues of #69 before their commit), 12 governance items (GV; GV-13 is the issue #94), 14 test items (TS) and 17 owner actions (OW). None of these is a new story: governance is audit remediation, tests wait for decision OW-12 and OW-* are human actions. A draft carries title, body with links and the fields; `@devops` converts it to an issue in the UI when the slice leaves `Bloqueado`/enters `Pronto`, or when a GV/TS item gets a story (rule: "every new roadmap/story needs an issue", and a test is only removed with story, issue and owner decision).
- **Legacy (2 cards):** #17 and #18, already `Done`, stay as they are (the mapping of `Done` to `Concluído` happens when the options are renamed; `@devops` checks it).
- **Total:** 108 cards on the board (27 issues + 79 inventory drafts + 2 legacy).
- Drafts take no issue comments, so the "never comment on issues" rule is not at risk; `@devops` edits the draft body. Pull requests are not cards.
- Inventory item with neither issue nor draft: none. All 106 inventory IDs get one card each.

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

#94 ROADMAP Documentation and chat (DOC-2, DOC-3, OPS-14, OPS-17)   (roadmap parent issue, created 2026-10-27)
 ├── #40 DOC-2, #73 OPS-17, #65 OPS-14, #48 DOC-3

#76 OPS-20 Refund eligibility                            (story parent issue)
 └── FT-18, FT-19, FT-20  slices 1 to 3 (issue when the slice becomes ready)
```

Native links once everything exists: 47 (4 existing under #69, 20 OPS-15 slices (the 13 earlier plus the 7 cutover waves), 7 OPS-21, 3 OPS-20, 4 OPS-22, 3 OPS-23 and 6 OPS-24; updated 2026-10-27; fifth update: #74 moves from #69 to #80 and #94 adds 4 links, so 51). **Create now: 13** (#72, #74, #77, #78 and the 6 new slices plus FT-21 and FT-22 under #69, and FT-24 under the OPS-22 issue; the OPS-21 issue is born without a parent, as the story's parent issue). The rest are just-in-time.

Without a parent (independent, linked by native "blocked by" and by Depende de): #57 (OPS-13), #19 (FND-9), #60 (OPS-12); #65, #73, #40 and #48 have the parent #94 since 2026-10-27, and #57 stays open (ST-04 waits for ST-18). Suggested native dependencies: #65 blocked by #57; #73 by #65; #40 by #19; #48 by #40.

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
- **Atualizado em:** 2026-10-24 on all (2026-10-27 for FT-37..FT-43 and OW-09).
- **Card:** `#N` = existing issue; "issue nova (agora)" = create before the load; "rascunho" = draft item.
- **Prioridade, Dificuldade, Depende de:** from the inventory. **Ordem:** step of the recommended order (inventory section 2); items outside the listed steps got the closest step by dependency; the cutover waves got decimal sub-steps (FT-37 = 4.1, FT-38 = 4.2, FT-39 = 4.3, FT-40 = 5, FT-41 = 5.1, FT-42 = 8.1, FT-43 = 8.2), so equal values and ties break in execution order by ID (OW-03 = 3 because it closes ST-04; TS-01 to TS-03 = 11; TS-06/08/09 = 14; GV-09, GV-11 = 11; OW-07 = 10; OW-08 to OW-10 = 6; OW-14 = 15; OW-05 and ST-10 = 14).
- **Situação:** by the mapping in section 1.1. ST-02 and ST-03 stay `Em andamento` because the stories are `InProgress` (code implemented, `@qa` gate missing).
- The "Próximo passo" column is in Portuguese, as it will be stored on the board.

| ID | Card | Situação | Fase | Prio | Dif | Responsável | Área | Gate atual | Ordem | Depende de | Próximo passo |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ST-01 | #69 | Em andamento | OPS-15 Migração Next | P0 | GG | @dev | Painel Next | Implementação @dev | 8 | FT-01..FT-10, FT-21..FT-23, FT-37..FT-43, ST-15, ST-16, OW-01..OW-11 | Conduzir as fatias; revisões finais @qa/@architect (FT-09) |
| ST-02 | #77 | Em andamento | Estabilização | P1 | P | @qa | Overlay/OBS | Gate @qa | 3 | — | @qa mapeia AC a evidências e emite veredito |
| ST-03 | #78 | Em andamento | Estabilização | P1 | P | @qa | Twitch/worker | Gate @qa | 3 | — | @qa reexecuta a suíte completa e emite veredito |
| ST-04 | #57 | Rascunho | Estabilização | P2 | P | @po | Overlay/OBS | Planejamento @po | 16 | ST-18, OW-03 | Validação pendente, conduzida pela ST-18 (OPS-25) depois da ST-01; não fechar a #57 com evidência Linux |
| ST-05 | #19 | Em revisão | Estabilização | P1 | P | Proprietário | Twitch/worker | Aceite do proprietário | 10 | OW-01, OW-04 | @po/@qa reconciliam checkboxes dos AC; proprietário agenda aceite |
| ST-06 | #65 | Backlog | Chat e mensagens | P2 | G | @sm | Twitch/worker | Planejamento @po | 15 | ST-04, ST-01 | Localizar ou recriar a story bilíngue OPS-14 e validar |
| ST-07 | #74 | Backlog | OPS-22 Recuperação financeira | P1 | M | @devops | Twitch/worker | Nenhum | 6 | ST-15 | Incorporada à OPS-22 (#80), sem story própria; acompanhar pela ST-15 e manter a sub-issue sob a #80 |
| ST-08 | #72 | Backlog | Chat e mensagens | P2 | M | @po | Painel Next | Planejamento @po | 8 | FT-01 | @po valida a story; depois plano @ux >= 9,0 |
| ST-09 | issue nova (agora) | Rascunho | OPS-21 Contrato da API | P1 | GG | @devops | API | Planejamento @ux | 2 | GV-03 | @devops cria a issue-mãe; @ux e @qa concluem seus gates |
| ST-10 | #76 | Rascunho | OPS-20 Elegibilidade de devolução | P2 | GG | @po | Banco de dados | Planejamento @po | 14 | ST-01, ST-09, GV-03, OW-05 | Resolver CONCERNS do plano @qa; relabel via GV-03 |
| ST-11 | #73 | Aguardando decisão | Chat e mensagens | P3 | G | Proprietário | Twitch/worker | Planejamento @po | 15 | ST-06, ST-01 | Proprietário define a política de idioma do viewer; depois refinar |
| ST-12 | #40 | Bloqueado | Documentação | P3 | M | @dev | Docs/processo | Nenhum | 15 | ST-05, FT-10 | Sem ação até a UI ser aceita |
| ST-13 | #48 | Bloqueado | Documentação | P3 | G | @po | Docs/processo | Nenhum | 15 | ST-05, ST-12 | Sem ação ainda |
| ST-14 | #60 | Bloqueado | Instalador | P3 | G | @ux-design-expert | Infra/CI | Nenhum | 15 | `.release-stage` = rc (proprietário) | Nenhuma até a promoção para rc |
| ST-15 | #80 | Pronto | OPS-22 Recuperação financeira | P1 | GG | @dev | Twitch/worker | Implementação @dev | 4 | ST-01 (dependência do corte) | GO do @po 9,5; @architect e @data-engineer concluídos (ciclo de 6 tentativas 1/4/16/60/60 min, sem migration, 4 defeitos de código a absorver, deps `@twurple/common`/`@twurple/api-call` 8.2.0); falta o plano de testes do @qa; começar pela FT-24 |
| ST-16 | #81 | Pronto | OPS-23 Tempo real | P1 | GG | @architect | Painel Next | Planejamento @architect | 6 | ST-01, FT-01 | GO do @po 9,0; desenho do @architect e plano @ux >= 9,0; proprietário decide OD-23-1 (texto da OPS-15) e OD-23-2 (metas: caminho ao vivo 2 s p95, janela de 60 s) |
| ST-17 | #91 | Pronto | OPS-24 TypeScript e Biome | P2 | GG | @architect | API | Planejamento @architect | 16 | ST-15 (OPS-22 primeiro) | GO do @po 9,0; @architect, @data-engineer e @qa concluem seus gates; proprietário decide OD-24-1..3 (a OPS-23 espera só a TS-0 e a TS-2) |
| ST-18 | rascunho | Bloqueado | Estabilização | P2 | M | @po | Overlay/OBS | Planejamento @po | 16 | ST-01, ST-04, redução das tarefas do quadro | Story OPS-25 em Draft: validar o widget da conta no overlay Next (OBS nativo; @qa executa, @ux-design-expert ≥ 9,0); issue pelo @devops quando pronta |
| ST-19 | rascunho | Bloqueado | Chat e mensagens | P2 | M | @po | Twitch/worker | Planejamento @po | 16 | ST-01 (#69 integrada no main), ST-15 | Story OPS-26 em Draft: `ping` com latência real (D-8) e `status` do streamer; só depois do merge da branch no main; issue pelo @devops quando pronta |
| FT-01 | issue nova (agora) | Pronto | OPS-15 Migração Next | P0 | G | @ux-design-expert | Painel Next | Planejamento @ux | 8 | FT-02, FT-05 | Planos @ux por página (>= 9,0); depois @dev test-first |
| FT-02 | issue nova (agora) | Pronto | OPS-15 Migração Next | P1 | P | @dev | API | Implementação @dev | 4 | — | Red em token desconhecido na criação de fila; depois @qa |
| FT-03 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | G | @qa | Painel Next | Plano de testes @qa | 8 | FT-01 | Escrever E1-E8 após a UI estabilizar (E8 manual do proprietário) |
| FT-04 | rascunho | Bloqueado | OPS-15 Migração Next | P2 | P | @architect | Painel Next | Planejamento @architect | 11 | OW-09 (resolvida), FT-37, FT-39 | Coberta pelas ondas FT-37 (script) e FT-39 (aliases); fechar quando ambas passarem no @qa |
| FT-05 | issue nova (agora) | Pronto | OPS-15 Migração Next | P1 | M | @architect | Painel Next | Planejamento @architect | 5 | — | Definir caminho neutro dos catálogos; @dev move test-first; executada pela FT-40 (onda 2) |
| FT-06 | issue nova (agora) | Em andamento | OPS-15 Migração Next | P1 | G | @qa | API | Gate @qa | 8 | FT-01 | Atualizar inventário de endpoints conforme as fatias entram |
| FT-07 | issue nova (agora) | Em andamento | OPS-15 Migração Next | P1 | M | @qa | Infra/CI | Gate @qa | 5 | FT-05 | Conferir o que a execução de 2026-10-20 cobre e listar a lacuna |
| FT-08 | issue nova (agora) | Pronto | OPS-15 Migração Next | P2 | P | @qa | API | Gate @qa | 11 | — | Ler a matriz QRA e os testes de rota (QRA-13, QRA-02) |
| FT-09 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | M | @qa | Painel Next | Gate @qa | 12 | FT-01..FT-08, TS-10 | Revisões independentes @qa e @architect após as fatias |
| FT-10 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | G | @dev | Painel Next | Aceite do proprietário | 13 | FT-09, ST-15, ST-16, FT-21..FT-23, OW-01..OW-11, TS-10, TS-12 | Remoção decomposta nas ondas FT-37..FT-43 (2026-10-27); fica como proposta de fechamento e aceite; executar com autorização explícita |
| FT-11 | rascunho | Bloqueado | OPS-21 Contrato da API | P1 | M | @devops | API | Plano de testes @qa | 7 | FT-02, ST-09 | Criar sub-issue; @qa plano; depois @dev Red-first |
| FT-12 | rascunho | Bloqueado | OPS-21 Contrato da API | P2 | M | @dev | API | Planejamento @ux | 7 | FT-11 | Revisão @ux do copy dos catálogos; depois implementar |
| FT-13 | rascunho | Bloqueado | OPS-21 Contrato da API | P2 | G | @dev | Painel Next | Planejamento @ux | 9 | FT-12, OW-15 | @ux >= 9,0 e decisão 4 do proprietário |
| FT-14 | rascunho | Bloqueado | OPS-21 Contrato da API | P2 | G | @dev | Banco de dados | Planejamento @data-engineer | 9 | FT-12, OW-15 | @data-engineer coordena; nunca junto de trabalho de UI |
| FT-15 | rascunho | Bloqueado | OPS-21 Contrato da API | P2 | M | @dev | Banco de dados | Gate @qa | 14 | FT-14 | Promover rota só com evidência em PostgreSQL isolado |
| FT-16 | rascunho | Bloqueado | OPS-21 Contrato da API | P2 | G | @dev | Painel Next | Planejamento @ux | 14 | FT-13, FT-15 | @ux copy >= 9,0; chaves por intenção |
| FT-17 | rascunho | Bloqueado | OPS-21 Contrato da API | P3 | P | @dev | API | Aceite do proprietário | 13 | FT-10, OW-15 | Junto da remoção do painel vanilla |
| FT-18 | rascunho | Bloqueado | OPS-20 Elegibilidade de devolução | P2 | G | @dev | Banco de dados | Planejamento @data-engineer | 14 | ST-01, FT-11, GV-03 | Só após a migração OPS-15 |
| FT-19 | rascunho | Bloqueado | OPS-20 Elegibilidade de devolução | P2 | G | @dev | Twitch/worker | Planejamento @data-engineer | 14 | FT-18, OW-05 | Só após FT-18 |
| FT-20 | rascunho | Bloqueado | OPS-20 Elegibilidade de devolução | P2 | G | @dev | Painel Next | Planejamento @ux | 14 | FT-19 | @ux >= 9,0; textos do painel só quando a fatia sair |
| FT-21 | #89 | Pronto | OPS-15 Migração Next | P1 | P | @dev | Twitch/worker | Implementação @dev | 4 | FT-24 (sequência) | Red em parser+handler para `CONFIRMAR`/`Confirmar`/rótulo `en`; depois @qa |
| FT-22 | #90 | Pronto | OPS-15 Migração Next | P1 | P | @data-engineer | Banco de dados | Planejamento @data-engineer | 4 | FT-21 (sequência, mesmo arquivo) | Confirmar `outbox.payload` sem DDL; depois @dev Red-first e @qa em PostgreSQL |
| FT-23 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | M | @ux-design-expert | Painel Next | Planejamento @ux | 8 | FT-28, FT-26 | Plano @ux >= 9,0 (textos, região viva, foco); depois @dev Red-first |
| FT-24 | #82 | Pronto | OPS-22 Recuperação financeira | P0 | P | @dev | Twitch/worker | Implementação @dev | 4 | ST-15 | Red de contrato com instâncias reais do Twurple; depois @dev e @qa; acrescenta `@twurple/common` e `@twurple/api-call` 8.2.0 |
| FT-25 | rascunho | Bloqueado | OPS-22 Recuperação financeira | P1 | G | @data-engineer | Banco de dados | Implementação @dev | 8 | FT-24, ST-15 | Planejamento fechado: ciclo de 6 tentativas (1/4/16/60/60 min), sem migration; absorver `markRedemptionUnknown` e a retentativa manual; Red em PostgreSQL após a FT-24 |
| FT-26 | rascunho | Bloqueado | OPS-22 Recuperação financeira | P1 | G | @architect | Twitch/worker | Implementação @dev | 8 | FT-25, contrato OPS-21 | Planejamento fechado: estado da exclusão derivado; absorver bloqueios que viram `unknown` e a resolução manual que não destrava; Red em PostgreSQL por estado de resgate após a FT-25 |
| FT-27 | rascunho | Bloqueado | OPS-23 Tempo real | P1 | G | @analyst | API | Planejamento @architect | 8 | ST-16, `sse-research.md` | Ler a nota de SSE; @architect fixa modelo de eventos, fronteira de processo e proxy |
| FT-28 | rascunho | Bloqueado | OPS-23 Tempo real | P1 | M | @architect | Painel Next | Planejamento @architect | 8 | ST-16, ordem em relação à FT-01 | Definir a ordem com a FT-01 (mesmo conjunto de escrita); plano @ux >= 9,0 |
| FT-29 | rascunho | Bloqueado | OPS-23 Tempo real | P1 | M | @ux-design-expert | Painel Next | Planejamento @ux | 8 | FT-27, FT-28 | Plano @ux >= 9,0 (indicador, anúncios, foco); depois @dev Red-first |
| FT-30 | rascunho | Bloqueado | OPS-24 TypeScript e Biome | P2 | G | @architect | Infra/CI | Planejamento @architect | 16 | ST-17, OW-13 (evidência de CI) | @architect fixa a configuração e o texto do `AGENTS.md`; prova Red por gate; canário `credential-fingerprint.mjs` |
| FT-31 | rascunho | Bloqueado | OPS-24 TypeScript e Biome | P2 | G | @architect | Twitch/worker | Planejamento @architect | 16 | FT-30, FT-24 | Após a FT-24: medir erros do strict na pasta; depois Red com instâncias reais do Twurple |
| FT-32 | rascunho | Bloqueado | OPS-24 TypeScript e Biome | P2 | M | @architect | Twitch/worker | Planejamento @architect | 16 | FT-30, FT-25, FT-26 | Após FT-25 e FT-26; testes de outbox em PostgreSQL sem alteração |
| FT-33 | rascunho | Bloqueado | OPS-24 TypeScript e Biome | P2 | G | @architect | API | Planejamento @architect | 16 | FT-30, FT-27, FT-11, FT-12 | @architect escolhe as 5 rotas com schema e a ordem em relação à FT-27 |
| FT-34 | rascunho | Bloqueado | OPS-24 TypeScript e Biome | P2 | G | @data-engineer | Banco de dados | Planejamento @data-engineer | 16 | FT-30, FT-26, FT-14 | Contagem de erros do strict pelo @qa; decidir a divisão do repositório com @data-engineer |
| FT-35 | rascunho | Bloqueado | OPS-24 TypeScript e Biome | P2 | M | @architect | API | Planejamento @architect | 16 | FT-31..FT-34 | Após as fatias de pasta: `strict: true` global e troca da entrada |
| FT-36 | rascunho | Bloqueado | OPS-22 Recuperação financeira | P1 | G | @architect | Twitch/worker | Planejamento @architect | 8 | FT-26 | Cancelar exclusão pendente (decisão do proprietário 2026-10-27): @architect redesenha estados; @data-engineer transições e testes; texto no plano @ux da FT-23; @po revalida o escopo da OPS-22 |
| FT-37 | rascunho | Em revisão | OPS-15 Migração Next | P0 | P | @qa | Painel Next | Gate @qa | 4.1 | — (FT-23, ST-15, ST-16 bloqueiam a conclusão da OPS-15, não a onda) | Onda 0 (código morto) implementada pelo @dev; @qa emite o veredito e libera o grupo; @devops comita. Absorve TS-01 e o script da FT-04 |
| FT-38 | rascunho | Pronto | OPS-15 Migração Next | P0 | M | @dev | Painel Next | Implementação @dev | 4.2 | FT-37 (veredito do @qa) | Onda 1: Red invertendo `next-dev-proxy` e `compose-runtime`; remover os 3 rewrites e `registerWebRoutes`; @qa com classe C (Compose) obrigatória; 3-6 h @dev, 2-3 h @qa |
| FT-39 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | P | @dev | Overlay/OBS | Implementação @dev | 4.3 | FT-38 | Onda 3: @po reescreve CA 3/CA 8; depois @dev remove overlay vanilla e aliases de `/overlay.html` (URL do OBS passa à rota do Next); 1-2 h @dev, 1 h @qa. Absorve os aliases da FT-04 |
| FT-40 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | M | @dev | Painel Next | Implementação @dev | 5 | FT-39 (mesmo `server.mjs` da onda 1), FT-05, TS-04 | Onda 2: executa FT-05 e TS-04; `git mv` dos catálogos para `apps/shared/localization/catalogs/` (DP-3 do proprietário); `build:frontend` isolado e imagem; 3-5 h @dev, 1,5-2,5 h @qa |
| FT-41 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | M | @data-engineer | API | Planejamento @data-engineer | 5.1 | FT-40 | Onda 5: @data-engineer confirma linhas vivas `archiveAfterConfirm`; @po aceita a FR-10; depois @dev Red do 404 JSON e remove a rota e `archiveQueue`; 2-4 h @dev, 1,5-2 h @qa |
| FT-42 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | M | @dev | Painel Next | Implementação @dev | 8.1 | FT-41, TS-10 (6 ports provados não vazios) | Onda 4: remover painel vanilla e `apps/web`, reapontar o job `web`; antes do commit do Biome (FT-30); absorve TS-12; 3-5 h @dev, 3-4 h @qa |
| FT-43 | rascunho | Bloqueado | OPS-15 Migração Next | P2 | P | @dev | Infra/CI | Implementação @dev | 8.2 | FT-38, FT-42 | Onda 6: remover `API_ONLY` e `@fastify/static`; @po fecha CA 9/15; 1-2 h @dev, 1 h @qa |
| GV-01 | rascunho | Pronto | Governança | P0 | P | @architect | Docs/processo | Planejamento @architect | 1 | — | Reescrever "nunca comentar"; @dev atualiza o teste; @qa valida |
| GV-02 | rascunho | Pronto | Governança | P2 | P | @architect | Docs/processo | Planejamento @architect | 1 | — | Escrever as exceções de `/tmp` em AGENTS.md e CLAUDE.md |
| GV-03 | rascunho | Pronto | Governança | P1 | P | @architect | Docs/processo | Planejamento @architect | 2 | GV-01 | Definir Ready; @po reclassifica OPS-21 e OPS-20 (en e pt-BR) |
| GV-04 | rascunho | Pronto | Governança | P2 | P | @architect | Docs/processo | Planejamento @architect | 1 | — | Registrar Done = após PR integrada (override do projeto) |
| GV-05 | rascunho | Pronto | Governança | P2 | P | @architect | Docs/processo | Planejamento @architect | 1 | GV-01 | Escrever a isenção bilíngue e reacentuar AGENTS.md |
| GV-06 | rascunho | Pronto | Governança | P2 | P | @architect | Docs/processo | Planejamento @architect | 1 | — | Definir `boundary.frameworkProtection: true` e documentar |
| GV-07 | rascunho | Pronto | Governança | P1 | P | @architect | Docs/processo | Planejamento @architect | 1 | — | Registrar a autorização permanente de commit em AGENTS.md |
| GV-08 | rascunho | Pronto | Governança | P1 | P | @qa | Docs/processo | Gate @qa | 1 | — | @qa libera os grupos; @devops commita com pathspec |
| GV-09 | rascunho | Pronto | Governança | P2 | P | @devops | Infra/CI | Commit/PR @devops | 11 | — | Adicionar `validate:port-denylist` ao workflow; reexecutar actionlint |
| GV-10 | rascunho | Bloqueado | Governança | P1 | M | @qa | Docs/processo | Gate @qa | 1 | GV-01..GV-07 | Revisão de conteúdo do commit `89c67b8` após as regras finais |
| GV-11 | rascunho | Pronto | Governança | P2 | P | @devops | Infra/CI | Commit/PR @devops | 11 | — | Confirmar a ausência do hook e instalar ou corrigir o README |
| GV-12 | rascunho | Pronto | Governança | P2 | P | @po | Docs/processo | Planejamento @po | 1 | — | Confirmar origem com o proprietário; corrigir índice de stories |
| GV-13 | #94 | Backlog | Documentação | P2 | P | @sm | Docs/processo | Nenhum | 16 | — | Issue-mãe do roadmap Documentação e chat; @devops vincula as sub-issues #40, #73, #65, #48 (ST-12, ST-11, ST-06/OPS-14, ST-13/DOC-3); OPS-14 sem arquivo de story: lacuna de rastreabilidade |
| TS-01 | rascunho | Aguardando decisão | Qualidade e testes | P2 | P | Proprietário | Painel Next | Aceite do proprietário | 11 | OW-12 | Decidir remoção; depois issue e @dev; executada pela FT-37 (onda 0) sob a autorização do cutover incremental |
| TS-02 | rascunho | Aguardando decisão | Qualidade e testes | P2 | P | Proprietário | Docs/processo | Aceite do proprietário | 11 | OW-12 | Decidir reescrita ou remoção dos 3 testes |
| TS-03 | rascunho | Aguardando decisão | Qualidade e testes | P2 | P | Proprietário | Banco de dados | Aceite do proprietário | 11 | OW-12 | Decidir mover o teste com Prisma mockado para unit |
| TS-04 | rascunho | Bloqueado | Qualidade e testes | P1 | P | @dev | Painel Next | Implementação @dev | 5 | FT-05 | Mesclar teste de fronteira e checar caminhos em string; executada pela FT-40 (onda 2) |
| TS-05 | rascunho | Aguardando decisão | Qualidade e testes | P2 | M | Proprietário | Infra/CI | Aceite do proprietário | 14 | OW-12, TS-11 | Decidir evitar o segundo `next build` |
| TS-06 | rascunho | Aguardando decisão | Qualidade e testes | P3 | P | Proprietário | Infra/CI | Aceite do proprietário | 14 | OW-12, OW-13 | Decidir cortar entradas redundantes do CI |
| TS-07 | rascunho | Aguardando decisão | Qualidade e testes | P2 | G | Proprietário | Infra/CI | Aceite do proprietário | 14 | OW-12, TS-11 | Decidir um contêiner PostgreSQL por execução |
| TS-08 | rascunho | Bloqueado | Qualidade e testes | P3 | M | @dev | Infra/CI | Implementação @dev | 14 | TS-11 | Avaliar `isolate: false` com prova de ausência de vazamento |
| TS-09 | rascunho | Aguardando decisão | Qualidade e testes | P3 | P | Proprietário | Infra/CI | Aceite do proprietário | 14 | OW-12 | Decidir gerar o CA/cert TLS uma vez por arquivo |
| TS-10 | rascunho | Bloqueado | Qualidade e testes | P1 | M | @dev | Painel Next | Implementação @dev | 8 | FT-01 | Portar contratos classe B para testes Next test-first; bloqueia a FT-42 (onda 4) |
| TS-11 | rascunho | Bloqueado | Qualidade e testes | P2 | P | @dev | Infra/CI | Implementação @dev | 11 | OW-13 | Medir tempos e a primeira execução de CI da branch |
| TS-12 | rascunho | Bloqueado | Qualidade e testes | P1 | M | @dev | Painel Next | Implementação @dev | 13 | FT-10 | Remover testes classe C e ajustar asserções acopladas no mesmo change |
| TS-13 | rascunho | Bloqueado | Chat e mensagens | P2 | P | @dev | Twitch/worker | Implementação @dev | 16 | ST-19 | Teste obrigatório do D-8 (LB-23): o ping do chat falha sem o valor em ms havendo medição; casos presente, ausente e Twitch com falha |
| TS-14 | rascunho | Bloqueado | Chat e mensagens | P2 | M | @dev | Twitch/worker | Implementação @dev | 16 | ST-19, TS-13 | Testes do `status`: permissão do streamer, allowlist de campos, limite do chat por idioma, taxa com fake timers |
| OW-01 | rascunho | Pronto | OPS-15 Migração Next | P1 | M | Proprietário | Infra/CI | Aceite do proprietário | 10 | — | Agendar ciclo do instalador Windows em Docker real |
| OW-02 | rascunho | Pronto | OPS-15 Migração Next | P2 | P | Proprietário | Infra/CI | Aceite do proprietário | 10 | — | Agendar `npm run dev` e `dev:start`/`dev:stop` no Windows |
| OW-03 | rascunho | Pronto | Estabilização | P1 | P | Proprietário | Overlay/OBS | Aceite do proprietário | 3 | — | Retestar o OBS nativo (certificado, transparência, recarga) |
| OW-04 | rascunho | Aguardando decisão | Estabilização | P1 | M | Proprietário | Twitch/worker | Aceite do proprietário | 10 | autorização explícita | Autorizar e agendar a operação Twitch real |
| OW-05 | rascunho | Aguardando decisão | OPS-20 Elegibilidade de devolução | P2 | M | Proprietário | Twitch/worker | Aceite do proprietário | 14 | canal afiliado de teste | Fornecer canal de teste ou definir regra própria para as 3 lacunas |
| OW-06 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | M | Proprietário | Painel Next | Aceite do proprietário | 10 | FT-01 | Verificar NVDA/VoiceOver, foco e layout 390x844 |
| OW-07 | rascunho | Aguardando decisão | OPS-15 Migração Next | P3 | P | Proprietário | Infra/CI | Aceite do proprietário | 10 | — | Aceitar macOS sem validação ou arrumar um Mac |
| OW-08 | rascunho | Aguardando decisão | OPS-15 Migração Next | P2 | P | Proprietário | Docs/processo | Aceite do proprietário | 6 | — | Confirmar que OWN-19 fica superado |
| OW-09 | rascunho | Concluído | OPS-15 Migração Next | P1 | P | Proprietário | Overlay/OBS | Nenhum | 6 | — | Decidida (2026-10-27): alias não é necessário (sem usuários ativos); sai com o overlay vanilla na FT-39 |
| OW-10 | rascunho | Aguardando decisão | OPS-15 Migração Next | P2 | P | Proprietário | Painel Next | Aceite do proprietário | 6 | — | Decidir se o seletor de idioma vai para Configurações |
| OW-11 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | P | Proprietário | Painel Next | Aceite do proprietário | 13 | FT-09, OW-01..OW-10 | Autorizar corte e remoção do vanilla (explícito, nunca implícito) |
| OW-12 | rascunho | Aguardando decisão | Qualidade e testes | P2 | P | Proprietário | Infra/CI | Aceite do proprietário | 6 | GV-08 | Decidir TS-01..TS-09 em pop-ups |
| OW-13 | rascunho | Aguardando decisão | Governança | P2 | P | Proprietário | Infra/CI | Aceite do proprietário | 11 | GV-07 | Autorizar push e PR para a primeira execução de CI |
| OW-14 | rascunho | Aguardando decisão | Governança | P3 | P | Proprietário | Infra/CI | Aceite do proprietário | 15 | — | Dizer quando `backup/ops-15-before-history-fix` pode ser apagada |
| OW-15 | rascunho | Aguardando decisão | OPS-21 Contrato da API | P2 | P | Proprietário | API | Aceite do proprietário | 6 | — | Decidir fechar com a fatia 7 aberta, ordem das fatias 3-4 e timeout |
| OW-16 | rascunho | Aguardando decisão | OPS-22 Recuperação financeira | P1 | M | Proprietário | Twitch/worker | Aceite do proprietário | 10 | ST-15, FT-24, OW-04 | Autorizar e agendar a checagem ao vivo de resgate real (4 checagens do analista) |
| OW-17 | rascunho | Bloqueado | Chat e mensagens | P2 | P | Proprietário | Twitch/worker | Aceite do proprietário | 16 | ST-19, OW-04 | Checagem ao vivo do `ping` e do `status` no canal, depois da OPS-26 implementada |

**Counts (updated 2026-10-27, fifth):** 106 inventory items (19 ST, 43 FT, 13 GV, 14 TS, 17 OW) = 27 issues + 79 drafts (108 cards with the 2 legacy). By Situação: Backlog 4, Rascunho 3, Aguardando decisão 18, Pronto 25, Em andamento 5, Em revisão 2, Bloqueado 48, Concluído 1 (OW-09). Fifth update: ST-18, ST-19, TS-13, TS-14 and OW-17 added as Bloqueado, GV-13 (#94) added as Backlog, ST-04 moved from Em revisão to Rascunho (validation pending, P2), ST-07 (#74) is incorporated into OPS-22 (Fase OPS-22, no story of its own). Changes in this update: FT-37..FT-43 added (Em revisão 1, Pronto 1, Bloqueado 5) and OW-09 moved from Aguardando decisão to Concluído. Earlier: ST-15, ST-16, ST-17 and FT-24 became Pronto after the @po GO (third update). Native dependencies to add: the OPS-22 and OPS-23 issues block the cutover item (FT-10); FT-23 is blocked by FT-28 and FT-26.

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
| D9 | Keep #17 and #18 (legacy, Done) on the board? | Yes, as history only; archive when the board passes 100 cards |
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
| Wave issues | FT-39..FT-43 | **RESOLVED:** an issue only when each wave is ready; wave 3 (FT-39) is ready for the `@dev` and validated manually by the owner; wave 1 (FT-38) is in `bfff2f1`; wave 0 in `0eb4fd2` |
| #74 / #57 | Issue #74 and issue #57 | **RESOLVED:** #74 incorporated into OPS-22 (sub-issue of #80); #57 stays open, ST-04 waits for ST-18 (OPS-25) |

# OPS-15 — GitHub issue triage for the full Next panel flow validation

[Português brasileiro](../../pt-BR/stories/OPS-15/issue-triage.md)

- **Date:** 2026-10-21
- **Author:** `@devops` (Gage), read-only GitHub inspection (`gh issue list --state all`, `gh issue view`, `gh pr list`). Nothing was created, edited, commented, labeled, or closed.
- **Sources:** issue bodies; `docs/stories/OPS-15/story.md` (AC 1–18, scope exclusions); `docs/session-handoff.md`; `docs/stories.md`; `docs/project-completion-roadmap.md`.
- **Open PRs:** none.
- **Status:** recommendations only. The owner decides what is folded into OPS-15. OPS-15 scope exclusions state it "is not an umbrella for every unfinished repository feature"; folding anything in requires the owner to amend the story.

## Ranked "fits now" items

| Rank | Issue | Why it ranks here |
|---|---|---|
| 1 | #74 | Directly on a Next page (`/operations/` and the Twitch sync screen); its body says it "Complementa OPS-15 / issue #69". Fits the flow validation (AC 1, AC 7 "pending-versus-confirmed remote state", "operation recovery"). |
| 2 | #72 | Pure panel copy/guidance on the New Queue and Queue Settings forms already migrated in Next; no API/chat change (AC 5, AC 13). Small, bounded. |
| 3 | #57 | Overlay current-account reload regression; #57 itself says OPS-15 must include the regression. Native OBS acceptance overlaps AC 8. |
| 4 | #40 | Screenshots of the panel; only meaningful once the Next UI is the accepted UI. Fits the "docs/READMEs" part of the validation, but after cutover. |

## Full table

| Issue | Title (exact) | State | Relation to OPS-15 | Why (AC / page) | Suggested action | Risks |
|---|---|---|---|---|---|---|
| #76 | OPS-20 — Permitir que a pessoa streamer escolha quem tem direito à devolução de pontos | OPEN | Fits after migration | Known constraint: starts only after the OPS-15 migration; new refund-eligibility rule violates AC 7 "No new business/domain rule". | Keep separate. | Schema/data-engineer work; mixing it in would block OPS-15 cutover. |
| #75 | Avaliar diagnóstico e seleção de servidor de ingest da Twitch | CLOSED | Unrelated | New feature on the Channel Connection page; closed. | None. | — |
| #74 | OPS: Diagnosticar reconciliação e tornar operações Twitch acionáveis | OPEN | Fits now (partial) | Next `/operations/` and Twitch sync/refund screen; AC 1, AC 7 (pending vs confirmed, operation recovery). The navigable link from sync summary to the pending operation is panel UX; the root-cause investigation (why a pending remains, "Instável" source) may touch worker/outbox. | Fold the panel part (navigation, safe state display, localized copy) into OPS-15 validation; keep the backend investigation tracked in #74. Note: no story file found for it. | Scope creep into outbox/reconciliation semantics, which AC 7 forbids changing; needs story + UX review ≥9.0 before UI changes (AC 13). |
| #73 | [OPS-17] Comandos de chat multilíngues para viewers | OPEN | Fits after migration | Chat command parsing/aliases; body says it "é separada da paridade do painel OPS-15"; may need schema. | Keep separate. | New domain rule and possible persistence change. |
| #72 | OPS-16: Explicar variáveis personalizadas da mensagem de chamada da fila | OPEN | Fits now | New Queue and Queue Settings forms in Next; API/chat unchanged per its AC; aligns with AC 5 (catalog copy) and AC 13. | Candidate to fold, or deliver as a sibling increment on the same branch; keep its own story (OPS-16) and QA. Its body says its reviews do not approve OPS-15 overall. | Doing it on vanilla too would double work; agree to deliver only in Next. |
| #69 | OPS-15: Refatorar o painel local e o overlay OBS para Next.js modular | OPEN | Already covered (it is OPS-15) | Parent issue. | Keep open until AC 1–18 close. | — |
| #65 | OPS-14: Mensagens localizadas de chamada da fila e início do atendimento | OPEN | Fits after migration (chat); partially covered (panel) | Body: OPS-15 "não substitui os comportamentos de chat"; the roadmap sequences it after OPS-13 acceptance. The story already lists an increment "Localized queue call-message default". | Keep separate; verify that the OPS-15 increment does not claim #65 AC (Twitch chat replies, durable start-of-service announcement). | Double-claiming; chat delivery needs outbox evidence, not panel tests. |
| #60 | OPS-12: Planejar UX do instalador para a fase RC | OPEN | Unrelated (deferred) | Gated on `.release-stage` = `rc`; stage is beta. | Keep separate. | Starting early violates its AC 1. |
| #57 | Regressões: chamada de fila, overlay de conta e permissões | OPEN | Fits now (validation overlap) | Overlay `/overlay.html` current-account reload; AC 8. Handoff records Linux native OBS 32.2.2 runs passing; owner's own reproduction environment not yet re-tested. | Keep open; add its reproduction as an explicit OPS-15 OBS check and ask the owner to retest on the Next overlay. Do not close as covered without the owner's native acceptance. | Closing on Linux/Chromium evidence alone would contradict the issue body. |
| #48 | DOC-3: Auditoria completa da consistência documental e revisão UX | OPEN | Fits after migration | Covers READMEs, changelogs, stories, roadmaps — the documentation half of the requested validation; sequenced after FND-9 and DOC-2. | Keep separate; OPS-15 handles only AC 11 doc updates. | Folding it in would make OPS-15 an umbrella. |
| #45 | OPS-10: Separate PR CI from main image delivery | CLOSED | Unrelated | CI. | None. | — |
| #41 | OPS-8: Automatic Twitch reconnection after network interruption | CLOSED | Already covered | Baseline for runtime-health states shown on Overview (AC 7). | None; use as regression reference. | — |
| #40 | DOC-2: Capturas de tela bilíngues do produto | OPEN | Fits after migration | Screenshots must show the accepted current UI; Next replaces vanilla. | Keep separate; schedule after cutover. | Capturing vanilla now produces obsolete media. |
| #39 | OPS-7: Hierarchical chat command permissions and subscriber role model | CLOSED | Already covered | Chat Commands page `/commands` (AC 14, 9.1/10). | None. | — |
| #38 | DOC-1: Concise README and focused documentation navigation | CLOSED | Already covered | README structure contracts; AC 11. | None. | — |
| #32 | OPS-6: Versão, conectividade e orientação visual no painel | CLOSED | Already covered | Visual baseline referenced by AC 7. | None. | — |
| #30 | OPS-5: Instalador multiplataforma com progresso e remoção completa | CLOSED | Already covered | Installer Compose mount (AC 5, AC 18). | None. | — |
| #29 | OPS-4: Adotar a licença MIT | CLOSED | Unrelated | License. | None. | — |
| #21 | OPS-2: Status Twitch em português claro no painel | CLOSED | Already covered | Twitch status copy on Overview/Connection (AC 5, AC 7). | None. | — |
| #20 | OPS-1: CI para API, infraestrutura e web | CLOSED | Unrelated | CI (AC 18 references current workflow). | None. | — |
| #19 | FND-9: Modos de fila local e com Custom Reward conforme capacidade Twitch | OPEN | Already covered (panel); owner acceptance separate | Queue modes are in Next parity (QRA rows). Story exclusions: "FND-9 remains pending owner acceptance". | Keep separate; owner acceptance can be done on the Next panel. | Real Twitch redemption evidence still missing. |
| #18 | FND-8: Internacionalização (i18n) com limites seguros entre backend e frontend | CLOSED | Already covered | AC 5. | None. | — |
| #17 | Painel: catálogo de comandos e permissões por cargo | CLOSED | Already covered | `/commands` page. | None. | — |
| #7 | FND-7: Overlay OBS configurável por widget | CLOSED | Already covered | `/widgets` and overlay baseline (AC 7, AC 8). | None. | — |
| #6 | FND-6: painel local, API protegida e segurança | CLOSED | Already covered | AC 6. | None. | — |
| #5 | FND-3: outbox financeira durável e recuperação | CLOSED | Already covered | Operation recovery semantics (AC 7). | None. | — |
| #4 | FND-4: OAuth, recompensas e EventSub Twitch | CLOSED | Already covered | Channel connection/OAuth callback (AC 3). | None. | — |
| #3 | FND-1: completar documentação bilíngue e aceitação operacional | CLOSED | Unrelated | Historical docs. | None. | — |
| #2 | FND-2: domínio de filas, UID, parser, autorização e ordenação | CLOSED | Already covered | Queue domain (AC 6 UID filtering). | None. | — |
| #1 | FND-5: comandos, chamadas, timeout e conta atual | CLOSED | Already covered | Call/current-account flows (AC 7). | None. | — |

## Gaps found (not issues)

- OPS-18 (Current Account single identity) and OPS-19 (confirm Twitch reward at service start) are In Progress stories with **no linked GitHub issue**, which the project rule "every new story requires a GitHub issue" requires. Both touch flows visible in the Next panel (queue call, current account, service start). Recommendation: owner authorizes `@devops` to create the issues before more work.
- #74 has no story file in `docs/stories/`.

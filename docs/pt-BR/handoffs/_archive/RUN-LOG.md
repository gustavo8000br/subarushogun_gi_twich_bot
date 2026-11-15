# Registro de handoffs (handoffs arquivados, ondas encerradas)

[English](../../../handoffs/_archive/RUN-LOG.md)

Consolidação conforme `.claude/rules/handoff-consolidation.md` (D-07, 2026-11-14). Os originais ficam nesta pasta, sem alteração além de uma faixa "ARQUIVADO". O estado ativo está em [`docs/pt-BR/current-state.md`](../../current-state.md) e no topo de [`docs/pt-BR/session-handoff.md`](../../session-handoff.md); o último arquivo de parada por cota fica fora do arquivo morto: [`resume-agents-2026-11-14.md`](../resume-agents-2026-11-14.md).

## Contexto estratégico

O pipeline da OPS-15 substituiu o painel vanilla pelo painel Next.js em ondas de cutover, com autorização explícita do proprietário a cada passo. Estes handoffs foram escritos em paradas por cota; as ordens deles valiam só no momento em que foram escritos.

## Onda: prompt de continuação da OPS-15 e continuação do overlay Next (antes de 2026-10-27)

- **Arquivos:** `docs/pt-BR/handoffs/_archive/claude-code-ops15-prompt.md` (só pt-BR), `next-overlay-continuation.md` (en, pt-BR).
- **O que diziam:** manter o painel vanilla como fallback, não fechar a FND-9, sem cutover, sem remover o vanilla, branch `feat/ops-15-next-panel`, alvo `v0.2.0-beta`.
- **Por que estão mortos:** as ondas 1 a 4 do cutover foram executadas com autorização explícita do proprietário, o código vanilla foi removido, a branch `legacy` foi removida em 2026-11-13 (não é fallback nem alvo de rollback) e o plano de versões mudou (`AGENTS.md`, política de bumps).
- **Não siga:** nenhuma instrução de "não faça cutover" ou "mantenha o vanilla".

## Onda: retomar os agentes interrompidos (2026-10-27)

- **Arquivos:** `resume-agents-2026-10-27.md` (en, pt-BR).
- **Situação:** ENCERRADO em 2026-10-28 (código da Onda 3 `906fd5c` e `8e20277`; alinhamento OPS-15/22/23/24 `0604799`; gate do `@qa` `qa-gate-2026-10-28.md`, CONCERNS 9,0/10). Mantido só como registro.

## Onda: parada por cota com merge em andamento (2026-10-29)

- **Arquivos:** `resume-agents-2026-10-29.md` (en, pt-BR).
- **O que dizia:** um merge de `origin/main` estava em andamento, "não aborte", redisparar o `@dev` com o brief, esta rodada pula o `@qa`.
- **Por que está morto:** o estado de merge descrito não existe mais, a reescrita de histórico por causa da URL de sessão mudou os hashes (mapa só local) e a regra permanente é que o `@qa` sempre faz o gate antes de commit, PR ou release.
- **Bloqueio resolvido:** nada herdado; nada nele está pendente.

## Onda: retomada após a parada de cota de 2026-11-11

- **Arquivo:** `docs/pt-BR/handoffs/_archive/resume-2026-11-11.md` (escrito em português; estava na pasta em inglês sem par, por isso agora fica só no arquivo morto pt-BR).
- **Pendências que ainda importam (já rastreadas em outro lugar):** a meta do beta (regra dos 80%, ledger `docs/pt-BR/process/open-acceptance-criteria-2026-11-10.md`, recontado pela D-04), o instalador de teste do Windows só do dono, o kit de validação do Windows, as verificações ao vivo TS-25 e TS-27a pendentes.
- **Nota:** cita o Fable 5.1 como modelo do desenho da OPS-31; o Fable é proibido pela política de modelos (`AGENTS.md`), menção só histórica.

## Não arquivados

- `docs/pt-BR/handoffs/macos-session-handoff.md` e `windows-session-handoff.md` (sessões de plataforma ainda pendentes, itens do dono).
- `docs/pt-BR/handoffs/resume-agents-2026-11-14.md` (arquivo ativo de parada por cota).
- `docs/handoffs/claude-memory-snapshot/` NÃO é tocado aqui: a remoção (D-01) espera o dono conferir antes o arquivo de confidencialidade de clientes.

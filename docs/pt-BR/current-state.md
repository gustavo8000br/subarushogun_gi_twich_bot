# Estado atual (arquivo curto, leia este primeiro)

[English](../current-state.md)

**Atualizado:** 2026-11-14 (D-15, alavanca de cota R12). Este arquivo substitui "leia o topo de `docs/session-handoff.md`" como ponto de entrada ao retomar: `docs/pt-BR/session-handoff.md` é um registro histórico longo (cerca de 230 KB) e não deve ser lido inteiro. Mantenha este arquivo com cerca de 60 linhas no máximo e atualize-o a cada mudança de estado; o handoff de memória privada do orquestrador não é acessível aos demais agentes e não vale como regra.

## Onde está o trabalho

- Nunca publique a branch antiga `chore/emergency-snapshot-2026-11-12`: o histórico dela tem um commit WIP com arquivos de memória. O trabalho novo vai numa branch nova a partir da `main` (fluxo: `main` -> branch Conventional Commits -> PR -> `main`); commits, push e PR são do `@devops` depois do veredito do `@qa`.
- Confirme `pwd`, `git rev-parse --show-toplevel` e `git branch --show-current` antes de editar; não presuma nomes de branch de documentos antigos.
- Parada por cota e pacotes abertos: [`resume-agents-2026-11-14.md`](handoffs/resume-agents-2026-11-14.md). Síntese da auditoria: [`audit-2026-11-13.md`](audits/audit-2026-11-13.md).

## Meta do beta

- O `v1.0.0-beta` exige pelo menos 26 de 32 funcionalidades planejadas testadas e funcionais. Ledger: [`open-acceptance-criteria-2026-11-10.md`](process/open-acceptance-criteria-2026-11-10.md).
- Contagem honesta (D-04): **20 firmes + 2 provisórias** (funcionalidades 14 e 24, decididas pelo `@qa` no G2), não 22. A trava do dinheiro segue aberta: as funcionalidades 7 e 9 são N. O Windows (28 a 30) depende da execução do dono.
- Próximo bump: rc/stable com OK do dono; bumps alpha/beta seguem o `AGENTS.md`. A linha `restart: unless-stopped` espera a próxima seção do changelog: [`pending-changelog-entries.md`](process/pending-changelog-entries.md).

## Regras que mudaram há pouco

- Execução por faixas (até 3 de leitura e 1 de escrita; interruptor "multi-agents on/off"), não "um agente por vez": `AGENTS.md`, "Operação do orquestrador e dos agentes".
- A branch `legacy` não existe mais; o painel é o Next.js. Handoffs antigos foram arquivados: [`RUN-LOG.md`](handoffs/_archive/RUN-LOG.md).
- A HD-03 (aceite nativo OBS/CEF) está arquivada (D-14). O aceite no Windows e no macOS segue como item do dono.

## Itens do dono e bloqueios

- D-01: `docs/handoffs/claude-memory-snapshot/` fica onde está até o dono conferir o arquivo de confidencialidade de clientes; depois, um PR limpo de remoção (sem reescrever o histórico, salvo se a conferência mandar outra coisa).
- Execução do kit de validação no Windows (funcionalidades 28 a 30), macOS antes do `rc`, OK expresso para `rc` e `stable`, merge/tag/release.
- Sub-issues das fatias planejadas são criadas quando cada story fica Ready (D-16, exceção registrada no `AGENTS.md`).

## Pacotes abertos (ordem)

1. Gate do `@qa` do pacote de governança (P1), depois P2 (`release.yml`, feito nesta branch), P3 (esta onda de documentação), P4 (job de CI dos scripts browser-only), gate final do `@qa`, e o `@devops` monta a branch nova por grupos de pathspec.
2. Depois: OPS-24 (Biome e TypeScript), desenho v2 da OPS-31, correções de dinheiro.

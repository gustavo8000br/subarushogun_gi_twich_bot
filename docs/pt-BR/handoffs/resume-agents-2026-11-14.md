# Ponto de retomada — parada por cota (2026-11-14, cota ~77% e subindo)

[English](../../handoffs/resume-agents-2026-11-14.md)

Ordem do proprietário: seguir nesta ordem e só parar depois dela: (1) desenho multi-modelos (feito) → (2) pop-ups e aprovação do proprietário (feito, D-M1..D-M14) → (3) `@dev` / `@qa` / `@devops` aplicam o pacote aprovado e as correções da onda 0 numa branch NOVA. A cota chegou a ~77%, então a sessão foi preparada para parar. Regra: acima de ~80% o handoff é atualizado antes de acionar qualquer agente; na interrupção, registre aqui o ponto exato de parada.

## Estado em um parágrafo

A auditoria completa (17 lotes) e a síntese do `@architect` estão prontas (`docs/audits/audit-2026-11-13.md` + pt-BR, sem commit). O pacote de governança multi-modelos (P1) está implementado na árvore de trabalho pelo `@dev`, foi triado pelo `aiox-audit` (Haiku 5.5; achados F1..F15) e o `@dev` corrigia F2..F15 quando a parada foi preparada. Nada desta sessão depois do commit `5da50c2` está comitado nem publicado. A branch `chore/emergency-snapshot-2026-11-12` NÃO deve ser publicada (o histórico dela tem um commit WIP com arquivos de memória); a cópia remota foi apagada.

> **ATUALIZAÇÃO (cota 83%):** o `@dev` abaixo foi PARADO pelo Orion no meio da tarefa. Estado conferido logo depois: os testes do guard passam (`git-authority-guard.test.js` + `claude-governance-contract.test.js`: 322 testes verdes com Node 24.20.0), sem servidores de desenvolvimento nem contêineres sobrando, cerca de 72 entradas no `git status`. Quais dos F2..F15 foram concluídos NÃO está registrado: na retomada, reconfira a lista da triagem contra o código (grep de cada achado) e redispare o `@dev` só para o que continuar aberto. O `.claude/CLAUDE.md` já tem a nota de precedência (F11).

## Agente que foi interrompido (confira primeiro)

| Agente | Tarefa | Se não terminou |
|---|---|---|
| `@dev` (Sonnet 5.5) | Corrigir os achados F2..F15 da triagem do `aiox-audit` no pacote de governança (guard negar-por-padrão para quem não é `@devops`, endurecer o guard de leitura, `--no-v`, refspec dinâmico, hash de não rastreados na impressão digital, handle do dono e nome do repositório privado fora de `AGENTS.md:162` e `CLAUDE.md:17`, justificativa do `bypassPermissions` + teste de contrato, reescrita do README dos hooks, nota de precedência no `.claude/CLAUDE.md`, lacunas de teste, teste de paridade) | Confira `git status`, rode `npm run test:unit` (Node 24.20.0 via `source ~/.nvm/nvm.sh && nvm use 24.20.0`) e os testes do guard; redispare o `@dev` com a lista de achados (texto da triagem no handoff da memória); nunca confie num guard editado pela metade sem rodar os testes. |

## O que falta (em série até as novas regras de faixas do `AGENTS.md` serem exercitadas)

1. Gate do `@qa` para o P1 (bateria completa; os testes V-HOOK/V-SUB/V-ADV/V-WT/V-FP que exigem sessões reais do Claude; mutações; a primeira triagem do `aiox-audit` já foi feita). Passo do dono depois: remover o bloco `PreToolUse` antigo de `.claude/settings.local.json` (D-M14).
2. P2 `release.yml`: só disparo manual em todos os estágios e corrigir o `--prerelease` fixo no stable (D-03).
3. P3 onda de verdade dos docs: ledger 20 firmes + 2 provisórias (D-04), arquivar handoffs superados com um RUN-LOG e corrigir o ponteiro de continuação do `CLAUDE.md` (D-07), faixas históricas nas stories antigas Done (D-09), mover a linha `restart: unless-stopped` do changelog para fora da `v0.3.0-beta` publicada (D-12), limpar usuário do SO/hostname/nome de arquivo de credencial dos docs públicos, remover `docs/handoffs/claude-memory-snapshot/` por PR limpo sem reescrever histórico (D-01; o dono confere antes o arquivo de confidencialidade de clientes), HD-03 arquivada (D-14), arquivo curto de estado R12 (D-15), exceção da regra de sub-issues (D-16).
4. P4 job de CI para os 21 scripts `*-browser-only` (D-13).
5. Gate final do `@qa`; depois o `@devops` monta uma branch NOVA a partir da `main` por grupos de caminhos (cherry-pick é impossível: o commit WIP tem a base do trabalho), comita, não publica, e empurra a memória. G-A (correções de UX da S-13 + token `--control-border`) só depois da renota do `@ux-design-expert` >= 9,0 e do OK do dono ao token registrado no repositório (D-05).
6. Próximas sessões: programa Biome + TypeScript da OPS-24 (TS-0..TS-2 primeiro, `apps/shared` e painel `.tsx` como TS-6/TS-7, Biome formata CSS por decisão do dono, próximo MINOR, OPS-31 primeiro), desenho v2 da OPS-31 (escopo do Opus conforme o desenho), correções de dinheiro W3.

## Trabalho sem commit (NÃO limpar nem fazer stash)

Tudo está na árvore de trabalho (cerca de 70 entradas no `git status`): o pacote de governança (`.claude/hooks/`, `.claude/agents/`, `.claude/settings.json`, `.gitignore`, skills, `AGENTS.md`, `CLAUDE.md`, `.aiox-core/core-config.yaml`, dois arquivos de teste novos, nota de pesquisa), o relatório da auditoria, G-A/G-B/G-C do gate anterior e as atualizações de docs de "um agente por vez". Detalhes e listas exatas estão no handoff da memória (`handoff-current.md`, sincronizado com o repositório privado de memória).

## Ordem de retomada

1. `./sync.sh pull <pasta do projeto>` (Orion), ler `handoff-current.md` e depois este arquivo.
2. Verificar a tarefa do `@dev` interrompido acima.
3. Seguir a lista que falta; manter o handoff da memória e este arquivo atualizados a cada ciclo; o `@devops` empurra a memória.

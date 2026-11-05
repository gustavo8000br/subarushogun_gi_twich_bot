# R10 aplicada (adendo) — 2026-11-05

Aplica R10 (a)-(d) do `README.md` às dez definições de subagentes nativos em `.claude/agents/aiox-*.md`.

## O que mudou

- (a) `model: sonnet` nas 10 definições (9 estavam em `opus`). Não foi criado o `aiox-architect-opus`: a lista `ALLOWED_NATIVE_SUBAGENTS` em `.aiox-core/infrastructure/scripts/validate-claude-integration.js` (arquivo L2 do framework) rejeitaria um novo agente nativo. Para uma tarefa de arquitetura MUITO complexa, o Orion passa `model: opus` naquele único disparo (parâmetro por chamada), sem arquivo novo.
- (b) `effort: medium` em todas; `maxTurns`: `aiox-dev` 120, `aiox-qa` 150, os outros oito 60. Ambos os campos são frontmatter documentado de subagente (ver README, "Subagents").
- (c) Removidas as leituras de contexto de `.aiox/gotchas.json`, `.aiox-core/data/technical-preferences.md` e `.aiox-core/data/aiox-kb.md` (confirmado com `ls`: nenhum existe). Os itens restantes foram renumerados.
- (d) Removido o pré-carregamento de `synapse:tasks:diagnose-synapse` da lista `skills:` dos 10 agentes.

## Origem dos arquivos

`npm run sync:skills:claude` / `sync:ide` não geram `.claude/agents/`; são arquivos do projeto mantidos à mão, então foram editados diretamente e a sincronização rodou depois (nenhum outro arquivo mudou). As regras de qualidade (nota do `@qa` >= 9,0, paridade, segurança) não foram alteradas.

## Como medir

No `/usage`, compare antes e depois: as linhas por modelo (a fatia do Opus deve cair em direção ao Sonnet) e as linhas por subagente (`aiox-dev` era 53% do uso). Confira também se algum agente termina por `maxTurns` (término por "max turns" indica limite baixo para aquela missão: suba só para esse agente).

## Validação

`sync:skills:claude`, `sync:skills:codex`, `sync:ide:check`, `lint`, `validate:localization`, `validate-claude-integration.js` e `npm test` (171 arquivos, 1900 testes) passaram.

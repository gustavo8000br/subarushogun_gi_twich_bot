# Governança multimodelo: advisor, subagentes, worktrees, hooks e Haiku (nota de pesquisa)

[English](../../../research/2026-11-14-multimodel-governance/README.md)

- Autor dos achados: `@architect` (Aria), missão de 2026-11-14 (pacote de desenho aprovado pelo proprietário no mesmo dia). Registrada aqui pelo `@dev` para o índice ficar completo. O `@dev` não fez pesquisa nova na internet.
- Classe da fonte: **A1** = documentação oficial do Claude Code e da Anthropic lida pelo `@architect`; os links diretos das páginas não foram guardados no desenho, então precisam ser recolhidos de novo antes de qualquer decisão que dependa de um detalhe abaixo. **LOCAL** = observado neste repositório. **UNVERIFIED** = inferência, a provar pelas verificações V-* de `12-plano-de-testes` do desenho (executadas pelo `@qa`, nunca pelo `@dev`).
- Limites: nada abaixo foi executado em sessão nova do Claude Code, no GitHub, no Docker ou em navegador. O peso de cada modelo na cota semanal não é público; os limiares de 60 % e 80 % do `AGENTS.md` são escolhas operacionais, não medições.

## Achados

| # | Tema | Achado | Classe |
|---|---|---|---|
| 1 | Ferramenta advisor | Ferramenta experimental no servidor; o executor decide quando chamar (não dá para forçar nem limitar, só instruir). Vê a conversa inteira, só aconselha (sem ferramentas) e responde com cerca de 400 a 700 tokens. Cada chamada reprocessa a conversa sem cache, no preço do advisor. | A1 |
| 2 | Pares e interruptores do advisor | O advisor precisa ser pelo menos tão forte quanto o executor; o Sonnet 5.5 aceita Opus 5 em diante. Por sessão: `claude --model sonnet --advisor opus`; `/advisor opus` grava `advisorModel` nas configurações do usuário (não usado aqui); `/advisor off` e `CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1` desligam. | A1 |
| 3 | Advisor e subagentes | Subagentes herdam o advisor, então um agente de leitura Haiku poderia acionar uma chamada Opus que relê a conversa. Regra adotada: nenhum despacho de Haiku em sessão com advisor. O comportamento real nesta instalação não foi testado (V-ADV-1, V-ADV-2). | A1 + UNVERIFIED |
| 4 | Modelo do subagente | O argumento `model` da chamada de despacho vence o frontmatter do agente; o apelido `haiku` do frontmatter resolve para o Haiku 5.5 na API da Anthropic. | A1 |
| 5 | Haiku para leitura | O preço de entrada é cerca de 1/20 do Sonnet; o Haiku marcou 39,2 % contra 70,6 % do Sonnet num benchmark de agente de terminal, então o Haiku fica limitado a leitura e triagem, nunca a veredito, dinheiro ou segurança. | A1 |
| 6 | Ferramentas dos subagentes | `Grep` e `Glob` não apareceram para subagentes na versão instalada; os agentes de leitura usam `Bash` atrás de um hook de allowlist. Espera-se que `disallowedTools` valha mesmo em `bypassPermissions`; `permissionMode: plan` é ignorado ali. | LOCAL + UNVERIFIED (V-SUB-2) |
| 7 | Hooks | Hooks `PreToolUse` em `.claude/settings.json` e no frontmatter dos agentes podem devolver `allow`, `ask` ou `deny`. A entrada do hook traz o tipo do subagente (`agent_type`) quando a chamada vem de um subagente; isto é suposição, não prova aqui (V-HOOK-3). Hooks são guarda-corpo, não fronteira de segurança: scripts e interpretadores ainda alcançam o Git; credenciais e proteção de branch são a fronteira real. | A1 + UNVERIFIED |
| 8 | Worktrees | A worktree de um subagente parte da branch padrão (fresh) ou do HEAD comitado; mudanças staged, unstaged e não rastreadas não são copiadas. Como este projeto não comita antes do gate, uma worktree automática auditaria um diff incompleto; por isso o `aiox-audit` lê o checkout principal e prova a versão com uma impressão digital. Worktrees com trabalho não publicado não são removidas pela limpeza periódica. | A1 + UNVERIFIED (V-WT-1, V-FP-1) |
| 9 | Configuração do framework | `autoClaude.worktree.autoCreate` é lido só por `.aiox-core/infrastructure/scripts/story-worktree-hooks.js`; `models.active` é lido só por `.aiox-core/core/synapse/context/context-tracker.js` (janela de contexto e tamanho do prompt). | LOCAL |
| 10 | permissionMode bypassPermissions | Mantido nos dez agentes de escrita (decisão do proprietário, 2026-11-14); os três agentes de leitura usam `plan`. Motivo: agentes em segundo plano não têm quem responda a um pedido de permissão, e as faixas autônomas parariam. O risco é coberto pelos hooks `PreToolUse`, por `permissions.deny` e pelo gate do `@qa`. Que os hooks continuam rodando e bloqueando sob `bypassPermissions` nesta instalação **não está comprovado** (V-HOOK-1, executada pelo `@qa` em sessão real). | LOCAL + UNVERIFIED (V-HOOK-1) |

## Registro da decisão: bypassPermissions mantido

- Decisão (proprietário, 2026-11-14): manter `permissionMode: bypassPermissions` em `aiox-analyst`, `aiox-architect`, `aiox-data-engineer`, `aiox-dev`, `aiox-devops`, `aiox-pm`, `aiox-po`, `aiox-qa`, `aiox-sm` e `aiox-ux`.
- Justificativa escrita: as faixas autônomas precisam de agentes que não parem em pedidos de permissão; o guard nega por padrão a quem não é o `@devops`.
- Pendência: a V-HOOK-1 decide. Se o hook não rodar sob `bypassPermissions`, o proprietário decide a troca; até lá o estado é "mantido, não comprovado", sem crédito de aceite.
- Contrato: `tests/unit/claude-governance-contract.test.js` fixa o estado e a verificação pendente.

## O que mudou no projeto por causa desta nota

`AGENTS.md` (faixas, arquivos quentes, fila de gates, agentes de leitura, um único bullet de modelos), `CLAUDE.md` (agentes de leitura, faixas, advisor por sessão), `.claude/settings.json`, os dois hooks e `lib/shell-words.cjs`, os três agentes de leitura, as regras de Git do `@devops`, os overrides de commit de duas skills e `.aiox-core/core-config.yaml` (`models.active` e `autoCreate: manual`).

## Veredito para o índice

**REFRESH IF** a versão instalada do Claude Code mudar, ou quando as verificações V-HOOK, V-SUB, V-ADV, V-WT e V-FP produzirem resultados (então atualizar os itens 3, 6, 7 e 8 com o comportamento medido).

# Handoff de desenvolvimento — 2026-10-06

[English](../session-handoff.md)

## Worktree atual

- Repositório/worktree: `/home/gustavo/projects/wt-ops-fnd8-spec`
- Branch: `docs/ops-qa-fnd8-spec` (base atual `origin/main` em `c008f07`)
- Esta é a worktree ativa do Codex CLI/VS Code. A captura do usuário `Captura de tela de 2026-10-06 18-28-47.png` confirma que o VS Code está na pasta `wt-ops-fnd8-spec` e a barra de status mostra `docs/ops-qa-fnd8-spec*`. Não troque para o checkout principal `/home/gustavo/projects/subarushogun_gi_twich_bot`.
- As alterações ainda não foram commitadas. Não as descarte. O checkout principal tem mudanças do usuário separadas e não deve ser modificado.

## Objetivo atual e ponto de parada

Concluir o registro dos achados do Planning Workflow (Spec Pipeline) FND-8 e das evidências de QA OPS nesta worktree. O usuário pediu explicitamente para parar assim que o planejamento estiver concluído, para continuar na sessão Codex do VS Code. Nesta etapa, não iniciar implementação FND-8, abrir PR, fazer merge, apagar volumes Docker ou iniciar instalação Compose limpa.

## Resultados das revisões OPS

- OPS-1: QA independente PASS 9,3/10, com base no Actions `37525101710` em `c008f07` (473 testes / 69 arquivos). QA não executou novamente a suíte no worktree de revisão. Existem gates bilíngues em `docs/qa/gates/` e `docs/pt-BR/qa/gates/`.
- OPS-2: dois defeitos de precedência visual de status foram corrigidos com teste primeiro. Testes focados passaram 12/12; lint/typecheck web passaram. Reavaliação QA independente PASS 9,3/10. Não foram usadas credenciais Twitch reais. Sincronização da issue #21 fica para DevOps após merge.
- OPS-4: QA independente PASS 9,3/10 para a PR #25 já mesclada. Registros de gate QA bilíngues foram adicionados.
- Atualizar e fechar issues OPS-1/OPS-2 somente depois de revisar/mesclar esta branch. Não publicar comentários; atualizar corpo/status da issue.

## Estado do planejamento FND-8

- Artefatos bilíngues completos do Spec Pipeline: `docs/stories/FND-8/` e `docs/pt-BR/stories/FND-8/`.
- Escopo aprovado pelo proprietário: idioma do produto todo, pt-BR/en/es, locale persistido/editável, um catálogo comunitário por módulo/idioma, raízes `!fila` / `!queue` / `!cola` sem aliases legados e cobertura do painel/configuração/callback/chat/textos de produto OBS/ferramentas locais.
- Complexidade: COMPLEX 22/25. Nenhuma implementação iniciada.
- QA independente da specVersion 1: CONCERNS 8,1/10. A specVersion 2 revisada registra estes gates:
  1. Alto: definir autoridade/ponte PostgreSQL-host, bootstrap, mudanças atômicas pelo painel e recuperação offline/parcial.
  2. Alto: escolher contrato de serialização/escaping/placeholders/plurais consumível por browser ESM, Node ESM e ferramentas sem runtime adicional no host antes do Docker. JSON é apenas candidato.
  3. Médio, decisão do proprietário: política de apresentação de fila/reward/template/widget escrito pelo streamer após troca de locale. Preservar é só recomendação; dados salvos nunca podem ser reescritos silenciosamente.
  4. Médio, decisão do proprietário: colisões de slug/alias existentes com raízes reservadas. Detectar e bloquear sem renomeação automática é proposta.
  5. Baixo/médio, decisão do proprietário: confirmar a família `subarushogun_twich_bot_*` e os sufixos exatos das ferramentas locais.
- Se continuar a aprovação do planejamento, solicitar/registrar reavaliação QA independente curta da specVersion 2. Manter implementação FND-8 bloqueada até resolver os gates/decisões necessárias.
- `v1.1.0-HHHHHHH-beta` continua sendo intenção; nenhuma promoção de estágio, release ou tag está autorizada aqui.

## IDE e continuidade

- O `AGENTS.md` da raiz agora se aplica ao Codex CLI e à extensão Codex IDE do VS Code, instrui ambos a ler este handoff e exige a mesma worktree/branch.
- Para alinhar/reabrir o VS Code nesta worktree, execute de qualquer terminal: `code --reuse-window /home/gustavo/projects/wt-ops-fnd8-spec`.
- No terminal integrado, confira `pwd`, `git rev-parse --show-toplevel` e `git branch --show-current`.
- A captura mostra o aviso do chat Codex “Está aberto em outro aplicativo”. A conversa em si não fica disponível simultaneamente nos dois clientes: feche/libere-a no outro app e tente novamente lá para continuar o mesmo chat, ou inicie um chat novo na IDE e use este handoff. Não presuma que o histórico é compartilhado.

## Validação pendente

O daemon Docker foi atualizado durante a pausa anterior. A stack Compose atual foi parada pela reinicialização do daemon. Quando o usuário retomar depois do planejamento, executar novamente os quality checks exigidos na branch final; depois realizar a reinstalação Compose limpa previamente autorizada, removendo somente containers/volumes do projeto `queuebot-fnd7` e preservando os demais recursos Docker. Verificar `/health` e painel antes do relatório. Manter os serviços one-shot `bootstrap`/`migrate` como esperado.

# Handoff de Continuidade do Overlay Next.js

**Data:** 2026-10-19  
**Repositório:** SubaruShogun Twitch Queue Bot  
**Branch:** `feat/ops-15-next-panel`  
**Checkpoint inicial:** `38cc55e`  
**Story:** OPS-15 — **In Progress**  
**Público:** GitHub Copilot e Claude Code

## Leia primeiro

1. `AGENTS.md`
2. `docs/session-handoff.md` e `docs/pt-BR/session-handoff.md`
3. `docs/stories/OPS-15/story.md` e `docs/pt-BR/stories/OPS-15/story.md`
4. Este handoff e `docs/decisoes_humanas/em_revisao/HD-02-contrato-compatibilidade-overlay.md`

Antes de editar, informe `pwd`, `git rev-parse --show-toplevel`, `git branch --show-current` e `git rev-parse --short HEAD`. Mantenha este checkout em `feat/ops-15-next-panel`; preserve todas as modificações locais e artefatos não rastreados existentes. Não troque para `main`, descarte/reset alterações, crie PR ou faça merge. Não execute geradores de status ou greeting. Nunca adicione `.env.product.local`, segredos, artefatos de build ou `.aiox/project-status-43a81ec8.yaml` ao Git.

## Papéis e decisões do produto

- Master coordena; Dev implementa; QA valida de forma independente; DevOps cuida das operações remotas do repositório. Não declare revisão de persona ou score de QA sem executar o fluxo correspondente.
- Next.js é responsável pelo painel público e pelo documento `/overlay.html` em desenvolvimento e produção. Fastify continua sendo a API e a fonte de verdade; Next encaminha as requisições de API do painel/overlay para o Fastify pela mesma origem pública. Mantenha o Fastify privado/loopback em produção e preserve a porta pública atual.
- O overlay OBS é dinâmico e está em uso: consulta a API do bot a cada segundo, atualiza quando a página volta a ficar visível, desativa ao revogar a capability e deve continuar atualizando mudanças de conta/fila/conteúdo. Preserve URL de capability, contrato somente leitura, revogação e comportamento de cache existentes, salvo revisão explícita do HD-02.
- Mantenha o painel vanilla como fallback até haver evidência de paridade da story, auditoria dos testes legados, revisões de QA/arquitetura/UX, validação nativa em OBS/CEF e ensaio de rollback. Não apague arquivos legados nem encerre FND-9.
- Não altere a versão do produto até terminar as correções. Os changelogs públicos devem ser concisos e classificar cada versão em seções traduzidas `Added`/`Changed`/`Fixed` (pt-BR: `Adicionado`/`Alterado`/`Corrigido`). Atualize inglês e pt-BR juntos e antes de qualquer commit.
- Não altere `apps/frontend/.next` enquanto uma prévia Next puder estar usando essa pasta. Confira a propriedade do processo e pare apenas uma prévia sob seu controle antes de reconstruir.

## Estado atual da implementação

A worktree em andamento adiciona servidor dinâmico de produção Next e supervisor dos processos, rewrites de produção para a API privada Fastify, roteamento do documento overlay pela mesma origem, separação de portas pública/API privada e configuração da imagem Docker/Compose. O runtime Next deixou de ser exportação estática. Rotas legadas do painel ainda têm fallbacks de compatibilidade. Testes unitários/de integração relacionados, documentação OPS-15 e changelogs beta categorizados estão modificados. Este trabalho não está commitado; inspecione `git status` e o diff antes de continuar.

A versão beta pública permanece `v0.2.0-beta`. Não considere OPS-15 concluída. A linha de base geral existente de QA permanece **CONCERNS 8.0/10**; a fatia do novo servidor/runtime ainda **não foi avaliada por QA independente**. Aceitação nativa OBS/CEF, paridade completa no browser, instalador, ensaio de rollback, auditoria completa de testes legados e gates finais de cutover continuam abertos.

## Estado das validações nesta worktree

- `npm run build` passou após corrigir uma omissão no Dockerfile de `apps/web/queue-confirmation-copy.mjs`. Build Next de produção, geração do Prisma Client e export final da imagem Docker concluíram.
- O smoke runtime encontrou `/health` retornando Next `308` por causa de `trailingSlash: true` em produção. A configuração de barra final foi desativada e `/overlay.html` agora reescreve diretamente para `/overlay`. Depois, o teste completo de runtime Compose passou migrations, health Next/Fastify, TLS e aceite de persistência/restart gracioso.
- Testes focados de roteamento/build/config/release notes passaram **6 arquivos / 31 testes**. `npm test` passou **145 arquivos / 1.362 testes**, com **20 testes de execução de instalador POSIX ignorados** no Windows. Esses cenários shell rodam em CI POSIX; as verificações estáticas dos pacotes continuam no Windows. O harness nativo do instalador Windows passou.
- `npm run lint`, `npm run typecheck`, `npm run validate:localization`, `npm run validate:port-denylist` (1.024 arquivos / 0 achados), `npm run validate:version`, `npm run review:static` / OpenGrep (146 arquivos JS / 0 achados) e `git diff --check` passaram. OpenGrep 1.31.0 foi instalado no perfil do usuário pelo instalador oficial Windows; validação de assinatura Cosign foi ignorada porque Cosign não está instalado.
- Não foi feita QA independente desta fatia Next production/Compose. Um smoke HTTP em Compose descartável de produção agora confirma que `GET /overlay.html` retorna o documento Next (`200`) e que `GET /overlay/api/widget` same-origin é encaminhada ao Fastify e devolve seu `401` esperado sem capability, com cabeçalhos no-store. Aceite OBS/CEF nativo, ensaio de rollback e auditoria final dos testes legados continuam pendentes.
- Docker Desktop e um container de banco do projeto foram observados em execução. Não pare nem remova o banco/volumes ativos do usuário. Verifique labels/projeto antes de limpar somente containers de teste comprovadamente descartáveis.

## Próximos passos recomendados

1. Releia os dois handoffs e a story OPS-15; confirme estado da worktree e inspecione o diff completo. Preserve todo trabalho do usuário já existente.
2. Ative QA AIOX independente desta fatia e siga a skill UX para mudanças de interação/copy/layout visíveis ao usuário. Faça revisão de arquitetura quando necessário. Mantenha score delimitado separado do score geral OPS-15; não altere a linha de base 8.0/10 sem evidência independente nova.
3. Continue os itens ordenados restantes da story. Atualize checklist/file lists bilíngues da story, handoffs, inventários e changelogs públicos no mesmo incremento. Mantenha os gates não relacionados a código claramente pendentes.
4. Complete OBS/CEF nativo, ensaio de rollback e auditoria completa dos testes legados antes de cutover ou remoção do painel vanilla. Mantenha FND-9 aberta.
5. Antes de commit, atualize ambos changelogs como última etapa de implementação. O gate AIOX pre-push exige lint/typecheck/test/build/denylist/análise estática aprovados e status da story `Ready for Review` ou `Done`; não o ignore. Não marque OPS-15 Ready/Done enquanto paridade, OBS/CEF, auditoria legada ou rollback estiverem pendentes.

## Manutenção do handoff

Mantenha este arquivo sincronizado com `docs/handoffs/next-overlay-continuation.md`. Acrescente evidências datadas, comandos, resultados e a próxima ação precisa. Os handoffs de sessão continuam sendo o registro autoritativo da worktree atual.

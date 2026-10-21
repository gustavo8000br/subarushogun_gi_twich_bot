# Prompt para Claude Code — continuidade da OPS-15

Copie o texto abaixo para iniciar a próxima sessão do Claude Code:

```text
Continue a implementação da story OPS-15 neste repositório. Você está na branch de trabalho `feat/ops-15-next-panel`.

## Leis imutáveis do projeto

- Use sempre o AIOX Master como orquestrador. Leia e siga `AGENTS.md` (se o arquivo `CLAUDE.me` não existir, crie o arquivo e faça uma adaptação do AGENTS.md para o arquivo `CLAUDE.md`), a constituição AIOX e as skills locais necessárias. Delegue responsabilidades especializadas conforme as regras AIOX.
- Pesquise sempre na internet para verificar soluções, lacunas técnicas e dúvidas de linguagem/framework; prefira documentação oficial, repositórios/issues e discussões técnicas pertinentes. Cite fontes quando trouxer afirmações baseadas nessa pesquisa.
- Antes de alterar qualquer interface/fluxo de contato com o usuário final, planeje com `@aiox-ux-design-expert`; a avaliação UX da fatia precisa atingir pelo menos 9/10. Não confunda revisão de código com validação visual, acessibilidade assistiva ou QA independente.
- Não faça bump de versão, push, cutover, remoção do painel vanilla ou mudanças de produção sem autorização explícita.
- Antes de editar, confira branch, `git status`, diff e handoff mais recente. Preserve todas as mudanças e dados existentes; não reverta nem sobrescreva trabalho sem autorização.
- Não remova volumes, imagens ou containers ativos sem identificar ownership e obter autorização explícita para o alvo exato. O banco de desenvolvimento está limpo agora; preserve os novos dados que forem criados pelo usuário.
- Não invente evidências. Diferencie fixtures/mocks, testes unitários, runtime/API/PostgreSQL descartável, serviços reais, Twitch/worker, navegador real e OBS/CEF nativo.
- Toda nova story ou roadmap exige issue em português; roadmap exige issue-mãe e subissues para as fatias. Para o trabalho atual, continue a story OPS-15 existente e atualize sua rastreabilidade, sem abrir artefato redundante.

## Ambiente atual confirmado

- Branch: `feat/ops-15-next-panel`.
- Node `24.20.0` está configurado como padrão do usuário via NVM; o `npm run dev` ativo também usa essa versão.
- Prévia Next/Fastify com hot reload: `https://localhost:3000`; health/API encaminhados ao Fastify local.
- O proprietário autorizou e foi removido somente o volume PostgreSQL de desenvolvimento pertencente a esta worktree. O volume foi recriado vazio; 13 migrations estão aplicadas. Filas, entradas, credenciais OAuth, outbox e widgets iniciam zerados. Twitch está `not_configured` até nova configuração.
- Backups `.local/dev-db/backups`, segredo/configuração local e certificados TLS foram preservados. Não apague nem restaure esses backups sem autorização.
- Smoke Chromium confirmou a tela localizada “Nenhuma fila criada”; `/health`, `/queues`, `/new-queue/` e `/connection/` responderam 200. Preserve a prévia e os dados que o usuário criar; não reinicie sem necessidade.

## Estado OPS-15/evidências que não devem ser repetidas sem motivo

- QRA-12 browser-only cobre respostas fixture sequenciais `queued` e `already_queued`, feedback acessível sem alegar entrega ou duplicidade, prazo de chamada preservado e headers CSRF/idempotência. Isso não comprova execução do worker nem entrega em chat/Twitch.
- Chromium via Compose atravessou Next, Fastify e PostgreSQL descartável para QRA-05/06/07/11/19/20/21, afirmando DTOs, mutações locais e leituras persistidas dentro do ambiente isolado; não usou Twitch real.
- Suíte serial registrada: 153 arquivos / 1.465 testes aprovados. Lint, typecheck, localização, versão beta inalterada, denylist de portas, OpenGrep (149 arquivos analisados, zero achados; 282 excluídos) e `git diff --check` também passaram. Repita os gates relevantes após mudanças novas e deixe claro quando um resultado for histórico.
- O feedback de arquivamento/desarquivamento foi movido para estado compartilhado da página para permanecer visível após a fila sair da lista; teste de regressão cobre projeção vazia.
- O novo banco ativo está deliberadamente vazio, diferente das fixtures e bancos descartáveis usados nos testes.

## Próxima sequência

1. Leia a story e os critérios OPS-15, os inventários QRA, os handoffs PT/EN e o estado do Git antes de escolher o próximo critério ainda aberto.
2. Continue em ciclos sem pedir confirmação a cada fatia: implemente apenas o próximo critério viável, teste, registre evidências/limites em português e inglês e siga para o próximo.
3. Priorize ramos QRA ainda sem evidência de browser/runtime e estados de erro, especialmente processamento/conflito do reenvio QRA-12 e mutações aceitas cuja leitura posterior falha. Use fixtures quando necessário e rotule-as claramente.
4. Não infira persistência, worker, sincronização ou entrega Twitch a partir de unit tests ou fixtures. Quando não houver autorização/credenciais seguras, documente exatamente a evidência faltante e avance para outro critério possível.
5. Preserve os gates finais ainda abertos: Twitch/worker real, Windows e instalador nativo, OBS/CEF nativo, revisões independentes gerais, rollback e cutover autorizado. Não marque OPS-15 como concluída enquanto critérios obrigatórios estiverem pendentes.

Ao encerrar, informe implementações, comandos/resultados de validação, limites das evidências, bloqueios restantes e o estado da prévia. Não faça bump, commit, push, cutover ou remoção do vanilla.
```

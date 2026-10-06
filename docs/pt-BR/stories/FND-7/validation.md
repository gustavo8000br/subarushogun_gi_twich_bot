# FND-7 — Validação do Spec Pipeline

[English](../../../stories/FND-7/validation.md)

**Data da revisão:** 2026-10-06. Spec Pipeline e UX estão concluídos. Backend, API protegida, editor do painel e renderer foram implementados. HTTPS no CEF nativo, propagação de oito fontes, recuperação de indisponibilidade, estado stale, recarga da fonte e rotação de capability passaram no Ubuntu 24.04. Após confiar no certificado local atual no Chrome, a aceitação de criar/editar/copiar/regenerar/revogar/excluir widget passou. A seleção da fonte de fila foi verificada com fixture temporária local no PostgreSQL; sincronização Twitch não foi exercitada. Os gates completos passaram após as atualizações finais da documentação e dos testes de contrato. O QA independente AIOX passou com nota 9,2/10; FND-7 está Done.

## Estado do pipeline

| Fase | Resultado | Evidência |
| --- | --- | --- |
| Gather | Concluída com elicitação do usuário | Escopo completo de campos, mesmo computador, estilo completo, SLA de 2s, fallback para vazio, stale marker para falha transitória, link revogável e limite de 240 caracteres. |
| Assess | COMPLEX, 19/25 | Escopo 4, integração 3, infraestrutura 4, conhecimento 4, risco 4. Inclui confiança CEF nativo, Page Permissions e risco de recursos com várias fontes. |
| Research | Atualizada | Documentação/repositório oficiais de OBS Browser Source e obs-browser, certificados do Chromium Linux, desempenho do OBS, RFC 6750 e arquitetura existente; sem nova dependência. |
| Write | Revisada após crítica 1 | Define campos, identidade do widget, token fragment/header, fallback e semântica stale. |
| Critique 1 | NEEDS_REVISION | Encontrou ambiguidade entre campo vazio, falha temporária e link revogado; solicitou resposta visual distinta e atualização dos critérios. |
| Revise | Concluída | Elicitação especificou último valor com marcador stale durante falha transitória; vazio usa fallback; token inválido/revogado limpa valor em 401/403. |
| Critique 2 | APPROVED, 4,6/5 | Revisão pelo protocolo de QA; nenhum revisor independente foi alegado. Confiança CEF nativo/desempenho seguem como gates explícitos de aceite da implementação. |
| Refinamento UX | Concluído | Pesquisa documental da `$aiox-ux-design-expert`, arquitetura da informação, fluxos, estados, proposta de estilo, orientação de acessibilidade e wireframe estão em `ux-refinement.md` e no par em inglês. Nenhuma sessão de usabilidade é alegada. |
| Plan | Revisado | `spec/plan.json` e `plan/implementation.yaml` têm 24 tarefas alinhadas; FND-5/FND-6 foram concluídas (PR #16/#22). |

## Mapa de prontidão no código atual

Verificado por inspeção de código em 2026-10-06 (não é validação runtime nem teste OBS):

| Fonte do widget | Fonte da verdade existente | Restrição de projeção para FND-7 |
|---|---|---|
| Rótulo atual da conta Genshin | `getCurrentAccount()` em `apps/api/src/persistence/queue-repository.mjs`; a conta é persistida/auditada pela FND-5. | Selecionar somente o rótulo seguro da conta. |
| Nome/estado/contagem aguardando da fila | `listQueueProjection()` e consulta de entradas ativas no repositório de filas. | Não expor essa projeção ampla ao OBS: ela inclui vários campos e UID condicional. Criar projeção separada de um widget/campo. |
| Pessoa chamada/nome de exibição | `listEntriesByStatus(queueId, ['called'])`; `listQueueChatEntries()` ordena chamadas por `calledAt` e depois `createdAt`. | Selecionar a chamada pendente mais antiga por `calledAt` e `createdAt`. |
| Posição original na espera da pessoa chamada | Auditoria `safeDetail.previousPosition` do evento `entry.transitioned`, gravado nas operações de chamada nas linhas 558/588 do repositório. | Ler o snapshot de auditoria persistido; `entries.position` vira null após chamar. Não usar a ordem do grupo como posição original. |
| Pessoa em atendimento/nome de exibição | `listEntriesByStatus(queueId, ['in_progress'])` e projeção de chat da fila. | Selecionar uma entrada de forma determinística por início do atendimento e criação; manter saída de um campo. |
| Texto fixo do widget | Nova configuração de widget FND-7. | Renderizar como texto inerte; aplicar limite comum de 240 pontos de código. |

Os comportamentos de conta/chamada da FND-5 e os fundamentos protegidos do painel FND-6 estão na base mergeada. `registerLocalSession` em `apps/api/src/http/local-session.mjs` verifica Host/Origin loopback exatos, sessão e CSRF em mutações; `apps/api/src/server.mjs` registra essa proteção antes das rotas da API. A prontidão 0.1 está concluída; a FND-7 usa projeções específicas de um campo e a camada existente de sessão/CSRF.

## Decisões de escopo aceitas

- Nova extensão pós-MVP; FND-0 permanece como registro fiel do MVP original.
- OBS e app precisam rodar na mesma máquina. Não há acesso LAN/remoto.
- Uma URL por widget; dados operacionais completos da proposta e texto fixo.
- Cada widget oferece estilo completo via controles seguros, não CSS arbitrário.
- Atualização em até 2 segundos; fallback quando o campo está vazio; último dado marcado stale durante erro transitório; limpar dado ao rejeitar capability.
- Link tem segredo exclusivo e revogável; URL deve ser tratada como senha.
- Texto fixo/fallback limitado a 240 pontos de código Unicode, com contagem idêntica no cliente e servidor.
- Page Permissions do OBS Browser Source deve ser None; o overlay não usa bindings nem APIs de controle do OBS.
- O CEF nativo precisa carregar HTTPS local com a CA confiável do app. Nunca usar HTTP ou ignorar validação TLS; verificar cada versão SO/OBS declarada como suportada.
- A meta de dois segundos vale para oito páginas ativas/habilitadas. Uma fonte descarregada busca o estado atual quando voltar.
- A posição da pessoa chamada vem do snapshot auditável `previousPosition`, pois a entrada ativa deixa de manter a `position` da espera.
- Nome/estado/quantidade aguardando da fila exigem `queue_id`; rótulo da conta e pessoa chamada/em atendimento mais antiga globalmente são fontes do canal. Texto fixo não tem fila.

## Limitações e evidências finais

A suíte real em PostgreSQL isolado cobre migrations, formato/unicidade do hash da capability, escopo das fontes, persistência após reinício, projeções e serialização entre leitura/exclusão. Um teste adicional confirma diretamente que uma fila em `delete_pending` é projetada como fechada. Testes do renderer cobrem fallback, indisponibilidade, stale/recuperação e limpeza ao rejeitar capability inválida/revogada. As correções de regressão foram test-first: estado de fila pendente era projetado como aberto; HTTP 403 mantinha conteúdo stale; e polling ocorria a cada dois segundos. Os Reds focados observaram as falhas; o Green limitou a projeção a estados remotos confirmados, limpou em 401/403/404 e mudou o polling para um segundo. Testes afetados passaram.

Evidência OBS nativa: Ubuntu 24.04; OBS Studio 32.2.2 (Flathub); Browser Source `obs-browser` 2.26.9 / CEF 127.0.6533.120. Inicialmente o CEF rejeitou a CA com `net::ERR_CERT_AUTHORITY_INVALID`; após importá-la no perfil NSS temporário de teste, carregou com TLS 1.3, estado seguro e HTTP 200. Não houve bypass de certificado nem fallback HTTP. A leitura de volta do OBS confirmou `webpage_control_level=0` (Page Permissions=None). O E2E nativo autenticado final rodou com `APP_ORIGIN=https://localhost:3437`, Compose isolado `queuebot-fnd7`, `OBS_VERSION=32.2.2` e `CEF_VERSION=127.0.6533.120`: oito fontes ativas simultâneas completaram dez rodadas (80 atualizações commit→DOM), com pico de 905 ms. Também verificou parada/reinício do bot, retenção e recuperação do valor stale, descarregamento/recarga da Browser Source buscando o valor atual e limpeza da capability antiga após rotação, com a nova renderizando. Foi executado por `npm run test:e2e:overlay`. Os resultados valem somente para esta combinação Ubuntu/OBS/CEF; não se declara validação OBS no Windows ou macOS.

O operador confiou no certificado local atual no Chrome e relatou diretamente que a criação de widgets funciona. A aceitação manual no Chrome também cobriu edição, cópia única, regeneração/revogação confirmadas, exclusão e seleção de fonte de fila com fixture descartável local no PostgreSQL. Fixture e widgets foram removidos depois. Não foram usados credenciais nem sincronização Twitch; nenhuma operação Twitch ao vivo é alegada. A autenticação WebSocket temporária do OBS e a confiança CA de teste foram restauradas após a validação; OBS continua instalado. O Compose isolado permanece ativo para o operador, com banco e bot saudáveis e sem widgets de teste.

A instalação do certificado nos READMEs usa caminho absoluto entre aspas (`"$PWD/.local/localhost-ca.crt"`) em comandos shell Linux/macOS e `Resolve-Path` no PowerShell, incluindo projetos em pastas com espaços. O `install -D` Linux foi executado para um destino temporário com espaços e comparado byte a byte com a CA de origem. O comando privilegiado com `sudo` não pôde ser executado nesta sessão porque não havia prompt interativo de senha; o operador relatou separadamente que executou com sucesso o comando exato com caminho absoluto. Os comandos de importação nativos do Windows/macOS não foram executados aqui e continuam marcados como não validados.

Gates de engenharia passaram em 2026-10-06: `npm run lint`, `npm run typecheck`, `npm test` (472 testes / 69 arquivos), `npm run review:static` (0 achados / 56 arquivos JavaScript da aplicação), `npm run validate:version` (`v0.5.0-0000000-alpha`), validação do schema Prisma com URL local sintética, validação da configuração Compose isolada, `npm audit --omit=dev --audit-level=low` (0 vulnerabilidades) e `git diff --check`. `npx vitest run tests/unit/fnd7-documentation-contract.test.js` passou (5 testes); a operação `install` equivalente também passou no teste temporário com caminho contendo espaços. Nenhuma conta Twitch autorizada foi usada; não se alegam escritas ou comportamento ao vivo na Twitch.

O QA independente AIOX PASS 9,2/10 está registrado na story. FND-7 está Done; comportamento Twitch ao vivo e compatibilidade de certificado/OBS no Windows/macOS seguem sem validação.

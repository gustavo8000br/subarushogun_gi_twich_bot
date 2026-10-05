# Especificação do produto: Bot local de filas da Twitch para Genshin Impact

[English](../../../../stories/FND-0/spec/spec.md)

> **Story ID:** FND-0  
> **Complexidade:** COMPLEX (25/25)  
> **Gerada:** 2026-10-02  
> **Status:** Rascunho para crítica AIOX  
> **Fonte:** Prompt 1 completo do usuário e esclarecimento sobre estrutura de pastas

## 1. Visão geral

Construir uma aplicação local-first para um único canal Twitch, com várias filas de atendimento de Genshin Impact. A entrada ocorre somente por resgate de recompensa de pontos criada pelo app ou adição manual autorizada pelo streamer/moderador. A Twitch é a autoridade para pontos; o PostgreSQL local é a autoridade para ordem, ciclo de atendimento, intenção financeira e histórico.

### Objetivos

- Instalar e operar com Docker Compose v2, sem Node.js ou PostgreSQL no host.
- Preservar operações de fila e intenções de pontos após reinício do processo, rede ou computador.
- Integrar OAuth, recompensas, chat e EventSub da Twitch, com painel local.
- Manter o produto em português brasileiro e documentação canônica em inglês com versão equivalente em português.
- Desenvolver cada incremento com testes primeiro e evidências auditáveis.

### Fora de escopo

Serviço/backend hospedado, banco remoto, telemetria, domínio público obrigatório, Discord/DMs, segunda conta de bot, IRC, comando de entrada para viewer, cadastro público, cadastro de UID, overlay/OBS, ranking, funcionalidade de backup/exportação, multi-canal, múltiplas identidades de bot e escalabilidade horizontal.

## 2. Resumo dos requisitos

Os requisitos estruturados completos estão em [requirements.json](requirements.json); complexidade e fontes verificadas estão em [complexity.json](complexity.json) e [research.json](research.json).

### Requisitos funcionais

| ID | Requisito | Prioridade |
| --- | --- | --- |
| FR-1 | Primeiro uso via Compose, bootstrap de segredo, PostgreSQL local, migrations, saúde e ciclo de operação seguro. | P0 |
| FR-2 | Validação das credenciais Twitch, OAuth vinculado à sessão, validação/renovação de token, elegibilidade e reconexão. | P0 |
| FR-3 | Gerenciar somente recompensas próprias, com arquivamento/exclusão seguros e estado remoto desejado separado do confirmado. | P0 |
| FR-4 | Persistir configurações/chaves de fila, limites nativos da Twitch, privacidade e identidade imutável do histórico. | P0 |
| FR-5 | Entrada apenas por resgate ou ação manual, identidade por ID Twitch, unicidade de entrada ativa e UID estrito. | P0 |
| FR-6 | Um serviço de transições com estado local, fotografia da política, auditoria, ordem/conta e intenção outbox atômicos. | P0 |
| FR-7 | Outbox financeira durável, com lease, retry, reconciliação remota, conflito e resultado desconhecido visível. | P0 |
| FR-8 | EventSub WebSocket, chat Helix, deduplicação e reconciliação na inicialização, reconexão, rotina e solicitação do operador. | P0 |
| FR-9 | Parser puro em português e autorização por canal/ator confiáveis, cooldown, deduplicação, limites e resultado de envio seguro. | P0 |
| FR-10 | Operações de fila, chamada, atendimento, limpeza, abrir/fechar, conta e timeout conforme as políticas. | P0 |
| FR-11 | UI estática vanilla e API local Fastify, protegida por sessão e com projeções explícitas. | P1 |
| FR-12 | Persistir rótulo de conta, origem, proprietário, troca automática em chamada individual e regras de retorno. | P1 |
| FR-13 | Separar identidade do produto, versão do contrato da API e revisão do estado; validar/materializar SHA exato. | P1 |
| FR-14 | Manter documentos/changelogs canônicos em inglês e equivalentes ligados em português. | P1 |

Os critérios Given/When/Then AC-1 a AC-20 estão em `requirements.json` e são obrigatórios para as stories abaixo.

### Requisitos não funcionais

- **Segurança:** não vazar segredo/token/código/senha/connection string; controles locais de Host/Origin/sessão/CSRF; persistência allowlist para texto Twitch não confiável; bot sem root; mounts de segredo com privilégio mínimo.
- **Confiabilidade:** estado e outbox duráveis; resultados de pontos confirmados pela Twitch; sem promessa de exactly-once de rede; recuperação segura de reinício e falha parcial.
- **Concorrência:** restrições PostgreSQL e transações curtas serializam ordem da mesma fila e mudanças globais de conta atual; uma instância do bot.
- **Usabilidade:** chat e painel em pt-BR, respostas de até 500 caracteres, erros acionáveis, instalação com Docker Compose v2 e navegador.
- **Manutenibilidade:** JavaScript ESM/JSDoc, Fastify, assets vanilla, dependências fixadas e lockfile, Prisma/PostgreSQL, Vitest, sem TypeScript de aplicação/transpiler/bundler.
- **Documentação:** inglês principal com equivalente em pt-BR e evidência TDD verdadeira a cada incremento.

## 3. Abordagem técnica

### Arquitetura

Usar um monólito com diretórios explícitos:

```text
apps/
  api/       API Fastify, serviços de domínio, persistência, adaptadores Twitch e workers
  web/       HTML, CSS e JavaScript vanilla servido por @fastify/static
  infra/     Bootstrap e scripts operacionais locais usados pelo Compose
Dockerfile
compose.yaml
iniciar.bat
iniciar.sh
```

Outros diretórios `apps/*` podem ser adicionados somente quando necessários. O `.env.example` do framework não é configuração do produto. Dockerfile/Compose raiz ficam onde os requisitos do produto os especificam. Schema e migrations Prisma vivem junto de `apps/api` e são versionados.

Uma implantação Compose contém quatro responsabilidades: `bootstrap` idempotente de execução única, PostgreSQL `db`, `migrate` de execução única e `bot` sem root. Persistir os dados PostgreSQL e um volume nomeado de segredos separado. O bootstrap gera a senha uma única vez e a preserva; os demais serviços recebem mounts somente leitura para o mesmo arquivo. `db` não publica porta no host. O bot monta a connection string com encoding correto a partir do segredo antes de carregar Prisma, sem imprimir a string. Compose aguarda saúde de `db` e sucesso das migrations antes do bot. A aplicação escuta em `0.0.0.0` no contêiner e o host publica `127.0.0.1:${APP_PORT:-3000}:3000`.

O painel local e o callback Twitch usam `https://localhost:${APP_PORT:-3000}` e `/callback`. O bootstrap cria uma autoridade certificadora local persistente e um certificado de servidor localhost no volume de segredos; somente o certificado público da autoridade é exportado em `.local/`, ignorado pelo Git, para o operador confiar no repositório de certificados do usuário atual. O bot monta a chave TLS somente para leitura e inicia o Fastify com HTTPS. Não precisa de hostname público, proxy, acesso LAN nem alteração automática do repositório de confiança do host. O cookie de sessão é `HttpOnly`, `SameSite=Lax` e `Secure`; mutações aceitam somente a origem HTTPS local exata. O console Twitch recusou o callback HTTP durante a configuração, embora exemplos atuais da documentação pública ainda mostrem localhost HTTP; o comportamento observado do console é o contrato do produto.

A estrutura de apps solicitada não usa compilação do frontend. `apps/api` contém domínio, parser, persistência, outbox, OAuth, adaptadores Helix/EventSub, rotas Fastify e workers. `apps/web` contém os fontes estáticos. `apps/infra` contém bootstrap, inicialização, espera e abertura do navegador. As transações SQL permanecem curtas; chamadas Twitch acontecem fora delas.

### Stack e versões

| Componente | Versão planejada | Evidência e motivo |
| --- | --- | --- |
| Runtime/contêiner | Node 24.20.0 LTS, `node:24.20.0-bookworm-slim` | Status LTS e imagem oficial Docker conferidos em 2026-10-02. |
| Banco/contêiner | PostgreSQL 18.6, `postgres:18.6-bookworm` | Minor suportada atual segundo a página de versões PostgreSQL consultada em 2026-10-02. |
| Prisma | `prisma`, `@prisma/client`, `@prisma/adapter-pg` 6.19.3; `pg` 8.23.1 | Docs v6 oficiais aceitam config `.mjs` e `prisma-client-js`; o gerador v7 `prisma-client` produz TypeScript. |
| SDK Twitch | `@twurple/auth`, `@twurple/api`, `@twurple/eventsub-ws` 8.2.0 | Metadados npm mostram versões peer alinhadas em 8.2.0; referências oficiais atuais consultadas. |
| HTTP/static/testes | Fastify 5.12.5, `@fastify/static` 10.1.5, Vitest 5.0.3 | Metadados atuais consultados em 2026-10-02; fixar e travar versões exatas. |

Usar workspace npm e lockfile na raiz para a imagem executar `npm ci`; dependências/scripts específicos ficam nos pacotes `apps/*`. `prisma.config.mjs` é compatível com Prisma v6.19.3. O gerador selecionado é `prisma-client-js`, aceitando explicitamente a depreciação no Prisma 7 para cumprir a regra JavaScript-only. Não gerar client TypeScript nem adicionar build frontend.

### Domínio e persistência

Modelar filas, chaves de fila, entradas, resgates, operações outbox, logs de auditoria, configurações da instalação, credenciais OAuth privadas e operações processadas. IDs Twitch e UID são strings; IDs locais são UUIDs; timestamps são UTC. Não salvar payload bruto de chat/resgate.

Usar índice SQL único parcial para limitar uma entrada ativa por `(queue_id, twitch_user_id)` quando o status for `waiting`, `called` ou `in_progress`. Adicionar unicidade no banco para ID de resgate, namespace global de chaves, idempotência da outbox e operações processadas. Integridade fonte manual/resgate deve ser expressa em checks/relacionamentos SQL. Serializar mutações por fila com lock transacional e atualizações globais de conta no PostgreSQL; executar uma instância do bot.

Toda mudança de status passa por um único serviço de domínio usado por chat, painel, timer, EventSub e reconciliação. Esse serviço grava estado, ordem/conta, auditoria, fotografia da política e intenção financeira na mesma transação. A outbox executa após o commit. Garantias de persistência usam PostgreSQL e migrations Prisma reais, nunca SQLite ou mock do Prisma.

### Operações e escopos Twitch

| Operação | Endpoint/evento | Escopo de usuário |
| --- | --- | --- |
| Provar credenciais do app | `POST https://id.twitch.tv/oauth2/token`, `grant_type=client_credentials` | Client ID/Secret; sem escopo de usuário |
| Conectar/renovar streamer | OAuth authorize/token e `/oauth2/validate` | `channel:manage:redemptions user:read:chat user:write:chat` |
| Criar/consultar/editar/excluir recompensa própria | Helix `/channel_points/custom_rewards` | `channel:manage:redemptions` (GET também aceita read) |
| Consultar resgates paginados/estado | Helix `/channel_points/custom_rewards/redemptions` | `channel:manage:redemptions` (GET também aceita read) |
| Cancelar/concluir resgate | PATCH do estado para `CANCELED` ou `FULFILLED` | `channel:manage:redemptions` |
| Receber resgate novo/alterado | EventSub `channel.channel_points_custom_reward_redemption.add` / `.update` | `channel:manage:redemptions` ou `channel:read:redemptions` |
| Receber chat | EventSub `channel.chat.message` por WebSocket | `user:read:chat` |
| Enviar chat | Helix `POST /chat/messages`, token do broadcaster | `user:write:chat` |

Os escopos OAuth listados são o mínimo esperado por esta arquitetura; não adicionar outros sem requisito de endpoint documentado. Normalizar campos/status EventSub e Helix dentro do adaptador Twitch. Conferir nomes de métodos do SDK, formato de retorno, erros e subscriptions suportadas com os pacotes fixados antes de codificar.

A documentação Twitch consultada em 2026-10-02 informa: título de recompensa com máximo 45 caracteres; prompt máximo 200; até 50 recompensas habilitadas mais desabilitadas; somente o app criador pode geri-la; recompensa exige Afiliado/Parceiro; `should_redemptions_skip_request_queue=false` mantém `UNFULFILLED`; excluir recompensa com resgates pendentes marca esses resgates `FULFILLED`. A API de chat aceita até 500 caracteres e retorna se a mensagem foi enviada. Essas semânticas governam criação, cancelamento, exclusão e confirmação do chat.

OAuth usa state aleatório, de uso único, validade curta e vínculo à sessão local que iniciou. Salvar credenciais novas do app somente após sucesso do Client Credentials. Persistir atomicamente renovações do `RefreshingAuthProvider`. Validar no início e ao menos uma vez por hora. Client ID/broadcaster ficam fixos quando já houver dados/recompensas; é possível trocar Secret no mesmo app. A UI nunca retorna nenhum trecho de um Secret salvo.

### Finanças e recuperação

`CANCELED` significa pedido de reembolso; informar reembolso somente após a Twitch confirmar `CANCELED`. `FULFILLED` significa pedido de consumo; informar consumo somente após confirmação. Commit no banco e chamada Twitch não formam uma transação e não oferecem exactly-once de rede.

Para transição terminal: validar/bloquear na transação, atualizar entrada e ordem/conta, registrar auditoria e decisão imutável da política, inserir intenção outbox única e confirmar o commit. O worker chama Twitch fora da transação e registra confirmação/retry/conflito/desconhecido. Usar leases duráveis, backoff exponencial limitado com jitter, dados `Retry-After`/rate-limit para 429, revalidação coordenada para 401 e consulta do estado remoto após perda de resposta. 404 não comprova cancelamento. Conflitos continuam visíveis; histórico financeiro não é apagado.

Exclusão é uma saga durável: marcar `deleting` e bloquear novas ações; pausar recompensa e confirmar; enumerar todas as páginas de resgates `UNFULFILLED`, inclusive rejeitados/não importados; solicitar cancelamento e aguardar confirmação remota de cada um; consultar novamente e confirmar ausência de pendências; somente então excluir recompensa e marcar fila excluída. Falha/desconhecido deixa retomada possível. Histórico antigo permanece vinculado ao ID imutável da fila.

Na inicialização/reconexão/reconciliação manual ou periódica, estabelecer observação, verificar propriedade/configuração crítica das recompensas, paginar todos os `UNFULFILLED`, importar eventos válidos ausentes na ordem de resgate/ID, verificar por ID resgates ativos ausentes, aplicar status terminal externo confirmado pelo serviço sem nova mutação, e restaurar outbox/timers somente após reconciliação aplicável. Página parcial/falha nunca prova ausência. Preservar movimentos manuais persistidos.

### Privacidade, comandos e superfícies de operação

Modo UID oculto não solicita nem aceita UID, limpa valores existentes quando ativado e não retém argumentos manuais. Modo visível exige prompt de recompensa que explique a exposição pública. UID manual é opcional, mas validado em formato estrito. Renderizar notificações pendentes conforme a visibilidade atual no momento do envio para evitar vazamento de texto antigo.

O parser puro aceita slug/aliases da fila primeiro, caixa/espaços e variantes com acento, mas nunca usa display name como login. `posicao`/`sair` de viewer usam a identidade da mensagem Twitch. Gestão usa broadcaster ID/badges mod da mensagem atual e do mesmo canal; gestão por VIP é desligada por padrão. Mensagens mutáveis do chat deduplicam por ID. Respostas são centralizadas em pt-BR, têm no máximo 500 caracteres e falha ao enviar não desfaz estado confirmado no domínio.

Chamadas movem até 10 entradas aguardando para `called` atomicamente. Iniciar atendimento move de `called` para `in_progress` e encerra ausência. Timer começa somente após primeira notificação confirmada; reinício/reconciliação retoma prazo persistido com carência de recuperação de 60 segundos. Limpeza exige confirmação revisável por 15 segundos ligada ao ator/canal/fila/versão do conjunto ativo e inclui todos os ativos. Troca automática de conta só ocorre em `proximo` individual; somente a entrada proprietária pode retorná-la ao padrão.

O painel local expõe operações especificadas de instalação/reconexão, filas, entradas, conta, finanças e reconciliação. Sessão local protege projeções seguras explícitas. `GET /api/state` separa `product_version`, `api_contract_version`, revisão e timestamp; inclui UID somente conforme visibilidade atual. Rotas de mutação usam schemas explícitos, sessão, CSRF, idempotência e controle otimista de versão quando aplicável. Allowlist de Host/Origin é exata; callback OAuth recebe exceção limitada de Origin e valida Host/sessão/state; cookie seguro permite retorno OAuth por GET (`SameSite=Lax`). Usar `textContent`, sem inserir valores não confiáveis como HTML.

## 4. Dependências e pesquisa oficial

Fontes datadas e metadados de pacotes estão registrados em `research.json`. Referências primárias:

- [Registro de app Twitch](https://dev.twitch.tv/docs/authentication/register-app/) — e-mail verificado, 2FA, callback registrado e proteção do Secret.
- [Fluxos OAuth Twitch](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/) e [validação do token](https://dev.twitch.tv/docs/authentication/validate-tokens/) — Client Credentials, Authorization Code e validação do token de usuário.
- [Referência Helix Twitch](https://dev.twitch.tv/docs/api/reference/) — endpoints de recompensa/resgate, semântica de pontos, elegibilidade/limites e resultado de Send Chat Message.
- [Tipos de assinatura EventSub](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/) e [WebSocket](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/) — eventos, escopos, transporte e reconexão.
- [Envio/recebimento de chat](https://dev.twitch.tv/docs/chat/send-receive-messages/) — EventSub e Helix, sem IRC.
- [RefreshingAuthProvider Twurple](https://twurple.js.org/reference/auth/classes/RefreshingAuthProvider.html), [EventSubWsListener](https://twurple.js.org/reference/eventsub-ws/classes/EventSubWsListener.html), [HelixChatApi](https://twurple.js.org/reference/api/classes/HelixChatApi.html) — superfície do SDK fixado.
- [Geradores Prisma v6](https://www.prisma.io/docs/orm/v6/prisma-schema/overview/generators), [config Prisma v6](https://www.prisma.io/docs/orm/v6/reference/prisma-config-reference), [adapter PostgreSQL](https://www.prisma.io/docs/orm/v6/overview/databases/postgresql) — `prisma-client-js`, `.mjs`, `@prisma/adapter-pg`.
- [Índices parciais PostgreSQL](https://www.postgresql.org/docs/current/indexes-partial.html) e [versões suportadas](https://www.postgresql.org/support/versioning/) — unicidade ativa e escolha da versão.
- [Ordem Compose](https://docs.docker.com/compose/how-tos/startup-order/) e [secrets Compose](https://docs.docker.com/reference/compose-file/secrets/) — condições de saúde/conclusão e restrições de mount local.
- [Releases Node.js](https://nodejs.org/en/about/previous-releases/) e [tags oficiais da imagem Node](https://hub.docker.com/_/node/tags) — imagem LTS suportada.

## 5. Arquivos a criar

| Área | Caminhos planejados | Finalidade |
| --- | --- | --- |
| Raiz/runtime | `package.json`, `package-lock.json`, `Dockerfile`, `compose.yaml`, `.dockerignore`, `.gitignore`, `.release-stage`, `VERSION` | Workspace, lockfile, entrada runtime/build e fontes da versão. |
| API | `apps/api/package.json`, `apps/api/prisma/schema.prisma`, `apps/api/prisma.config.mjs`, `apps/api/prisma/migrations/*`, `apps/api/src/*` | Banco, domínio, adaptadores, rotas, worker e ciclo seguro. |
| Web | `apps/web/public/index.html`, `apps/web/public/*` | Interface estática vanilla. |
| Infraestrutura | `apps/infra/*`, `iniciar.bat`, `iniciar.sh` na raiz | Bootstrap persistente, espera e abertura do navegador. |
| Testes | `tests/unit/*`, `tests/integration/*`, `compose.test.yaml` | Regras puras e integração PostgreSQL/migrations real e isolada. |
| Docs | READMEs, stories, integrações, versionamento e changelogs em dois idiomas | Instalação, uso, decisões, política, progresso e evidências. |

Caminhos exatos serão refinados nos workflows Greenfield/implementação. Nenhum código de aplicação será criado durante esta fase da spec.

## 6. Estratégia de testes

Escrever testes antes de cada comportamento e registrar evidência real Red → Green → Refactor nos dois arquivos de stories.

| Grupo | Cobertura necessária |
| --- | --- |
| Unitário/domínio | Transições/políticas, UID ASCII/trim/modo oculto, gramática do parser, templates seguros, limite de resposta, propriedade da conta e relógio controlável. |
| API/segurança | Host/Origin/CSRF/sessão, OAuth state/callback, segredo, HTML, badges/canal, schema/idempotência/versão, projeções e UID. |
| Contrato Twitch | Fakes em tokens/recompensas/resgates/EventSub/chat; normalização SDK, chat descartado, rate limit, retry, estado remoto oposto/desconhecido. Sem credenciais. |
| Integração PostgreSQL | PostgreSQL real isolado e migrations reais; índices únicos; integridade source/fonte; dedupe; corrida de operações; atomicidade/lease outbox; lock conta; exclusão/retomada. Sem SQLite/mock Prisma como prova. |
| Recuperação/aceite | Crash antes da API, resposta perdida após sucesso, update antes de add, paginação parcial, resgate rejeitado, UID antigo, timer após restart/concorrência, exclusão retida até todas as confirmações. |
| Runtime/Compose | Config e build Compose, idempotência/permissão do bootstrap, ordem por saúde/conclusão, health local, sem porta de banco, bot sem root, primeira inicialização e reinício persistente. |
| Versão | Marcador/fontes consistentes, SHA de sete caracteres, ausência de Git versus erro ao localizar Git, materialização do commit de origem, sem reescrita em validação comum, separação de versão runtime/API/estado. |

Gates do projeto: `npm run lint`, `npm run typecheck`, `npm test`, mais PostgreSQL integration, migrations, build/health Compose e política de versão. Não foram executados nesta fase de especificação.

## 7. Riscos e mitigações

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Commit local e efeito Twitch não são atômicos. | Alegação incorreta de reembolso/consumo ou perda de operação. | Outbox durável, intenção local idempotente, consultar remoto após resultado incerto, expor pendência/conflito/desconhecido. |
| Excluir recompensa conclui resgates pendentes na Twitch. | Pontos podem ser consumidos em vez de devolvidos. | Enumerar e confirmar todos os cancelamentos antes de DELETE; teste garante ausência de DELETE se qualquer item não estiver confirmado. |
| Gerador Prisma 7 produz TypeScript. | Violação da regra JavaScript-only. | Fixar Prisma 6.19.3 e `prisma-client-js`; gerar na imagem e validar sem compilação. |
| EventSub não reproduz histórico e paginação não é snapshot. | Resgates perdidos, duplicados ou fora de ordem. | IDs duráveis/dedupe, observação mais reconciliação paginada, checagem por ID, transações curtas, nenhuma inferência destrutiva pela ausência. |
| Segredos Compose locais variam entre hosts. | Falha no primeiro uso ou permissão de senha incorreta. | Volume nomeado e bootstrap único; testar Compose v2 nos hosts suportados; mounts somente leitura e registrar evidências de plataforma. |
| Shared Chat pode propagar mensagens com token broadcaster. | Visibilidade pode ultrapassar o canal de origem. | Não prometer isolamento; documentar comportamento Twitch e verificar resultado da API. |
| UID antigo vaza após mudança de privacidade. | Exposição acima da política vigente. | Limpar UID persistido ao ocultar; renderizar no envio segundo configuração atual; testar todas projeções. |

## 8. Questões abertas

Nenhuma decisão de produto/arquitetura bloqueia implementação. Validação ao vivo Twitch requer credenciais fornecidas deliberadamente pelo streamer; sem elas, reportar integração real pendente, não validada. Comportamento do segredo Compose precisa ser testado antes de alegar paridade Windows/macOS/Linux.

## 9. Checklist de implementação

- [ ] Crítica Spec Pipeline e plano de implementação AIOX concluídos.
- [ ] Workflows Greenfield full-stack, service e UI concluídos após material de spec suficiente.
- [ ] Story Development Cycle cria/valida cada story antes da implementação.
- [ ] Para cada comportamento: Red observado primeiro; Green implementado; Refactor e testes afetados passando; evidência bilíngue escrita.
- [ ] Integração PostgreSQL usa banco isolado e migrations reais.
- [ ] Docs e changelogs afetados equivalentes em inglês e pt-BR.
- [ ] Compose e cenários de primeira execução/reinício verificados.
- [ ] Nenhuma release, tag ou promoção de estágio nesta fundação.

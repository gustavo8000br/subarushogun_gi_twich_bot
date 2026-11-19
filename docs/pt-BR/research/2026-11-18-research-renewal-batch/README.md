# Lote de renovação do índice de pesquisa (delta desde a data de cada nota) - 2026-11-18

[English](../../../research/2026-11-18-research-renewal-batch/README.md)

- Autoria: `@analyst` (Atlas). Data: 2026-11-18. Fluxo: `docs/pt-BR/process/research-learning-flow.md` (seção 3.3, registro de renovações). Esta nota é o `## Registro de renovações` das linhas **1, 3, 5, 6, 9, 10, 11, 15, 17** do `docs/pt-BR/research-index.md`. As notas antigas não foram reescritas; este registro diz o que mudou desde a data delas.
- Verificado em **2026-11-18**; revisar depois de **2026-12-30** (VOL, 6 semanas) para toda linha abaixo.
- Rótulos: **CONFIRMADO-DOC** (página oficial, Markdown bruto ou notas de versão), **CONFIRMADO-CÓDIGO** (código real ou instalado, arquivo e linha), **RELATADO** (fórum, blog, trecho de busca, leitura resumida), **SUPOSIÇÃO** (inferência minha), **TESTADO-LOCAL** (comando rodado neste repositório, resultado registrado). Correspondência com o índice: VERIFIED = CONFIRMADO-DOC ou CONFIRMADO-CÓDIGO; PARTIAL = RELATADO; UNVERIFIED = SUPOSIÇÃO.
- Conteúdo da internet foi tratado como dado não confiável. Nenhuma página lida trazia texto dirigido a agentes. Nenhuma chamada à Twitch com credenciais do proprietário; nada foi atualizado nem testado ao vivo.
- Downloads brutos (não versionados): `.local/analyst-renewal/` (páginas Markdown da Twitch, changelog do Node, cópia do Wayback, notas do OBS).

## 1. Resumo

| Linha | Tema | Gatilho disparou? | Resultado | Novas datas |
|---|---|---|---|---|
| 1 | Stack de base do FND-0 | **SIM: Node 24.22.1 e 24.22.3 são versões de segurança; o pin é 24.20.0** | REVISAR. Ação do Orion: bump de patch do pin | 2026-11-18 / 2026-12-30 |
| 3 | FND-7 OBS Browser Source | **SIM: o OBS 33.0.0 trocou o CEF 127 por 150; o E2E nativo rodou no OBS 32.2.2 / CEF 127** | REVISAR. Reteste nativo no OBS 33.0.1 pelo `@qa` | 2026-11-18 / 2026-12-30 |
| 5 | FND-9 Channel Points | Sem mudança de API; **dois deltas de documentação** (abaixo) | Renovada, segue REVISAR SE | 2026-11-18 / 2026-12-30 |
| 6 | OPS-3 EventSub `channel.chat.message` | Não | Renovada | 2026-11-18 / 2026-12-30 |
| 9 | OPS-7 envio/recebimento de chat | Não (o último `@twurple/*` segue 8.2.0) | Renovada | 2026-11-18 / 2026-12-30 |
| 10 | OPS-8 OAuth validar/renovar | Não; uma inconsistência de documentação (400 vs 401) que o código já trata | Renovada | 2026-11-18 / 2026-12-30 |
| 11 | OPS-15 realocação de módulos | Não (o Next segue 16.x) | Renovada | 2026-11-18 / 2026-12-30 |
| 15 | OPS-20 elegibilidade de reembolso por inscrito | n/a (era LACUNA) | **LACUNA vira REVISAR SE**: as dúvidas de documentação foram respondidas; o que resta só teste ao vivo (RT-A) fecha | 2026-11-18 / 2026-12-30 |
| 17 | OPS-20 estratégia de testes | Não | Renovada | 2026-11-18 / 2026-12-30 |

As três dispensas (linhas 1, 3, 6) caem para `nenhuma`. Não renovadas: nenhuma. Não verificado de todo: ver a seção 6.

## 2. Ponto de parada

- Feito: todas as linhas abaixo pesquisadas e escritas; índices e lições atualizados depois (ver o relatório final da execução).
- Nada pendente nesta nota. Os itens para outros agentes estão na seção 5.

## 3. Fontes

| # | URL / local | Tipo | Data da leitura | O que prova | Confiança |
|---|---|---|---|---|---|
| S1 | https://dev.twitch.tv/docs/change-log.md (Markdown bruto) | changelog oficial | 2026-11-18 | Só três entradas desde 2026-10-02: 2026-10-01 (tipos de gifted drops no `channel.chat.notification`), 2026-11-04 (aviso de layout, feed RSS), 2026-11-10 (novo estilo de documentação mais correções da referência). Nada sobre OAuth, `channel.chat.message` ou comportamento de Custom Rewards | Alta (CONFIRMADO-DOC) |
| S2 | https://dev.twitch.tv/docs/api/reference/channel-points.md | referência oficial | 2026-11-18 | Endpoints de Custom Rewards, 403 "não é parceiro ou afiliado", propriedade pelo Client-Id, regra do UNFULFILLED | Alta |
| S3 | https://dev.twitch.tv/docs/api/reference/chat.md | referência oficial | 2026-11-18 | Send Chat Message: 500 caracteres, escopos, lista de `drop_reason` e `is_sent`, padrão de `for_source_only` | Alta |
| S4 | https://dev.twitch.tv/docs/eventsub/reference/chat.md | referência oficial | 2026-11-18 | `channel.chat.message` v1, escopo `user:read:chat`, `badges` e `source_badges` | Alta |
| S5 | https://dev.twitch.tv/docs/authentication/validate-tokens.md | oficial | 2026-11-18 | Validar na partida e a cada hora; auditorias | Alta |
| S6 | https://dev.twitch.tv/docs/authentication/refresh-tokens.md e `.../authentication.md` | oficial | 2026-11-18 | Renovar sem consentimento só no Authorization Code; refresh token rotativo; refresh token de cliente público expira em 30 dias; refresh inválido: o texto diz 401, o exemplo JSON mostra 400 | Alta (a própria inconsistência é o achado) |
| S7 | https://dev.twitch.tv/docs/api/reference/subscriptions.md | referência oficial | 2026-11-18 | Get Broadcaster Subscriptions: `user_id` até 100, `first` 1-100 padrão 20, `pagination`/`points`/`total` omitidos com `user_id`, nenhum 403 listado, nenhum campo Prime | Alta |
| S8 | https://web.archive.org/web/20260930214845/https://dev.twitch.tv/docs/api/reference (Wayback) | página oficial arquivada | 2026-11-18 | Antes da migração de 2026-11-10 a página Get Custom Reward Redemption dizia "Canceled and fulfilled redemptions are returned for only a few days after they're canceled or fulfilled" | Alta (é o texto antigo) |
| S9 | registro npm (`npm view`) de `@twurple/api`, `auth`, `eventsub-ws`, `fastify`, `vitest`, `prisma`, `next`, `typescript` | registro | 2026-11-18 | `@twurple/*` mais recente 8.2.0 (publicado em 2026-09-13); fastify 5.12.8; vitest 5.1.1; prisma na linha estável 7.x com 8.0.0-rc.x em andamento; next 16.4.6 | Alta (TESTADO-LOCAL) |
| S10 | https://nodejs.org/dist/index.json e `doc/changelogs/CHANGELOG_V24.md` (nodejs/node, bruto) | dados oficiais de release | 2026-11-18 | v24.20.0 = 2026-08-26; v24.22.1 = 2026-10-20 segurança; v24.22.3 = 2026-11-10 segurança (o CHANGELOG data 2026-10-21 e 2026-11-11); lista de CVEs; cronograma: v24 em manutenção desde 2026-10-20, v26 LTS desde 2026-10-28 | Alta |
| S10b | https://nodejs.org/en/blog/vulnerability/november-2026-security-releases | post oficial de advisory | 2026-11-19 | Pré-condições do `CVE-2026-126051` (exige `SNICallback`/`OCSPRequest`/`newSession`/`resumeSession`/`addContext()`) e do `CVE-2026-123864` (exige `res.flushHeaders()` antes do fim do corpo e depois `res.end()` com um trecho; `node:http` em texto claro não é afetado) | Alta (CONFIRMADO-DOC, só esses dois advisories lidos em detalhe) |
| S11 | https://hub.docker.com/v2/repositories/library/node/tags/ | API do registro | 2026-11-18 | `24.22.3-alpine3.24` existe (atualizada em 2026-11-11); `26.13.1-alpine3.24` existe | Alta |
| S12 | https://github.com/fastify/fastify/security/advisories (+ página GHSA-3qgw-9275-xf8w, `api.github.com/advisories/GHSA-389g-gv7q-r4x8`) | advisories oficiais | 2026-11-18 | GHSA-389g (baixa, >=5.12.2 <5.12.6); GHSA-3qgw (moderada, >=5.8.0 <5.12.8, exige `handlerTimeout` != 0 e rota com streaming) | Alta (página do advisory lida por busca resumida: PARTIAL no texto do GHSA-3qgw; as faixas do GHSA-389g também estão no JSON da API) |
| S13 | `npm audit --json` neste worktree | execução local | 2026-11-18 | 7 achados: fastify (baixa, 5.12.5), eslint/minimatch/fast-uri/undici/vite (ferramental ou transitivo) | Alta (TESTADO-LOCAL) |
| S14 | https://github.com/obsproject/obs-studio/releases (33.0.0, 33.0.1 via `gh api`) | notas de versão oficiais | 2026-11-18 | 33.0.0 (2026-10-23): "Updated CEF from 127/6533 to 150/7871"; 33.0.1 (2026-10-29): correção de corrida em painéis de navegador | Alta |
| S15 | https://obsproject.com/kb/browser-source | KB oficial | 2026-11-18 | Browser Source é baseado em CEF; padrões (CSS transparente, desligar quando invisível, atualizar ao ficar ativo) inalterados | Alta (leitura resumida: PARTIAL quanto à completude) |
| S16 | https://blog.twitch.tv/en/2026/05/13/monetization-for-all/ (por trecho de busca; notas anteriores já citam) | blog | 2026-11-18 | Channel Points abertos a todo streamer monetizado, não só Afiliado/Parceiro | Média (RELATADO aqui; o blog não foi buscado de novo) |
| S17 | https://discuss.dev.twitch.com/t/bug-update-custom-reward-redemption-gives-403/61230 e `.../63689` | fórum | 2026-11-18 | Respondente da comunidade: um client ID só gerencia recompensas que criou; recompensas do painel não podem ser geridas por outro cliente (2024, 2025). Não é funcionário da Twitch, até onde a página mostra | Média-Baixa (RELATADO) |
| S18 | `gh api repos/twitchdev/issues/issues?since=2026-10-02` e `repos/twurple/twurple/issues?since=2026-09-10` | rastreadores de issues | 2026-11-18 | Nenhuma issue nova sobre Channel Points, `channel.chat.message`, Send Chat Message ou OAuth; #1224 (`channel.follow` v2 duplicado) está fora do projeto; Twurple: nada novo | Média (ausência de relatos) |
| S19 | https://github.com/twurple/twurple/releases (busca resumida) | página de releases | 2026-11-18 | Conteúdo de 8.1.0 a 8.2.0 (Device Code Flow, Custom PowerUps, correções); as datas da página não são confiáveis (o npm diz 8.1.0 em 2026-04-01 e 8.2.0 em 2026-09-13) | Baixa para datas, Média para conteúdo |
| S20 | Instalado `node_modules/@twurple/auth/lib/helpers.js:132`, `providers/RefreshingAuthProvider.js:95-108` | código instalado | 2026-11-18 | O Twurple mapeia só HTTP 401 na consulta de token para `InvalidTokenError` | Alta (CONFIRMADO-CÓDIGO) |
| S21 | Repositório: `apps/api/src/twitch/auth-runtime.mjs:23`, `helix-adapter.mjs:202`, `chat-notice-worker.mjs:2`, `apps/api/src/server.mjs:36-38`, `apps/frontend/scripts/start-production.mjs:2`, `compose.yaml:70`, `Dockerfile:1,12`, `docs/stories/FND-7/story.md:81,120` | código e docs do projeto | 2026-11-18 | Como o projeto já reage a cada achado | Alta |
| S22 | https://github.com/vitest-dev/vitest/releases (v5.1.0, v5.1.1) | notas de versão oficiais | 2026-11-18 | Recursos menores (`--last-failed`, fake timers para `node:timers`, `--since-last-run`), nenhuma quebra listada para o 5.x | Alta |
| S23 | https://github.com/prisma/prisma/releases, texto do PR #127, busca sobre o guia de upgrade para o Prisma 7 | notas de versão, Dependabot, índice de docs | 2026-11-18 | Prisma 7.10.1 é estável (2026-10-19); 8.0.0-rc.x em andamento; o 7 exige driver adapter e novo provider de generator (guia lido só em resumos de busca) | Média (RELATADO quanto ao guia) |
| S24 | https://github.com/moby/moby/releases, https://github.com/docker/compose/releases, `docker --version` local | listas de releases | 2026-11-18 | Docker 29.10.0 (2026-11-16) e Compose 5.8.0 (2026-11-17) saíram; a máquina local tem 29.9.3 e 5.7.1 | Alta |
| S25 | PRs do Dependabot #124, #125, #127, #128, #138 (`gh pr view`, só leitura) | metadados de PR | 2026-11-18 | #124 Node 24.20.0 para 26.13.1 (a checagem "Vitest unit, PostgreSQL, and Compose integration" falhou); #125 actions checkout 6.0.3 para 7.0.1, setup-node, upload-artifact 7.0.2, cosign-installer 4.1.3; #127/#128 Prisma 6.19.3 para 7.10.1; #138 fastify 5.12.5 para 5.12.8, vitest 5.0.3 para 5.1.0, eslint, js-yaml, playwright-core | Alta |
| S26 | https://github.com/vercel/next.js/releases (v16.4.5, v16.4.6) | notas de versão oficiais | 2026-11-18 | Ainda a linha 16.x; a v16.4.5 corrige advisories de cache (a linha 37 cobre) | Alta |

## 4. Registro de renovações por linha

### Linha 1: stack de base do FND-0 (Node, Docker, dependências de base)

- **Verificado:** dados de versão e changelog do Node (S10), tags do Docker Hub (S11), advisories do Fastify (S12), `npm audit` (S13), versões no npm (S9), releases do Docker/Compose (S24), PRs do Dependabot (S25), pins do repositório (S21).
- **O que mudou desde 2026-10-02:**
  1. **Gatilho disparou.** O pin é o Node 24.20.0 (`Dockerfile:1,12`, `engines` do `package.json`). Saíram o Node **24.22.1** (segurança, 8 CVEs: guarda de agente http, bytes nulos no dns, normalização de IP no tls, modelo de permissão, brotli) e o **24.22.3** (segurança, 16 CVEs, 7 de severidade High; tratamento de streams/buffers do http2, retomada/SNI do tls, queda de servidor TLS `CVE-2026-126051`, reentrância no parser TLS/HTTP `CVE-2026-123864`) (CONFIRMADO-DOC, S10). A `node:24.22.3-alpine3.24` existe (S11).
  2. **Aplicabilidade ao projeto (CONFIRMADO-CÓDIGO, texto do advisory lido no post oficial, S10b).** A API e o frontend de produção iniciam **servidores TLS** do Node (`server.mjs:36-38`, `start-production.mjs:2`) publicados só em `127.0.0.1` (`compose.yaml:70`). Caminhos de servidor HTTP/2 não são usados (nenhum import de `http2` em `apps/`). Por CVE:
     - `CVE-2026-126051` (queda de servidor TLS): **NÃO APLICÁVEL.** O advisory exige um servidor TLS que use `SNICallback`, `OCSPRequest`, `newSession`, `resumeSession` ou `server.addContext()`; o `grep` em `apps/`, `packages/` e `scripts/` não acha nenhum (os únicos acertos possíveis estariam na saída gerada `.next`, que foi excluída).
     - `CVE-2026-123864` (reentrância do parser HTTPS, High): o advisory exige um handler que chame `res.flushHeaders()` antes de o corpo da requisição terminar e depois `res.end()` com um trecho não vazio. `grep flushHeaders|writeHead` em `apps/` e `packages/` não acha nada no código do projeto. Se internos do Fastify ou do Next chamam isso **não foi conferido** (SUPOSIÇÃO: exposição baixa). Mantido como "possivelmente aplicável".
     - Os demais CVEs de http2 não se aplicam (não há servidor HTTP/2). Os CVEs de renegociação/retomada/SNI do TLS (`CVE-2026-123872`, `123867`, `123877`) não foram mapeados um a um; importam para servidores com certificado de cliente ou contextos SNI, que o projeto não configura, pelo que o grep mostra (SUPOSIÇÃO).
     - As conexões com a Twitch são clientes TLS, cobertas em termos gerais pelas correções de TLS/IP da 24.22.1 (não mapeadas CVE a CVE).
  3. O Node 24 entrou em **manutenção** em 2026-10-20 e o Node 26 (Lithium) virou LTS em 2026-10-28 (S10). O Dependabot #124 propõe a 26.13.1 e a checagem de integração falhou no CI (S25). É só insumo; migrar para o Node 26 é outra decisão.
  4. **Fastify:** o pin 5.12.5 está dentro do GHSA-389g (baixa, corrigida na 5.12.6) e abaixo da 5.12.8 (GHSA-3qgw, moderada). O GHSA-3qgw exige `handlerTimeout`; `grep handlerTimeout apps/api/src` não achou nada, então não se aplica (CONFIRMADO-CÓDIGO). O #138 levaria à 5.12.8.
  5. O `npm audit` tem 7 achados, quase todos de ferramental (eslint, vite, undici, fast-uri); fora do caminho de produção pelo que os nomes das dependências indicam (SUPOSIÇÃO quanto ao caminho completo). O Prisma 6.19.3 é a tag `prev`; o Prisma 7.10.1 é estável (#127/#128 são quebras: driver adapter e generator, RELATADO). O Vitest 5.1.1 saiu (menor). Docker 29.10.0 e Compose 5.8.0 saíram; nada indica quebra para o arquivo Compose do projeto (SUPOSIÇÃO).
- **Impacto para o projeto:** a exposição é **baixa e só local** (bind em loopback, sem HTTP/2, o CVE de queda de TLS não se aplica). O bump de patch para 24.22.3 continua justificado: é um patch da mesma linha LTS, fecha as demais correções de TLS/HTTP que podem tocar a stack e as da 24.22.1 (normalização de IP no tls, dns, modelo de permissão, certificados raiz, OpenSSL 3.5.9), e o pin não deve ficar para trás. Recomendo que o Orion o agende como pacote próprio com o `@qa` (arquivos na seção 5), e leve o Fastify à 5.12.8 e o Vitest na mesma janela planejada de dependências (#138). Não misturar com as decisões de Node 26 ou Prisma 7.
- **Confiança:** Alta para os fatos de Node e Fastify (fontes oficiais); Média para a leitura do audit transitivo. **Não verificado:** se alguma ferramenta do repositório fixa o Node em outro lugar (os workflows de CI não foram relidos).
- **Resultado:** REVISAR (gatilho disparou). Verificado em 2026-11-18; revisar depois de 2026-12-30. A dispensa cai para `nenhuma`.

### Linha 3: FND-7 OBS Browser Source / overlay

- **Verificado:** notas de versão do OBS 33.0.0 e 33.0.1 (S14), KB do Browser Source (S15), o ambiente do E2E registrado pelo projeto (S21).
- **O que mudou:**
  1. **Gatilho disparou.** O OBS **33.0.0** (2026-10-23) "Updated CEF from 127/6533 to 150/7871", "a massive update ... from the July 2024 release to September 2026"; as notas dizem que deveria ser invisível, mas pedem que se reportem problemas em browser sources (CONFIRMADO-DOC). A 33.0.1 (2026-10-29) corrige o tamanho de painéis de navegador e quedas nas integrações Twitch/YouTube. A última versão estável no GitHub é a 33.0.1.
  2. O E2E nativo registrado (story do FND-7) rodou no **OBS Studio 32.2.2 / CEF 127.0.6533.120** em Ubuntu 24.04, com validação de certificado ligada e Page Permissions None (CONFIRMADO-CÓDIGO: `docs/stories/FND-7/story.md:81,120`). O ambiente testado está, portanto, duas versões do OBS atrás.
  3. A KB segue documentando os mesmos padrões (CSS padrão transparente, desligar quando invisível, atualizar ao ficar ativo); baseado em CEF (CONFIRMADO-DOC, leitura resumida).
- **Impacto:** o overlay é uma origem HTTPS em localhost com certificado local; um salto de cerca de 23 majors do Chromium pode mudar o tratamento de certificado, avisos de permissão de rede local, CSS e o comportamento de Server-Sent Events (SUPOSIÇÃO; nenhum relato achado nos dois sentidos). Não é motivo para mudar código; é motivo para **repetir a checagem nativa no OBS 33.0.1** (o E2E autenticado existente mais as checagens do LA-09 de `docs/pt-BR/process/open-acceptance-criteria-2026-11-10.md`). Windows/macOS seguem não verificados como antes.
- **Confiança:** Alta para os fatos de versão; Baixa-Média para o impacto (não testado).
- **Resultado:** REVISAR (gatilho disparou). Verificado em 2026-11-18; revisar depois de 2026-12-30. A dispensa cai para `nenhuma`.

### Linha 5: FND-9 Channel Points / recompensas customizadas

- **Verificado:** changelog (S1), referência de Channel Points (S2), cópia do Wayback de 2026-09-30 (S8), threads de fórum (S17), Monetization for All (S16), rastreadores de issues (S18).
- **O que mudou:**
  1. **Nenhuma mudança funcional** em Custom Rewards. As correções de 2026-11-10: `prompt` deixa de listar limite de 200 caracteres; `cost` lista o máximo de 1.000.000.000; `status` deixa de ser obrigatório em Get Custom Reward Redemption quando `id` é informado (CONFIRMADO-DOC, S1).
  2. **Delta de documentação A (novo):** a frase "Canceled and fulfilled redemptions are returned for only a few days after they're canceled or fulfilled" estava na página em 2026-09-30 (S8) e está **ausente** da página migrada (grep em S2). O changelog não menciona a remoção. Nossas notas se apoiavam nela (`redemption-sync-research.md:36`, `OPS-20/research.md:117`). Trate a retenção como **desconhecida, não como removida**: mantenha a reconciliação tolerante à ausência de um registro CANCELED/FULFILLED (SUPOSIÇÃO sobre a intenção).
  3. **Delta de documentação B (conflito):** a referência ainda diz 403 quando "the broadcaster is not a partner or affiliate" em todo endpoint de Custom Rewards (CONFIRMADO-DOC, S2), enquanto o anúncio da Twitch de 2026-05-13 abriu Channel Points a todo streamer monetizado (RELATADO, S16). O texto da API pode estar só atrasado. O projeto detecta o 403 e o mapeia para `channel_ineligible`, então a falha é segura; se um canal monetizado não afiliado consegue usar a API é item de **teste ao vivo**.
  4. Regra de propriedade inalterada: só o Client ID criador gerencia a recompensa e seus resgates (CONFIRMADO-DOC S2; RELATADO S17 para recompensas do painel).
- **Situação do gatilho:** "a Twitch muda a Custom Rewards API": não disparou (só correções de documentação).
- **Confiança:** Média.
- **Resultado:** renovada, segue REVISAR SE. Verificado em 2026-11-18; revisar depois de 2026-12-30.

### Linha 6: OPS-3 EventSub `channel.chat.message`

- **Verificado:** referência de chat do EventSub (S4), changelog (S1), versões do Twurple (S9), rastreadores de issues (S18).
- **O que mudou:** nada relevante. O `channel.chat.message` segue na versão `1`, exige `user:read:chat` (mais `user:bot`/`channel:bot` no caminho com app token), traz `badges` e `source_badges` opcional (CONFIRMADO-DOC). O tipo de fragmento `gif` entrou em 2026-07-16/17, **antes** da data da nota, e não afeta a lógica de papéis. O `channel.chat.notification` ganhou `gifted_drops_summary` em 2026-10-01 (não usado). O `@twurple/*` segue 8.2.0 (S9). Uma busca por `source_badges` ou problemas de Shared Chat achou uma thread antiga de fórum (mensagens de shared chat não aparecem, RELATADO) e nada novo.
- **Situação do gatilho:** não disparou. **Confiança:** Alta.
- **Resultado:** renovada. Verificado em 2026-11-18; revisar depois de 2026-12-30. A dispensa cai para `nenhuma`.

### Linha 9: OPS-7 envio/recebimento de chat com Twurple

- **Verificado:** referência de Send Chat Message (S3), changelog (S1), versões do Twurple (S9, S19), tratamento no repositório (S21).
- **O que mudou:** as correções de 2026-11-10 listam **todos os códigos de `drop_reason`** (18 códigos, por exemplo `msg_duplicate`, `slow_mode`, `automod_held`) e dizem que `for_source_only` tem padrão true só com app access token. Existe também um parâmetro opcional `pin` (adicionado antes na mesma linha do ano, antes da data da nota, portanto fora do delta). O projeto envia com token de **usuário**, então `for_source_only` não se aplica, e o adaptador já devolve `isSent` e `dropReasonCode` e trata `is_sent != true` como não entregue (CONFIRMADO-CÓDIGO: `helix-adapter.mjs:202`, `chat-notice-worker.mjs:2`). O limite de 500 caracteres e os escopos (`user:write:chat`) não mudaram.
- **Situação do gatilho:** "`@twurple/*` sai da 8.2.0": não disparou (último no npm 8.2.0 em 2026-11-18; a versão 8.2.0 é de 2026-09-13).
- **Confiança:** Alta.
- **Resultado:** renovada. Verificado em 2026-11-18; revisar depois de 2026-12-30.

### Linha 10: OPS-8 validação/renovação de token OAuth

- **Verificado:** páginas de validar, renovar e autenticação (S5, S6), changelog (S1), Twurple instalado (S20), código do projeto (S21).
- **O que mudou:** nada em substância: validar na partida e a cada hora; a Twitch audita o cumprimento; renovar sem consentimento só no fluxo Authorization Code; refresh tokens podem rotacionar e devem ser guardados; teto de 50 access tokens por refresh token em renovações concorrentes (CONFIRMADO-DOC). Duas coisas a registrar:
  1. **Inconsistência de documentação:** o texto diz que refresh token inválido dá HTTP **401**, o exemplo JSON mostra status **400** `Invalid refresh token` (S6). O projeto já trata 400 e 401 de `https://id.twitch.tv/oauth2/token` como falha definitiva de renovação (CONFIRMADO-CÓDIGO: `auth-runtime.mjs:23`). O próprio Twurple mapeia só 401 na consulta de **info** do token para `InvalidTokenError` (S20), então um 400 do endpoint de renovação chega ao projeto como erro HTTP comum, que o projeto trata.
  2. **Nota sobre cliente público:** refresh tokens de um cliente do tipo **Public** expiram em 30 dias; clientes Confidential não (CONFIRMADO-DOC). O projeto usa um app confidencial (texto de requisito do projeto, `docs/stories/OPS-8/spec/requirements.json:44`; não reconferido no console da Twitch); mantenha assim.
- **Situação do gatilho:** docs de autenticação da Twitch inalteradas em comportamento, Twurple auth ainda 8.2.0: não disparou. **Confiança:** Alta.
- **Resultado:** renovada. Verificado em 2026-11-18; revisar depois de 2026-12-30.

### Linha 11: OPS-15 S-03 realocação de módulos, S-12 limpeza

- **Verificado:** releases do Next (S26), versões no npm (S9), Dockerfile (S21).
- **O que mudou:** o Next segue na linha 16.x; o 16.4.6 instalado é o `latest` do npm. As versões 16.4.5/16.4.6 são correções de segurança de recursos de cache que o projeto não usa (a linha 37 cobre). Nada encontrado que toque a raiz do Turbopack, shims de re-export ou a ordem do `COPY` no Docker. As 3 inferências UNVERIFIED da nota seguem sendo itens de teste, inalteradas. Pin do Node: ver a linha 1 (a imagem base do Dockerfile é onde a realocação encontra a stack; um bump de pin não altera o layout).
- **Situação do gatilho:** "o major do Next muda": não disparou. **Confiança:** Média (notas de versão lidas, sem reteste).
- **Resultado:** renovada. Verificado em 2026-11-18; revisar depois de 2026-12-30.

### Linha 15: OPS-20 elegibilidade de reembolso por status de inscrito (era LACUNA)

- **Verificado:** a nova nota da Helix `docs/pt-BR/research/2026-11-18-twitch-helix-group-lookup/README.md` (não repetida aqui), referência de Subscriptions (S7), referência de Channel Points (S2), comparação com o Wayback (S8), fórum (S17), Monetization for All (S16).
- **Respondido pela documentação (agora CONFIRMADO-DOC):**
  - Get Broadcaster Subscriptions: escopo `channel:read:subscriptions`, `broadcaster_id` deve bater com o usuário do token, filtro `user_id` até **100**, `first` 1-100 (padrão 20), `pagination`, `points` e `total` omitidos quando se usa `user_id`, nenhum 403 listado (S7). A nota antiga listava o limite de 100 ids e a redação do escopo como não verificados: fechado.
  - Inscrições de presente trazem `is_gift` e `gifter_*` (strings vazias nos demais casos). Texto novo de 2026-11-10: algumas inscrições (por exemplo de contas apagadas) não entram, então uma página pode ter menos itens que `first` (S7).
  - Update Redemption Status: só UNFULFILLED muda; só o app criador; CANCELED devolve os pontos; FULFILLED não pode ser reembolsado depois (S2, inalterado).
  - Novo consentimento para streamers já conectados: inalterado (escopos são fixados na concessão).
- **Ainda em aberto, e o que fecha cada um (a pesquisa na web não fecha):**
  1. Representação de Prime: o fórum diz tier `1000`, indistinguível (RELATADO); sem campo em S7. Teste ao vivo, passo A7 do RT-A.
  2. Broadcaster na própria lista de inscritos: declaração de funcionário da Twitch em 2020 diz que entra (da nota da Helix, RELATADO); sem doc atual. Manter a regra explícita. RT-A.
  3. Se a Twitch expira ou limita resgates UNFULFILLED na fila: **nenhuma declaração achada, e a frase de retenção "returned for only a few days" sumiu da referência** (linha 5, delta A). Teste ao vivo com um resgate UNFULFILLED antigo.
  4. Resposta de canal não afiliado em Get Broadcaster Subscriptions (400 vs 200 vazio): relatos conflitantes; a referência é silente. Teste ao vivo.
- **Mudança de veredito:** LACUNA para **REVISAR SE**. A parte documental foi respondida e o que sobra são tarefas de teste (`@qa`/`@dev`, roteiro RT-A na nota da Helix), não pesquisa. As regras do proprietário já escolhidas para a OPS-31 (Prime conta como tier 1000; regra explícita para o broadcaster) não dependem de pesquisa web. O Orion pode reverter para LACUNA se o proprietário quiser manter o rótulo até o RT-A rodar.
- **Confiança:** Média (era Baixa). Verificado em 2026-11-18; revisar depois de 2026-12-30.

### Linha 17: OPS-20 estratégia de testes

- **Verificado:** versões do Twurple e limiter instalado (versão inalterada), releases do Vitest (S22), Docker (S24), Dependabot #138 (S25).
- **O que mudou:** o `@twurple/api` segue 8.2.0, então a leitura do código do limiter na nota (reenfileirar no 429, esperar `Ratelimit-Reset`) continua sendo o comportamento instalado (CONFIRMADO-CÓDIGO, reconfirmado pela nota da Helix no mesmo dia). O Vitest foi de 5.0.3 para **5.1.1**: novos `--last-failed`, `--since-last-run`, fake timers para `node:timers`, nenhuma quebra listada (CONFIRMADO-DOC); o #138 propõe a 5.1.0. A abordagem de PostgreSQL descartável não é afetada. O `fast-check` não está no `package.json` da raiz (nenhuma afirmação de versão feita).
- **Situação do gatilho:** "`@twurple/api` sai da 8.2.0": não disparou. **Confiança:** Média.
- **Resultado:** renovada. Verificado em 2026-11-18; revisar depois de 2026-12-30.

## 5. Repasses para outros agentes

- **Orion / `@devops` / `@dev`:** planejar um bump de patch do pin do Node de 24.20.0 para 24.22.3 como pacote próprio. Arquivos que carregam o pin: `Dockerfile` (1 arquivo, 2 linhas `FROM`), `package.json` e `package-lock.json`, `.nvmrc`, os workflows `quality-gates`, `main-cd`, `release`, `browser-only` e `branch-cleanup` (`.github/workflows/`), os docs em en e pt-BR (`AGENTS.md`, `CLAUDE.md`, `docs/INSTALLATION.md`, `docs/DEVELOPMENT.md`, `docs/CONTRIBUTING.md`, `docs/integrations.md` e outros que citam 24.20.0) e a regra do pin em `AGENTS.md`/`CLAUDE.md`, mais os testes de contrato que fixam 24.20.0: `tests/unit/ci-workflow-contract.test.js`, `tests/unit/dev-preflight.test.js`, `tests/unit/windows-native-contract.test.js`, `tests/integration/codespaces-contract.test.js`. Planejar também uma janela Fastify 5.12.8 / Vitest 5.1 (PR #138). Node 26 (#124) e Prisma 7 (#127, #128) são decisões separadas; o #124 falhou na checagem de integração no CI.
- **`@qa`:** (a) reteste nativo do OBS na 33.0.1 / CEF 150 (linha 3); (b) roteiro RT-A A1-A9 da nota da Helix num canal afiliado de teste (linhas 15, 38); (c) se possível, um teste com canal monetizado não afiliado para ver se Custom Rewards funcionam pela API (linha 5, delta B); (d) conferir como a reconciliação se comporta quando um resgate CANCELED/FULFILLED deixa de ser devolvido (linha 5, delta A).
- **Processo:** o changelog da Twitch oferece feed RSS (`https://dev.twitch.tv/docs/rss/change-log.xml`, segundo S1). Lê-lo é a checagem de gatilho mais barata para todas as linhas da Twitch.

## 6. Não encontrado / não verificado

- Janela de suporte ou data de fim de vida do Prisma 6: buscado ("Prisma 6 support policy end of life"), não achado.
- Declaração oficial da Twitch sobre expiração de resgate UNFULFILLED: não achada (linhas 5, 15).
- Se Custom Rewards pela API já funcionam para canais monetizados não afiliados: sem texto oficial da API; só o blog e guias de terceiros.
- Relatos de problemas do OBS 33 / CEF 150 com overlays HTTPS locais: não buscado a fundo; nenhum apareceu nas notas do OBS.
- Página de issues do Twurple no GitHub: ilegível pela busca; a API de issues não mostrou itens recentes.
- O guia de upgrade do Prisma 7 em si: só resumos de busca lidos (afirmações de formato de módulo conflitam entre resumos).
- Detalhe dos CVEs do Node: o post oficial `nodejs.org/en/blog/vulnerability/november-2026-security-releases` (baixado como `.local/analyst-renewal/node-vuln.html`, 21.771 caracteres de texto após remover o HTML) foi lido **só para dois CVEs usados acima**, `CVE-2026-126051` (pré-condições) e `CVE-2026-123864` (pré-condições), e para a lista de severidades. Os demais advisories do post **não** foram lidos em detalhe. Os fatos de release vêm do changelog oficial. Sites secundários que também noticiaram a versão não foram usados.
- Notas de outras linhas (20, 21, 23, 27, 36, 37, 38) não foram renovadas aqui; estão dentro do prazo.

## 7. Gatilhos de revisão deste lote

Renovar as nove linhas até 2026-12-30, antes se: o Node 24.x ou 26.x publicar outra versão de segurança antes do bump do pin; o OBS publicar a 33.1 ou uma atualização de CEF; o changelog da Twitch (RSS) reportar mudança em Custom Rewards, chat do EventSub, Send Chat Message ou OAuth; o `@twurple/*` sair da 8.2.0; o RT-A ou o reteste do OBS contradisser algo acima.

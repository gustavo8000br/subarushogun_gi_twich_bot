# Bugs que entram antes do bump 0.3.0-beta — validação do `@po` (D-8, FT-53, FT-54, TS-18, widget no OBS, D-6) e fechamento dos CA 9 e 15 da OPS-15

[English](../../../stories/OPS-15/po-validation-bugs-pre-bump.md)

**Validador:** `@po` (Pax) — **Data:** 2026-11-05 — **Modo:** YOLO (`[AUTO-DECISION]` marca escolhas autônomas). Nenhuma ação de código, git ou GitHub.
**Decisões do dono (2026-11-05):** os seis itens abaixo entram **antes do bump e do gate único do `@qa`** (mín. 9,0). O teste no OBS desta máquina está autorizado; **sem iniciar transmissão e sem resgate real** (isso exige um "pode transmitir" explícito).
**Fontes lidas:** [story OPS-26](../OPS-26/story.md), [story OPS-25](../OPS-25/story.md), [qa-gate-2026-11-05.md](qa-gate-2026-11-05.md) (L-1, L-2, L-3), [live-battery-2026-10-26-results.md](live-battery-2026-10-26-results.md) (D-6, D-8/LB-23), [issue-body-changes-2026-11-05](../../process/issue-body-changes-2026-11-05.md), [research-index.md](../../research-index.md). Código lido como evidência: `apps/api/src/commands/chat-handler.mjs:397`, `apps/api/src/commands/help.mjs:76-82`, `apps/api/src/health-route.mjs` (`readTwitchHealth`, `getTwitchHealth`), `apps/api/src/twitch/helix-adapter.mjs:80-84`, `apps/api/src/twitch/integration.mjs:68-72,95-135,195-225`, `HelixUserApi.getUserById` do `@twurple/api` instalado, `VERSION`.

## Vereditos

| Item | Onde | Veredito | Nota | Status |
|---|---|---|---|---|
| **D-8** `ping` com a latência real da Twitch (**fatia A da OPS-26**; o comando `status` fica fora deste bump) | OPS-26 / ST-19 (+ TS-13) | **GO** | **9,0/10** | continua Rascunho: ainda sem issue (regra "Ready = GO + issue"); vira Ready quando o `@devops` criar a issue |
| **FT-53** mensagem do 401 após um DELETE possivelmente enviado | acompanhamento da OPS-22, mãe #80 | **GO** | **9,0/10** | Backlog -> **Ready** (a mãe #80 existe; sub-issue na hora pelo `@devops`) |
| **FT-54** textos no singular e "recompensa" no pt-BR | acompanhamento da OPS-22, mãe #80 | **GO** | **9,1/10** | Backlog -> **Ready** (idem) |
| **TS-18** `isOpen` local no PG36-16 | acompanhamento da OPS-22, mãe #80 | **GO** | **9,2/10** | Backlog -> **Ready** (idem) |
| **Widget no OBS desta máquina** | OPS-25 / ST-18 (substitui a OPS-13 / #57) | **GO** para o subconjunto pré-bump | **8,8/10** | continua Rascunho: sem issue; o `@devops` cria |
| **D-6** `/health` `degraded` desde o início da stream | acompanhamento da OPS-22 (item novo, **proposto FT-55**, o `@sm` registra) | **GO** (só diagnóstico; a correção da causa raiz NÃO é prometida) | **8,6/10** | Ready depois que o `@sm` registrar a linha (mãe #80) |

"Ready" significa validado para planejamento; os gates de cada fatia continuam valendo (`@architect`/UX antes do `@dev` onde listado, `@dev` test-first, **um** gate do `@qa` com nota >= 9,0, `@devops` comita).

## Achados que mudam o plano

1. **Causa raiz da D-8 achada lendo o código (evidência estática, ainda a provar pelo teste Red).** `chat-handler.mjs:397` chama `getTwitchHealth()`, que é o `getTwitchHealth()` de `health-route.mjs`: um **retrato passivo** que devolve `null` quando o `/health` não foi consultado nos últimos `probeCacheMs` (60 000 ms) (`if (!cachedProbe) return null; if (now() - cachedAt >= probeCacheMs) return null;`). O chat nunca dispara uma sonda; então, se nada consultou o `/health` há menos de 60 s, o `ping` imprime "latência indisponível". Em 2026-10-27 o dono estava com o `/health` aberto (219 ms), o que explica "o dono viu várias vezes". O CA 4 da OPS-26 (registrar a causa) fica atendido por este achado mais o teste Red.
2. **`ping()` é uma requisição real e única.** `helix-adapter.mjs:80` -> Twurple `api.users.getUserById(broadcasterId)` -> `callApi({type:'helix', url:'users', query:{id}})`; o `HelixUserApi.getUserById` instalado **não** usa o batcher nem cache (o batcher é do `getUserByIdBatched`). O tempo medido é, portanto, a ida e volta real de `GET /helix/users?id=<broadcaster>`, incluindo a fila do cliente Twurple e, se devido, a renovação do token. [VERIFICADO no código instalado; os números de limite de taxa da Twitch não são repetidos aqui, veja a linha 17 da pesquisa.]
3. **`VERSION` hoje é `v0.2.1-0000000-beta`** (segmento de commit dentro). O formato do dono não tem segmento de commit (decisão do `@po` de 2026-10-28, mantida). Depois do bump a string deve ser `v0.3.0-beta`.
4. **Candidatas da D-6 (código, NÃO VERIFICADO ao vivo).** `twitch_integration` é o `status` do `publishStatus`. Ele vira `degraded` de quatro maneiras: reconciliação `partial` ou falha (registrada desde a FT-24 como `twitch_reconciliation_degraded`), `eventsub_disconnected`, `eventsub_startup_disconnected` e assinaturas revogadas (`integration.mjs:204-224`). **As três últimas não deixam linha de log**, o que combina com "degraded sem linha de log". Também plausível: a causa antiga da D-5 (classe de resgate do Helix sem `status`) fazia toda reconciliação ser "partial" e pode já estar corrigida pela FT-24; só uma execução ao vivo prova.
5. **Fatia A da OPS-26.** O dono quer a D-8 antes do bump, não a story inteira. A dependência da ST-01 ("branch integrada na `main`") é suspensa para a fatia A pela decisão do dono de 2026-11-05. O `status`, o CA 5, o CA 6 e a permissão só do streamer ficam no Rascunho, sem mudança, depois do bump.

## Checklist de 10 pontos

| # | Ponto | D-8 | FT-53 | FT-54 | TS-18 | Widget | D-6 |
|---|---|---|---|---|---|---|---|
| 1 | Título | 1,0 | 1,0 | 1,0 | 1,0 | 1,0 | 0,8 |
| 2 | Descrição | 1,0 | 0,9 | 0,9 | 1,0 | 0,9 | 0,8 |
| 3 | CAs testáveis | 0,9 | 0,9 | 0,9 | 1,0 | 0,8 | 0,8 |
| 4 | Escopo DENTRO/FORA | 0,9 | 0,9 | 0,9 | 1,0 | 0,9 | 0,9 |
| 5 | Dependências | 0,9 | 0,9 | 0,9 | 1,0 | 0,8 | 0,9 |
| 6 | Complexidade | 0,8 | 0,8 | 0,9 | 1,0 | 0,9 | 0,9 |
| 7 | Valor de negócio | 0,9 | 0,8 | 0,9 | 0,8 | 0,9 | 0,9 |
| 8 | Riscos | 0,9 | 0,9 | 0,9 | 0,8 | 0,9 | 0,9 |
| 9 | Definição de Pronto | 0,9 | 0,9 | 0,9 | 0,9 | 0,8 | 0,8 |
| 10 | Alinhamento | 0,9 | 0,9 | 0,9 | 0,9 | 0,9 | 0,8 |
| | **Total** | **9,0** | **9,0** | **9,1** | **9,2** | **8,8** | **8,6** |

Deduções: a D-6 não tem evidência ao vivo nem linha no inventário; o widget tem linhas por plataforma e um passo de chat fora da permissão; a FT-53 tem valor P3 (seguro hoje, menos acionável).

## Critérios de aceitação (Dado/Quando/Então; Red primeiro, depois Green)

### D-8 — `ping` (fatia A da OPS-26; cobre os CA 1-4, 7, 8 e 9 da story só para o `ping`; a TS-13 viaja junto)

**Como a latência é medida (decisão, sem número inventado):**
- **O quê:** o tempo de relógio de um `twitch.ping()` do adaptador Helix, isto é, um `GET /helix/users?id=<broadcaster>` pelo Twurple 8.2.0, da chamada até a promessa resolvida. **Não** é a latência do EventSub nem do chat, nem o tempo desde que a mensagem foi enviada no chat.
- **Unidade:** milissegundos inteiros, arredondados (`Math.round`), nunca negativos; impressos como `<n>ms`.
- **Relógio:** um relógio monotônico (`performance.now()`) injetado no módulo de saúde; o padrão atual `Date.now` é trocado na sonda para que um salto do relógio de parede não gere valor negativo ou enorme.
- **Uma só fonte:** o chat lê a **mesma** medição do `/health` (`twitch_api_ping_ms`), por uma função assíncrona de `health-route.mjs` que reaproveita o `readTwitchHealth` (cache `probeCacheMs` e o `pendingProbe` de voo único). O retrato passivo `getTwitchHealth()` deixa de ser usado pelo chat. O TTL do cache e um limite explícito por chat são confirmados pelo `@architect` (CA 3 da story); até lá vale o padrão de 60 000 ms e o teste usa timers falsos.
- **Se falhar:** nenhum valor inventado. A resposta é `Pong 🏓 - <versão> - Twitch indisponível (<CÓDIGO>).` com lista fechada de códigos proposta aqui e confirmada pelo `@architect`/UX: `TWITCH_NOT_CONNECTED` (integração fora de `connected/ineligible/degraded/reconciling`, sem sonda) e `TWITCH_PROBE_FAILED` (a sonda lançou erro ou devolveu algo diferente de `true`). A falha é registrada uma vez com o código, sem dados da pessoa, token, UID ou texto de mensagem.

- **CA-D8-1 (Red primeiro):** Dado que existe uma medição de 219 ms (sonda recente do `/health` ou o cache compartilhado), quando uma pessoa espectadora executa `!fila ping`, então a resposta é exatamente `Pong 🏓 - v0.3.0-beta - 219ms.` (versão sem o segmento de commit, derivada do mesmo arquivo `VERSION` que o `validate:version` lê; sem segunda constante de versão) e nunca contém "indisponível". Red: hoje o chat imprime "latência indisponível" porque `getTwitchHealth()` é `null` quando o `/health` não foi chamado nos últimos 60 s.
- **CA-D8-2 (Red primeiro, TS-13):** Dado que não há medição recente e a integração está `connected`, quando o `ping` roda, então o bot faz uma sonda (um `twitch.ping()`) e responde com o valor dela; dado que a sonda falha, responde a forma de erro com `TWITCH_PROBE_FAILED`; dado que a integração está `reconnect_required` ou `not_configured`, então `TWITCH_NOT_CONNECTED` e **zero** chamadas ao Helix. Os três casos (presente, ausente, Twitch falhando) são três testes nomeados.
- **CA-D8-3:** Dados 50 comandos `ping` em 1 s (timers falsos), quando rodam, então ocorre exatamente um `twitch.ping()` por janela de cache (voo único); depois da janela, mais um.
- **CA-D8-4:** Dadas as versões `v0.2.1-0000000-beta` e `v0.3.0-beta`, quando a versão é formatada, então as saídas são `v0.2.1-beta` e `v0.3.0-beta`; uma string não reconhecida é impressa como está (nunca lança erro).
- **CA-D8-5 (igualdade com o `/health`):** Dado um adaptador falso que leva 219 ms (relógio falso), quando `/health` e `ping` rodam na mesma janela, então `twitch_api_ping_ms` é igual ao número impresso pelo `ping`.
- **CA-D8-6 (instância Twurple real):** Dado um `ApiClient` real com `fetch` falso (helper `tests/helpers/twurple-real-instances.mjs`), quando o `ping` roda, então é feita exatamente uma requisição a `helix/users?id=<broadcaster>` e o valor medido é >= o atraso falso.
- **CA-D8-7:** Dados pt-BR, en e es, quando o `ping` responde, então `chat.ping.response` e o novo `chat.ping.error` existem nos três catálogos de chat, a resposta tem <= 500 caracteres e `npm run validate:localization` passa. `chat.ping.unavailable` é removida ou mantida só se ainda usada (o grep prova).
- **CA-D8-8 (E2E de chat com fixtures):** Twitch conectada, degradada e falhando produzem as mensagens de saída esperadas pelo handler de chat real.
- **CA-D8-9 (ao vivo, OW-17, a cargo do dono, FORA do gate do `@dev` e do `@qa`):** o `ping` real no canal mostra ms próximos do `/health` da mesma instância. Registrado como classe de evidência ao vivo separada; exige o dono (mensagem real de chat na Twitch real; não precisa de stream, mas a decisão é dele).
- **Fora:** `status`, qualquer mudança nos campos do `/health`, SSE, bump.
- **Ordem:** testes Red CA-D8-1, 2, 3, 5 -> Green (sonda assíncrona compartilhada + handler de chat que a aguarda) -> CA-D8-4 -> CA-D8-6, 7, 8.

### FT-53 — mensagem após um 401 quando o DELETE pode ter chegado à Twitch

- **Decisão `[AUTO-DECISION]`:** manter o HTTP 409 e o código `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` (nada muda para os clientes) e **acrescentar um campo `reason` fechado** com `authorization_required` quando a leitura que falhou foi um 401 (caso contrário `reason` não aparece). O painel então diz os dois fatos: o DELETE pode ter chegado à Twitch **e** a autorização precisa ser renovada. (Motivo: a L-2 pede manter ou melhorar; esta é a menor melhoria acionável e sem vazamento. O `@architect` confirma o nome do campo e que a lista é fechada; se preferir um código novo, os CAs abaixo mantêm o sentido.)
- **CA-F53-1 (Red primeiro):** Dado um DELETE possivelmente enviado e um 401 na leitura de cancelamento (linha 401 do PG36-05), quando o cancelamento é pedido, então HTTP 409 com `code: QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` e `reason: 'authorization_required'`; o corpo não tem mensagem do adaptador, canário parecido com token nem UID (teste de canário mantido).
- **CA-F53-2:** Dado o mesmo fluxo com falha que não é 401 (por exemplo 5xx ou erro de rede), então 409 sem `reason` ou com um valor da lista fechada afirmada pelo teste (`reason` nunca é texto livre).
- **CA-F53-3:** Dado que o painel recebe esse 409 com `reason: 'authorization_required'`, quando renderiza, então mostra um texto localizado com os dois fatos e a ação "autorizar de novo" existente; pt-BR, en e es existem; o `@ux-design-expert` aprova o texto (>= 9,0, escopo da revisão declarado).
- **CA-F53-4 (limite escrito, sem código):** a story OPS-22 registra, como limite explícito do CA 16, que uma tarefa de pausa restaurada por uma leitura de cancelamento para `unknown`/`failed` **não** é rearmada após a reautorização e precisa de "tentar agora" (item f do gate). O `@po` escreveu essa nota na OPS-22 nesta data.
- **CA-F53-5:** as asserções existentes do PG36-05, as listas permitidas de auditoria (PG36-13) e os testes de canário continuam verdes.
- **Ordem:** Red CA-F53-1/2 (rota e PostgreSQL) -> Green -> texto e teste do painel CA-F53-3 depois da nota de UX.

### FT-54 — textos no singular e "recompensa" no pt-BR

- **CA-F54-1 (registro de UX):** o `@ux-design-expert` escreve um adendo ao plano de UX da FT-23/FT-36 reconhecendo as quatro famílias (`confirm.delete_local.one`, `confirm.delete_converted.one` em en, es e pt-BR; contadas como as quatro famílias do gate), com nota >= 9,0 no escopo revisado e a declaração do que não foi revisado (sem execução visual nem de tecnologia assistiva).
- **CA-F54-2 (Red primeiro):** Dado o catálogo pt-BR do painel, quando um teste varre a família de exclusão de fila (`panel.queue.confirm.delete*`, `panel.queue.delete.*`, `panel.queue.status.pending_local_delete`, `panel.operation.confirm.continue_delete`, `panel.queue.confirm.retry_delete_converted`), então nenhum valor contém a palavra inglesa `reward`/`rewards` fora de nome próprio entre aspas; a regra do termo é "recompensa" para reward e "resgate" para redemption. Red: `confirm.delete_local.one`, `confirm.delete_converted.one`, `continue_delete`, `delete.done` e `delete.cancel.*` contêm "reward" hoje.
- **CA-F54-3:** singular e plural de cada chave mantêm os mesmos marcadores (`{title}`, `{count}`) e a paridade en/es/pt-BR; `npm run validate:localization` e os testes de plural continuam verdes.
- **CA-F54-4 (a UX decide, não obrigatório):** `panel.widget.queue_label` e `panel.widget.source.help` (pt-BR, "reward") estão na mesma regra de termo; o `@ux-design-expert` diz se entram nesta fatia. Se sim, a mesma varredura os cobre.
- **Ordem:** adendo de UX -> varredura Red -> edições de texto Green.

### TS-18 — `isOpen` local após um DELETE tardio

- **CA-T18-1 (Red primeiro):** Dado o cenário do PG36-16 (a tarefa de abertura termina `unknown('reward_open_reward_diverged')`, `remoteSyncStatus = open_unknown`), quando o teste termina as asserções atuais, então também afirma o valor armazenado de `isOpen` lido do PostgreSQL. O valor esperado é o que a semântica atual produz (`setQueueOpen(true)` deixa a flag `true` enquanto a sincronização está pendente/desconhecida), escrito como asserção explícita com um comentário que nomeia a semântica.
- **CA-T18-2 (o teste não é vazio):** Dada a mutação "o ramo do DELETE tardio grava `isOpen: false`" (ou "reabre", se a semântica da flag for a oposta), quando o teste roda, então falha; o `@dev` registra a mutação no comentário do teste e nos resultados.
- **CA-T18-3:** se o `@dev` achar a semântica da flag pouco clara, o `@data-engineer` a documenta em um parágrafo em `docs/stories/OPS-22/data-review.md`; nenhum código de produção muda nesta fatia.
- **Ordem:** asserção Red contra um ramo mutado -> restaurar -> Green. Mudança só de teste.

### Widget no OBS desta máquina (OPS-25 / ST-18, subconjunto pré-bump)

As classes de evidência continuam separadas: navegador automatizado, OBS/CEF nativo desta máquina (Linux). Nada é afirmado para Windows ou macOS.
- **CA-W-1:** Dada a overlay Next com o link do widget da conta como Browser Source no OBS nativo desta máquina, quando a fonte é recarregada (atualizar e "atualizar o cache da página atual"), então o rótulo volta sem tela preta nem erro de autorização; o tempo para exibir é registrado (até 5 s proposto; o `@qa` fixa contra a primeira carga). Cobre o CA 1 da OPS-25.
- **CA-W-2:** 10 recargas seguidas, 10 rótulos. Cobre o CA 2 da OPS-25.
- **CA-W-3:** depois que a sessão do painel expira e depois que a API reinicia, o mesmo link ainda mostra o rótulo. Cobre o CA 3 da OPS-25.
- **CA-W-4:** a troca de conta **no painel** atualiza o rótulo sem recarregar dentro da sondagem documentada de 1 s (`apps/shared/panel/overlay-renderer.mjs:176`, `:129`); o atraso observado é registrado. Cobre o CA 5 da OPS-25.
- **CA-W-5:** revogar o widget mostra o estado seguro não autorizado; um link novo funciona. Cobre o CA 6 da OPS-25.
- **CA-W-6:** o `@ux-design-expert` revisa os estados carregando, autorizado e não autorizado sobre fundo transparente e escuro (>= 9,0, escopo declarado). Cobre o CA 7 da OPS-25.
- **CA-W-7:** versões do OBS e do CEF, data, commit e tipo de URL (link de capacidade, sem segredo) são registrados na story OPS-25, em inglês e pt-BR. Cobre o CA 8 da OPS-25.
- **CA-W-8 (chat, pendente):** a troca de conta por `!fila conta` (CA 4 da OPS-25) exige uma mensagem real de chat na conexão Twitch real, o que o dono não autorizou no teste de OBS. Fica **pendente do OK do dono**; até lá o caminho do chat é coberto só pela classe de fixtures.
- **Fora deste subconjunto:** CA 9 da OPS-25 (Windows, macOS; "pendente de plataforma") e CA 10 (fechar a #57 exige o veredito e o OK do dono). Um defeito achado vira story de bug própria; nenhuma correção é misturada.
- **Regras durante a execução:** sem iniciar transmissão, sem resgate real; o link é um link de capacidade e nunca é escrito em documentos; quem executa é o `@qa`.

### D-6 — `degraded` desde o início da stream (só diagnóstico)

Sem evidência ao vivo, o `@po` limita a promessa: **fazer toda transição para `degraded` se explicar e provar o que dá para provar**. A causa raiz só fecha quando uma execução ao vivo com os novos logs a identifica.
- **CA-D6-1 (Red primeiro):** Dado que a integração publica `degraded` por `eventsub_disconnected`, `eventsub_startup_disconnected` ou assinatura revogada (`integration.mjs:204-224`), quando isso acontece, então uma linha de log estruturada é escrita com um código `reason` fechado (e o `type` da assinatura e o `revokeStatus` nas revogações), `level: warn`, sem token, UID, texto de chat nem connection string. Red: hoje esses três caminhos não escrevem nada.
- **CA-D6-2:** Dada uma transição para `degraded` de qualquer origem, então a linha traz o mesmo conjunto de campos (`event: 'twitch_integration_degraded'`, `reason`, `trigger` onde se aplica) e a linha de reconciliação da FT-24 (`twitch_reconciliation_degraded`) fica inalterada.
- **CA-D6-3 (sem spam):** Dado que o status já é `degraded` com o mesmo `reason`, quando é publicado de novo, então nenhuma segunda linha é escrita (uma linha por transição) e uma falha de log nunca muda o status (o padrão `try/catch` do `logReconciliationDegraded`).
- **CA-D6-4 (o que é testável agora):** Dado um runtime EventSub falso que desconecta antes do `onConnected` e uma reconciliação falsa que devolve `partial` com os códigos de problema da causa antiga da D-5, quando a integração inicia, então os logs nomeiam a origem certa em cada caso, na ordem em que ocorrem.
- **CA-D6-5 (limite honesto):** os campos do `/health` não mudam. A linha da D-6 do arquivo de resultados recebe a anotação "diagnosticável; causa raiz pendente de evidência ao vivo". Quem transmitir e vir `degraded` lê o log e nomeia a causa; **isso depende do dono** (exige "pode transmitir").
- **Ordem:** Red CA-D6-1/3 -> Green -> CA-D6-2/4.

## Pesquisa (item 3 do pedido)

**Não há LACUNA para a D-8 e não há etapa do `@analyst` antes do `@dev`.** A nota da linha 17 do `docs/research-index.md` (fonte do limitador de taxa do Twurple 8.2.0 VERIFICADA, **SUFICIENTE**) e a da linha 20 (fonte instalada do Twurple) cobrem o cliente Helix; o comportamento de requisição única do `getUserById` foi verificado acima na fonte instalada; a escolha do relógio é decisão padrão do Node. O que continua NÃO VERIFICADO é o valor **ao vivo** e se uma renovação de token infla uma medição; isso se fecha com a verificação ao vivo CA-D8-9 (OW-17), não com pesquisa. **REVISAR SE** o `@twurple/api` sair da 8.2.0. Para a D-6 a documentação do EventSub não é necessária para acrescentar logs; se a execução ao vivo mostrar uma causa sem explicação, o `@analyst` é acionado então, com a pergunta exata.

## Etapas extras (um agente por vez)

1. **`@architect` (uma nota curta, sem revisão completa):** confirmar para a D-8 a sonda assíncrona compartilhada, o TTL/limite do cache e os dois códigos de erro; para a FT-53 o campo `reason` e sua lista fechada; para a D-6 a lista fechada de `reason` e o conjunto de campos do log. Saída: uma página, en e pt-BR, antes do `@dev`.
2. **`@ux-design-expert` (um acionamento, antes de o `@dev` escrever textos):** (a) formatos do `ping` e do erro do `ping` em três idiomas (o formato do dono é vinculante; a revisão confere leitura e tamanho), (b) texto da FT-53, (c) adendo da FT-54 e a regra "recompensa", (d) estados do widget (CA-W-6), (e) **as notas D1 e D3 da onda 4**: D1 é só comportamento (fallback do seletor para pt-BR, idioma escolhido mantido enquanto salva); D3 é CSS visível (+3 px entre ações, +1 px no texto de aviso, restrito a `.reward-resolution-dialog`, `ts-10-wave-note.md` linhas 27-29); a nota deve dizer se o espaçamento e a fonte são aceitáveis em 390x844 e 768x900, nota >= 9,0, declarando revisão estática versus visual.
3. **`@data-engineer`:** não necessário (sem esquema, sem migração, sem consulta nova); a TS-18 pode pedir um parágrafo sobre a semântica de `isOpen` só se o `@dev` a achar pouco clara.
4. **`@analyst`:** não necessário agora (veja Pesquisa).
5. **`@sm`:** registrar a D-6 como linha nova (proposta **FT-55**, mãe #80, P2, P) e acrescentar as notas pré-bump à ST-18 e à ST-19; o quadro mostra os novos cards Ready.
6. **`@devops`:** criar as issues da OPS-26 (fatia A) e da OPS-25 (só corpo, sem comentários) e as sub-issues da #80 na hora para FT-53, FT-54, TS-18 e FT-55.

## O que depende do dono

- "Pode transmitir" para reproduzir a D-6 ao vivo; sem isso a D-6 só fica diagnosticável (CA-D6-5).
- OW-17: o `ping` real no canal (CA-D8-9), e o OK explícito para uma mensagem real de chat no passo do widget CA-W-8.
- Linhas de Windows e macOS da OPS-25 (sem sessão disponível; D-05 = B mantém o macOS bloqueado); a decisão final sobre a #57.
- Execução no OBS/CEF nativo desta máquina (CA-W-1..5): a autorização existe; o dono pode precisar abrir a cena ou ceder a tela ao `@qa`.

## Ordem de execução do `@dev` (em série)

1. **TS-18** (só teste, pequena).
2. **Nota do `@architect` e acionamento único do `@ux-design-expert`** (em paralelo com 1 só se a cota permitir; senão antes de 3).
3. **D-6** (CA-D6-1..4, só logs).
4. **D-8** (CA-D8-1..8).
5. **FT-53** (rota primeiro, texto depois da UX).
6. **FT-54** (texto, depois do adendo de UX).
7. **Gate único do `@qa`** (mín. 9,0) com estes seis itens mais as ondas 5, 4 e 6; depois a execução do widget no OBS nativo pelo `@qa` (CA-W-1..7) e os passos do dono; depois o bump. A execução do widget não precisa de código novo.

## Fechamento dos CA 9 e 15 da OPS-15 (pendentes desde a FT-43 / CA-43-4)

Evidência lida hoje: `apps/` contém só `api`, `frontend`, `infra`, `shared`; `grep` por `API_ONLY` e `@fastify/static` em `apps/` e `package.json` não devolve nada; existem os commits das ondas 0-3 (`08e84cb`, `384a7e7`, `ec12ae0`, `906fd5c`) com os vereditos do `@qa`; as ondas 4, 5 e 6 estão implementadas test-first pelo `@dev` na árvore de trabalho, **sem commit e sem veredito do `@qa`**.

| Parte do CA | CA 9 (ondas incrementais, rollback) | CA 15 (descontinuar o painel vanilla) |
|---|---|---|
| **Provado** | As ondas 0-3 tiveram veredito independente do `@qa` e hash de commit (arquivos `cutover-wave`, gates de QA de 2026-10-28 e 2026-10-29); sem gambiarra de polling nem shim nos caminhos removidos, conforme os gates de onda; `legacy` é só referência histórica (decisão do dono, sem evidência a produzir); rollback = reverter o commit da onda (regra de processo, sem migração nas ondas). | `apps/web` não existe mais na árvore; sem `API_ONLY`, sem `@fastify/static`; contratos da classe B portados para testes do Next (`ts-10-wave-note.md`); aliases `/overlay.html` removidos na onda 3; rota de arquivamento removida na onda 5 (segurança de linhas legadas em PostgreSQL isolado). |
| **Evidência pendente** | Ondas 4, 5 e 6: o gate único do `@qa` e os hashes dos commits (registrar hash, veredito e classes de evidência por onda). | O mesmo gate do `@qa` e o commit (a remoção só está na árvore de trabalho); **OBS/CEF nativo** com o novo link `/overlay` (nunca executado; coberto pela execução do widget CA-W-1..5); **leitor de tela e tecnologia assistiva no painel Next** (nunca executados); Windows/macOS. |

`[AUTO-DECISION]` Fechar os CA 9 e 15 como "fechados no que a evidência prova, com as linhas pendentes nomeadas" e não como "Done". (Motivo: a regra é não afirmar o que não foi executado; o gate único do `@qa` e as execuções nativa/de tecnologia assistiva são lacunas reais.) Os CA 9 e 15 são marcados na story OPS-15, em inglês e pt-BR, com o conteúdo desta tabela em forma curta; o texto deles não muda. Fecham por completo quando o PASS do gate for registrado com os hashes das ondas 4-6; as linhas de OBS e de leitor de tela continuam "evidência pendente" até serem executadas.

## Arquivos alterados por esta validação

- Este arquivo e o gêmeo em inglês.
- `docs/stories/OPS-15/story.md` e pt-BR: notas de fechamento sob o CA 9 e o CA 15 e uma linha no Change Log.
- `docs/stories/OPS-22/story.md` e pt-BR: limite explícito do CA 16 (pausa restaurada, item f do gate) e uma linha no Change Log.
- `docs/stories/OPS-26/story.md` e pt-BR, `docs/stories/OPS-25/story.md` e pt-BR: linha no Change Log com a decisão pré-bump (status inalterado: Rascunho).
- `docs/process/backlog-inventory.md` e pt-BR: FT-53, FT-54, TS-18 Ready; notas na ST-19 e na ST-18.

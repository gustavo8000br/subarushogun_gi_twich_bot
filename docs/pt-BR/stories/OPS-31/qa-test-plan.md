# OPS-31 — plano de testes do `@qa` (devolução por grupo e avisos de fila; FT-71..FT-78)

[English](../../../stories/OPS-31/qa-test-plan.md)

> **Atualização 2026-11-15 (v2).** As seções 1-8 (Parte A) são o plano v1 dos CAs 1-33 e valem onde o design v2.4 não mudou nada. A **Parte B (seções 9-24)** acrescenta os CAs 34-41, os pacotes P0..P8, os gates A/B/C, a tabela-verdade da política, a corrida do teto, o teste de mutação LIVE-1, `concluir` por papel, migrations e `rollback.sql`, `EXPLAIN` em volume sintético, DB-12..DB-17, `lock_timeout`, i18n, a11y e a rodada C. Onde a Parte B e a Parte A divergem, **vale a Parte B** (lista na seção 9). Somente plano: nada foi executado.

**Autor:** `@qa` (Quinn), 2026-11-11. **Natureza:** SOMENTE PLANO. Nenhum teste foi escrito ou executado, nenhum Docker nem ambiente de desenvolvimento foi tocado, nenhuma ação de código, git ou GitHub foi feita. Os nomes de arquivo são **prováveis** (criados ou estendidos pelo `@dev`); os IDs e nomes dos testes são o contrato, os arquivos podem mudar.
**Entradas:** [story](story.md) (AC 1-33; GO 9,3 do `@po`), [architect-design](architect-design.md) (D-31-1..D-31-11, seções 4, 7, 9), [data-engineer-review](data-engineer-review.md) (seções 4 e 6), [ux-plan](ux-plan.md) (seção 10), [po-validation](po-validation.md). Formato do plano anterior: [qa-test-plan da OPS-22](../OPS-22/qa-test-plan.md).
**Fatos do repositório conferidos em leitura:** `tests/unit` já tem `chat-outbox-worker`, `chat-command-handler`, `queue-action-state`, `overlay-widget-service`, `twitch-adapter`, `twitch-http-error`, `twitch-reconciliation`; existem `tests/helpers/twurple-real-instances.mjs` e os auxiliares de PostgreSQL isolado. **Nenhum arquivo em `tests/` menciona a sonda da TS-20 nem `40P01`/`pg_stat_activity`** (o grep não achou): a sonda que o `@data-engineer` quer "estendida" precisa ser localizada pelo `@dev` (pode estar fora de `tests/`); se não existir como teste, o `@dev` a cria (ver seção 4.4).

## 1. Base e regras

1. **Classes são evidências separadas; nenhuma substitui outra.** Legenda: `U` unitário (Vitest), `TW` Twurple falso ou classes reais (`twurple-real-instances`), `PG` PostgreSQL isolado com **migrations reais** (contêiner descartável, label `queuebot.test=disposable`; nunca SQLite, nunca mock de Prisma, nunca volume ativo), `K` componente (Vitest + DOM), `L` localização, `C` contrato/estático, `E` E2E Chromium (scripts só de navegador, fixtures, sem Twitch), `OBS` OBS/CEF nativo (método da OPS-25), `RT` canal de testes real (FT-78). Um ID = um teste nomeado; teste orientado a tabela conta uma vez e diz isso.
2. **Teste primeiro.** O `@dev` escreve cada teste em Red antes do código e registra a saída Red e Green em cada checkpoint de fatia na story (sem commit). O `@dev` roda os testes da fatia durante a implementação; o `@qa` reexecuta tudo uma vez, de forma independente, no gate único (regra do projeto). O `@qa` não confia na saída do `@dev`.
3. **Corridas usam duas conexões reais (dois `PrismaClient`) e uma barreira provada em `pg_stat_activity`; no mínimo 50 rodadas; a invariante é relida do banco após cada rodada.** Nenhum `sleep` como sincronização. O tempo é injetado (`clock`, timers falsos, `random` injetado, `lock_timeout` substituível pelo teste).
4. **Nenhum resultado é declarado fora do que foi executado.** Cada ID termina em `PASS`, `FAIL`, `NOT RUN` (com o motivo) ou `PENDENTE (precisa de janela de observação)`.
5. **Ordem de dependência:** FT-76 e FT-77 são validadas juntas (seção 6 do architect); a FT-71 traz o limitador e o `chat.notice`, então seus testes antecedem os testes de aviso da FT-72/FT-76.

## 2. Matriz AC para teste (os 33)

"Red hoje" = por que o teste falha antes de qualquer código (tudo da OPS-31 é novo; a maioria do Red é módulo, coluna, rota ou chave ausente). Executor: **D** = `@dev` no desenvolvimento, **Q** = `@qa` no gate (o Q sempre reexecuta também os testes do D; a coluna diz quem escreve e roda primeiro).

| AC | Evidência (classe) | Arquivo(s) sugerido(s) | Testes | Red esperado | Quem |
|---|---|---|---|---|---|
| 1 aviso ao entrar | U, RT | `tests/unit/chat-notice-texts.test.js`, ext. de `queue-service` | U71-01, U71-02, RT-A1 | Sem tipo `chat.notice`: importação/enfileiramento falha; nenhuma mensagem ao aceitar | D, Q |
| 2 fim do atendimento | U, RT | idem | U71-03, RT-A2 | `concludeEntry` não enfileira nada | D, Q |
| 3 pausa/fechamento + recusa | U, PG, RT | idem; `chat-notice-outbox-postgres.test.js` | U71-04, U71-05, PG71-01, RT-A3 | Pausar/fechar não envia nada; resgate durante pausa não é cancelado com o novo motivo | D, Q |
| 4 rajada/limitador | U, TW, PG, RT | `tests/unit/chat-notice-limiter.test.js` (novo), ext. de `chat-outbox-worker.test.js` | U71-06..U71-10, U71-13, TW71-01, TW71-02, PG71-01..03, RT-A6 | Sem módulo limitador; `is_sent` hoje não é checado; sem status `expired` (CHECK recusa) | D, Q |
| 5 chaves, 3 idiomas, sem ids, 500 caracteres | U, L, RT | `chat-notice-texts.test.js`, catálogos | U71-11, U71-12, U71-14, L71-01, L71-02 | Chaves ausentes; sem coluna de chave por fila | D, Q |
| 6 regra de ausência/pular/restaurar | U, PG, K, E, RT | `tests/unit/queue-skip-restore.test.js` (novo), `settlement-skip-restore-postgres.test.js` | U72-01..U72-04, U72-06, PG72-01..03, PG72-04, K72-01, E72-01, RT-A4 | `called->waiting` e `no_show->waiting` não existem (transição recusada) | D, Q |
| 7 reordenação agregada | U, RT | idem | U72-05, RT-A5 | Reordenar não envia nada | D, Q |
| 8 "próximo" no widget | U, K, E, OBS | ext. de `overlay-widget-service.test.js` e `tests/unit/next-widgets-page.test.jsx`, script de navegador do overlay | U73-01..U73-04, K73-01, E73-01, OBS-73-01 (RT-A7) | O payload não tem campo `next` | D, Q (OBS: Q + Orion) |
| 9 configuração + grupos | U, PG | `queue-settings-refund-policy.test.js` (novo), `settlement-migration-postgres.test.js` | U74-01, U74-02, PG74-01..PG74-05, PG74-08 | Colunas/enums ausentes; filas antigas sem `settlement` | D, Q |
| 10 lista própria (500, por canal) | U, PG, K, E | `own-list-service.test.js` (novo), PG de migração/lista própria | U74-05..U74-09, PG74-06, PG74-07, K74-03, E74-02 | Sem tabela/rota da lista própria | D, Q |
| 11 texto de retenção no controle | K, E, L | `next-queue-settlement-form.test.jsx` (novo) | K74-01, E74-01, L74-01 | Controle e chave ausentes | D, Q |
| 12 desabilitado sem as 4 condições; exclusão bloqueada | U, K, PG | teste de política; PG de exclusão | U74-03, U74-10, K74-02, PG76-21 | Modo de devolução salvável com qualquer recompensa; exclusão não bloqueada pelos novos estados | D, Q |
| 13 decisão persistida uma vez | U, TW, PG | `settlement-decision-service.test.js` (novo) | U75-01, U75-05, U75-07, U75-08, PG75-01, PG75-02 | Sem colunas de decisão; resultado da consulta não gravado | D, Q |
| 14 streamer + ordem fixa | U | idem | U75-02, U75-03 | Sem serviço de decisão | D, Q |
| 15 qualquer falha = `unknown` | U, TW | `twitch-group-lookup.test.js` (novo) | U75-04, U75-05, U75-10, TW75-01, TW75-02, TW75-06 | Sem adaptador; um 4xx viraria exceção | D, Q |
| 16 um escopo por grupo | U, K, RT | ext. de `twitch-oauth.test.js` | U75-09, U75-10, K74-02, RT-B5, RT-B13 | Lista de escopos opcionais ausente | D, Q |
| 17 reter e devolver ao fim | U, TW, PG, RT | `settlement-transitions.test.js` (novo) | U76-02, U76-04, U76-05, TW76-03, RT-B1, RT-B2 | O início cumpre todo resgate normal; sem estado de retenção | D, Q |
| 18 uma operação terminal | U, PG | `settlement-race-postgres.test.js` | U76-09, U76-10, PG76-01..PG76-12 | Sem unicidade por resgate; sem `settlement.contradictory_request` | D, Q |
| 19 cancelamento duplo (404) com Twurple real | TW | ext. de `twitch-adapter.test.js` | TW76-01, TW76-02 | O segundo cancelamento vira falha em vez de "já feito" | D, Q |
| 20 decidir ao cancelar/pular/ausência | U, K, E, RT | `settlement-transitions.test.js`, componente do diálogo | U76-06, U76-07, K77-03, E77-01, RT-B3, RT-B4 | Sem endpoint de escolha; "não devolver" deixaria `UNFULFILLED` | D, Q |
| 21 `check_group` | U, PG, K, E, RT | `settlement-transitions.test.js`, componente da lista | U77-01..U77-05, PG77-01, PG77-02, K77-01, K77-02, E77-03, RT-B5 | Estado ausente; o início cumpre um membro desconhecido | D, Q |
| 22 canal real | RT | este plano, seção 5 | RT-A1..A7, RT-B1..B13 | n/a (veredito por classe) | Q (o Orion age) |
| 23 sem ids/tokens/corpos nos logs | U, PG, C | canário em cada arquivo | U71-14, U74-09, U76-13, PG76-30, C-04 | Strings canário apareceriam nos novos logs | D, Q |
| 24 docs + localização en/pt-BR | L, C | `documentation-contract`, `localization-parity` | L71-01, L71-02, L72-01, L74-01, L75-01, L77-01, C-01 | Chaves/docs novos ausentes | D, Q |
| 25 sete gates | gates | seção 6 | execução do gate | Falha até o código passar em lint e tipos | D, Q |
| 26 fechamentos sem atendimento + lote | U, TW, PG, K, E, RT | `settlement-batch-postgres.test.js` | U76-01..U76-03, U76-14..U76-16, TW75-03, TW75-04, PG76-13..PG76-20, PG76-28, K77-04, E77-02, RT-B6 | Sem rotas prepare/confirm; limpar devolve tudo como hoje | D, Q |
| 27 abuso por reentrada | PG, RT | arquivo de lote/compat | PG76-31, RT-B9, RT-B12 | n/a (documenta limites; sem regra nova) | D, Q |
| 28 devolução por recusa é outro caso | U, C | transições + varredura de textos | U71-05, U76-12, C-02 | Texto de recusa divide chaves com a devolução de grupo | D, Q |
| 29 restaurar só sem operação terminal | U, PG | pular/restaurar | U72-03, PG72-02, PG72-03 | Restaurar sempre permitido ou não implementado | D, Q |
| 30 API recusa `refund_on_end` antes da FT-76 | U | teste de política | U74-04 | Salva em silêncio | D, Q |
| 31 gatilhos sem como perguntar -> `awaiting_choice` | U, PG | transições | U72-07, U76-08, PG76-07 | Ausência por tempo devolveria ou cumpriria sozinha | D, Q |
| 32 lote vale só para membros | U, PG | lote/exclusão | U76-15, PG76-14, PG76-21 | O lote também decide `check_group` | D, Q |
| 33 "devolvido" só após a Twitch confirmar | U, TW, RT | transições + worker | U76-11, TW76-04, RT-B1, RT-B4 | Aviso enviado quando a intenção é gravada | D, Q |

## 3. Testes por fatia (o contrato)

### 3.1 FT-71 — avisos (21)

| ID | Classe | Teste | AC |
|---|---|---|---|
| U71-01 | U | O texto de entrada traz posição e instrução, en/es/pt-BR (orientado a tabela, um teste) | 1, 5 |
| U71-02 | U | Exatamente uma mensagem por resgate aceito; nenhuma para recusado ou duplicado | 1 |
| U71-03 | U | A conclusão enfileira um aviso de fim de atendimento | 2 |
| U71-04 | U | Pausar, fechar e reabrir enfileiram um aviso cada | 3 |
| U71-05 | U | Resgate durante pausa/fechamento fica `CANCELED` e o texto do motivo não é texto de devolução de grupo | 3, 28 |
| U71-06 | U | Relógio injetado, 1000 enfileiramentos: nenhuma janela deslizante de 30 s passa do teto (80) | 4 |
| U71-07 | U | Prioridade 0 (sua vez, respostas a comandos) nunca é descartada nem esfomeada; a cota reservada se mantém sob enchente | 4 |
| U71-08 | U | Rajada (limpar, fechar, reordenação em massa) deixa uma linha pendente por fila e tipo (a última vence) | 4, 7 |
| U71-09 | U | Avisos em excesso expiram (`expired`), tentativas limitadas, contagem em log, nunca tentados para sempre | 4 |
| U71-10 | U | `is_sent` false, undefined, null, campo ausente: todos "não entregue" (orientado a tabela) | 4 |
| U71-11 | U | Chave por fila por grupo de tipo: desligada não envia nada, padrões conforme o desenho | 5 |
| U71-12 | U | Composição <= 500 caracteres em 3 idiomas, nomes multibyte, lista longa termina em "e mais N", nunca corta um nome | 5 |
| U71-13 | U | Remetente lança erro ou aviso expira: a transição da fila/dinheiro já está gravada e inalterada | 4 |
| U71-14 | U | Canário (uid, token, corpo de chat) nas entradas nunca chega a um argumento de log | 5, 23 |
| TW71-01 | TW | Envio de chat do Twurple falso com `is_sent:false` + motivo de descarte e com 429: não entregue; prioridade 0 repetida, prioridade 1/2 expiram | 4 |
| TW71-02 | TW | A classe Twurple real interpreta o formato da resposta de envio usado para `is_sent` | 4 |
| PG71-01 | PG | `chat-notice-outbox-postgres.test.js`: rajada numa janela grava uma linha, a janela seguinte uma nova | 3, 4 |
| PG71-02 | PG | `expired` aceito pelo CHECK de status do outbox; status existentes inalterados | 4 |
| PG71-03 | PG | O `claimNext` financeiro nunca reivindica `chat.notice` | 4 |
| L71-01 | L | Toda chave `chat.notice.*` existe em en/es/pt-BR (paridade) | 5, 24 |
| L71-02 | L | Marcadores e o sufixo "e mais N" válidos em 3 idiomas | 5, 24 |

### 3.2 FT-72 — ausência, pular, reordenar (14)

| ID | Classe | Teste | AC |
|---|---|---|---|
| U72-01 | U | Ausência: `called->no_show`, mensagem de chat com a nova situação | 6 |
| U72-02 | U | Pular: `called->waiting`, posição logo após a primeira entrada em espera; fila com 0 e 1 em espera | 6 |
| U72-03 | U | Restaurar `no_show->waiting` só sem operação terminal e sem outra entrada ativa | 29 |
| U72-04 | U | Quem não é membro mantém as regras de hoje de `refundOnNoShow` | 6 |
| U72-05 | U | Reordenar manualmente avisa as pessoas afetadas com uma mensagem agregada | 7 |
| U72-06 | U | Pular é o próprio desfazer; guarda de `version` da entrada; restauração auditada | 6 |
| U72-07 | U | Ausência por tempo de um membro -> `awaiting_choice`, ninguém é perguntado | 31 |
| PG72-01 | PG | Posição de pular/restaurar após a primeira entrada em espera; carimbos de chamada limpos | 6 |
| PG72-02 | PG | `P2002` mapeado para código estável quando há outra entrada ativa | 29 |
| PG72-03 | PG | Restaurar recusado quando o estado é `intent_recorded` | 29 |
| PG72-04 | PG | Pular x chamar x reordenar numa fila, 50 rodadas: posições contíguas, sem duplicatas | 6 |
| K72-01 | K | Controles de pular/restaurar, estados e foco após a ação | 6 |
| E72-01 | E | Pular um membro não pergunta nada e informa a nova posição | 6, 20 |
| L72-01 | L | Chaves `no_show`, `skipped`, `restored`, `reordered` em 3 idiomas | 24 |

### 3.3 FT-73 — "próximo" no widget (7)

| ID | Classe | Teste | AC |
|---|---|---|---|
| U73-01 | U | Payload `next` = nome de exibição da primeira entrada em espera | 8 |
| U73-02 | U | Sem entrada em espera: sem campo `next` (não string vazia nem de preenchimento) | 8 |
| U73-03 | U | Payload sem id/login; nomes longos e unicode seguros | 8, 23 |
| U73-04 | U | O payload acompanha pular, restaurar e reordenar | 8 |
| K73-01 | K | O widget mostra o próximo, o estado ausente, reticências em nome longo | 8 |
| E73-01 | E | Página do widget em 320/390/768 px, com e sem entrada em espera | 8 |
| OBS-73-01 | OBS | OBS/CEF nativo pelo método da OPS-25 (classe separada; Orion + `@qa`) | 8 |

### 3.4 FT-74 — configuração, grupos, lista própria (24)

| ID | Classe | Teste | AC |
|---|---|---|---|
| U74-01 | U | `settlement` padrão `fulfill_on_start`; valores permitidos e conjunto de grupos validados | 9 |
| U74-02 | U | Conjunto vazio não devolve a ninguém (serviço de decisão nunca chamado) | 9 |
| U74-03 | U | Modo de devolução desabilitado sem: recompensa deste produto, pular-fila desligado, afiliado/parceiro, escopo concedido por grupo (orientado a tabela) | 12 |
| U74-04 | U | A API recusa `refund_on_end` antes do sinalizador da FT-76 com código estável | 30 |
| U74-05 | U | Adicionar à lista própria resolve o login uma vez, guarda só o id numérico + rótulo opcional | 10 |
| U74-06 | U | A 500ª pessoa é aceita, a 501ª recusada com código estável e mensagem | 10 |
| U74-07 | U | Remover, limpar tudo, adicionar duplicado idempotente | 10 |
| U74-08 | U | A lista própria é por canal; excluir uma fila remove só a chave `own_list` dela | 10 |
| U74-09 | U | Canário: login e id nunca em log | 10, 23 |
| U74-10 | U | Regra de exclusão de recompensa/fila bloqueada enquanto há resgates devolvíveis pendentes | 12 |
| PG74-01 | PG | `settlement-migration-postgres.test.js`: M1 e M2 aplicam sobre linhas já existentes; filas antigas mantêm `fulfill_on_start`, `none`, `NULL` | 9 |
| PG74-02 | PG | Cada CHECK recusa sua linha inválida (forma da decisão, estado x decisão, estado x `expected_status`, `remote_status`, formato do id da lista, tamanho do rótulo); orientado a tabela, um teste | 9, 10 |
| PG74-03 | PG | O gatilho de guarda recusa sair de `intent_recorded` e mudar decisão conclusiva | 13, 18 |
| PG74-04 | PG | `VALIDATE` passa; a guarda do `M2-down` recusa quando o recurso foi usado e passa quando não | 9 |
| PG74-05 | PG | `prisma migrate diff` não aponta deriva | 9 |
| PG74-06 | PG | Duas conexões adicionam a 500ª pessoa, 50 rodadas: exatamente 500 linhas, uma recusa (advisory lock dedicado) | 10 |
| PG74-07 | PG | Lista própria apagada com os dados do canal; excluir a fila mantém as pessoas | 10 |
| PG74-08 | PG | Avisos desligados por padrão nas filas pré-existentes | 5, 9 |
| K74-01 | K | Bloco "Pontos": opções de momento; parágrafo de retenção ligado por `aria-describedby` | 11 |
| K74-02 | K | Motivos de desabilitado como texto; dica de conjunto vazio; selo "aguardando reconexão"; reconectar oculto com formulário alterado | 12, 16 |
| K74-03 | K | Interface da lista própria: adicionar, duplicado, limite, remover (foco se move), diálogo de limpar tudo, texto vazio | 10 |
| L74-01 | L | Chaves de configuração/lista própria, plurais, 3 idiomas | 24 |
| E74-01 | E | Configuração em 320/390/768 px (zoom 200% em 320) | 11, 12 |
| E74-02 | E | Lista própria em 320/390/768 px | 10 |

### 3.5 FT-75 — consulta e escopos (20)

| ID | Classe | Teste | AC |
|---|---|---|---|
| U75-01 | U | Cada grupo sozinho torna o membro elegível (lista própria, moderador, VIP, inscrito, streamer) | 13, 14 |
| U75-02 | U | Ordem fixa lista própria, moderador, VIP, inscrito; `matched_group` é o primeiro que casa | 14 |
| U75-03 | U | `user_id == broadcaster_id` elegível com zero chamadas | 14 |
| U75-04 | U | Uma falha mais um positivo = elegível | 15 |
| U75-05 | U | Falha sem positivo = `unknown` com o motivo da primeira falha; todas respondidas sem positivo = `not_eligible` | 13, 15 |
| U75-06 | U | Consulta dispensada para: `fulfill_on_start`, conjunto vazio, entrada manual, recusa, decisão já gravada | 13 |
| U75-07 | U | A decisão é gravada antes da primeira chamada de escrita à Twitch (ordem das chamadas registrada) | 13, 18 |
| U75-08 | U | A repetição do outbox nunca reconsulta; só "tentar agora" substitui `unknown` | 13 |
| U75-09 | U | Habilitar um grupo pede só o escopo dele, acumulando; lista obrigatória inalterada | 16 |
| U75-10 | U | Lista concedida vem do `/validate`; escopo ausente = `scope_missing` com zero chamadas | 15, 16 |
| TW75-01 | TW | 401, 403, 429, 5xx, timeout, corpo malformado -> códigos de motivo (orientado a tabela, 6 casos) | 15 |
| TW75-02 | TW | Canal não afiliado -> `channel_not_eligible` | 15 |
| TW75-03 | TW | Blocos de 100 ids, no máximo uma chamada por grupo por bloco | 26 |
| TW75-04 | TW | 429 espera uma vez dentro do limite, depois o bloco vira `unknown(rate_limited)`; a limpeza continua com sucesso | 26 |
| TW75-05 | TW | Fixtures de inscrição: paga, presenteada e um registro em formato Prime contam todas (nível de fixture, NÃO é prova real de Prime) | 15 |
| TW75-06 | TW | Classes de erro reais do Twurple (`HttpStatusCodeError`) mapeiam corretamente, no estilo da FT-26 | 15 |
| PG75-01 | PG | Decisão conclusiva imutável: uma segunda escrita não muda nada | 13 |
| PG75-02 | PG | `unknown` só é substituído por "tentar agora" e só enquanto não há intenção | 13 |
| PG75-03 | PG | Retrato de `settlement_mode` e grupos: mudar a configuração depois não toca resgates já decididos | 13 |
| L75-01 | L | Textos de motivo e de reconexão em 3 idiomas | 24 |

### 3.6 FT-76 — reter, devolver ao fim, escolhas, lote (51)

| ID | Classe | Teste | AC |
|---|---|---|---|
| U76-01 | U | Tabela de gatilhos, coluna "não é membro", as 10 linhas (orientado a tabela) | 26, 28 |
| U76-02 | U | Coluna "membro", todas as linhas | 17, 20, 26, 31 |
| U76-03 | U | Coluna `unknown`, todas as linhas | 21 |
| U76-04 | U | Início: membro retido (sem chamada), não membro cumprido | 17 |
| U76-05 | U | `redemption.cancel` só é emitido na conclusão (espião no gravador do outbox) | 17 |
| U76-06 | U | "Não devolver" = `redemption.fulfill` gravado na mesma transação da escolha | 20 |
| U76-07 | U | Pular não pergunta nada e não tem efeito financeiro | 20 |
| U76-08 | U | Gatilhos sem como perguntar (tempo, sair, remoção por chat) dão `awaiting_choice`; comando de chat nunca é aceito como escolha | 31 |
| U76-09 | U | Pedido contraditório explícito: código estável, `settlement.contradictory_request`, desfecho gravado devolvido, estado inalterado; regra automática mantém o rebaixamento mais auditoria | 18 |
| U76-10 | U | A mesma escolha repetida = "já feito", uma tarefa | 18 |
| U76-11 | U | O aviso de desfecho só após a leitura-verificação do worker confirmar; resposta ausente nunca o produz | 33 |
| U76-12 | U | Recusa (pausada/fechada/duplicada) cancela sem nenhuma consulta | 28 |
| U76-13 | U | Canário: lista permitida de `safe_detail` da auditoria e logs trazem só códigos e contagens | 23 |
| U76-14 | U | Preparar o lote devolve só contagens (não membros, membros, verificar grupo) | 26 |
| U76-15 | U | Confirmar o lote: só membros; `check_group` nunca decidido | 32 |
| U76-16 | U | O texto do resultado diz "solicitado/pendente" até a Twitch confirmar | 26 |
| TW76-01 | TW | Segundo cancelamento -> Twitch 404, leitura `CANCELED` -> resolvido como já feito, com a classe **real** de resgate do Twurple | 19 |
| TW76-02 | TW | Status remoto oposto achado pela leitura-verificação -> `conflict` da OPS-22, sem escrita | 18 |
| TW76-03 | TW | Resgate retido: o falso registra zero chamadas de escrita durante todo o atendimento | 17 |
| TW76-04 | TW | Após cancelamento/cumprimento confirmado o aviso é enfileirado uma vez; nenhum após `unknown`/`failed` | 33 |
| PG76-01..07 | PG | Pares de corrida, 50 rodadas cada (seção 4.1) | 18, 31 |
| PG76-08 | PG | Sem o lock: a segunda inserção com a mesma chave é recusada pela unicidade da chave | 18 |
| PG76-09 | PG | Sem o lock: a segunda inserção com chave diferente (`financial:R:x`) é recusada por `outbox_financial_redemption_uidx` | 18 |
| PG76-10 | PG | Autoteste da barreira: se o segundo backend não é visto esperando, o auxiliar falha a rodada (não passa no vazio) | 18 |
| PG76-11 | PG | `expected_status` igual ao vencedor; uma linha financeira; o perdedor recebe código estável | 18 |
| PG76-12 | PG | Nenhum `40P01`/`40001` em nenhuma rodada | 18 |
| PG76-13 | PG | Lote: contagens por desfecho | 26 |
| PG76-14 | PG | `check_group` nunca decidido por lote | 32 |
| PG76-15 | PG | Retrato desatualizado recusado | 26 |
| PG76-16 | PG | Lote x ação individual serializados; o perdedor relê | 26 |
| PG76-17 | PG | Lote x lote na mesma fila (cancelamento duplo / confirmação duplicada): o segundo recusado ou idempotente, uma tarefa por resgate | 18, 26 |
| PG76-18 | PG | `ON CONFLICT DO NOTHING` contado como "já decidido" | 26 |
| PG76-19 | PG | Número de comandos SQL independente de N (10 vs 500) | 26 |
| PG76-20 | PG | Lote com N=500 termina dentro de `statement_timeout`/`lock_timeout`; o tempo é registrado como medição, não afirmado | 26 |
| PG76-21 | PG | Exclusão de fila/recompensa fica em `deleting` enquanto houver resgate em `held_for_service`, `awaiting_choice` ou `check_group` | 12, 32 |
| PG76-22 | PG | Fila arquivada ainda lista as decisões pendentes | 21 |
| PG76-23 | PG | Reiniciar copia a configuração, nunca as colunas do resgate nem a lista própria | 9 |
| PG76-24 | PG | Resgate retido nunca reivindicado pelo `claimNext` (sem linha de outbox) | 17 |
| PG76-25 | PG | Confirmação do worker de outra tarefa enquanto a liquidação roda: sem aresta de lock compartilhada | 18 |
| PG76-26 | PG | A reconciliação que observa um terminal remoto numa linha retida grava `expected_status` e `intent_recorded` juntos | 18 |
| PG76-27 | PG | `check_group` e `unknown` financeiro são mutuamente exclusivos (CHECK) | 21 |
| PG76-28 | PG | Limpar com um bloco de consulta falho: entradas removidas, bloco `unknown`, a limpeza nunca falha | 26 |
| PG76-29 | PG | Sonda da TS-20 estendida (seção 4.4) | 18 |
| PG76-30 | PG | Captura de logs nos arquivos: nenhum id de usuário, login, nome de exibição ou rótulo em logs ou `safe_detail` | 23 |
| PG76-31 | PG | Reentrada: segunda entrada ativa da mesma pessoa recusada com devolução (`duplicate_active_entry`); não existe punição automática | 27 |

(PG76-01..07 são os sete testes de corrida da seção 4.1, então o PG76 soma 31.)

### 3.7 FT-77 — "verificar grupo" (16)

| ID | Classe | Teste | AC |
|---|---|---|---|
| U77-01 | U | `unknown` -> `check_group`; o início não cumpre; o atendimento começa mesmo assim | 21 |
| U77-02 | U | Quatro escolhas (tentar agora, devolver, cumprir, manter); nada acontece sem a ação | 21 |
| U77-03 | U | Tentar agora: elegível em atendimento -> retido; elegível fechado -> `awaiting_choice`; não elegível -> cumprimento gravado; ainda desconhecido -> permanece | 21 |
| U77-04 | U | Conclusão com `check_group` sem resolver: não decide, listado como pendente | 21 |
| U77-05 | U | Nenhum aviso de chat é produzido para "verificar grupo" | 21 |
| PG77-01 | PG | `check_group` sobrevive ao fim do atendimento e a reinício; lista pendente por índice da fila após recarregar | 21 |
| PG77-02 | PG | Ações em lote da lista pendente tocam só itens `check_group` | 32 |
| K77-01 | K | Marca no cartão, selo no cartão e na navegação | 21 |
| K77-02 | K | Linhas pendentes, dica antes de "Verificar de novo", empilhadas abaixo de 600 px | 21 |
| K77-03 | K | Diálogo de decisão: título com foco, `Esc`/Voltar sem efeito, botões iguais, nenhum pré-armado, texto "(definitivo)" | 20 |
| K77-04 | K | Diálogo de lote: opções sem padrão, Confirmar desabilitado com motivo visível, seleção zera com novo retrato | 26 |
| L77-01 | L | Chaves de diálogo, lote, pendentes, motivos; plurais em 3 idiomas | 24 |
| E77-01 | E | Diálogo de decisão em 320/390/768 px; "já decidido" numa segunda aba | 20 |
| E77-02 | E | Diálogos de limpar/excluir para 0 membros, só membros, misto, alguns desconhecidos; diz "solicitado", nunca "devolvido" | 26 |
| E77-03 | E | Lista pendente após limpar e após recarregar | 21 |
| E77-04 | E | Só teclado, armadilha/restauração de foco, uma região `status` e uma `alert` permanecem montadas | 20, 21 |

### 3.8 Contrato transversal (4) e totais

| ID | Classe | Teste | AC |
|---|---|---|---|
| C-01 | C | Docs bilíngues e guia do usuário existem (contrato de documentação) | 24 |
| C-02 | C | Varredura estática: chaves de recusa e de devolução de grupo são disjuntas; o aviso `refunded` só é alcançável pelo caminho de confirmação | 28, 33 |
| C-03 | C | Novos eventos de auditoria (`settlement.*`) dentro da lista permitida de `safe_detail` | 23 |
| C-04 | C | Toda rota nova: não-2xx traz `code` enumerado; falha inesperada devolve texto genérico com `referenceId` | 23 |

| Classe | FT-71 | FT-72 | FT-73 | FT-74 | FT-75 | FT-76 | FT-77 | Transv. | Total |
|---|---|---|---|---|---|---|---|---|---|
| U | 14 | 7 | 4 | 10 | 10 | 16 | 5 | 0 | **66** |
| TW | 2 | 0 | 0 | 0 | 6 | 4 | 0 | 0 | **12** |
| PG | 3 | 4 | 0 | 8 | 3 | 31 | 2 | 0 | **51** |
| K | 0 | 1 | 1 | 3 | 0 | 0 | 4 | 0 | **9** |
| L | 2 | 1 | 0 | 1 | 1 | 0 | 1 | 0 | **6** |
| E | 0 | 1 | 1 | 2 | 0 | 0 | 4 | 0 | **8** |
| C | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 | **4** |
| OBS | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | **1** |
| **Total** | 21 | 14 | 7 | 24 | 20 | 51 | 16 | 4 | **157** |

Mais 20 itens de canal real (RT-A1..A7, RT-B1..B13; seção 5), 27 mutações (seção 4.6), as suítes de regressão existentes (`compose-runtime`, `localization-parity`, `documentation-contract`, as fixtures da OPS-22) e os sete gates.

## 4. Corridas e concorrência

### 4.1 Operação terminal única (as cinco corridas principais, 50 rodadas cada, em `settlement-race-postgres.test.js`)

| # | Corrida | Teste | Invariante relida após cada rodada |
|---|---|---|---|
| 1 | **Cumprir x cancelar:** conclusão (membro -> `cancel`) x remoção com "não devolver" (`fulfill`) no mesmo resgate | PG76-01 | Exatamente uma linha `financial:{id}`; `expected_status` igual ao vencedor; o perdedor recebeu o código estável "já decidido"; `settlement.contradictory_request` gravado exatamente uma vez (as escolhas diferem) |
| 2 | **Cancelamento duplo:** duas abas com escolhas opostas (devolver x não devolver), e duas escolhas iguais | PG76-02, PG76-06 | Opostas: uma linha, uma linha de auditoria, desfecho gravado devolvido ao perdedor. Iguais: uma linha, as duas respostas "feito/já feito", zero auditoria de contradição |
| 3 | **Lote:** confirmar limpar/excluir x escolha individual ou conclusão, e confirmar x confirmar | PG76-05, PG76-16, PG76-17 | Uma tarefa por resgate; o perdedor relê e recebe o código de retrato desatualizado ou "já decidido"; `check_group` intocado |
| 4 | **Início x remoção** (membro retido vs devolução de não membro) | PG76-03 | Membro: retido, sem linha; não membro: exatamente uma linha do tipo vencedor; nunca cumprir e cancelar juntos |
| 5 | **Duas "tentar agora"** (e tentar agora x escolha) em `check_group`; mais ausência por tempo x escolha no painel com relógio injetado | PG76-04, PG76-07 | Uma decisão gravada; uma transição; o `awaiting_choice` do tempo perde para a escolha do painel ou o contrário, nunca os dois |

Cada rodada: ids novos de fila e resgate (únicos por rodada), então rodadas nunca dividem linhas; o vencedor **não** é fixo (as duas ordens precisam ocorrer nas 50 rodadas, ou o teste registra a distribuição e falha se uma ordem nunca ocorreu, o que indicaria que a barreira não está realmente disputando). Sem `40P01`, sem `40001`, sem 500 genérico no perdedor (PG76-12).

### 4.2 A barreira por `pg_stat_activity` (sem `sleep`)

1. Cada cliente obtém primeiro seu pid de backend (`SELECT pg_backend_pid()`).
2. Os dois executam a função real do repositório até uma **costura de teste** posta depois do lock da fila e antes da escrita da intenção (o desenho do architect/`@data-engineer` a permite). O cliente A chega à costura segurando o advisory lock e espera uma promessa controlada pelo teste.
3. O cliente B é iniciado; o teste **consulta** `pg_stat_activity` junto com `pg_blocking_pids(pidB)` até `wait_event_type = 'Lock'`, `wait_event = 'advisory'` e o `pidA` estar na lista de bloqueadores. A consulta é um laço limitado de idas e voltas ao banco (limite, depois FAIL com o último estado), não um temporizador.
4. Só então A é liberado. Ver B esperando prova que a serialização é real em vez de presumida.
5. Rodada em que B nunca foi visto esperando é **falha da rodada** (o PG76-10 afirma que o auxiliar faz isso), nunca um pulo. Suíte com menos de 50 rodadas com espera observada por corrida não é aceita.

### 4.3 Execução sem o advisory lock (mutação por SQL puro)

PG76-08 e PG76-09 usam transações em SQL puro **sem** `lockQueue`: a segunda inserção com a mesma chave é recusada pela unicidade da chave; a segunda com chave **diferente** é recusada pelo índice único parcial por resgate. Juntas provam que a camada de restrições funciona com a camada de lock contornada (D-31-3, camadas 1-2). A mutação M1 no código (seção 4.6) remove o lock do caminho real, e a barreira deve então falhar porque B nunca é visto esperando.

### 4.4 Deadlock: a sonda da TS-20 estendida

`settlement-deadlock-postgres.test.js` (PG76-29) usa as três transações `retryOutboxManually`, `requestQueueDeletion` e uma de liquidação e roda as 6 ordens, cada uma iniciada atrás de barreira. Esperado em toda ordem: cada transação termina em commit ou em `40P01`/`55P03` mapeado para erro genérico repetível com `referenceId`; nada trava. O `lock_timeout` do servidor vem de uma constante de configuração que o teste reduz (por exemplo 500 ms) para um defeito falhar rápido; o valor de produção (5 s) é afirmado à parte como constante. Se a sonda da TS-20 não for achada como teste, o `@dev` registra isso e escreve este arquivo como a primeira sonda (ponto aberto P1).

### 4.5 Relógio e repetição

- `clock` injetado para o limitador, o temporizador de chamada e a expiração (sem espera real).
- Rodadas de corrida: **>= 50** por par numa execução; cada arquivo de PostgreSQL roda **3 vezes** no gate (150+ rodadas por par). Uma única rodada com falha reprova o gate.
- Máquina disputada: tempo nunca é afirmado; só desfechos.

### 4.6 Mutações obrigatórias (27; >= 12 exigidas)

**Como o `@qa` as reproduz.** Uma por vez, em série, só no gate e nunca enquanto outro agente edita o mesmo arquivo: (1) copiar o arquivo a mutar para `.local/qa-ops31/backup/<id>/` (nunca `/tmp`) e registrar o `sha256sum`; (2) aplicar a mutação de uma linha; (3) rodar **só** o(s) teste(s) nomeado(s) e registrar o nome e a mensagem da falha; (4) restaurar o arquivo da cópia e rodar `cmp` contra o backup, mais `git diff --stat -- <arquivo>` igual ao estado anterior à mutação; (5) rodar o teste nomeado de novo em Green. Mutação que não derruba o teste nomeado é **FAIL do plano** (teste fraco) e bloqueia o gate. Quando outro agente está ativo em `apps/`, as mutações rodam numa cópia completa da árvore (`cp -a` sem `node_modules`, com `npm ci` próprio) em `.local/`, nunca no checkout compartilhado.

| # | Mutação | Teste que deve falhar |
|---|---|---|
| M1 | Remover o advisory lock da fila da transação de liquidação | PG76-01..07 (B nunca visto esperando), PG76-10 |
| M2 | Remover `outbox_financial_redemption_uidx` da migration | PG76-09, PG74-01 |
| M3 | Trocar `ON CONFLICT DO NOTHING` por inserção simples | PG76-11 (o perdedor recebe erro, não código estável), PG76-18 |
| M4 | Deixar a escrita da decisão sem guarda (sobrescreve `eligible` com resultado posterior) | PG75-01, U75-08 |
| M5 | Gravar a decisão depois da chamada à Twitch em vez de antes | U75-07, U76-05 |
| M6 | Tratar toda falha de consulta como `not_eligible` | U75-04, U75-05, TW75-01 |
| M7 | Cancelar membros no início do atendimento | U76-04, U76-05, U76-02 |
| M8 | A conclusão cumpre membros em vez de cancelar | U76-02, U76-05 |
| M9 | "Não devolver" não grava nada (deixa `UNFULFILLED`) | U76-06, PG76-11 |
| M10 | Permitir `no_show->waiting` após `intent_recorded` | U72-03, PG72-03 |
| M11 | A confirmação do lote também decide linhas `check_group` | U76-15, PG76-14 |
| M12 | Remover a guarda do retrato de confirmação | PG76-15 |
| M13 | Um pedido contraditório sobrescreve `expected_status` | U76-09, PG76-01 |
| M14 | Teto do limitador removido ou prioridade 0 descartável | U71-06, U71-07 |
| M15 | Tratar `is_sent` undefined como entregue | U71-10 |
| M16 | Enviar o aviso "pontos devolvidos" quando a intenção é gravada | U76-11, TW76-04, C-02 |
| M17 | Registrar o id ou login do usuário em erro de consulta/lista própria | U71-14, U74-09, U76-13, PG76-30 |
| M18 | Limite da lista própria com erro de um (aceita a 501ª) | U74-06, PG74-06 |
| M19 | A API aceita `refund_on_end` antes do sinalizador da FT-76 | U74-04 |
| M20 | Exclusão da fila não bloqueada por `awaiting_choice` | PG76-21 |
| M21 | Usar `SKIP LOCKED` em vez de esperar na decisão do lote | PG76-13, PG76-17 (um membro descartado em silêncio) |
| M22 | Aceitar uma escolha vinda de comando de chat | U76-08 |
| M23 | Chamar a Twitch mesmo com escopo ausente | U75-10 |
| M24 | Cortar mensagens em 500 caracteres no meio de um nome | U71-12 |
| M25 | Trocar a ordem dos grupos (inscrito antes da lista própria) | U75-02 |
| M26 | Remover o gatilho de guarda (saída de `intent_recorded`) | PG74-03 |
| M27 | Ausência por tempo de um membro devolve ou cumpre sozinha | U72-07, U76-08, PG76-07 |

## 5. Testes reais no canal de testes (FT-78, AC 22)

**Autorização e limites.** Apenas o canal de testes exclusivo SubaruShogun (autorização do dono de 2026-11-05). O `@qa` cria filas e recompensas pelo produto (só recompensas criadas por este produto). O Orion age no Chrome: resgates e mensagens de chat; quando o `@qa` não tem navegador autenticado no backend real, o Orion também clica os botões do painel seguindo o roteiro e relata o que está visível. O `@qa` verifica pelo banco, pela leitura-verificação do próprio produto e pelas linhas de auditoria, **só contagens e códigos de motivo**; nenhum token, header, id de usuário ou corpo de chat é copiado para a evidência. Sem senha, sem `sudo`, sem segredos no roteiro.

### 5.1 Duas execuções, como no plano do architect

- **Execução A (depois da FT-71..FT-73): avisos.**
- **Execução B (depois da FT-74..FT-77): dinheiro.** Nunca rodar a B antes de o gate local único estar verde (um defeito em código de dinheiro não deve encontrar um resgate real).

### 5.2 Duas contas

Os grupos são testados com **duas contas de espectador no Chrome do Orion**: a conta X (com papel) e a conta Y (sem papel). Os papéis são baratos de criar sem pagar: a **lista própria** torna X membro sem papel na Twitch; X também pode virar moderador e VIP pelo streamer no canal de testes (`/mod`, `/vip`, reversíveis).

| Precisa das duas contas (X membro, Y não membro, mesma fila) | Uma conta basta |
|---|---|
| RT-B1 + RT-B2 comparados numa fila (membro retido, não membro cumprido no início) | RT-A1, RT-A2, RT-A3 (pausa/recusa), RT-B9 (limite), RT-B5 (verificar grupo), RT-B8, RT-B11 |
| Ordem e avisos com dois espectadores reais (a RT-A4 pode usar entradas manuais) | RT-B3, RT-B4 (escolha sobre membro) |

Decisão (alternativa se só houver uma conta): alternar a mesma conta entre membro e não membro adicionando/removendo da lista própria entre dois resgates. A lógica de dinheiro é exercitada por inteiro assim; o que se perde (dois espectadores distintos na mesma fila) é coberto por entradas manuais e registrado como tal. Haver duas contas é ponto aberto (P3).

### 5.3 Roteiros

| ID | Exec. | Roteiro (Orion / `@qa`) | Esperado | Fecha |
|---|---|---|---|---|
| RT-A1 | A | Y resgata; o chat mostra o aviso de entrada | Uma mensagem, posição e instrução, idioma do canal, <= 500 caracteres | AC 1, 5 |
| RT-A2 | A | Atender até o fim | Uma mensagem de fim de atendimento | AC 2 |
| RT-A3 | A | Pausar, Y resgata; fechar, Y resgata; reabrir | Resgates `CANCELED` (pontos de volta), texto do motivo; um aviso por estado | AC 3, 28 |
| RT-A4 | A | Entradas manuais; ausência, pular, restaurar pelo painel | Uma mensagem cada com a nova situação | AC 6 |
| RT-A5 | A | Reordenar várias; limpar | Uma mensagem agregada de reordenação, uma de limpeza | AC 4, 7 |
| RT-A6 | A | Rajada: 30+ entradas manuais, limpar, chamar; contar mensagens do chat na janela | Nunca acima do teto; "sua vez" entregue; avisos excedentes expirados, não presos | AC 4 |
| RT-A7 | A | "Próximo" do widget no OBS nativo | Mostrado com entrada em espera; nada enganoso sem | AC 8 (classe OBS) |
| RT-B1 | B | X (lista própria) resgata; visão da fila na Twitch durante o atendimento; concluir | `UNFULFILLED` durante todo o atendimento, `CANCELED` após a conclusão, pontos de volta; chat "devolvido" só após a leitura-verificação | AC 17, 33 |
| RT-B2 | B | Y resgata na mesma fila | Cumprido no início; sem devolução | AC 17 |
| RT-B3 | B | X resgata, é removido com "não devolver (definitivo)" | Resgate `FULFILLED`; sem pontos de volta | AC 20 |
| RT-B4 | B | X resgata, é removido com "devolver" | `CANCELED` na hora; o chat informa a pessoa após a confirmação | AC 20, 33 |
| RT-B5 | B | Habilitar VIP sem o escopo: X resgata -> "verificar grupo"; reconectar (dono) -> tentar agora | `check_group`, sem cumprir; depois retido | AC 15, 16, 21 |
| RT-B6 | B | Limpar com membros e um não membro | Preparar mostra contagens; confirmar aplica uma escolha; resumo no chat; texto diz "solicitado" até confirmar | AC 26, 32 |
| RT-B7 | B | X vira moderador, depois VIP (Orion no Chrome), grupos habilitados um por vez | Casa pelo grupo respectivo; grupo de inscritos **não executado** (ver 5.5) | AC 14 |
| RT-B8 | B | Deixar um resgate `UNFULFILLED`; registrar o horário; reler após 24 h e após 7 dias | Resultado registrado como observado ou `PENDENTE`; nunca inventado | Item real 1 |
| RT-B9 | B | Limite da recompensa 1 por pessoa por transmissão; X resgata, conclui (`CANCELED`), resgata de novo | Se o limite/recarga é restaurado; registrado | Item real 2, AC 27 |
| RT-B10 | B | Após qualquer cancelamento/cumprimento feito pelo app, ler as contagens de observação da reconciliação | Se `redemption.update` chega para a nossa própria mudança | Item real 3 |
| RT-B11 | B | Repetir RT-B1/RT-B4 com o canal offline; uma repetição ao vivo se o dono transmitir | Cancelar funciona offline; comportamento do aviso no chat offline registrado | AC 17, 20 |
| RT-B12 | B | X resgata duas vezes seguidas | O segundo recusado com devolução (`duplicate_active_entry`); sem punição | AC 27 |
| RT-B13 | B | O dono reconecta com um escopo novo; comparar os escopos concedidos no `/validate` antes/depois (só nomes) | Se a segunda autorização traz só o escopo novo ou o conjunto inteiro | Item real 6 |

### 5.4 O que só um teste real fecha

Expiração de resgate `UNFULFILLED` (RT-B8, exige tempo), restauração dos limites da recompensa após `CANCELED` (RT-B9), se as nossas próprias mudanças disparam `redemption.update` (RT-B10), cancelamento com o streamer offline (RT-B11), limite por pessoa (RT-B9, RT-B12) e o conteúdo da segunda autorização (RT-B13, depende do dono).

### 5.5 O que não se prova neste ambiente e como declarar

| Item | Por quê | Declaração |
|---|---|---|
| **Prime** (item real 4) | Exige conta com assinatura Prime ativa | `NOT RUN`. Só existe o TW75-05 (fixture). O guia e a nota de versão dizem "inscritos (pagos e presenteados)"; o Prime "deve contar, não verificado em canal real". O item fica aberto na story (não é fechado) |
| **Grupo de inscritos em geral** | Exige assinatura paga ou presenteada (dinheiro) | `NOT RUN` para a classe real; só unitário/falso. O painel mantém o grupo disponível; o guia diz que não foi verificado ao vivo |
| **Streamer nas três listas** (item real 5) | A regra `user_id == broadcaster_id` (AC 14) torna a elegibilidade independente das listas, e o streamer pode não conseguir resgatar no próprio canal | `NOT RUN`; registrado como "sem impacto na correção". Se o Orion descobrir que o streamer consegue resgatar, a RT-B1 é repetida com o streamer |
| **Segunda autorização** (item real 6) | Exige o dono entrar e consentir; o plano proíbe senhas | `PENDENTE (dono)`; o Orion só tenta com sessão já autenticada. Só se fecha por observação |
| **Expiração de `UNFULFILLED`** | Exige tempo além de uma sessão | `PENDENTE (janela de observação)` com horários registrados |

Texto do veredito: o gate pode ser PASS/CONCERNS com estes itens declarados como acima; **nunca PASS com afirmação de resultado de Prime, inscritos ou expiração que não foi observado**.

## 6. Gates e critérios de saída

Ordem do gate único do `@qa`:

1. `git diff --check`; `npm run lint`; `npm run typecheck` (e `typecheck:api/infra/web`); `npm run validate:localization`, `validate:version`, `validate:port-denylist`; `npm run review:static` (OpenGrep; código de saída informado).
2. Suíte completa **3x**: `npm test` três execuções seguidas, todas verdes, nenhum teste instável (instável é FAIL do teste, não motivo de repetir).
3. PostgreSQL **3x por arquivo**: os nove arquivos (`settlement-migration`, `settlement-race`, `settlement-batch`, `settlement-deadlock`, `settlement-ops22-compat`, `settlement-deletion`, `settlement-skip-restore`, `chat-notice-outbox`, mais o arquivo da lista própria se for separado), cada um três vezes na instância descartável com migrations reais; contêineres e volumes conferidos (label, projeto) antes e depois; nada ativo tocado.
4. Navegador: os scripts E2E (configuração, lista própria, diálogo de decisão, diálogos de lote, lista pendente, widget, mais `panel-layout`) em **320, 390 e 768 px** (zoom 200% em 320), cada um 3x; contraste >= 4,5:1 medido; alvos >= 44 px; só teclado; regiões vivas como na seção 10 do `ux-plan.md`. Leitor de tela: `NOT RUN` (risco aceito pelo dono). Revisão estática de UX e validação visual são classes diferentes e relatadas à parte.
5. Localização: `validate:localization`, paridade e formas de plural para en, es e pt-BR; nenhuma chave ausente em qualquer idioma.
6. Segurança: testes canário de log verdes; varredura dos logs capturados e de `audit_logs.safe_detail` sem id de usuário, login, token, header, corpo de chat ou de resgate; textos de chat sem ids; texto genérico de erro com `referenceId`; `git log origin/main..HEAD --format=%B | grep -c 'claude[.]ai/'` é 0 e nenhuma URL de sessão em docs.
7. As 27 mutações (seção 4.6) derrubam cada uma o teste nomeado e são restauradas com `cmp`.
8. Evidência de corrida: >= 50 rodadas com espera observada por corrida, 3x.
9. Execuções reais A e B conforme a tabela acima (cada item PASS/FAIL/NOT RUN/PENDENTE).
10. Nota: nota do `@qa` **>= 9,0/10** e a nota estática do `@ux-design-expert` mantida >= 9,0 para o escopo revisado.

**O que bloqueia o commit (qualquer um):** teste falhando ou instável; mutação que sobrevive; menos de 50 rodadas com espera observada, ou corrida sem a prova de espera; um `40P01`/`40001`; qualquer AC sem evidência registrada por classe; aviso do AC 33 sem confirmação; qualquer vazamento em logs ou chat; lint, typecheck, `review:static` ou script de validação com saída diferente de zero; chave de localização ausente; texto de retenção (AC 11) ou a palavra "definitivo" (AC 20) ausente; resultado de canal real declarado sem execução; URL de sessão em qualquer lugar; nota < 9,0. Veredito: PASS / CONCERNS / FAIL / WAIVED mais a lista de grupos prontos para o `@devops` (FT-76 e FT-77 juntas).

## 7. Riscos do plano e dependências

| # | Risco | Depende de |
|---|---|---|
| P1 | A sonda da TS-20 não foi achada em `tests/` | `@dev` localiza ou escreve (primeiro, antes da FT-76) |
| P2 | A costura de teste entre o lock da fila e a escrita da intenção precisa existir no caminho de produção sem mudar o comportamento | `@dev` + `@data-engineer` combinam a costura na FT-74/FT-76 |
| P3 | Duas contas de espectador no Chrome do Orion não estão confirmadas | Dono/Orion confirmam; alternativa em 5.2 |
| P4 | Os itens reais 1, 2, 3, 6 e Prime podem ficar abertos; a DoD diz "fechados ou registrados como pendentes" | Dono aceita a declaração da 5.5 |
| P5 | O streamer pode não conseguir resgatar no próprio canal | Observação na execução real |
| P6 | Mutações editam arquivos compartilhados enquanto um `@dev` trabalha em `apps/` | Execução em série no gate; cópia completa em `.local/` caso contrário |
| P7 | Os arquivos de PostgreSQL são lentos em máquina disputada (3x de nove arquivos) | Tempo nunca é afirmado; o orçamento do gate é planejado em tempo, não elevando limites |
| P8 | Lote N=500 numa transação é medição, não garantia | `@dev` mede (R6 do data-engineer) antes de qualquer divisão |
| P9 | `moderation:read` é um escopo amplo; a RT-B7 exige o dono reconectar com ele | Dono, uma vez |
| P10 | A resposta do Twurple para inscrição Prime não está verificada | Continua suposição de fixture; declarado em 5.5 |
| P11 | Os textos de UX ("solicitado/pendente", "definitivo") são afirmados por presença de chave, não por sentido | Revisão estática do `@ux-design-expert` mais o E2E visual |

**Depende do `@dev`:** a costura, os registros Red/Green por fatia, a sonda da TS-20, as chaves de catálogo. **Do `@data-engineer`:** a revisão da migration (R2..R5, R10 da tabela de riscos deles) e os nomes das restrições usados nos PG76-08/09. **Do dono:** reconectar com os novos escopos, duas contas ou a alternativa, a segunda autorização e a aceitação das declarações da 5.5.

## 8. Esquema do gate único (v1; a divisão A/B/C da seção 10 o substitui)

As fatias seguem a ordem do architect (FT-71, FT-72, FT-73 ao lado, FT-74, FT-75, FT-76, FT-77); o `@dev` registra um checkpoint Red-depois-Green por fatia sem commitar; a execução A da FT-78 depois da FT-71..73 é opcional antes do gate e só com o dono presente; a B só depois do gate local. Um único gate do `@qa` no fim (regra do projeto), com FT-76 e FT-77 juntas.

---

# Parte B — adendo v2 (2026-11-15): CAs 34-41, pacotes P0..P8, gates A/B/C

**Autor:** `@qa` (Quinn). **Natureza:** SOMENTE PLANO. Nenhum teste foi escrito ou executado; nenhuma ação de Docker, banco, ambiente de desenvolvimento, controle de versão ou GitHub foi feita. Os IDs e nomes dos testes são o contrato; os nomes de arquivo são **prováveis**. **HIPÓTESE** marca tudo que ainda não foi verificado (por leitura, por execução ou pelo proprietário). **Entradas lidas:** [story](story.md) (CAs 34-41, pacotes P0..P8, CAs 3, 4, 5, 17, 27, 30 emendados), [po-validation](po-validation.md), [architect-design-v2](architect-design-v2.md) (3.2, 3.4, 3.10-3.13, 10, 13, 14), [data-engineer-review](data-engineer-review.md) (9.3, 9.4, 9.7, 9.8: DB-1..DB-17, N-1..N-5), [ux-plan-v2](ux-plan-v2.md) (checklist da seção 8). **Revisão 2026-11-15 (Parte B v2.1, design v2.6):** a seção 25 acrescenta o teto de reentrada configurável (`reentry_cap_hold`, `reentry_cap_counts_manual`), a `refund_origin`, a sexta causa `batch_deferred`, DB-18..DB-21 e o checklist de UX do teto (+36 testes, +11 mutações); G-B1..G-B7 estão fechadas (tabela 24.1); G-B12, G-B13 e G-B15 fechadas em 2026-11-15 (design v2.7/v2.8, decisão do proprietário); G-B14 aberta. Nada foi executado; todo ponto não verificado continua **HIPÓTESE**. **Fatos do repositório conferidos em leitura hoje:** nenhum arquivo em `tests/` ou `apps/` contém `resolveSettlementAction`, `stream_sessions`, `pending-decisions`, `settlement_policy_rev`, `onStreamOnline`, `lock_timeout`, `pg_stat_activity` ou `40P01`; a pasta de migrations tem as 13 migrations da cabeça (a última é `20261014230000_outbox_deletion_cancel_verification`, a única com `rollback.sql`); o `package.json` tem `playwright-core` e **nenhuma** dependência axe. Portanto o "Red hoje" de todo teste v2 é: módulo, coluna, rota, chave ou tabela ausente.

## 9. Base da Parte B e o que ela substitui

1. **Classes de evidência (separadas; nenhuma substitui outra).** A legenda da Parte A vale (`U`, `TW`, `PG`, `K`, `L`, `C`, `E`, `OBS`, `RT`). Mapa para as cinco classes pedidas ao gate: *unitário* = `U`, `TW`, `K`, `L`, `C`; *API/PostgreSQL 18 descartável* = `PG` e `API` (contrato HTTP contra a instância isolada com migrations reais; a nova marca `API` só indica teste de rota); *serviço real* = `SV` (nova: processos da API e do worker iniciados pela pilha de testes do compose contra a instância isolada, com a Twitch trocada pelo adaptador falso do projeto; **HIPÓTESE:** a pilha de adaptador falso usada por `compose-runtime.test.js` consegue subir o worker com os novos callbacks do EventSub; o `@dev` confirma); *navegador* = `E` (scripts Chromium do projeto, fixtures, sem Twitch); *Twitch/OBS real* = `RT` e `OBS`. Um ID = um teste nomeado; teste orientado a tabela conta uma vez e diz isso.
2. **Teste primeiro, nenhum commit antes do gate, nenhum `sleep`, relógio injetado, duas conexões reais e barreira provada em `pg_stat_activity`/`pg_locks`, 50 rodadas no mínimo, invariante relida do banco:** as regras 2-4 da Parte A valem.
3. **A Parte B substitui a Parte A nestes pontos.**
   - *Gates.* As seções 6 e 8 da Parte A descrevem um gate; a seção 10 da Parte B o divide em A, B e C (a regra do projeto é um gate por story; o design recomenda três; o Orion decide se B e C se fundem, seção 10.4).
   - *Pré-seleção.* Todo teste da Parte A que espere que "aplicar aos pendentes" pré-selecione o novo valor da política está **anulado**: o CA 36 (decisão do proprietário de 2026-11-15) diz que nenhuma opção vem pré-selecionada e o botão fica desabilitado até uma escolha explícita. **Inconsistência encontrada:** a seção 13 do design (item Policy da v2.1) e a 3.10 ainda dizem "preselects"; o CA prevalece e o `@architect` deve corrigir o texto do design.
   - *Migrations.* A M1 tem cinco colunas; o arquivo de reversão é `rollback.sql` (não `down.sql`); a M2 se divide em M2a/M2b; a ordem estrita de reversão é `M3b, M4, M3a, M3, M2, M1`.
   - *Mutações.* A Parte A tem 27 (>= 12 exigidas); a Parte B acrescenta 39 (28 na seção 21 e M56..M66 da v2.1); no gate **>= 20 das 39 são obrigatórias** (todas onde o código existir).
   - *Quantidades.* "2 x 50 rodadas" por corrida da Parte A vale; a Parte B acrescenta corridas (seções 13 e 18).
4. **IDs.** Os IDs novos levam o número do CA para ficarem disjuntos dos da Parte A (que usa o número da fatia 71-78): `U34-01`, `PG39-03`, `API38-02`, `K36-01`, `E36-01`, `TW40-02`, `SV-01`, `MG-01` (arquivo de migration), `RT-C1`.

## 10. Gates A / B / C e o mapa de pacotes

### 10.1 CA para pacote para gate (os 41)

| CA | Pacote(s) | Gate | Classes principais |
|---|---|---|---|
| 1-5, 28 | P2 | B | U, TW, PG, L, RT (rodada A) |
| 6, 7, 29 | P3 | B | U, PG, K, E, RT (rodada A) |
| 8 | P4 | B | U, K, E, OBS |
| 9-12, 30 | P5 | C | PG, U, K, E |
| 13-16 | P6 | C | U, TW, K |
| 17-21, 26, 31-33 | P7 (o P0 protege 18, 26, 32) | A (base do P0), C | U, TW, PG, K, E, RT (rodada B) |
| 22, 27 | P8 | veredito por classe | RT |
| 23, 24, 25 | todo pacote | A, B e C (cada gate confere o seu escopo) | C, L, varreduras |
| 34 | P1 (interface, tabela-verdade), P5b (armazenamento), P7 (aplicação) | A, C | U, PG |
| 35 | P5b (armazenamento e API), P7 | C | API, PG, K |
| 36 | P7 | C | API, PG, K, E |
| 37 | P5 (colunas da M2a e `CHECK`s), P7 (comportamento) | C | PG, TW, U |
| 38 | P5b (contagem), P7 (rota e histórico) | C | API, PG, K |
| 39 | P5b (`refunded_at`), P6b (janela), P7 (contagem e teto) | C; rodada C no P8 | PG, U, RT |
| 40 | P6b | C; rodada C no P8 | U, TW, PG, SV, RT |
| 41 | P7 | C | U |

### 10.2 O que cada gate roda (escopo; a bateria da seção 6 da Parte A vale para o escopo)

| Gate | Pacotes | Condição de entrada | O `@qa` roda | Rodada real depois |
|---|---|---|---|---|
| **A** (base do dinheiro) | P0, P1 | nenhuma (primeiro) | suítes financeiras existentes sem mudança e verdes (a prova de "nenhuma mudança de comportamento" do P1); testes de contrato do gate; sonda de ordem de locks com `lock_timeout` (seção 17); fixture da regra OpenGrep; as mutações do Gate A (M1, M3, M13 da Parte A e M-A1..M-A3 da seção 21) | nenhuma |
| **B** (avisos, pular/restaurar, widget) | P2, P3, P4 | Gate A verde e congelado | testes FT-71/72/73 da Parte A, M1 up/down (seção 16), limitador, i18n das chaves de aviso, widget no OBS nativo | **Rodada A** (RT-A1..A7) |
| **C** (política, grupos, dinheiro, live) | P5, P5b, P6, P6b, P7 | Gate B verde; P7 validado sobre uma base P5-P6b congelada (design 14) | tudo das seções 11-22 mais os testes FT-74..FT-77 da Parte A; a bateria completa 3x | **Rodada B** (dinheiro) e depois **rodada C** (live), com o proprietário transmitindo |

Todo gate termina com: lint, typecheck (os quatro), `validate:localization`, `validate:version`, `validate:port-denylist`, `review:static` (código de saída reportado), `npm test` completo 3x, arquivos PostgreSQL 3x cada, varredura de logs/auditoria por ids, verificação de URL de sessão. Um gate vermelho bloqueia o próximo pacote: nenhum código do P(n+1) começa sobre gate vermelho (mesma regra de "resolver bloqueios primeiro").

### 10.3 Redação do veredito

PASS / CONCERNS / FAIL / WAIVED por gate, com a impressão digital da árvore validada (AGENTS.md "Fila de gates"). Nunca PASS com afirmação de classe que não rodou. `PENDING (proprietário)` e `PENDING (janela de observação)` são resultados legítimos só para itens `RT`.

### 10.4 Recomendação sobre fundir B e C

Manter **três gates**. Motivos: o P7 precisa ser validado sobre base congelada (o teto e a política leem `capWindowStart`, `refunded_at` e as colunas da M2a); um defeito no P7 não deve segurar os avisos de P2-P4 que a pessoa streamer já pode usar; a rodada A precisa só do B. Se o Orion fundir B e C, todas as verificações dos dois gates continuam rodando, as rodadas A e B não se fundem e a ordem das rodadas reais segue A, B, C. Custo de três gates: três baterias (arquivos PostgreSQL 3x), aceito para código de dinheiro. **HIPÓTESE:** máquina disputada deixa a bateria PostgreSQL lenta; o tempo nunca é afirmado, só orçado.

## 11. Matriz: CA 34-41 -> caso de teste -> classe -> pacote -> gate

"Red hoje": o objeto não existe.

### CA 34 — política de cinco ajustes (P1, P5b, P7; gates A, C)

| ID | Classe | Teste | Pct | Gate | Red hoje |
|---|---|---|---|---|---|
| U34-01 | U | Tabela-verdade de `resolveSettlementAction` (seção 12; orientada a tabela, conta uma vez; cada linha nomeada no relatório) | P1 | A | Função ausente |
| U34-02 | U | Verificação de propriedade sobre todo o domínio (finito): o resultado está sempre em `{refund, fulfill, wait, rule}`; se algum ajuste aplicável é `wait` ou os ajustes divergem então `wait`; `refund`/`fulfill` só quando todos os aplicáveis dizem o mesmo; o teto nunca produz `fulfill`; não membros e outros eventos dão `rule` | P1 | A | Ausente |
| U34-03 | U | O provedor constante do P1 (S1 `legacy`, `wait` nos demais) mantém todo teste financeiro existente verde e não muda comportamento | P1 | A | n/a |
| PG34-01 | PG | M3 up em dados semeados: padrões, `relfilenode` inalterado, `atthasmissing` verdadeiro, toda fila existente lê `legacy`, checksum das colunas pré-existentes igual | P5b | C | Colunas ausentes |
| PG34-02 | PG | Os `CHECK`s recusam: valor desconhecido de cada S1..S4; teto 0 e 21 (aceita `NULL`, 1, 20); janela 0 e 73 (aceita 1, 72, padrão 12); cada recusa é uma asserção própria | P5b | C | Ausente |
| PG34-03 | PG | Uma fila inserida depois da M3 lê `legacy`; depois da migration M3b lê `wait`; clonar e reiniciar escrevem o padrão vigente, nunca copiam `legacy` (DB-3) | P5b, P7 | C | Ausente |
| PG34-04 | PG | `rollback.sql` da M3: a guarda recusa após uso simulado (uma linha com `refunded_at`, cada estado pendente, uma fila `refund_on_end`) e passa antes; após a M3-down o checksum das colunas pré-existentes é igual ao original (seção 16) | P5b | C | Sem arquivo |
| PG34-05 | PG | As linhas de auditoria do resolvedor trazem id do ajuste, origem e `policyRev`, sem identificador de usuário (varredura de log/auditoria) | P7 | C | Ausente |

### CA 35 — edição da política, `expectedPolicyRev`, `legacy` sem volta (P5b, P7; gate C)

| ID | Classe | Teste | Pct | Gate | Red hoje |
|---|---|---|---|---|---|
| API35-01 | API | `expectedPolicyRev` velho -> `SETTLEMENT_POLICY_STALE`, 409, corpo com a rev atual; nada gravado | P5b | C | Rota ausente |
| API35-02 | API | S1 diferente de `legacy` antes do P7 -> `SETTLEMENT_MODE_UNAVAILABLE`, motivo `policy_not_active`; depois de sair de `legacy`, `legacy` -> motivo `legacy_not_selectable`; o `GET` devolve `legacySelectable`; um corpo que mantém `legacy` numa fila `legacy` é aceito | P5b, P7 | C | Ausente |
| API35-03 | API | Edição recusada em filas `deleting` e arquivadas (código estável) | P5b | C | Ausente |
| API35-04 | API | Ligar `refund_on_end` com grupos numa fila `legacy` converte S1 em `wait` no mesmo salvamento, auditado, e diz isso na resposta | P7 | C | Ausente |
| API35-05 | API | Auditoria `queue.settlement_policy_changed`: valores antes/depois de conjunto fechado, origem, sem id de usuário, sem rótulo | P5b | C | Ausente |
| PG35-01 | PG | Duas edições concorrentes (barreira no lock da fila): exatamente uma vence, a perdedora recebe `SETTLEMENT_POLICY_STALE`; a rev incrementa no **mesmo** `UPDATE` dos valores (revisão do banco: sem ler-depois-gravar); 50 rodadas | P5b | C | Ausente |
| PG35-02 | PG | Um evento durante uma edição vê uma rev inteira (antiga ou nova), nunca mistura; o valor é lido dentro do lock da fila (`loadSettlementPolicy` chamado depois do lock) | P7 | C | Ausente |
| PG35-03 | PG | Mudar a política não toca linhas já `awaiting_choice`, `held_for_service` ou `check_group` (checksum das linhas igual) | P7 | C | Ausente |
| PG35-04 | PG | Um snapshot de confirmação de limpar/excluir tirado na rev N fica velho ao confirmar quando a rev é N+1 | P7 | C | Ausente |
| API35-06 | API | **Ponto aberto N-5:** S2..S5 alterados antes do P7 ou recusados com `SETTLEMENT_MODE_UNAVAILABLE` ou guardados como inertes e sinalizados pelo `@ux`. Testar os dois ramos atrás de uma bandeira até o `@architect`/`@po` decidirem | P5b | C | n/a (decisão pendente) |

### CA 36 — "Decidir pelos N em espera", sem pré-seleção (P7; gate C)

| ID | Classe | Teste | Pct | Gate | Red hoje |
|---|---|---|---|---|---|
| API36-01 | API/PG | `choice` ausente, vazio ou inválido é recusado e **nada é gravado** (contagens de linhas, outbox e auditoria inalteradas); não há padrão | P7 | C | Ausente |
| PG36-01 | PG | Cada aplicação grava `settlement.choice_recorded` com origem `streamer_bulk`; uma escolha `refund` da pessoa streamer acima do teto passa e conta (o teto não a bloqueia) | P7 | C | Ausente |
| U36-01 | U/C | Varredura estática: nenhum agendador, timer ou job lê ou decide `awaiting_choice`/`check_group` (O-7: sem prazo) | P7 | C | n/a |
| K36-01 | K | Ao abrir nenhum rádio está marcado e o botão de confirmar fica desabilitado até uma escolha explícita; só a opção que coincide com o ajuste leva a etiqueta "Coincide com o seu ajuste" | P7 | C | Ausente |
| E36-01 | E | Script de navegador (classe separada de K36-01): abrir, confirmar desabilitado, escolha por teclado, confirmar, contagem de aplicadas vs. puladas (velhas) | P7 | C | Ausente |

### CA 37 — `awaiting_choice`, causa, `settled_external` (P5 colunas, P7 comportamento; gate C)

| ID | Classe | Teste | Pct | Gate | Red hoje |
|---|---|---|---|---|---|
| PG37-01 | PG | `CHECK`s de estado (regressão DB-1): `awaiting_choice` aceita decisões `NULL` e `not_eligible` e é recusado com remoto diferente de `UNFULFILLED`; `held_for_service` recusado sem `eligible` | P5 | C | Ausente |
| PG37-02 | PG | **DB-12 (forma estrita, G-B4 fechada):** `CHECK` da causa com seis códigos (v2.6, ver PG37-09): cada código aceito só com `awaiting_choice`; código desconhecido recusado; qualquer código com outro estado recusado; `awaiting_choice` com causa `NULL` **recusado** | P5 | C | Ausente |
| PG37-03 | PG | Matriz de saída: `awaiting_choice` -> `none`, -> `intent_recorded`, -> `settled_external` falham se a causa não for limpa no mesmo comando | P7 | C | Ausente |
| PG37-04 | PG | **DB-13:** `settled_external` sem `settled_external_at` e `settled_external_at` em outro estado são ambos recusados; alterar `settled_external_at` depois de definido é recusado pelo gatilho de guarda | P5 | C | Ausente |
| PG37-05 | PG | Absorvente: `intent_recorded` e `settled_external` não saem; um pedido local posterior responde `SETTLEMENT_ALREADY_DECIDED` com o resultado remoto e não grava nada (contagens inalteradas) | P7 | C | Ausente |
| PG37-06 | PG | Corrida com barreira: liquidação externa (`FULFILLED` ou `CANCELED` observado) x escolha local, 50 rodadas, nas duas ordens: zero ou uma tarefa financeira, nunca duas; `settled_external` não tem linha de outbox; nenhum `40P01`/`40001` | P7 | C | Ausente |
| TW37-01 | TW | Twurple falso: remoto `FULFILLED` e `CANCELED` com a linha em `held_for_service`, `awaiting_choice` ou `check_group` geram `settled_external` no comando que grava `remote_status` | P7 | C | Ausente |
| PG37-07 | PG | A relistagem do worker de exclusão com uma linha `awaiting_choice` nunca cria cancelamento nem fulfill (mutação M35); uma fila `legacy` ainda cancela o seu resíduo; uma fila não `legacy` grava `awaiting_choice` (`legacy_residue`) | P7 | C | Ausente |
| U37-01 | U | Precedência da causa: o teto só é lido quando a ação já é devolução; a política `wait` dá `policy_wait` e o teto não é lido (espião na porta do teto) | P7 | C | Ausente |
| PG37-08 | PG | `settled_external` e `check_group` não criam linha de `chat.notice` e nenhuma chave de catálogo existe (teste de chave negativa, seção 20) | P7 | C | Ausente |
| MG-04 | PG | M2a sozinha e depois M2b: cinco constraints `convalidated`; M2-down remove colunas, índices, constraints, gatilho e função (checksum igual); M2a-down funciona quando a M2b nunca foi aplicada | P5 | C | Sem arquivos |

### CA 38 — contagem de pendentes, rota, histórico (P5b contagem, P7 rota; gate C)

| ID | Classe | Teste | Pct | Gate | Red hoje |
|---|---|---|---|---|---|
| API38-01 | API | `GET /api/state`: `pendingDecisions {awaitingChoice, checkGroup, total}` por fila; `held_for_service` não é contado; campo ausente é *desconhecido* (contrato do cliente: não mostra nada, nunca `0`) | P5b | C | Ausente |
| API38-02 | API | Formato da rota: `items` (mais antigo primeiro, <= 200, campos e `capDetail` só para `reentry_cap`), `history` (as 20 últimas `settled_external`, mais nova primeiro, desempate `redemption_id DESC`, DB-14); só sessão do painel (sem sessão -> 401, qualquer outra credencial recusada); atende filas arquivadas e `deleting`; linhas com `queue_id NULL` nunca aparecem | P7 | C | Ausente |
| PG38-01 | PG | 201 linhas pendentes -> `items` 200, `total` 201, `truncated` verdadeiro (DB-16: `total` é contagem real, não `items.length`); histórico de 25 linhas devolve 20 e, com 25 linhas no mesmo milissegundo, a ordem é determinística | P7 | C | Ausente |
| PG38-02 | PG | As contagens de `GET /api/state` para N filas vêm de **uma consulta agrupada** (o contador de consultas não cresce com N; **HIPÓTESE:** eventos de consulta do Prisma podem ser contados no teste, DB-15) | P5b | C | Ausente |
| PG38-03 | PG | **EXPLAIN em volume sintético** (seção 18): lista de pendentes, contagem, histórico | P7 | C | Ausente |
| K38-01 | K | Selo no cartão da fila e na navegação: texto oculto lido como "N decisões em espera"; requisição com falha não mostra nada, nunca `0`; `alert` de erro + "Tentar de novo" | P5b, P7 | C | Ausente |
| C38-01 | C | Campos da resposta: nenhum dado pessoal além do `displayName` como a tela da fila já mostra; varredura de log limpa | P7 | C | Ausente |

### CA 39 — teto de reentrada por live (P5b, P6b, P7; gate C; rodada C)

| ID | Classe | Teste | Pct | Gate | Red hoje |
|---|---|---|---|---|---|
| PG39-01 | PG | **Corrida do teto** (seção 13): devolução automática x devolução manual da pessoa streamer no limite, nas duas ordens, 50 rodadas; nunca duas devoluções automáticas acima do orçamento; v2.6: oito células (`after_n`/`at_n` x `counts_manual` true/false x duas ordens), seção 25.4 | P7 | C | Ausente |
| PG39-02 | PG | Teto `NULL` nunca bloqueia; duas pessoas diferentes no limite não se bloqueiam; bordas da janela (igual ao início, 1 ms antes, horas de reserva); lote em conjunto (`user_id = ANY`) igual ao resultado linha a linha | P7 | C | Ausente |
| PG39-03 | PG | `refunded_at` é gravado no mesmo comando da intenção `redemption.cancel`, só para fim de serviço, política `refund` e escolha `refund` da pessoa streamer, com `refund_origin` gravada no mesmo comando (PG39-10); um cancelamento de recusa não grava nenhuma das duas colunas | P7 | C | Ausente |
| PG39-04 | PG | Uma devolução cuja tarefa termina `failed` ou `resolved_manual` (mesmo com `remoteConfirmed:false`) continua contando (DB-5); nenhum crédito devolvido | P7 | C | Ausente |
| PG39-05 | PG | O worker financeiro não grava nada em `redemptions` por causa do teto: um **gatilho de comando só de teste** conta comandos em `redemptions` durante uma execução do worker (a seção 14 explica por que não só `pg_stat_*`) | P7 | C | Ausente |
| PG39-06 | PG | Acima do teto: o resgate vai para `awaiting_choice` (`reentry_cap`) e **nunca** para fulfill; uma devolução da pessoa streamer pelo painel acima do teto funciona e conta | P7 | C | Ausente |
| PG39-07 | PG | Reserva com relógio falso: `none_known`, `revoked`, `stale` (aberta > 48 h, valor **HIPÓTESE**) usam a janela em horas e registram o motivo; o teto nunca vira ilimitado; a auditoria `settlement.reentry_cap_hit` traz `windowKind`, sem ids | P7 | C | Ausente |
| PG39-08 | PG | Uma devolução feita sem live conta contra a **última** sessão (Q-3); uma devolução dentro de uma lacuna de fusão conta; uma nova live fora da janela de fusão dá orçamento novo | P6b, P7 | C | Ausente |
| PG39-09 | PG | Job que zera `refunded_at` (72 h): horizonte `LEAST(now - 72 h, início da última sessão)`; nada dentro da última sessão é zerado; lote com `SKIP LOCKED` enquanto outra transação segura uma linha; o caminho do `offline` nunca o chama (DE 9.4 item 3) | P7 | C | Ausente |
| U39-01 | U | A porta `capWindowStart` é uma reserva constante até o P6b (forma do P1) e devolve `{kind, start, reason}` | P1, P6b | A, C | Ausente |
| RT-C7 | RT | Teto no canal real (seção 22) | P8 | veredito por classe | n/a |

**Discrepância com a story (para o `@po`, não bloqueia):** a evidência do CA 39 diz "dois resgates concorrentes no limite: um passa, outro espera". Com o único `entries_active_user_per_queue` uma pessoa não pode ter duas entradas ativas numa fila, então duas devoluções *automáticas* da mesma pessoa não correm entre si. A corrida real é automática x manual (DE 9.4 item 2), que o PG39-01 testa. O plano considera a frase do CA satisfeita pelo PG39-01 mais o caso de duas pessoas do PG39-02 e pede ao `@po` que reescreva a linha de evidência.

### CA 40 — sessão de live (P6b; gate C; rodada C)

| ID | Classe | Teste | Pct | Gate | Red hoje |
|---|---|---|---|---|---|
| U40-01 | U | Redutor puro `applyLiveEvent`: `online` duplicado; `offline` duplicado; `offline` antes do `online` (id desconhecido: nada gravado, uma reconciliação); `offline` do id antigo depois do `online` do novo; dois `online` de ids diferentes; tipo `rerun` (e os demais tipos não `live`); borda da janela de fusão igual, +1 s, -1 s (inclusiva); `online` tardio de uma live mais antiga (ignorado e registrado, nenhum `stream_session_id` guardado muda); `online` com outra linha aberta (linha antiga fechada antes) | P6b | C | Ausente |
| U40-02 | U/C | Estático: nenhum módulo do código de live importa o repositório de filas (LIVE-1) | P6b | C | n/a |
| U40-03 | U | Ligação do runtime com o `listenerFactory` injetável: callbacks protegidos por `broadcasterId`, sem depender de `redemptionsEnabled`, erros isolados pelo `dispatch`; desconexão falsa seguida de ready dispara `reconcileLiveSession('reconnect')` **mesmo com o canal inelegível** | P6b | C | Ausente |
| U40-04 | U | A revogação de `stream.online`/`stream.offline` pega o ramo antecipado: marca a bandeira "eventos de live indisponíveis", publica o novo código fechado de `degraded`, **não** marca `reconnect_required` e não toca o chat nem o estado das recompensas; a bandeira limpa após nova inscrição e uma reconciliação boa | P6b | C | Ausente |
| TW40-01 | TW | `getCurrentStream`: live, `null`, 401, 429, 5xx, timeout (`unknown`, nunca fecha) | P6b | C | Ausente |
| TW40-02 | TW | Um `null` logo após o `online` não fecha; duas negativas consecutivas separadas pelo atraso de confirmação (injetado, 30 s proposto) fecham; um erro entre elas zera a contagem | P6b | C | Ausente |
| PG40-01 | PG | Chave composta: duas conexões entregam o mesmo `online` (barreira): uma linha, uma sessão, nenhum erro | P6b | C | Ausente |
| PG40-02 | PG | Dois ids **diferentes** de `online` ao mesmo tempo: exatamente uma linha aberta; a perdedora espera e depois fecha/funde; `23505` nunca sem tratamento; ordem fecha-depois-insere (DB-7) | P6b | C | Ausente |
| PG40-03 | PG | `online` x `offline` de um id ao mesmo tempo, nas duas ordens: fechada, `ended_at >= started_at`; `offline` de id desconhecido não grava nada; casos de fusão (queda e retorno dentro e fora da janela; lacuna maior que a janela abre nova sessão; linha ainda aberta com outro id é fechada como `reconciled`) | P6b | C | Ausente |
| PG40-04 | PG | **Teste de mutação LIVE-1** (seção 14) | P6b | C | Ausente |
| PG40-05 | PG | Catálogo: nenhuma chave estrangeira, gatilho, regra ou view em `stream_sessions`; os CHECKs recusam id de tamanho 0 e 65, `ended_at < started_at`, `source` desconhecido | P6b | C | Ausente |
| PG40-06 | PG | Locks: o lock do canal é `pg_advisory_xact_lock(classe, hashtext(id))` (dois inteiros); `pg_locks` mostra espaço de chaves distinto do `lockQueue` e do lock de conta `1868787013`; a constante de classe difere de `1868787013`; um lock de canal retido nunca bloqueia `lockQueue` | P6b | C | Ausente |
| PG40-07 | PG | Retenção: sessões inteiras com o último `ended_at` com mais de 90 dias são removidas (valor **HIPÓTESE**), nunca parte de uma sessão, nunca a mais recente, nunca uma com linha aberta | P6b | C | Ausente |
| PG40-08 | PG | Linha `live_session_policy`: ausente significa 10; faixa 1-60 aplicada no código (e pelo `CHECK` opcional com `CASE` se adotado); uma mudança vale só para eventos recebidos depois dela | P6b | C | Ausente |
| PG40-09 | PG | M4 up/down com linhas existentes nas outras tabelas intactas (checksums); a M4-down deixa o teto na reserva | P6b | C | Ausente |
| SV-01 | SV | O worker sobe com as duas novas inscrições no adaptador falso; `GET /api/state` devolve `liveSession {state, startedAt, endedAt, source, capWindow, fallbackReason}`; ausente antes do P6b | P6b | C | Ausente |
| RT-C1..C8 | RT | Rodada C (seção 22) | P8 | veredito por classe | n/a |

### CA 41 — `concluir` por papel (P7; gate C)

Testes na seção 15 (U41-01..U41-08).

### CAs emendados 3, 4, 5, 17, 27, 30 (2026-11-15)

- CA 3 (recusa): U71-04/05, PG71-01, RT-A3 da Parte A valem; acrescenta-se **C-05** (estático): as chaves de motivo de recusa e as de devolução por grupo continuam disjuntas (estende o C-02).
- CA 4 (limitador): um novo tipo de aviso `waiting_decision` passa pelo mesmo limitador (U71-06..10 da Parte A); `settled_external`, `check_group`, início/fim de live e o acerto do teto **não** criam mensagem (testes negativos, seção 20).
- CA 17: U76-02/04/05, TW76-03, RT-B1/B2 da Parte A valem com as linhas S2/S3 da seção 12 acrescentadas.
- CA 27: RT-B9/B12 da Parte A valem; o teto (CA 39) é o único limite que o produto aplica e só faz uma devolução esperar: PG39-06. (v2.6: o teto é configurável por fila, e "no máximo N devoluções por pessoa por live" vale só para `after_n`; C39-01 e seção 25.)
- CA 30: U74-04 da Parte A vale (a API recusa `refund_on_end` antes do P7); o P7 levanta a recusa e a recusa de S1 na mesma entrega: **API30-01** afirma que as duas recusas somem juntas e não antes.

## 12. Tabela-verdade da política S1..S5 (`U34-01`)

Domínio: uma fila em `refund_on_end` com pelo menos um grupo ligado, recompensa criada pelo produto. `rule` = a regra de hoje pelo gate (sem política). "Chave" = a chave de devolução correspondente da fila. As linhas são o contrato; o `@dev` não pode encolhê-las e o `@qa` as estende se o código acrescentar um evento.

**Origem das linhas:** design 3.4 e 3.10. **Ambiguidade fechada (G-B2, design 3.14 B, v2.5):** a coluna de membro da 3.4 prevalece; o S1 rege só não membros. As linhas 7, 8 e 8b abaixo estão confirmadas e deixam de ser HIPÓTESE.

### 12.1 S1 — uma entrada fecha com a chave de devolução **desligada** (no-show painel/timer, remoção chamada, `sair` chamada)

| # | Pessoa | Chave | S1 | Estado do teto S5 | `action` / estado esperado |
|---|---|---|---|---|---|
| 1 | não membro | ligada | qualquer | qualquer | `rule` (a chave devolve; S1 não é consultado) |
| 2 | não membro | desligada | `legacy` | qualquer | `rule`: nada solicitado; resíduo legado possível (a relistagem da exclusão pode devolver, C8) |
| 3 | não membro | desligada | `wait` | qualquer | `wait` -> `awaiting_choice`, causa `policy_wait`, teto não lido |
| 4 | não membro | desligada | `fulfill` | qualquer | `fulfill`; teto não lido |
| 5 | não membro | desligada | `refund` | abaixo do teto ou `NULL` | `refund` (`redemption.cancel`), `refunded_at` gravado na intenção |
| 6 | não membro | desligada | `refund` | no teto/acima | `wait` -> `awaiting_choice`, causa `reentry_cap` (nunca `fulfill`) |
| 7 | membro, no-show no painel | qualquer | qualquer | qualquer | `Perguntar`: `SETTLEMENT_CHOICE_REQUIRED` (não é política; nem o S1 nem a chave são lidos; confirmado) |
| 8 | membro, timer / `sair` / `remover` de moderador | qualquer | qualquer | qualquer | `awaiting_choice`, causa `cannot_ask`, sem dinheiro (confirmado) |
| 8b | membro com decisão `unknown`, qualquer evento de fechamento | qualquer | qualquer | qualquer | `check_group` (confirmado, design 3.14 B) |

### 12.2 S2 — conclusão direta `called -> completed` (painel, ou chat da pessoa streamer)

| # | Pessoa | S2 | Teto | Esperado |
|---|---|---|---|---|
| 9 | não membro | qualquer | qualquer | `rule`: fulfill (hoje, C2); S2 não consultado |
| 10 | membro | `wait` | qualquer | `awaiting_choice`, `policy_wait` |
| 11 | membro | `refund` | abaixo/`NULL` | `refund` (conta como fim do serviço, causa `group_refund_on_end`) |
| 12 | membro | `refund` | no teto/acima | `awaiting_choice`, `reentry_cap` |
| 13 | membro | `fulfill` | qualquer | `fulfill`; teto não lido |
| 14 | membro, `check_group` | qualquer | qualquer | continua `check_group` (CA 21) |

### 12.3 S2 x S3 — `concluir` de moderador pelo chat num membro

O S3 não tem `fulfill`. O resultado de uma conclusão direta de moderador aplica os **dois** ajustes; num `concluir` de moderador sobre um membro retido `in_progress` só o S3 vale (linha 148 da 3.4).

| # | Evento | S2 | S3 | Esperado |
|---|---|---|---|---|
| 15 | direta `called -> completed` | `wait` | `wait` | `wait` |
| 16 | direta | `wait` | `refund` | `wait` (divergem) |
| 17 | direta | `refund` | `wait` | `wait` (divergem) |
| 18 | direta | `refund` | `refund` | `refund` (o teto vale) |
| 19 | direta | `fulfill` | `wait` | `wait` (divergem) |
| 20 | direta | `fulfill` | `refund` | `wait` (divergem: nunca o mais generoso) |
| 21 | `in_progress -> completed`, membro retido | n/a | `wait` | `awaiting_choice`, `policy_wait` (o S3 substitui a devolução do fim do serviço para o moderador) |
| 22 | idem | n/a | `refund` | `refund` (o teto vale) |
| 23 | `concluir` da própria pessoa streamer no chat | qualquer | n/a | age como o painel (Q-1); conclusão direta segue o S2, membro retido segue a devolução do fim do serviço |

### 12.4 S4 — `limpar` pelo chat

| # | Pessoa | S4 | Esperado |
|---|---|---|---|
| 24 | não membro | qualquer | `rule`: devolução (hoje) |
| 25 | membro | `wait` | `awaiting_choice`, `chat_clear`, contagens na resposta |
| 26 | membro | `refund` | `refund` (o teto vale; acima -> `reentry_cap`) |
| 27 | membro | `fulfill` | `fulfill` |
| 28 | limpar no painel | qualquer | não é o S4: escolha em lote do diálogo (CA 26) |

### 12.5 S5 — o teto (só sobre uma ação que já é `refund`)

| # | Contagem na janela | Teto | Esperado |
|---|---|---|---|
| 29 | qualquer | `NULL` | a devolução passa, nunca bloqueada |
| 30 | teto - 1 | N | passa (esta devolução é a N-ésima) |
| 31 | teto | N | `awaiting_choice` (`reentry_cap`) com `after_n` (`count >= budget`; igualdade declarada pelo CA 39 e pela decisão do proprietário, deixa de ser HIPÓTESE); com `at_n` o orçamento é N-1, ver seção 25.1 |
| 32 | qualquer | N, ação `fulfill`/`wait` | teto não lido |
| 33 | qualquer | N, escolha `refund` da pessoa streamer no painel | nunca bloqueada, e conta |
| 34 | qualquer | N, cancelamento de recusa (pausada/fechada/duplicada) | não conta, não é bloqueado |
| 35 | qualquer | N, devolução anterior `failed`/`resolved_manual` | continua contando |

### 12.6 Todo o resto

Pular, restaurar, reordenar, chegada, recusa na importação, entradas manuais, filas em `fulfill_on_start`, filas sem grupo, recompensas não criadas pelo produto: `rule`, sem política. Uma escolha no painel, uma restauração ou um pulo nunca cria `awaiting_choice`. Cada linha afirma também os campos de auditoria (`source`, id do ajuste, `policyRev`) e a **ausência** de qualquer identificador de usuário.

## 13. Corrida do teto de reentrada (`PG39-01`, arquivo `ops31-cap-postgres.test.js`)

**Invariante:** as devoluções automáticas de uma pessoa numa fila dentro da janela nunca passam do teto, em qualquer intercalação; uma escolha da pessoa streamer nunca é bloqueada.

| Corrida | Fixture | As duas ordens devem ser observadas | Invariante relida |
|---|---|---|---|
| R-cap-1 automática x manual | teto 1; a pessoa U tem uma entrada antiga `awaiting_choice` E0 e uma entrada retida E1; "fim de serviço de E1" x "a pessoa streamer devolve E0" | sim | Ou E1 devolve e a escolha de E0 também vai (nunca bloqueada), ou a escolha chega primeiro e E1 vira `awaiting_choice` (`reentry_cap`); nunca duas devoluções automáticas |
| R-cap-2 duas pessoas | teto 1; U e V cada uma no limite | n/a | nenhuma bloqueia a outra; cada uma exatamente uma devolução automática |
| R-cap-3 edição de política x devolução | teto subido/baixado por `PUT` enquanto uma devolução automática roda | sim | a devolução vê uma rev inteira (antiga ou nova); a perdedora do lock espera; contagens consistentes |
| R-cap-4 teto `NULL` | sem teto | n/a | nenhuma linha espera pelo teto |
| R-cap-5 lote em conjunto | confirmação em lote com `user_id = ANY` sobre vários membros de várias filas de uma pessoa | n/a | igual ao resultado linha a linha |

(v2.6: a matriz completa de oito células, com `counts_manual` true e false e as duas retenções, é a seção 25.4; a R-cap-1 é o par `after_n` x `true`.) Mecânica: seção 4.2 da Parte A (barreira provada por `pg_stat_activity` junto com `pg_blocking_pids`, laço limitado, uma rodada em que B nunca foi vista esperando é rodada falha), 50 rodadas por corrida, ids novos por rodada, executada 3x. **Mutações:** M38 (teto lido fora do lock), M37 (contado na confirmação), M39 (acima do teto vira fulfill), M40 (devolução falha devolve crédito). Nenhum `40P01`/`40001`/500 na perdedora.

## 14. Teste de mutação LIVE-1 (`PG40-04`, arquivo `ops31-live-session-postgres.test.js`)

**Afirmação a refutar:** o fim ou o início de uma live nunca altera filas, entradas nem resgates (invariante do proprietário, 2026-11-15).

1. **Semear** um banco descartável pelas migrations reais: filas (ativa, arquivada, `deleting`, em cada modo de liquidação), `entries` em todo status (**a tabela é `entries`, não `queue_entries`**, DB-7), `redemptions` em todo estado de liquidação e status remoto, linhas do outbox financeiro em todo status, `audit_logs`, `settings`. Os jobs de zerar e de remover ficam **desligados**.
2. **Fotografar antes**, para `entries`, `redemptions`, `queues`, o outbox financeiro e `audit_logs`: contagem de linhas e `md5` do `row_to_json` ordenado.
3. **Contadores.** Instalar, só no banco descartável e **não** em `stream_sessions`, gatilhos `AFTER INSERT OR UPDATE OR DELETE ... FOR EACH STATEMENT` que incrementam uma tabela de contadores. Motivo: um checksum não percebe um `UPDATE` sem efeito, e o momento de `pg_stat_force_next_flush()` no PostgreSQL 18 é **HIPÓTESE**; os gatilhos por comando disparam também para comando de zero linhas, então são estritamente mais rigorosos. `n_tup_ins/upd/del` após `pg_stat_force_next_flush()` é lido como testemunha **secundária** e reportado como tal, nunca como a única. Um controle positivo grava uma linha em cada tabela e precisa mover os contadores (senão o arnês está quebrado e o teste falha).
4. **Conduzir** o código de live (as funções reais, não SQL): `online`, `online` duplicado, `offline`, um `offline` que chega depois de um novo `online`, um fechamento por reconciliação (duas negativas), um novo `online` dentro e fora da janela de fusão, um `online` tardio de live mais antiga, um `rerun`, uma revogação.
5. **Afirmar** após cada passo e ao final: contagens, checksums e contadores das cinco tabelas idênticos ao retrato; `stream_sessions` mudou como as regras dizem; nenhuma linha de auditoria; nenhuma linha de outbox; os eventos de log não têm título, login nem id de espectador.
6. **Gêmeo estático** `U40-02`: nenhum import do repositório de filas nos módulos de live.
7. **Controles de mutação** (precisam reprovar o teste, seção 21): M43 faz o handler do `offline` atualizar `queues`; M43b faz o fechamento da reconciliação tocar `entries`. Se o teste passar com uma violação deliberada, ele é rejeitado.

Mais as asserções de catálogo `PG40-05` (sem FK/gatilho/regra/view em `stream_sessions`) **antes** de os gatilhos de teste serem instalados.

## 15. `concluir` por papel (`U41-01..08`, testes do `chat-command-handler`)

O handler lê `authorized.role` (`chat-handler.mjs:356`, `:369`) e sempre chama `reply(...)` depois do `transitionEntry` (`:224-228`). Casos (orientados a tabela por linha, cada linha nomeada):

| ID | Autor | Entrada | Ajustes | Transição / resposta esperada |
|---|---|---|---|---|
| U41-01 | pessoa streamer | membro retido `in_progress` | qualquer | devolução do fim do serviço, exatamente como o painel (Q-1) |
| U41-02 | moderador | membro, `called` (direta) | S2 `wait`, S3 `wait` | `awaiting_choice`; resposta `chat.queue.service_completed` (neutra); nunca `complete_pending`, nunca mensagem de pontos |
| U41-03 | moderador | membro, `called` | S2 `refund`, S3 `refund` | devolução; resposta neutra |
| U41-04 | moderador | membro, `called` | S2 `fulfill`, S3 `refund` | divergem -> `wait`; resposta neutra |
| U41-05 | moderador | membro retido `in_progress` | S3 `wait` | `awaiting_choice`, `policy_wait`; `service_completed` |
| U41-06 | pessoa streamer | membro, `called` (direta) | S2 `fulfill` | segue o S2 (equivalente ao painel) |
| U41-07 | moderador | não membro | qualquer | regra de hoje (o fulfill existe); `financialDecision` como hoje, `complete_pending` só para `request_fulfill` |
| U41-08 | qualquer autor do chat | qualquer | qualquer | uma escolha (`refund`/`no_refund`) nunca é aceita do chat; o comando responde a família genérica "use o painel" ou é desconhecido |
| C41-01 | estático | catálogo | n/a | a chave descartada `chat.queue.points_waiting` não existe em nenhum idioma |

Também: o `financialDecision` devolvido pelo P7 para o S3 não é `request_fulfill` (contrato sobre o valor de retorno). Pessoa streamer e moderador se distinguem só por `authorized.role`; um teste muda o papel sem mudar o id do usuário.

## 16. Migrations, `rollback.sql` e a ordem de reversão (`ops31-migrations-postgres.test.js`, `MG-01..MG-12`)

Vale para os Gates B (M1) e C (M2a, M2b, M3, M3a, M4, M3b). Sempre PostgreSQL 18 isolado com migrations reais; nunca o volume de desenvolvimento.

| ID | Teste |
|---|---|
| MG-01 | Semear a cabeça atual (13 migrations); registrar por tabela a contagem de linhas e o `md5` do `row_to_json` ordenado das colunas pré-existentes |
| MG-02 | Para a frente, uma migration por vez, na ordem dos pacotes `M1, M2a, M2b, M3, [M3a], M4, M3b`: após cada uma, checksum pré-existente inalterado, `pg_constraint.convalidated` verdadeiro, padrões como projetado, `prisma migrate diff` (migrations -> modelo de dados) vazio |
| MG-03 | Sem reescrita: `pg_class.relfilenode` de `queues`, `redemptions`, `outbox` idêntico em torno de M1/M2/M3; `atthasmissing` verdadeiro nas colunas de padrão constante |
| MG-04 | M2a sozinha e depois M2b; M2a-down com a M2b não aplicada; `CHECK`s de causa/`settled_external_at`/estado (ver PG37-01..04) |
| MG-05 | Matriz de isolamento: M1, M4 sozinhas; M2 sozinha; M3 sem M2; M3 depois da M2 |
| MG-06 | Cada `CHECK` recusa sua linha inválida (conjuntos fechados, faixas, forma da decisão, `held_for_service` exige `eligible`, `awaiting_choice` aceita `NULL`/`not_eligible`, `settled_external` exige `expected_status IS NULL` e remoto terminal, `ended_at >= started_at`, `refunded_at` exige `CANCELED` se a M3a existir) |
| MG-07 | Gatilho de guarda: `intent_recorded` e `settled_external` absorventes; decisão conclusiva imutável; uma atualização só de `refunded_at` não o dispara; `settled_external_at` imutável depois de definido |
| MG-08 | **Reversão em ordem estrita inversa** `M3b, M4, M3a, M3, M2, M1` no banco semeado após uso simulado: cada guarda recusa depois do uso (linhas devolvidas, estados pendentes, lista própria não vazia, fila `refund_on_end`) e passa antes; após cada reversão o checksum das colunas pré-existentes é igual ao original; M2b-down e M3a-down são no-op; M3b-down roda primeiro após o P7 |
| MG-09 | M1-down: mapeia `expired` para `cancelled` com `last_error = 'notice_expired_rolled_back'` e cancela `chat.notice` pendente/retry/processing; não sobra linha `expired` nem aviso pendente; uma fixture de "worker antigo" (`CHECK` de status sem `expired`) não encontra tipo de operação desconhecido |
| MG-10 | M4-down remove a tabela; o teto passa a usar as horas de reserva (asserção de comportamento por `capWindowStart`); a chave inerte de `settings` pode ficar |
| MG-11 | **Sobe-desce-sobe:** cada migration sobe, `rollback.sql`, sobe de novo: esquema igual ao da primeira subida (diff de `pg_dump --schema-only` vazio); `_prisma_migrations` linear depois de `prisma migrate resolve --rolled-back` (**HIPÓTESE** sobre o fluxo exato de comandos do Prisma 6.19.3; o `@data-engineer` confirma, o `@qa` roda na instância descartável e registra a saída real) |
| MG-12 | Comportamento de locks: com `log_lock_waits` e um escritor concorrente, registrar os níveis de lock e o tempo que cada migration os segura em `queues`, `redemptions`, `outbox`; comparar a M2 em um arquivo com M2a/M2b; registrar as contagens de linhas usadas; toda migration roda com `lock_timeout`/`statement_timeout` e um escritor concorrente não a trava em deadlock. **HIPÓTESE:** o Prisma roda um arquivo como uma transação, então `SET LOCAL` funciona (N-3); se não, `SET` simples e depois `RESET` |

Os arquivos `rollback.sql` são executados com `prisma db execute --file` como o design diz; o plano nunca edita uma pasta de migration (isso é trabalho do `@dev`/`@data-engineer`).

## 17. Checagens DB-12..DB-17, `lock_timeout` (TS-20) e a base do dinheiro (Gate A)

### 17.1 DB-12..DB-17

| Item | Teste | Pacote |
|---|---|---|
| DB-12 (causa só em `awaiting_choice`, e obrigatória nele) | PG37-02, PG37-03, PG37-09: bicondicional estrita desde a M2a com seis códigos; uma linha em `awaiting_choice` nunca tem causa `NULL`; o ramo parametrizado do plano anterior cai (G-B4 fechada) | P5, P7 |
| DB-13 (`settled_external_at` bicondicional, imutável) | PG37-04 | P5 |
| DB-14 (desempate do histórico `redemption_id DESC`) | 25 linhas no mesmo milissegundo: `ORDER BY` determinístico em 20 execuções; a definição do índice inclui o desempate (leitura do catálogo) | P5, P7 |
| DB-15 (índice de pendentes com três estados vs. dois; contagem agrupada) | PG38-02, PG38-03; se o plano varre e descarta linhas `held_for_service`, reportar ao `@data-engineer` para o segundo índice parcial (CONCERNS, não FAIL) | P7 |
| DB-16 (`total` vs. `items`, `truncated`) | PG38-01 | P7 |
| DB-17 (payload `settlementCause` vs. coluna) | Estático/contrato: um payload do outbox financeiro com `settlementCause` usa só a mesma lista fechada de seis, ou a cópia no payload some; a linha de auditoria traz a causa | P7 |
| DB-18 (construção de índices e o lock em `redemptions`) | MG-16 (decidido no design v2.7 3.16 A: índices na M2b/M3a; G-B12 fechada) | P5 |
| DB-19 (`CHECK`s simples em `queues`) | MG-17 a | P5, P5b |
| DB-20 (seis estados no `CHECK` de estado) | MG-17 b, PG37-09 | P5 |
| DB-21 (gatilho de guarda separado para `refunded_at` e `refund_origin`; sem `INCLUDE`) | PG39-12, MG-15; `EXPLAIN` da contagem com e sem o filtro de origem (DE 9.9 item 6, seção 18) | P5b, P7 |

### 17.2 `lock_timeout` e `statement_timeout` (TS-20, DB-11; P0, Gate A)

A nota da Parte A vale: nenhum teste menciona a sonda TS-20, então o `@dev` a localiza ou a escreve (`settlement-deadlock-postgres.test.js`, PG76-29).

| ID | Teste |
|---|---|
| TS20-01 | Três transações (`retryOutboxManually`, `requestQueueDeletion`, uma transação de liquidação) nas 6 ordens atrás de barreiras: cada uma termina em commit, ou em `40P01`/`55P03` mapeado a um erro genérico reexecutável com `referenceId`; nada trava; `retryOutboxManually` corrigido (W3-5) |
| TS20-02 | **`lock_timeout` é real:** com um valor pequeno substituível pelo teste (por exemplo 200 ms), uma sessão auxiliar segura o lock da fila até o teste liberar; a transação do repositório falha com `55P03`, mapeado ao texto genérico localizado com `referenceId`, sem stack nem SQL no corpo, e **sem escrita parcial** (contagens iguais). A asserção é sobre a classe do resultado; o valor do timeout nunca é afirmado como duração |
| TS20-03 | `statement_timeout` (`57014`) mapeado igual, com um comando deliberadamente longo (`pg_sleep` só no auxiliar do **teste**) |
| TS20-04 | Os timeouts são definidos por transação (`SET LOCAL`) e não vazam para a conexão do pool usada em seguida (ler `SHOW lock_timeout` na próxima retirada) |
| TS20-05 | Nenhum `40P01`/`40001`/500 aparece em nenhuma corrida deste plano (reaproveitado como pós-condição de todo teste de corrida) |

### 17.3 Base do Gate A (P0, P1)

Suítes financeiras existentes sem mudança e verdes após o P1; testes de contrato do gate (cada um dos sete chamadores com um resgate retido devolve `held_blocked`/pular; o caminho `ON CONFLICT` devolve `already_same`; contraditório devolve o código); a regra OpenGrep dispara numa fixture com uma chave `financial:` montada à mão e o `npm run review:static` é reportado com o código de saída; limpar e excluir com uma entrada `in_progress` funcionam (regressão W3-1); a saída manual auditada de `conflict`/`failed` registra `remoteConfirmed:false`, mostra o status remoto guardado para `conflict`, exige uma pessoa, e a exclusão prossegue depois; tabela de mapeamento 409 (um teste por código, nenhum motivo livre pode forçar um cancelamento, G-14).

## 18. `EXPLAIN` em volume sintético (`PG38-03`, `ops31-pending-decisions-postgres.test.js`)

1. PostgreSQL 18 descartável, migrations reais. `generate_series` enche `redemptions` com **1.000.000** de linhas numa distribuição realista (>= 99,9% no estado `none`; algumas centenas pendentes e `settled_external`; várias filas; `refunded_at` em uma parcela pequena), depois `ANALYZE`. **HIPÓTESE:** uma carga de 1M linhas cabe no orçamento do contêiner descartável; se não couber, registra-se a contagem de linhas realmente usada.
2. `EXPLAIN (ANALYZE, BUFFERS)` de: a lista de pendentes, a contagem agrupada de pendentes, o histórico, a contagem do teto (`queue_id, user_id, refunded_at >= início`) **com e sem o filtro `refund_origin = 'automatic'`** (DE 9.9 item 6; sem coluna `INCLUDE`, DB-21).
3. **Evidência, não asserção de tempo.** O texto do plano é salvo em `.local/qa-ops31/` e citado na story. Asserção: o plano nomeia o índice parcial do objeto (pendentes, `settled_external_at`, `refunded_at`) e não faz varredura sequencial de `redemptions`. **HIPÓTESE:** o planejador é baseado em custo, então a asserção pode virar com as estatísticas; se virar, o `@qa` registra CONCERNS ao `@data-engineer` em vez de forçar FAIL, e nunca afrouxa o índice para passar.
4. Tabelas pequenas não são evidência para isto (o planejador escolhe varredura sequencial); a evidência da story do CA 38 é este teste, não um teste unitário.

## 19. Diálogos em lote e lista de pendentes no navegador (classe `E`, separada de `K`)

Scripts a 320, 390 e 768 px (e zoom 200% a 320), cada um 3x: bloco de política e retorno do salvamento (`E34-01`), edição velha com `alert` mantendo as edições não salvas (`E35-01`), diálogo de conversão ao ligar `refund_on_end` (`E35-02`), "Decidir pelos N em espera" (`E36-01`), lista de pendentes com causas e linhas do teto (`E38-01`), histórico em `<details>` fechado por padrão (`E38-02`), as três marcas como texto (`E37-01`), "Registrar resolução manual" em Operações para `unknown`/`conflict`/`failed` e a linha de conflito sem hora de leitura (`E37-02`), linhas de estado da detecção de live e motivos de reserva (`E40-01`), LIV-1 na interface: depois de um `stream.offline` falso nenhum cartão, entrada ou contagem muda (`E40-02`). Validação visual, revisão estática de UX e tecnologia assistiva são reportadas como classes separadas (regra do projeto).

## 20. i18n (`validate:localization`, es/pt-BR sem revisão nativa)

| ID | Classe | Teste |
|---|---|---|
| L34-01 | L | `npm run validate:localization` com toda chave nova (painel e chat), três idiomas, paridade e formas de plural |
| L34-02 | L | Nenhuma chave existe em um idioma só; nenhum valor vazio; marcadores de interpolação idênticos entre os idiomas |
| C20-01 | C | Chaves negativas: nenhuma `chat.queue.points_waiting`; nenhuma chave de chat para `settled_external`, `check_group`, início/fim de live nem acerto do teto (checklist de UX: "nenhuma mensagem no chat") |
| C20-02 | C | Contrato de redação por chave: textos de "solicitado/pendente" nunca contêm "devuelto/devolvido/refunded" fora do caminho de confirmação (estende o C-02); CA 33 |
| U20-03 | U | Todo texto de aviso de chat com nomes no pior caso fica <= 500 caracteres após a interpolação e não traz id (reaproveita U71-12 nas chaves novas, `waiting_decision`) |
| C20-03 | C | `panel.pending.cause.*` tem exatamente as **seis** causas da lista fechada (v2.6, `batch_deferred` incluída) mais as variantes `reentry_cap.*` (inclusive `.loosened` e `.zero`); uma causa nova sem chave reprova |
| L34-03 | L | O idioma do canal rege os avisos de chat; o idioma do painel rege o texto do painel (sem uso cruzado) |

**Limite declarado (não afirmado):** espanhol e português foram escritos pelo agente; **sem revisão nativa**; o plural `.many` do espanhol não foi conferido com o validador (`ux-plan-v2` seção 7: **HIPÓTESE**). O validador prova presença, paridade e formas de plural, não sentido nem tom. Redação do veredito: "validado quanto a presença e paridade; qualidade semântica de es e pt-BR sem revisão nativa". O proprietário lê pt-BR; o espanhol fica como declarado.

## 21. Mutações obrigatórias da Parte B (39: 28 + M56..M66 da v2.1; >= 20 exigidas)

Mesmo método da seção 4.6 da Parte A (serial, cópia em `.local/qa-ops31/backup/<id>/` com `sha256sum`, mudança de uma linha, rodar só os testes nomeados, registrar a falha, restaurar, `cmp`). Só no gate, nunca enquanto o `@dev` edita o mesmo arquivo.

| # | Mutação | Teste que deve falhar |
|---|---|---|
| M28 | O resolvedor devolve o valor mais generoso na divergência | U34-01, U34-02 |
| M29 | S1 `legacy` tratado como `wait` (ou `wait` como `legacy`) | U34-01, PG34-03 |
| M30 | Política lida antes do lock da fila | PG35-02 |
| M31 | Comparação da rev removida, ou incremento em segundo comando | PG35-01 |
| M32 | "Decidir pelos N" usa `choice` padrão `refund` | API36-01, K36-01 |
| M33 | Causa não limpa quando a linha sai de `awaiting_choice` | PG37-03 |
| M34 | Remover o `CHECK` de `settlement_cause` | PG37-02 |
| M35 | O worker de exclusão cancela uma linha `awaiting_choice` | PG37-07 |
| M36 | `settled_external` cria um `chat.notice` | PG37-08, C20-01 |
| M37 | Teto contado na confirmação da Twitch, não na intenção | PG39-03, PG39-04, PG39-01 |
| M38 | Teto lido fora do lock da fila | PG39-01 |
| M39 | Acima do teto a devolução vira fulfill | PG39-06, U34-02 |
| M40 | Uma devolução falha devolve crédito | PG39-04 |
| M41 | O worker financeiro grava `refunded_at` | PG39-05 |
| M42 | Um cancelamento de recusa grava `refunded_at` | PG39-03 |
| M43 | O handler do `offline` atualiza `queues` (e M43b: o fechamento da reconciliação toca `entries`) | PG40-04, U40-02 |
| M44 | A reconciliação fecha com um único `null` | TW40-02 |
| M45 | Um `online` tardio de live mais antiga reescreve `stream_session_id` | U40-01, PG40-03 |
| M46 | Borda da fusão exclusiva (`<`) em vez de inclusiva | U40-01 |
| M47 | O lock do canal usa o espaço de chave bigint único do `lockQueue` | PG40-06 |
| M48 | Insere-depois-fecha em vez de fecha-depois-insere | PG40-02 |
| M49 | `concluir` de moderador devolve `complete_pending` | U41-02 |
| M50 | A rota de pendentes filtra `lifecycleStatus = active` | API38-02 |
| M51 | `total = items.length` | PG38-01 |
| M52 | `ORDER BY` do histórico sem o desempate | PG38-01, DB-14 |
| M53 | `pendingDecisions` ausente exibido como `0` | K38-01, API38-01 |
| M54 | A M3 define `DEFAULT 'wait'` antes do P7 | PG34-03 |
| M55 | A revogação da inscrição de stream marca `reconnect_required` | U40-04 |
| M56 | `after_n` e `at_n` trocados (orçamento N-1 para `after_n`) | U39-02, PG39-01 |
| M57 | Comparação `<=` em vez de `<` (igualdade no teto) | U39-02 |
| M58 | `reentry_cap_counts_manual` ignorado (devoluções manuais sempre contam) | U39-02, PG39-14, PG39-01 |
| M59 | Uma devolução da pessoa streamer é retida pelo teto | PG39-06, U39-02 |
| M60 | `refund_origin` gravada num segundo comando, ou não gravada | PG39-10 |
| M61 | O `CHECK` da origem removido, ou o gatilho de guarda deixa de congelar as colunas | PG39-11, PG39-12 |
| M62 | `effectiveBudget` devolve N para `at_n`, ou o cliente o recalcula | U39-03, API35-13, K39-03, C39-01 |
| M63 | O `PUT` converte `"true"` ou `1` em booleano | API35-08 |
| M64 | O M3-down remove as colunas antes do gatilho, ou a sua guarda ignora devolução com origem | MG-15 |
| M65 | "Decidir uma a uma" grava `policy_wait` ou `chat_clear` em vez de `batch_deferred` (ou a grava para não membro) | PG37-10, U37-02 |
| M66 | Um `PUT` de corpo igual incrementa a revisão | API35-10 |

Adicionais do Gate A (base do dinheiro): **M-A1** remover `lock_timeout` de uma transação do repositório -> TS20-02; **M-A2** um chamador contorna o gate (chave `financial:` montada à mão) -> a fixture do OpenGrep e o contrato do gate; **M-A3** o worker de exclusão sai de `deleting` com decisão pendente -> PG37-07 e PG76-21 da Parte A.

## 22. Testes reais (P8): rodada A depois do Gate B, rodada B depois do Gate C, rodada C

A autorização e os limites valem (seção 5 da Parte A): só o canal de testes exclusivo; só recompensas criadas pelo produto; só contagens e códigos de motivo, nenhum id, token, header ou corpo de chat copiado para a evidência. **A rodada C exige o proprietário transmitindo**; o Orion não consegue iniciar uma transmissão. Nada nesta seção é afirmado até ser observado.

**Acréscimos da rodada B (depois do Gate C):**

| ID | Roteiro | Esperado | Fecha |
|---|---|---|---|
| RT-B14 | Um resgate de membro retido é finalizado no painel da Twitch pelo proprietário | `settled_external` no painel ("liquidado na Twitch"), sem linha de outbox, sem mensagem no chat | CA 37 |
| RT-B15 | Pausar a recompensa e resgatar (W4-3) | Registra se uma recompensa pausada aceita resgates (decide se "recusado por estar fechada" pode acontecer fora de uma corrida) | W4-3 |
| RT-B16 | S1 `wait`, chave de devolução desligada: no-show de um não membro | `awaiting_choice`, nada muda na Twitch (continua `UNFULFILLED`), contagem de pendentes no painel; depois uma escolha | CA 34, 36, 37 |
| RT-B17 | Y feito moderador (`/mod` reversível) digita `concluir` na entrada de membro de X, S3 `wait` | Resposta neutra, nenhuma mensagem de pontos, entrada `awaiting_choice` (alternativa: a mesma conta alternando papéis, declarado) | CA 41 |
| RT-B18 | A pessoa streamer digita `concluir` no chat sobre um membro retido | Age como o fim de serviço do painel | CA 41 |
| RT-B19 | `limpar` pelo chat com um membro presente, S4 `wait` | Resposta com as contagens de pendentes; membro `awaiting_choice` | CA 34 |

**Rodada C — sessão de live (proprietário transmitindo; classe separada `RT-live`):**

| ID | Roteiro | Esperado | Fecha |
|---|---|---|---|
| RT-C1 | O proprietário inicia uma live no canal de testes | A sessão abre (`liveSession` estado `live`, origem `event`); **atraso entre ir ao ar e o painel registrado como medido** | CA 40 |
| RT-C2 | O proprietário encerra a live | A sessão fecha; retrato de contagens/checksums de filas, entradas, resgates, outbox antes e depois: **idêntico** (LIVE-1 no canal real) | CA 40 |
| RT-C3 | Reiniciar dentro da janela de fusão (padrão 10 min) | Mesmo `stream_session_id` | CA 40 |
| RT-C4 | Definir a janela em 1 minuto, reiniciar depois disso | Uma nova sessão (orçamento novo do teto) | CA 39, 40 |
| RT-C5 | Derrubar a rede do worker durante a live e restaurar | Reconciliação ao reconectar; **nenhum fechamento falso** (duas negativas); estado `unknown` enquanto incerto | CA 40 |
| RT-C6 | Ler o custo real do EventSub após as duas novas inscrições | Custo e `max_total_cost` registrados como observados (o design supôs 5 de 10: **HIPÓTESE**) | CA 40 |
| RT-C7 | Teto 1 numa fila `refund_on_end`: X resgata, é devolvido no fim, reentra, segunda devolução | A segunda vai para `awaiting_choice` (`reentry_cap`); a pessoa streamer a devolve (conta); uma nova live fora da janela dá orçamento novo | CA 39 |
| RT-C8 | Opcional, condicionado ao proprietário: revogar a autorização do app na Twitch e reconectar | Motivo de reserva `revoked`; chat e estado de recompensa intocados; recuperação após reconectar. **HIPÓTESE:** o caminho exato da revogação (disruptivo; pulado se o proprietário recusar) | CA 40 |

**Não dá para provar aqui (declarado, nunca afirmado):** Prime e o grupo de inscritos (Parte A 5.5); os tipos `rerun`/`premiere`/`playlist` num canal real (só unitário); variação real do atraso da Twitch em várias lives; leitor de tela (`NOT RUN`); expiração de `UNFULFILLED` (janela de observação).

## 23. Acessibilidade e o checklist de UX (`ux-plan-v2` seção 8)

Classe `E`, a 320, 390 e 768 px e zoom 200% a 320: cada item do checklist de UX vira um passo de script com resultado (`PASS`, `FAIL`, `NOT RUN`). Medido, não a olho: **contraste >= 4,5:1** calculado a partir dos estilos renderizados no script (o projeto não tem dependência axe, então o `@qa` não adiciona nenhuma; **HIPÓTESE:** o `@dev` talvez já traga um auxiliar de contraste, o `@qa` confere); **alvos >= 44 px** pelas caixas delimitadoras; **só teclado** (a ordem de tab do bloco de política segue a ordem visual; diálogos prendem e restauram o foco; nenhum roubo de foco ao atualizar); **regiões vivas:** a contagem de `[aria-live]`, `[role=status]`, `[role=alert]` montadas não muda com as telas novas (um status e um alert continuam montados, E77-04) e as linhas de detecção de live não criam nenhuma; marcas são texto, não só cor; `aria-invalid` nos campos numéricos (limite S5 1-20, horas 1-72, fusão 1-60) com não inteiros e fora da faixa recusados e limite em branco não aceito quando "Limite" é escolhido. **Leitor de tela (NVDA, VoiceOver, TalkBack): `NOT RUN`, risco aceito pelo proprietário**, registrado literalmente; nenhuma afirmação de validação de tecnologia assistiva.

## 24. Veredito sobre este plano, lacunas e riscos

**Nota do plano: 9,3 / 10** (meta >= 9,0; reavaliada em 2026-11-15 após a seção 25 e o fechamento de G-B12, G-B13, G-B15). É nota de plano: nada foi executado e toda `HIPÓTESE` acima fica aberta até o teste correspondente rodar. Pontos fortes: todo CA 1-41 tem pacote, gate e ao menos uma classe; as invariantes de dinheiro e de live têm controles de mutação; as classes unitária, PostgreSQL, serviço, navegador e real ficam separadas; o arnês do LIVE-1 tem controle positivo e não depende do momento do `pg_stat`. Motivos de não ser maior: um ponto em aberto da seção 25.11 (G-B14), os pontos de design ainda abertos abaixo (G-B8..G-B11), muitos itens **HIPÓTESE** não verificados (fluxo do Prisma, comportamento do planejador, pilha de adaptador falso) e os itens de rodada real que dependem do proprietário.

### 24.1 Lacunas (a fechar antes do pacote indicado)

| # | Lacuna | Responsável | Antes de |
|---|---|---|---|
| G-B1 | **FECHADA** (design 3.14 A, CA 36): sem pré-seleção; o texto "pré-seleciona" foi retirado | `@architect` | feito |
| G-B2 | **FECHADA** (design 3.14 B): o S1 rege só não membros; linhas 7, 8 e 8b da seção 12 confirmadas | `@architect` | feito |
| G-B3 | **FECHADA** (CA 39 reescrito): a evidência é automática x manual, seção 25.4 | `@po` | feito |
| G-B4 | **FECHADA** (DE 9.9 item 1, CA 37): forma estrita, `awaiting_choice` exige causa; PG37-02, PG37-09 | `@architect` / `@data-engineer` | feito |
| G-B5 | **FECHADA** (design 3.14 D): S2..S5 e os dois campos do teto são recusados antes do P7, de forma atômica; API35-12 | `@architect` / `@ux` | feito |
| G-B6 | **FECHADA** (proprietário, design 3.15, CA 39): configurável por fila, igualdade declarada (`count < budget`); seção 25.1 | `@po` | feito |
| G-B7 | **FECHADA** (design 3.15 D): a M3a sempre existe; MG-14 | `@data-engineer` | feito |
| G-B8 | A sonda TS-20 não foi encontrada em `tests/`; `lock_timeout` ainda não existe no repositório | `@dev` (P0) | P0 |
| G-B9 | Fluxo `prisma migrate resolve --rolled-back`, `SET LOCAL` dentro do arquivo do Prisma, o timeout de 5 s da transação interativa para o lote da 3.6 | `@data-engineer`, `@dev` | P5 / P7 |
| G-B10 | A classe `SV` depende de a pilha de adaptador falso do compose subir o worker com os novos callbacks | `@dev` | P6b |
| G-B11 | O número de consultas de `GET /api/state` por poll não é medido hoje (DB-15) | `@dev` | P5b |

### 24.2 Riscos do plano

| # | Risco | Mitigação |
|---|---|---|
| R-B1 | O P7 (FT-76 + FT-77 + política + teto + chat) é um pacote muito grande validado de uma vez | O Gate C vem por último e roda sobre base P5-P6b congelada; os testes unitários e PG do P7 são escritos em Red primeiro, por subárea, pelo `@dev`; o `@qa` recusa P7 parcial |
| R-B2 | Três baterias PostgreSQL (arquivos x3) são lentas numa máquina disputada | Tempo nunca afirmado; orçado em tempo; nenhum limite aumentado |
| R-B3 | Os gatilhos por comando do arnês LIVE-1 poderiam eles mesmos gravar | Só incrementam uma tabela de contadores excluída dos cinco retratos; o controle positivo prova o arnês |
| R-B4 | Os planos de `EXPLAIN` dependem do planejador | Evidência, não asserção de tempo; CONCERNS em vez de FAIL; plano salvo |
| R-B5 | A rodada C exige o proprietário transmitindo; o atraso real do EventSub é desconhecido | `PENDING (proprietário)`; registrado como medido; a evidência unitária e PG vale sem ela, mas o CA 40 e a metade live do CA 39 ficam abertos para a classe real |
| R-B6 | Pontos reais se movem nas rodadas B e C | Só canal de testes; Gate C verde antes; só contagens na evidência |
| R-B7 | Os textos es/pt-BR não têm revisão nativa | Declarado (seção 20); o validador prova só paridade |
| R-B8 | Conflitos de edição: `queue-repository.mjs` é arquivo quente compartilhado por P5b, P6, P6b, P7 | Escritas em série (design 14); mutações só rodam quando nenhum `@dev` edita esse arquivo |
| R-B9 | Hipóteses sobre comportamento do Prisma/PostgreSQL 18 (envoltório de transação, descarga do `pg_stat`, `migrate resolve`) | Cada uma tem um teste que registra o comportamento real; nenhuma é presumida |

**Depende de:** `@dev` (costuras, registros Red/Green, TS-20, timeouts, pilha falsa), `@data-engineer` (regeneração do DDL N-4, nomes de constraints, fluxo de reversão), `@architect` (G-B1, G-B2, G-B4, G-B5), `@po` (G-B3, G-B6), `@ux-design-expert` (chaves), proprietário (reconectar, duas contas ou alternativa, transmitir na rodada C, aceite das declarações).

### 24.3 Totais (Parte B)

| Classe | Quantidade | Observação |
|---|---|---|
| U (unitário) | 22 | `U34-01`, `U39-02` e `U41-01..08` são orientados a tabela; cada linha é nomeada no relatório |
| TW (Twurple falso) | 3 | |
| L / C (localização, contrato estático) | 4 + 7 | inclui `C-05`, `C38-01`, `C41-01`, `C20-01..03`, `L39-01`, `C39-01` |
| PG (PostgreSQL 18 isolado, migrations reais) | 48 | corridas: `PG35-01`, `PG37-06`, `PG39-01` (oito células), `PG39-15`, `PG40-01..03` com 50 rodadas x 3 execuções |
| API (contrato HTTP na instância isolada) | 19 | inclui `API30-01`, `API35-07..15` |
| MG (arquivos de migration) | 17 | `MG-01..17`, um arquivo de teste |
| TS20 (lock_timeout e sonda de deadlock) | 5 | |
| SV (serviços reais) | 1 | HIPÓTESE: depende da pilha de adaptador falso |
| K (componente) | 7 | |
| E (scripts de navegador) | 12 | `E36-01`, `E39-01`, `E39-02` mais os nove da seção 19; 3 larguras, cada um 3x |
| RT (canal real) | 15 | `RT-B14..20` (7, `RT-B20` opcional) e `RT-C1..C8` (8); resultados PASS/FAIL/NOT RUN/PENDING |
| **Total** | **160** | mais 39 mutações (Parte B: 28 + M56..M66), 3 mutações do Gate A, as 27 da Parte A, os totais da Parte A (157 testes, 20 itens reais) e as suítes de regressão existentes (a v2.1 acrescentou 36 testes) |

As contagens vêm dos IDs escritos neste plano (um script contou as linhas das tabelas; a linha agregada `RT-C1..C8` e as linhas repetidas `MG-04` e `RT-C7` contam uma vez). Elas mudam quando o `@dev` dividir um teste orientado a tabela; os IDs são o contrato, não o número.

---

## 25. Adendo da Parte B v2.1 (design v2.6, 2026-11-15): teto configurável, `refund_origin`, sexta causa

**Base:** [architect-design-v2](architect-design-v2.md) 3.15 e 3.14 (v2.6), [story](story.md) CAs 27, 35, 37, 39 (emendados), [data-engineer-review](data-engineer-review.md) 9.9 (DB-18..DB-21 e seus seis acréscimos de testes), checklist da seção 8 do [ux-plan-v2](ux-plan-v2.md) (itens do teto). **Natureza:** somente plano; nada foi executado; **HIPÓTESE** marca o que não foi verificado. Os arquivos são nomes prováveis: os casos de PostgreSQL vão em `ops31-cap-postgres.test.js` e `ops31-migrations-postgres.test.js`. **Regra usada abaixo:** `budget = N` com `after_n`, `N - 1` com `at_n`; uma devolução automática passa se e somente se `count < budget`; `count` é lido dentro do lock da fila antes da decisão (a devolução em decisão não entra) sobre as devoluções da pessoa na janela atual com `refunded_at` preenchido e, quando `reentry_cap_counts_manual` é false, com `refund_origin = 'automatic'`; teto `NULL` nunca retém; a devolução que a pessoa streamer escolhe nunca é retida. Padrões: `after_n`, `true`.

### 25.1 Tabela-verdade do teto (`U39-02`; orientado a tabela, conta uma vez, cada linha nomeada no relatório)

"Linhas contadas" = linhas com `refunded_at` da pessoa na janela, como automática / streamer. "Retida" = o resgate vai a `awaiting_choice`, causa `reentry_cap`, nunca a um fulfill, sem chamada à Twitch. Toda linha afirma também a `refund_origin` gravada de uma devolução que passa (`automatic`), os campos de auditoria (id da configuração, `policyRev`) e a ausência de qualquer identificador de pessoa.

| # | Retenção | N | Conta manual | Linhas contadas (auto / streamer) | Contagem lida | Orçamento | Esperado |
|---|---|---|---|---|---|---|---|
| C1 | `after_n` | 3 | true | 0 / 0 | 0 | 3 | passa |
| C2 | `after_n` | 3 | true | 2 / 0 | 2 | 3 | passa (a 3ª) |
| C3 | `after_n` | 3 | true | 3 / 0 | 3 | 3 | retida |
| C4 | `after_n` | 3 | true | 4 / 0 | 4 | 3 | retida |
| C5 | `at_n` | 3 | true | 0 / 0 | 0 | 2 | passa |
| C6 | `at_n` | 3 | true | 1 / 0 | 1 | 2 | passa |
| C7 | `at_n` | 3 | true | 2 / 0 | 2 | 2 | retida (a 3ª espera) |
| C8 | `at_n` | 3 | true | 3 / 0 | 3 | 2 | retida |
| C9 | `after_n` | 1 | true | 0 / 0 | 0 | 1 | passa |
| C10 | `after_n` | 1 | true | 1 / 0 | 1 | 1 | retida |
| C11 | `at_n` | 1 | true | 0 / 0 | 0 | 0 | retida (toda devolução automática espera) |
| C12 | `at_n` | 1 | true | 1 / 0 | 1 | 0 | retida |
| C13 | `at_n` | 1 | false | 0 / 0 | 0 | 0 | retida (orçamento 0 qualquer que seja a configuração) |
| C14 | `after_n` | 20 | true | 19 / 0 | 19 | 20 | passa |
| C15 | `after_n` | 20 | true | 20 / 0 | 20 | 20 | retida |
| C16 | `at_n` | 20 | true | 18 / 0 | 18 | 19 | passa (**linha derivada**: extensão do `@qa` da regra declarada) |
| C17 | `at_n` | 20 | true | 19 / 0 | 19 | 19 | retida (linha derivada) |
| C18a..d | teto `NULL`, cada uma das quatro combinações de retenção x conta manual | `NULL` | qualquer | 0 / 0, 5 / 5, 20 / 20 | n/a | n/a | nunca retida; a porta do teto nem é lida (spy) |
| C19 | `after_n` | 3 | true | 0 / 5 | 5 | 3 | retida |
| C20 | `after_n` | 3 | false | 0 / 5 | 0 | 3 | passa (cinco linhas da pessoa streamer, nenhuma automática) |
| C21 | `after_n` | 3 | true | 2 / 2 | 4 | 3 | retida |
| C22 | `after_n` | 3 | false | 2 / 2 | 2 | 3 | passa |
| C23 | `after_n` | 3 | false | 3 / 0 | 3 | 3 | retida (as linhas automáticas sempre contam) |
| C24 | `at_n` | 3 | true | 1 / 1 | 2 | 2 | retida |
| C25 | `at_n` | 3 | false | 1 / 1 | 1 | 2 | passa |
| C26a..d | escolha `refund` da pessoa streamer no painel, cada uma das quatro combinações | 1 e 3 | qualquer | 0, orçamento - 1, orçamento, orçamento + 5 | qualquer | qualquer | **nunca retida**, gravada com origem `streamer`, conta só se a configuração mandar |
| C27 | qualquer | 3 | qualquer | cancelamento de recusa (pausada, fechada, duplicada) | n/a | n/a | não conta, não é retido, **nenhuma** das colunas `refunded_at` e `refund_origin` é gravada |
| C28 | qualquer | 3 | qualquer | devolução anterior que terminou `failed` ou `resolved_manual` | contada | n/a | continua contando (DB-5), origem mantida, nenhum orçamento devolvido |
| C29 | `after_n` | 3 | `true` -> `false` | 0 / 5 | 5 -> 0 | 3 | antes da troca uma devolução automática é retida; depois a **próxima** passa; a linha que já está em `awaiting_choice` não se move (checksum igual) |
| C30 | `after_n` | 3 | `false` -> `true` | 0 / 5 | 0 -> 5 | 3 | o inverso: a próxima devolução automática é retida; as devoluções passadas são reavaliadas com a origem gravada |
| C31 | `after_n` -> `at_n` | 3 | true | 2 / 0 | 2 | 3 -> 2 | a próxima decisão retém; nada já pendente se move |
| C32 | `at_n` -> `after_n` | 3 | true | 2 / 0 | 2 | 2 -> 3 | uma linha retida antes continua retida (segue esperando a pessoa streamer); a próxima devolução automática passa |
| C33 | `at_n`, N de 3 para 2 | 2 | true | 1 / 0 | 1 | 1 | retida; a leitura de `capDetail` de uma linha retida mais antiga mostra contagem e orçamento do momento da leitura |

C1..C33 (com as expansões a..d: 41 afirmações) são um teste, nomeado por linha. A igualdade está declarada pela decisão do proprietário e pelo CA 39 (`count < budget` passa), então a antiga **HIPÓTESE** da linha 31 da seção 12.5 está fechada; C16/C17 são as únicas linhas derivadas.

**`U39-03` (unitário)** — `effectiveBudget(cap, hold)`: `NULL` -> `null`; `after_n` N -> N; `at_n` N -> N - 1; `at_n` com N = 1 -> `0`; `at_n` N = 20 -> 19; nunca negativo, nunca acima de 20; a mesma função alimenta a decisão, o `GET` e o `capDetail` (spy: uma implementação, nenhuma segunda fórmula no cliente).

### 25.2 `refund_origin`, o `CHECK` e o gatilho `redemptions_refund_guard` (DB-21)

| ID | Classe | Teste | Pacote | Gate | Vermelho hoje |
|---|---|---|---|---|---|
| PG39-10 | PG | `refund_origin` é gravada **no mesmo comando** que `refunded_at` (um gatilho de comando só de teste registra as duas colunas do único `UPDATE`; nunca dois comandos). Origem `automatic` para: devolução de grupo no fim do serviço, devolução produzida por S1..S4 (inclusive conclusão de moderador e `limpar` de chat que a política transformou em devolução). Origem `streamer` para: decisão única no painel, "Decidir pelas N em espera", escolha no diálogo de no-show do painel. Um cancelamento de recusa não grava nenhuma das duas. Orientado a tabela por caminho, conta uma vez | P7 | C | Colunas ausentes |
| PG39-11 | PG | Matriz do `redemptions_refund_origin_check` (DE 9.9 item 2): ambas `NULL` aceitas; ambas preenchidas aceitas; valor fora de `{automatic, streamer}` recusado; origem sem `refunded_at` recusada; `refunded_at` sem origem recusado. Cada recusa é uma afirmação própria | P5b | C | Ausente |
| PG39-12 | PG | **Gatilho de guarda** (DE 9.9 item 3, DB-21): mudar `refunded_at` depois de preenchido é recusado (`23514`); mudar `refund_origin` depois de preenchida é recusado (`23514`); `NULL` -> valor (primeira gravação) passa; valor -> `NULL` de **ambas** as colunas no mesmo comando (job de anulação) passa; valor -> `NULL` de só uma coluna é recusado pelo `CHECK`; atualização de outras colunas da linha não o dispara (lista `UPDATE OF`); o gatilho é uma função separada da guarda da M2 (a M3 não redefine objeto da M2) | P5b | C | Ausente |
| PG39-13 | PG | O job de anulação de 72 h limpa `refunded_at` e `refund_origin` no mesmo comando; nada dentro da última sessão é anulado (horizonte do PG39-09 inalterado); uma linha anulada deixa de contar para as duas configurações | P7 | C | Ausente |
| PG39-14 | PG | **Troca de configuração** (seção 25.3) | P7 | C | Ausente |

### 25.3 Trocar a configuração não move as linhas em espera (`PG39-14`, `PG39-15`)

- **PG39-14.** Semeie linhas `awaiting_choice` com cada causa (`reentry_cap`, `policy_wait`, `cannot_ask`, `chat_clear`, `legacy_residue`, `batch_deferred`), linhas `held_for_service` e `check_group`, e devoluções das duas origens. Para cada troca, uma de cada vez (N, `reentry_cap_hold`, `reentry_cap_counts_manual`, horas da janela): checksum de linha de toda linha pendente/retida igual antes e depois; `settlement_cause` inalterada; nenhuma linha de outbox criada; a **próxima** decisão automática usa os valores novos (C29..C33); as contagens das devoluções passadas são reavaliadas com a origem gravada nos dois sentidos; a linha de auditoria `queue.settlement_policy_changed` traz valores fechados antes/depois e nenhum identificador de pessoa.
- **PG39-15.** Edição de política dos dois campos novos x devolução automática (barreira no lock da fila, as duas ordens, 50 rodadas): a devolução vê uma revisão inteira da política (antiga ou nova, nunca mistura, por exemplo `after_n` com o `counts_manual` novo); a perdedora espera; a revisão sobe no mesmo `UPDATE` dos valores; nenhum `40P01`/`40001`/500. Estende a R-cap-3.

### 25.4 Corrida do CA 39 (`PG39-01` ampliado; barreira, duas ordens, `counts_manual` true e false)

Fixture por rodada (ids novos): a pessoa U tem um resgate mais antigo R0 em `awaiting_choice` (a pessoa streamer vai devolvê-lo à mão) e uma entrada ativa E1 cujo fim de serviço é a devolução automática; nenhuma outra devolução na janela; teto `N = 1` com `after_n` (orçamento 1) e `N = 2` com `at_n` (orçamento 1), de modo que **uma devolução contada preenche exatamente o orçamento**. Duas conexões, barreira provada por `pg_stat_activity` junto com `pg_blocking_pids` (Parte A 4.2; rodada em que B nunca foi vista esperando é rodada falha), 50 rodadas por célula, executada 3x, em série.

| Célula | Retenção | Conta manual | Ordem | Esperado (lido de volta do banco) |
|---|---|---|---|---|
| R1 / R2 | `after_n` | true | manual primeiro / automática primeiro | manual primeiro: a devolução manual passa (nunca retida) e a automática fica **retida** (`reentry_cap`); automática primeiro: **ambas passam**, a contagem pode passar de N pela manual |
| R3 / R4 | `after_n` | false | manual primeiro / automática primeiro | o commit manual **não** muda a contagem lida: a devolução automática **passa nas duas ordens**; a manual é gravada com origem `streamer` e não é retida |
| R5 / R6 | `at_n` | true | manual primeiro / automática primeiro | como R1/R2 com orçamento 1 |
| R7 / R8 | `at_n` | false | manual primeiro / automática primeiro | como R3/R4 |

Invariante após cada rodada: as devoluções automáticas contadas pela decisão nunca passam do orçamento em nenhum entrelaçamento; a devolução da pessoa streamer nunca é bloqueada; toda devolução tem a sua origem; nenhum `40P01`/`40001`/500 na perdedora. Rodada de controle por célula: uma segunda pessoa V no mesmo instante não é afetada (o lock serializa, não bloqueia cruzado). A frase do CA "dois resgates concorrentes no limite" não é testável para uma pessoa (entrada ativa única, G-B3, fechada pela redação do CA 39); a corrida acima é a evidência.

### 25.5 Casos de API (testes de rota na instância isolada, sessão do painel)

| ID | Classe | Teste | Pacote | Gate |
|---|---|---|---|---|
| API35-07 | API | `PUT` com `reentryCapHold` fora de `{after_n, at_n}` (string vazia, `AFTER_N`, `never`, número) -> **400**, campo nomeado, nada gravado (checksum de linha, revisão, auditoria e outbox inalterados) | P5b | C |
| API35-08 | API | `PUT` com `reentryCapCountsManual` que não é booleano (`"true"`, `1`, `0`, `null`, `[]`) -> **400**, sem coerção, campo nomeado, nada gravado | P5b | C |
| API35-09 | API | **Revisão velha:** `expectedPolicyRev` mais antigo que o gravado -> `SETTLEMENT_POLICY_STALE`, 409, o corpo traz a revisão atual, nada gravado (inclusive quando o corpo também traz valor válido dos campos novos) | P5b | C |
| API35-10 | API | **Corpo igual** (todo valor igual ao gravado, incluindo os dois campos novos) -> aceito, **não grava nada, a revisão não se move, nenhuma linha de auditoria**; antes e depois do P7 | P5b | C |
| API35-11 | API | **Campo ausente significa inalterado:** um `PUT` só com `reentryCapHold` deixa `reentryCapCountsManual` como gravado, e o inverso; um cliente antigo que omite os dois continua válido | P5b | C |
| API35-12 | API | **Recusa antes do P7**, cada campo **sozinho** (mudança de `reentryCapHold`, mudança de `reentryCapCountsManual`) e **misturado** com uma mudança aceitável (por exemplo as horas da janela): `SETTLEMENT_MODE_UNAVAILABLE`, motivo `policy_not_active`, a chamada inteira recusada de forma atômica (nada do campo aceito é gravado, revisão inalterada); depois do P7 os mesmos corpos são aceitos. A recusa vem depois das checagens de revisão velha e de conjunto fechado (ordem: 400, depois 409 de revisão velha, depois recusa pré-P7) | P5b, P7 | C |
| API35-13 | API | O `GET` devolve `reentryCapHold`, `reentryCapCountsManual` e `effectiveBudget`: `null` quando o teto é `NULL`; N para `after_n`; N - 1 para `at_n`; `0` para `at_n` com N = 1; os dois campos gravados e devolvidos com o teto `NULL` (inertes, sem regra entre campos, o `PUT` aceita em qualquer ordem); `enforcementActive` false antes do P7 | P5b | C |
| API35-14 | API | **Auditoria sem id:** `queue.settlement_policy_changed` para mudança de qualquer campo novo traz antes/depois (só valor fechado e booleano), origem e a revisão, **nenhum identificador de pessoa, nenhum rótulo**; a varredura de log da mesma chamada está limpa; uma chamada recusada não grava linha de auditoria de mudança | P5b | C |
| API35-15 | API | Edição dos dois campos recusada em filas `deleting` e arquivadas com o código estável (estende o API35-03) | P5b | C |

### 25.6 `effectiveBudget` e `capDetail` (`API38-03`, `PG38-04`)

- **API38-03.** O `capDetail` aparece só em linhas com causa `reentry_cap` e traz `count`, `budget`, `window` (`live`, `last_live`, `hours`), `endedAt` e `hours` (os nomes dos campos são **HIPÓTESE** até o `@dev` confirmar, item 13 do plano de UX); `budget` é igual ao `effectiveBudget` da mesma fila; `budget` ausente é caso de contrato do cliente (a UI mostra o texto da causa sem `{budget}` e sem a linha de afrouxamento).
- **PG38-04.** O `count` do `capDetail` é calculado **no momento da leitura com o mesmo filtro da decisão** (helper ou SQL compartilhado; o teste aciona os dois numa fixture e compara): trocar `reentryCapCountsManual` muda a contagem exibida na leitura seguinte; uma linha retida cuja contagem caiu abaixo do orçamento depois de um afrouxamento continua sendo devolvida como pendente (não é removida), com contagem abaixo do orçamento.

### 25.7 Migrations com origem e DB-18..DB-21 (`MG-13..MG-17`)

| ID | Teste |
|---|---|
| MG-13 | **M3 up** na cabeça semeada (depois de M2a/M2b): `reentry_cap_hold` lê `after_n` e `reentry_cap_counts_manual` lê `true` em toda fila pré-existente; `queues_reentry_cap_hold_check` recusa valor fora do conjunto; `refund_origin` é `NULL` em toda linha; `relfilenode` de `queues` e `redemptions` inalterado, `atthasmissing` true para os dois defaults constantes; o `CHECK` de `refund_origin` **ainda não está validado** depois da M3 (`convalidated` false) mas já recusa uma linha nova inválida; checksums das colunas pré-existentes iguais (DE 9.9 itens 4 e 5) |
| MG-14 | **A M3a sempre existe:** valida `redemptions_refund_origin_check` (`convalidated` true; a validação roda em transação própria com um escritor concorrente, sem bloqueio de leitura ou escrita registrado, MG-12) e, só se adotado, o `CHECK` opcional de `refunded_at`/`expected_status`; o `M3a-down` é no-op e tem sucesso; a lista de arquivos do up é `M3, M3a` (o plano deixa de ramificar pela existência da M3a; G-B7 fechada) |
| MG-15 | **M3-down com origem:** a guarda recusa quando qualquer `refunded_at` está preenchido (uma linha com `refund_origin` é o mesmo caso), quando existe estado pendente ou quando existe fila `refund_on_end`; passa antes do uso; o gatilho e a sua função são removidos **antes** das colunas (um down que remove as colunas primeiro falha: a ordem do arquivo é afirmada executando-o); depois do M3-down os checksums das colunas originais de `queues` e `redemptions` são iguais ao MG-01; as três colunas novas, os dois `CHECK`s, o índice e o gatilho somem; a ordem inversa `M3b, M4, M3a, M3, M2, M1` deixa `_prisma_migrations` linear (estende o MG-08) |
| MG-16 | **DB-18 (índices e locks), decidido no design v2.7 3.16 A (G-B12 fechada): as construções de índice vão para os arquivos de validação.** Afirmar com um leitor concorrente e `log_lock_waits`: depois da M2a sozinha, `redemptions_settled_external_idx` e o índice parcial da lista de pendentes estão **ausentes**; depois da M3 sozinha, `redemptions_refunded_idx` está **ausente**; depois da M2b os dois primeiros estão **presentes** e depois da M3a o terceiro está **presente**; nenhuma migration segura `ACCESS EXCLUSIVE` em `redemptions` enquanto um índice é construído (a construção roda num arquivo que segura só `SHARE`; registrar o modo e o tempo do lock e a contagem de linhas de `redemptions` no ensaio); os índices únicos que garantem integridade (sonda de duplicatas, índice único parcial) continuam na M2a e existem depois dela; `M2b-down` e `M3a-down` são no-ops, e `M2-down`/`M3-down` removem os índices com `IF EXISTS` (a ordem de reversão não muda). Leitor bloqueado além do tempo registrado é **CONCERNS** com o tempo medido, nunca FAIL por tempo |
| MG-17 | **DB-19 e DB-20 (design v2.7 3.16 B, C):** (a) os `CHECK`s de conjunto fechado de `queues` são `ADD CONSTRAINT` simples e `convalidated` true logo após o arquivo; os de `redemptions`/`outbox` são `NOT VALID` até o seu arquivo de validação; (b) o `redemptions_settlement_values_check` regenerado lista **seis** estados e a gravação de `settled_external` tem sucesso (o texto superado DE 2.2 daria `23514`); uma gravação `none`/`intent_recorded` ainda passa; as formas DB-1 dos `CHECK`s de estado valem; (c) **DB-21:** `redemptions_refund_guard` é um gatilho separado na M3 que congela `refunded_at` e `refund_origin` depois de gravados, exceto os dois voltando a `NULL` no job de 72 h, e o índice de `refund_origin` não tem coluna `INCLUDE` |

Também ampliados: `MG-06` (cada `CHECK` recusa a sua linha inválida) ganha `queues_reentry_cap_hold_check` e `redemptions_refund_origin_check`; `MG-07` (gatilho de guarda) ganha `redemptions_refund_guard`; `MG-02` inclui a `M3a` sem condição na ordem direta `M1, M2a, M2b, M3, M3a, M4, M3b`. `PG34-01..04` ganham as duas colunas novas de `queues` e `refund_origin` (defaults, `CHECK`s, guarda do rollback).

### 25.8 A sexta causa `batch_deferred` e o `CHECK` estrito da causa (`PG37-09`, `PG37-10`, `U37-02`)

- **PG37-09** (DB-12 forma estrita, DB-20). `CHECK` da causa com **seis** códigos (DE 9.9 item 1): cada código aceito só com `awaiting_choice`; `batch_deferred` aceito; código desconhecido recusado; `awaiting_choice` com causa `NULL` **recusado** (forma estrita; G-B4 fechada); código em qualquer outro estado recusado. O `CHECK` de estado lista seis estados (MG-17 b).
- **PG37-10.** `batch_deferred` é gravada pelo diálogo de limpar ou excluir "decidir uma a uma" **só para membros**; não membros seguem a regra de hoje (design 3.6 passo 3) e nunca recebem essa causa; o `limpar` do chat grava `chat_clear`, uma política grava `policy_wait`, nunca `batch_deferred`; a exclusão que aguarda essas linhas as reporta como decisões pendentes (3.7); a linha sai de `awaiting_choice` com a causa limpa no mesmo comando (PG37-03 ampliado); nenhum `chat.notice`.
- **U37-02.** Precedência: um adiamento em lote não lê S4, não consulta o teto (spy na porta do teto: não chamada) e não é `policy_wait`.
- Catálogo: o `C20-03` agora afirma **seis** causas (ver seção 20); a chave `panel.pending.cause.batch_deferred` existe em en, es e pt-BR (`L39-01`).

### 25.9 Controles do painel e a linha de afrouxamento (checklist de UX, seção 8 do `ux-plan-v2`)

| ID | Classe | Teste |
|---|---|---|
| K39-01 | K | Dois controles aparecem no subgrupo "Limite de devoluções repetidas": os rádios de retenção (`after_n`, `at_n`, cada um com o seu exemplo por `aria-describedby`, nomes internos nunca exibidos) e a caixa "Devoluções que eu escolho também contam para o limite"; uma fila nova mostra os padrões; ambos ficam **desabilitados com motivo visível** quando "Sem limite" está escolhido e **mantêm os valores**; a linha de `effectiveBudget` mostra o número da API (`.one`, `.other`, texto do zero), leva o prefixo "Configuração salva:" com edições não salvas e **fica ausente quando `null` ou ausente** (nunca `0` para ausente) |
| K39-02 | K | `at_n` com N = 1 (decisão do proprietário, UX U-20, design v2.8 3.16 E; G-B13 fechada). **Nota:** visível qualquer que seja o rádio, ganha "Esta é a sua escolha atual." quando se aplica, é referenciada por `aria-describedby` a partir do campo numérico e do rádio `at_n`, anuncia a confirmação, é texto estático (nenhuma região viva nova). **O diálogo abre:** Salvar com `at_n` e limite exatamente 1, diferente do par salvo, abre o `alertdialog` (`showModal()`, rotulado pelo título, descrito pelo corpo) e **não envia nada**. **O diálogo não abre:** limite acima de 1; `after_n`; "Sem limite" (controles desabilitados); formulário igual ao par salvo (`at_n` e 1 nos dois, um salvamento que só muda outros campos); bloco não renderizado. **Foco:** foco inicial em **Voltar**; Tab percorre Voltar e "Salvar esta escolha" e fica dentro; Esc, Voltar e qualquer fechamento que não seja a confirmação cancelam sem enviar nada, edições mantidas, **foco volta a Salvar**; clique no fundo **não** fecha. **Confirmar:** envia a mesma requisição que Salvar enviaria, exatamente uma vez; "Salvar esta escolha" fica **desabilitado enquanto a requisição roda** e o diálogo permanece aberto até o resultado; sucesso fecha, mostra o texto de sucesso na região existente do formulário, foco em Salvar; revisão defasada ou erro de validação fecha e mostra a mensagem do formulário com as edições mantidas e foco em Salvar; nenhum `[aria-live]`, `[role=status]` ou `[role=alert]` acrescentado. **Ordem com o U-7:** quando o diálogo de conversão `legacy` também se aplica, ele abre **primeiro**; Voltar em qualquer um cancela o salvamento inteiro e nada é enviado; "Salvar esta escolha" só vem depois da conversão confirmada; ao final, uma requisição. O gatilho é a comparação de dois valores literais do formulário, nunca um cálculo de orçamento (grep do código do painel: nenhuma fórmula no cliente) |
| K39-03 | K | Linha pendente: `{budget}` e `{count}` vêm do `capDetail`, nunca recalculados; uma linha com contagem **abaixo** do orçamento mostra a linha da causa **mais** a linha de afrouxamento ("O limite foi alterado depois de reter esta..."); uma linha com contagem igual ou acima do orçamento **não** tem linha de afrouxamento; as palavras "acima do limite" nunca aparecem para linha pendente; `budget` ausente cai na redação anterior sem linha de afrouxamento; a linha da sexta causa é renderizada |
| K39-04 | K | Um `PUT` com só um dos dois campos deixa o outro inalterado no estado do formulário; valor inválido mostra o erro de campo da API junto ao controle (não um banner); revisão velha mantém as edições não salvas e oferece recarregar |
| K39-05 | K | **Bloco ausente antes do P7 (decisão do proprietário, UX U-1/U-18, design 3.16 D):** com `enforcementActive` **falso** e com o campo **ausente** no `GET`, o bloco de política (S2..S5, os dois controles do teto, a linha de `effectiveBudget`) **não está na página**: nenhum elemento, título, alvo de `aria-describedby`, texto somente leitura, nem a chave removida `panel.policy.cap.readonly`; o restante do formulário de liquidação funciona e a ordem de tabulação não tem lacuna; com `true` o bloco é renderizado. Ausente significa *não renderizar*, nunca *renderizar como ativo*. O diálogo de confirmação não pode ser acionado com o bloco ausente. A recusa da API (API35-12) continua testada à parte como guarda das chamadas diretas |
| E39-01 | E | Script de navegador a 320, 390, 768 px e zoom 200% a 320, 3x cada: a ordem de tab do subgrupo segue a ordem visual, alvos de rádios e caixa >= 44 x 44 px (rótulo incluído), contraste >= 4,5:1 calculado dos estilos renderizados, a contagem de `[aria-live]`, `[role=status]`, `[role=alert]` inalterada pelos controles novos, motivo do desabilitado lido na ordem da página, marcas em texto |
| E39-02 | E | Fluxo: reter uma devolução pelo teto, subir N (ou trocar para `after_n`), salvar, recarregar Pendentes: a linha mantém a linha da causa, ganha a linha de afrouxamento com os números da API, o diálogo de decisão ainda abre e funciona, nenhuma opção vem marcada (CA 36) |
| L39-01 | L | `npm run validate:localization` com as chaves `panel.policy.cap.hold.*`, `panel.policy.cap.counts_manual*`, `panel.pending.cause.batch_deferred`, `panel.pending.cause.reentry_cap.loosened`, variantes `.zero`/`.one`/`.other`: paridade em en/es/pt-BR, nenhum valor vazio, placeholders idênticos (`{count}`, `{budget}`, `{hours}`, `{time}`); qualidade semântica de es e pt-BR sem revisão nativa (declarado na seção 20) |
| C39-01 | C | Contrato estático de redação: nenhuma chave de linha pendente contém "acima do limite"; o texto "no máximo N devoluções por pessoa por live" aparece só no exemplo de `after_n`, nunca como afirmação geral (emenda do CA 27); a linha do limite usa `effectiveBudget` (nenhuma fórmula no cliente, grep do código do painel por `- 1` no teto) |

Leitor de tela continua `NOT RUN` (risco aceito pelo proprietário); são scripts de navegador e revisão estática, não validação de tecnologia assistiva.

### 25.10 Verificação real opcional (rodada B, condicionada ao proprietário)

| ID | Roteiro | Esperado | Fecha |
|---|---|---|---|
| RT-B20 | Opcional: no canal de teste, fila com teto 1 e `at_n`: X resgata e é encerrado pelo fim do serviço | a devolução fica **retida** (`awaiting_choice`, `reentry_cap`), nada muda na Twitch (continua `UNFULFILLED`), a pessoa streamer devolve à mão (conta conforme a configuração); depois `after_n`: a primeira passa e a segunda é retida | CA 39 (fronteira), design 3.15 H |

### 25.11 Lacunas e lacunas anteriores fechadas

**Fechadas pelo design v2.5/v2.6, pelo proprietário e pela revisão do DE (tabela 24.1 atualizada):** G-B1 (sem pré-seleção, texto retirado), G-B2 (S1 rege só não membros; linhas 7, 8 e 8b da seção 12 confirmadas), G-B3 (evidência reescrita como automática x manual), G-B4 (forma estrita `awaiting_choice => causa NOT NULL`, PG37-09), G-B5 (S2..S5 recusadas antes do P7, atômico), G-B6 (configurável, igualdade declarada), G-B7 (a M3a sempre existe).

**Fechadas em 2026-11-15 (design v2.7/v2.8, decisão do proprietário):** G-B12 (as construções de índice vão para M2b e M3a; o `MG-16` segue só esse ramo), G-B13 (diálogo de confirmação para `at_n` com N = 1, UX U-20; o `K39-02` segue o diálogo), G-B15 (linhas C16/C17 confirmadas como derivadas da regra: orçamento 19, contagem 18 passa, contagem 19 é retida, design 3.16 C). O bloco antes do P7 fica oculto (`K39-05`), o que também fecha o ponto aberto 10 da UX.

**Lacuna aberta (não bloqueia o plano):**

| # | Lacuna | Responsável | Antes de |
|---|---|---|---|
| G-B14 | Nomes dos campos do `capDetail` (`count`, `budget`, `window`, `endedAt`, `hours`) não confirmados pelo `@dev` (item 13 da UX) | `@dev` | P7 |

### 25.12 Totais acrescentados por este adendo

Testes: `U39-02`, `U39-03`, `U37-02` (U +3); `PG39-10..15` (6), `PG37-09`, `PG37-10`, `PG38-04` (PG +9; `PG39-14` e `PG39-15` contados aqui uma vez); `API35-07..15` (API +9); `MG-13..17` (MG +5); `K39-01..05` (K +5); `E39-01`, `E39-02` (E +2); `L39-01` (L +1); `C39-01` (C +1); `RT-B20` (RT +1, opcional). **+36 testes, 11 mutações (M56..M66, seção 21).** O `PG39-01` continua um teste com 8 células. Os totais estão em 24.3.

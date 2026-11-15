# OPS-31 — plano de testes do `@qa` (devolução por grupo e avisos de fila; FT-71..FT-78)

[English](../../../stories/OPS-31/qa-test-plan.md)

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

## 8. Esquema do gate único

As fatias seguem a ordem do architect (FT-71, FT-72, FT-73 ao lado, FT-74, FT-75, FT-76, FT-77); o `@dev` registra um checkpoint Red-depois-Green por fatia sem commitar; a execução A da FT-78 depois da FT-71..73 é opcional antes do gate e só com o dono presente; a B só depois do gate local. Um único gate do `@qa` no fim (regra do projeto), com FT-76 e FT-77 juntas.

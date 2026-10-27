# OPS-15 — Roteiro da bateria real na Twitch (2026-10-26)

[English](../../../stories/OPS-15/live-battery-2026-10-26.md)

Autor: @qa (Quinn). Status: **apenas roteiro, não executado**. Escrever este roteiro não tocou em nenhum recurso da Twitch, não enviou mensagem, não criou recompensa e não subiu nem parou servidor.

Escopo: aceite real do painel Next, dos comandos de chat e do overlay (no Chrome) contra o canal **real** `subarushogun`. O proprietário autorizou mensagens de teste no chat, recompensas `[TESTE]`, filas de teste e chamar/remover pessoas, e quer que todos os dados de teste sejam removidos no fim. Reembolso real exige OK do proprietário no momento. O OBS/CEF nativo é um teste do próprio proprietário, feito depois.

Fontes: [story](story.md) (AC, matriz INV), [inventário de rotas/ações de fila](queue-route-action-inventory.md) (QRA-xx), [QA gate 2026-10-23](qa-gate-2026-10-23.md), OPS-3/OPS-7 (comandos), OPS-11 (presença, recompensa removida), FND-9 (modos de fila, abrir/fechar = `is_paused`), FND-7/OPS-13 (overlay) e o código: `apps/api/src/commands/{catalog,parser,chat-handler,help}.mjs`, `apps/api/src/outbox/{chat-worker,timeout-loop,reward-worker}.mjs`, `apps/api/src/http/{queue-routes,overlay-routes,local-session}.mjs`.

## Fatos do código que moldam a bateria

- O único ator no chat é o dono do canal (`subarushogun`). Ele tem cargo `streamer`, então todos os comandos são permitidos. Para ele não há verificação de seguidor nem cooldown de 5 s. `!fila comandos` / `!<fila> comandos` só respondem com um aviso que aponta para o painel. Por isso, efeitos de cargo/permissão para espectadores **não** podem ser observados no chat nesta bateria.
- As respostas do bot saem pela Helix `sendChatMessage` como a conta conectada, então aparecem como `subarushogun`.
- As mensagens do bot no chat são respostas a comandos, mais o **aviso de chamada** (`callMessage` da fila, enviado pela linha `chat.call:<entryId>` da outbox). **Não existe mensagem de entrada por resgate, nem mensagem de prazo, nem mensagem de remoção para ações feitas no painel.** Quando o prazo vence, a entrada passa em silêncio para `no_show` depois de `callDeadlineAt + 60 s` de tolerância (`timeout-loop.mjs`).
- A raiz global depende do idioma do produto: `!fila …` (pt-BR), `!queue …` (en), `!cola …` (es). A raiz de outro idioma é ignorada sem resposta. `!filas` e `!conta` sem a raiz são inválidos e nada é enviado.
- Uma fila nova com recompensa cria a recompensa na Twitch **habilitada e pausada** (`reward-worker.mjs`). Espectadores a veem no menu de pontos, mas não conseguem resgatar. Abrir a fila despausa a recompensa, e espectadores reais **poderiam resgatá-la**.
- Excluir uma fila com recompensa envia `reward.delete` para a Twitch. Excluir uma fila que foi convertida para manual mantém a recompensa na Twitch (`converted_queue_locally_deleted_reward_preserved`). Por isso a conversão ficou adiada (seção 3).
- **Defeito suspeito, encontrado na leitura do código e a confirmar em LB-35/LB-38:** `chat-handler.mjs:266` compara `args[0] === 'confirmar'` de forma exata. O parser aceita o rótulo do idioma em qualquer caixa (`confirm` em en, `CONFIRMAR`). O resultado provável é que `!<fila> clear confirm` (en) e `!<fila> limpar CONFIRMAR` gerem uma nova prévia em vez de confirmar.

## 1. Pré-condições e checagens iniciais

| ID | Checagem | Executor | Como | Esperado |
|---|---|---|---|---|
| P-01 | Instância de dev no ar, sem reiniciar | @qa | `curl -sk https://localhost:3000/health` | `status ok`, `database/twitch_api/twitch_integration/twitch_chat = connected`, `twitch_rewards = available`. Observado pelo @qa ao escrever (2026-10-26): exatamente isso, `product_version v0.2.0-0000000-beta`, `last_reconciliation_at null` |
| P-02 | Linha de base limpa do banco | @qa | `sg docker -c "docker exec queuebot-dev-ts-subarushogun-gi-twich-bot-db-1 psql -U queuebot -d queuebot -Atc '<consulta>'"` (socket dentro do contêiner; nunca exibir a senha de `.local/dev-db/`) | Observado ao escrever: 0 filas, 0 entradas, 0 widgets, 0 resgates, 0 linhas abertas na outbox |
| P-03 | **Linha de base das recompensas na Twitch** | Orion | Painel de criador → Recompensas para espectadores → Pontos do canal → Gerenciar recompensas. Captura de tela mais a lista escrita dos títulos | Salva antes do LB-06; é a referência da limpeza |
| P-04 | Sessão do painel | Orion | Abrir `https://localhost:3000/`, aceitar a CA de dev, manter uma aba no painel | A visão geral carrega sem erro |
| P-05 | Chat pronto | Orion | Abrir `https://www.twitch.tv/popout/subarushogun/chat` logado como o dono | Consegue digitar. Deixar as respostas do bot visíveis |
| P-06 | Sessão de API somente leitura do @qa | @qa | `curl -sk -c .local/live-battery/jar -H 'Origin: https://localhost:3000' https://localhost:3000/api/session`, depois apenas GETs com `-b` | `{csrfToken}` (não registrar). Sessão em memória, inofensiva |
| P-07 | Cursor do log | @qa | `wc -l .local/dev-session.log`, guardado como linha inicial | Usado pelo LB-41 |
| P-08 | Decisões do proprietário | Orion → proprietário | Confirmar: (a) ao vivo ou offline (offline é preferível: menos espectadores expostos à janela aberta); (b) LB-17/LB-37 aceitos (recompensa resgatável por ≤30 s, com custo de 1.000.000 pontos); (c) as mensagens de teste ficam no histórico do chat | Registrado na evidência |

Regras para toda a execução: horário em UTC (`date -u +%H:%M:%S`). O Orion digita no chat só o que está escrito aqui. Manter pelo menos 6 s entre mensagens e esperar a resposta do bot antes do próximo comando. Não repetir texto **idêntico** em menos de 31 s: a regra de mensagem idêntica da Twitch pode valer (não confirmado para o dono do canal; evitar mesmo assim). Se aparecer um resgate inesperado, parar e perguntar ao proprietário antes de qualquer reembolso.

## 2. Casos

Legenda: **Vis.** = visível no canal (chat ou menu de pontos). As consultas ao banco usam o comando do P-02.

### Painel

**LB-01 Visão geral e health** — Orion: abrir `/`, clicar em "Atualizar" e depois usar Tab para voltar ao botão. Esperado: cards de health conectados e recompensas disponíveis, conta atual "Streamer", 0 filas, 0 operações pendentes; o foco continua no botão depois da atualização. @qa: P-01 de novo, com os mesmos valores. Vis.: não.

**LB-02 Conexão e reconciliação** — Orion: `/connection/`. Esperado: canal `subarushogun` exibido como texto; nenhum valor de segredo, token ou `broadcasterId` exibido; "Reconectar" **não** é clicado. Clicar em "Reconciliar". Esperado: conclusão localizada, sem pendências. @qa: o `last_reconciliation_at` do `/health` deixa de ser nulo. Vis.: não (leitura na Twitch).

**LB-03 Idioma do painel** — Orion: mudar para English, recarregar e voltar para pt-BR. Esperado: o texto só muda depois da confirmação da API e a escolha persiste após recarregar. @qa: `select value from settings where key='product_locale'` → idioma e revisão sobem e terminam em pt-BR. Vis.: não (o efeito no chat é o LB-38).

**LB-04 Permissões de comando** — Orion: `/commands/`. Mudar `queue:lista` de follower para moderator, salvar e recarregar. Esperado: valor persistido, revisão +1; linhas fixas (`add`, `remover`, `proximo`, …, `conta <nome>`) travadas. Restaurar follower e salvar. **Se o painel pedir autorização da Twitch para restaurar follower, parar e chamar o proprietário.** @qa: a chave `chat_command_policies` de `settings` termina com `queue:lista = follower`. Vis.: não.

**LB-05 Criar a fila manual B** — Orion: `/new-queue/`, modo "somente manual", slug `teste-b`, alias `tb`, título `[TESTE] Fila B manual`, mensagem de chamada `{user}, sua vez na {queue} (posição {position})`, prazo de 3 min. Esperado: fila criada, sem recompensa na Twitch. @qa: linha em `queues` com `queue_mode=manual_only` e `reward_id null`; `queue_keys` contém `teste-b` e `tb`; nenhuma linha `reward.*` na outbox. Vis.: não.

**LB-06 Criar a fila A com recompensa** — Orion: slug `teste-a`, título `[TESTE] Fila A QA`, custo 1000000, máximo por live 1, máximo por pessoa 1, prazo de 3 min. Esperado: pendente e depois sincronizada. @qa: `reward_id` preenchido, `remote_sync_status='synced'`, `is_open=false`, `reward.create` na outbox como `confirmed`. Orion: o painel de criador mostra `[TESTE] Fila A QA` **pausada**. Vis.: **sim** (recompensa pausada no menu).

**LB-07 Erros seguros na criação** — Orion: tentar o slug `fila` (reservado), o slug `teste-b` (duplicado) e um título de 46 caracteres. Esperado: mensagens localizadas para 400/409/400, sem stack nem despejo de código; o formulário mantém o que foi digitado. @qa: continuam 2 filas, nenhuma linha nova na outbox. Vis.: não.

**LB-08 Configurações locais** — Orion: fila B → mudar o prazo para 2 e salvar; depois tentar a mensagem `{user} {foo}` → erro localizado de template. @qa: `call_timeout_min=2`, `version` +1, mensagem inalterada. Vis.: não.

**LB-09 Versão desatualizada** — Orion: abrir as configurações da fila B em duas abas; salvar uma mudança na aba 1 e depois uma mudança diferente na aba 2. Esperado: a aba 2 recebe a mensagem de conflito/desatualizado com caminho para atualizar e não sobrescreve a aba 1. @qa: o valor da aba 1 foi o que persistiu. Vis.: não.

**LB-10 Editar a recompensa vinculada (QRA-04)** — Orion: fila A → configurações da recompensa: título `[TESTE] Fila A QA ed`, custo 999999. Esperado: aceito como pendente e depois sincronizado. @qa: `reward.update` na outbox como `confirmed`, `version` da fila +1. Orion: o painel de criador mostra o novo título/custo, ainda pausada. Vis.: **sim**.

**LB-11 Adição manual no painel (QRA-10)** — Orion: fila A (fechada, com recompensa) → adicionar `subarushogun`; depois adicionar `qa_inexistente_zz9q` (não deve existir na Twitch). Esperado: 1 entrada aguardando; para a segunda, "não encontrado" localizado (404). @qa: `entries` com `source` manual, `redemption_id null`, nenhuma outbox financeira. Vis.: não.

**LB-12 Prioridade auditada (QRA-07)** — Orion: marcar a entrada como prioridade (motivo: decisão do operador) e depois remover a prioridade. Esperado: o selo aparece e some. @qa: `audit_logs` tem os dois eventos e `priority_class` volta para `standard`. Vis.: não.

**LB-13 Chamada pelo painel (QRA-13)** — Orion: fila A → chamar a entrada. Esperado: a mensagem de chamada aparece no chat (`@subarushogun, sua vez!` padrão ou o texto configurado). @qa: entrada com `status=called`, `call_notified_at` e `call_deadline_at ≈ notificação + 3 min` preenchidos, `chat.call:<id>` na outbox como `confirmed`. Vis.: **sim**.

**LB-14 Reenviar chamada (QRA-12)** — Orion: ≥35 s depois do LB-13, "Reenviar chamada". Esperado: retorno de "na fila, ainda não entregue" e depois uma segunda mensagem de chamada no chat. @qa: `call_deadline_at` **inalterado** (comparar com o LB-13); `entry.call_notification_resent` em `audit_logs`; outbox `confirmed` de novo. Vis.: **sim**.

**LB-15 Transições de atendimento e histórico (QRA-11/05)** — Orion: iniciar o atendimento, depois concluir; expandir o histórico. Esperado: a entrada aparece no histórico como concluída. @qa: `status=completed`, `finished_at` preenchido; nenhuma linha `redemption.*` na outbox (entrada manual). Vis.: não.

**LB-16 Limpar pelo painel (QRA-14/15)** — Orion: adicionar `subarushogun` de novo na fila A → "Limpar" → prévia (1 pessoa, 0 reembolsos) → confirmar. Esperado: fila vazia e retorno acessível. @qa: entrada `removed`, 0 linhas financeiras na outbox. Vis.: não.

**LB-17 Abrir/fechar a fila A pelo painel (QRA-16)** — exige o P-08(b). Orion: abrir → esperar a confirmação → fechar em ≤30 s. Esperado: pendente e depois aberta; pendente e depois fechada. @qa: `reward.set_open` confirmado duas vezes na outbox, `is_open=false`, `remote_sync_status='synced'`; `redemptions` continua 0. Orion: o painel de criador mostra a recompensa pausada de novo. Vis.: **sim** (janela de resgate).

**LB-18 Operações** — Orion: `/operations/`. Esperado: lista vazia e resumo 0; nenhuma ação de tentar de novo/resolver. @qa: GET `/api/operations` = `[]`. Vis.: não.

### Widgets e overlay

**LB-19 Criar widgets e link de uso único** — Orion: `/widgets/`, criar W1 `queue_waiting_count` (fila B), W2 `called_viewer_display_name`, W3 `account_label`, W4 `queue_state` (fila A). Copiar cada link, fechar o diálogo e reabri-lo. Esperado: o link só aparece uma vez e reabrir o diálogo não o revela. Manter os links só no navegador e não colá-los em nenhum relatório. @qa: 4 linhas em `overlay_widgets` com `capability_hash` não nulo (não exibir o valor). Vis.: não.

**LB-20 Overlay no Chrome** — Orion: abrir cada link numa aba própria (`/overlay.html?ref=…#token`). Esperado: o fragmento some da barra de endereço; W1=0, W2=texto alternativo, W3="Streamer", W4=fechada; a aba Network do DevTools não carrega chunks do painel. Vis.: não.

**LB-21 Rotação da capability (regenerar)** — depois do LB-34. Orion: regenerar o W1 e observar a aba antiga do W1. Esperado: a aba antiga é limpa em ~2 s e continua vazia depois de recarregar; o novo link funciona. @qa: `capability_version` +1. Vis.: não.

**LB-22 Revogar** — Orion: revogar o W2 e observar a aba dele. Esperado: a aba é limpa e continua vazia depois de recarregar. @qa: `revoked_at` preenchido. Vis.: não.

### Chat (Orion digita; @qa confere banco/log)

**LB-23 Ping** — `!fila ping`. Esperado: `Pong 🏓 Bot ativo · v0.2.0-0000000-beta · Twitch: <n> ms` (ou "latência indisponível"). Vis.: **sim**.

**LB-24 Ajuda** — `!fila comandos`, depois `!teste-b comandos`. Esperado: os dois dão o aviso para o streamer apontando para a página "Comandos". Vis.: **sim**.

**LB-25 Filas** — `!fila filas`. Esperado: `Filas disponíveis: teste-a (fechada), teste-b…` (registrar o sufixo da fila B como observado). Vis.: **sim**.

**LB-26 Conta** — `!fila conta` → `Conta atual: Streamer.`; `!fila conta QA Teste` → `Conta atual: QA Teste.`; conferir que o W3 atualiza em ≤2 s e que a visão geral do painel mostra o novo nome; `!fila conta reset` → `Conta atual: Streamer.` @qa: o rótulo de `settings.account_state` volta ao padrão. Vis.: **sim**.

**LB-27 Entrada e duplicidade** — `!teste-b add subarushogun` → `@subarushogun adicionado à fila.`; W1=1. Depois `!tb add subarushogun` (alias, texto diferente) → `Essa pessoa já está ativa nesta fila.` @qa: 1 entrada ativa, `source` manual. Vis.: **sim**.

**LB-28 Lista e posição** — `!teste-b` → título + `Aguardando: 1. @subarushogun`; `!tb lista` → mesmo conteúdo; `!teste-b posicao` → `@subarushogun, você está na posição 1.` Vis.: **sim**.

**LB-29 Próximo e aviso de chamada** — `!teste-b proximo` → `1 pessoa chamada.` mais o aviso de chamada com o texto do LB-05 (`posição 1`). O W2 mostra o nome; W1=0. `!teste-b posicao` → `@subarushogun, você foi chamado.` @qa: `chat.call` confirmado na outbox, prazo ≈ +2 min (LB-08). Vis.: **sim**.

**LB-30 Presença** — `!teste-b presente` → `@subarushogun, presença confirmada…`. @qa: `call_acknowledged_at` preenchido e status ainda `called` (não inicia o atendimento). Vis.: **sim**.

**LB-31 Atender e concluir** — `!teste-b atender` → `Atendimento iniciado.`; `!teste-b concluir` → `Atendimento concluído.` @qa: `completed`; nenhuma outbox financeira. Vis.: **sim**.

**LB-32 Prazo (sem presença)** — Orion: mudar o prazo da fila B para 1 no painel. `!teste-b add subarushogun`, depois `!teste-b proximo`; **não** digitar `presente`. Esperar 2 min 30 s. Esperado: **nenhuma** mensagem do bot quando o prazo vence; a entrada vai para o histórico como ausente; o W2 é limpo. @qa: `status=no_show`, `terminal_reason='call_timeout'`, `finished_at ≥ call_deadline_at + 60 s`. Vis.: **sim** (só o add e o próximo).

**LB-33 Remoção e saída** — `!teste-b add subarushogun`; `!teste-b remover subarushogun` → `Pessoa removida.`; `!tb add subarushogun`; `!teste-b sair` → `Você saiu da fila.`; depois de ≥31 s, `!tb sair` → `Você não está nesta fila.` @qa: `removed` com os motivos `operator_removed` e `viewer_left`; nenhum reembolso. Vis.: **sim**.

**LB-34 Limpar pelo chat** — `!teste-b add subarushogun`; `!teste-b limpar` → `Confirme em até 15 segundos com !teste-b limpar confirmar: 1 pessoas…; 0 reembolsos…`; em até 15 s, `!teste-b limpar confirmar` → `Fila limpa: 1 pessoas removidas; 0…`; depois `!tb limpar` → `A fila já está vazia.` Vis.: **sim**.

**LB-35 Sondagem: caixa da confirmação** — `!tb add subarushogun`; `!teste-b limpar`; em até 15 s, `!teste-b limpar CONFIRMAR`. Esperado pelo contrato: a limpeza é confirmada. Resultado suspeito (pelo código): uma nova prévia. Registrar o que acontecer. Se não confirmar, terminar com `!tb limpar confirmar`. @qa: 0 entradas ativas no fim. Vis.: **sim**.

**LB-36 Erros seguros no chat** — `!teste-b proximo 11` → `Use um número de 1 a 10.`; `!naoexiste lista` → `Essa fila não foi encontrada.`; `!teste-b add qa_inexistente_zz9q` → `Esse usuário da Twitch não foi encontrado.`; `!filas` e `!queue ping` → **sem resposta** (sintaxe inválida / raiz de outro idioma); `!teste-b proximo` (fila vazia) → `Não há pessoas aguardando.` @qa: o log não tem stack nem o texto dessas mensagens. Vis.: **sim**.

**LB-37 Abrir/fechar a fila A pelo chat** — exige o P-08(b). `!teste-a abrir` → `Fila aberta e recompensa confirmada.` (ou `Alteração solicitada…`); em ≤30 s, `!teste-a fechar` → `Fila fechada e recompensa pausada.` @qa: o mesmo do LB-17. Vis.: **sim**.

**LB-38 Idioma do chat (en) + sondagem** — Orion: painel → English. `!queue ping` → Pong em inglês; `!fila ping` → sem resposta; `!teste-b add subarushogun` (em en o rótulo também é `add`); `!teste-b clear` → pedido de confirmação em inglês; em até 15 s, `!teste-b clear confirm`. Contrato: confirma. Suspeita: uma nova prévia. Se preciso, terminar com `!teste-b clear confirmar` e registrar o resultado. Painel de volta para pt-BR; `!fila ping` volta a responder (≥31 s depois do `!fila ping` anterior). Vis.: **sim**.

### Recuperação e erros seguros

**LB-39 Recompensa removida na Twitch (OPS-11 AC4)** — Orion: criar a fila C `teste-c`, `[TESTE] Fila C remocao`, custo 1000000 (sincronizada e pausada). No painel de criador da Twitch, **excluir** essa recompensa. No painel do bot, "Reconciliar". Esperado: a fila C sai da lista ativa sem vazar erro. @qa: fila C com `lifecycle_status='deleted'`, `is_archived=true`, `remote_sync_status='deleted'`, `reward_id` mantido e auditoria registrada. Orion: o painel de criador não tem `[TESTE] Fila C`. Vis.: **sim** (recompensa pausada por alguns minutos).

**LB-40 Sessão, CSRF, origem, bearer do overlay** — @qa, curl sem efeito de domínio: `POST /api/queues` sem CSRF → 403 com texto genérico; com `Origin: https://evil.example` → 403 `Origem inválida.`; `Host: 127.0.0.1:9999` → 403; `GET /overlay/api/widget` sem bearer → 401 `Widget indisponível.`; com bearer malformado → 401. Nenhum corpo de resposta traz stack, caminho ou SQL. @qa: a contagem de `queues` não muda. Vis.: não.

**LB-41 Logs sem vazamento** — @qa: em `.local/dev-session.log` a partir da linha do P-07, contar (sem exibir) as ocorrências de `access_token|refresh_token|Bearer |client_secret|password|postgres://|oauth:`, dos textos de teste (`QA Teste`, `sua vez na`) e de linhas de stack (`    at `). Esperado: 0 segredos/strings de conexão; nenhum corpo de chat ou resgate; qualquer erro traz só código/`referenceId`. Vis.: não.

**LB-42 Excluir a fila A com recompensa (QRA-22)** — faz parte da limpeza. Orion: excluir a fila A com a confirmação. Esperado: exclusão pendente e depois a fila some da lista. @qa: `reward.delete` na outbox como `confirmed`, `lifecycle_status='deleted'`. Orion: o painel de criador não tem `[TESTE] Fila A…`. Vis.: **sim**.

**LB-43 Excluir a fila manual B e os widgets** — faz parte da limpeza. Orion: excluir a fila B e os widgets W1–W4; as abas antigas do overlay são limpas. @qa: fila B excluída sem nenhuma linha `reward.*` na outbox; `overlay_widgets.deleted_at` preenchido nos 4. Vis.: não.

## 3. Não executáveis agora

| Item | Motivo |
|---|---|
| Entrada por resgate, reembolso ao remover/ausência/limpar, consumo ao concluir, tentar de novo/resolver em operações | O dono não resgata as próprias recompensas, e um espectador real exigiria reembolso real (precisa do OK do proprietário) |
| QRA-08/09 candidatas/associação de recompensa | Exige o estado `create_unknown`; para chegar nele seria preciso forçar uma falha na Twitch |
| QRA-19/20 arquivamento local, QRA-21 desarquivar | Exige estado remoto não confirmado; o QRA-18 foi aposentado junto com o painel vanilla |
| QRA-23 cancelar exclusão | A janela entre o pedido e a execução do worker é curta demais para ser confiável |
| QRA-17 conversão para manual | Deixa uma recompensa `[TESTE]` pausada na Twitch (a exclusão a preserva), e a limpeza teria de ser feita à mão no painel de criador. Adiado até o proprietário autorizar |
| Mover/reordenar (`mover`, QRA-06) e prioridade mudando a ordem | Exige 2 ou mais pessoas diferentes; adicionar terceiros reais os mencionaria no chat. Precisa de uma segunda conta controlada pelo proprietário |
| Permissões de espectador, verificação de seguidor, cooldown, `presente` de quem não foi chamado, Shared Chat | O único ator é o streamer (cargo 5); precisa de uma conta de espectador |
| `referenceId` num 500/503 inesperado | Exige uma falha interna (parar o banco/Fastify), o que esta bateria proíbe. A evidência que cobre isso é a unitária/de integração (tabelas QRA) mais o LB-41 |
| Caminhos 401/429/5xx/timeout da Twitch | Não dá para induzir com segurança no canal real |
| OBS/CEF nativo | Teste do próprio proprietário, depois |
| Idioma espanhol no chat, modo UID visível, troca automática de conta por chamada (OPS-11 AC1), tecnologia assistiva | Pouco valor por mensagem ou exige configuração extra; fora desta rodada |

## 4. Ordem de execução (agrupa as mensagens no chat)

1. **Preparação silenciosa (≈15 min, sem chat):** P-01…P-08 → LB-01, LB-02, LB-03, LB-04, LB-05, LB-07, LB-08, LB-09, LB-18 → LB-06, LB-10 (visível na Twitch, só no menu) → LB-19, LB-20.
2. **Bloco de chat 1 — consultas (≈1 min, 6 s entre mensagens):** LB-23, LB-24, LB-25, LB-26.
3. **Bloco de chat 2 — caminho feliz na fila B (≈2 min):** LB-27, LB-28, LB-29, LB-30, LB-31.
4. **Chamadas pelo painel na fila A (≈2 min):** LB-11, LB-12, LB-13, (esperar 35 s) LB-14, LB-15, LB-16.
5. **Bloco de chat 3 — prazo (≈3 min, quase tudo espera):** LB-32. Enquanto isso, o @qa executa o LB-40.
6. **Bloco de chat 4 — remoção/limpeza/erros (≈3 min):** LB-33, LB-34, LB-35, LB-36. Depois LB-21, LB-22.
7. **Janela de resgate (≈1 min, só com o P-08(b)):** LB-17 e depois LB-37, em sequência com um intervalo curto.
8. **Bloco de chat 5 — idioma (≈2 min):** LB-38.
9. **Recompensa removida:** LB-39.
10. **Limpeza:** LB-42, LB-43, seção 5 e, por último, o LB-41.

Intervalos: ≥6 s entre comandos, esperando a resposta; ≥31 s antes de repetir texto idêntico. Total esperado: cerca de 45–60 mensagens (dono + bot).

## 5. Limpeza exata e confirmação

1. Garantir que nenhuma fila está aberta (`is_open=false` em todas) e que nenhuma tem entrada ativa (`entries` com status `waiting/called/in_progress` = 0).
2. Excluir a fila A (LB-42) e a fila B (LB-43); a fila C já foi aposentada (LB-39). Excluir W1–W4.
3. Restaurar: idioma do produto `pt-BR` (LB-03/38), conta `Streamer` (LB-26), `queue:lista = follower` (LB-04).
4. @qa, banco: `select slug, lifecycle_status, remote_sync_status, is_open from queues` → todas `deleted`; `select operation_type, status, count(*) from outbox group by 1,2` → nada em `pending/processing/retry/unknown/failed`; `select count(*) from redemptions` = 0; todos os `overlay_widgets` com `deleted_at`.
5. Orion, Twitch: a lista de recompensas no painel de criador é igual à linha de base do P-03 (nenhum título começando com `[TESTE]`); o menu de pontos na página do canal não tem `[TESTE]`. Captura de tela.
6. @qa: `/health` continua conectado; `rm` de `.local/live-battery/jar` (só o arquivo de cookies que o @qa criou).
7. Não é removido: as mensagens do chat (ficam no histórico; o proprietário decide se limpa), as lápides locais no banco de dev descartável (esperado; o próximo `dev:start` cria um banco novo) e a própria instância (o Orion decide).

## 6. Template de evidência (um por caso)

```
### LB-xx — <título>
- Resultado: PASS | FAIL | BLOCKED | NÃO EXECUTADO
- Início/fim UTC: hh:mm:ss / hh:mm:ss
- Executor: Orion (navegador/chat) | @qa (API/banco/log)
- Observado (texto literal do chat/painel; sem token/link):
- Conferência banco/API (consulta + resultado, sem segredos):
- Visível no canal: sim/não
- Observação / desvio / ID de defeito:
```

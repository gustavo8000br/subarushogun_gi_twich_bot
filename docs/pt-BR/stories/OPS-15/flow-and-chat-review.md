# OPS-15 — Cobertura de fluxos e revisão das respostas no chat da Twitch (lentes de QA 1 e 4)

**Revisor:** @qa (Quinn), revisão estática independente e somente leitura. **Data:** 2026-10-21. **Branch:** `feat/ops-15-next-panel`.
**Método:** li os arquivos de código e de teste e fiz greps rápidos. Não executei suítes, navegador, Compose, Twitch nem OBS. Todas as afirmações abaixo vêm da leitura dos arquivos, não de execução. Versão em inglês: [`../../../stories/OPS-15/flow-and-chat-review.md`](../../../stories/OPS-15/flow-and-chat-review.md).

## Lente 1 — Cobertura ponta a ponta por página Next

Camadas: **U** = unitário (`tests/unit/next-*`), **A** = API com PostgreSQL descartável, **B** = E2E só de navegador com API interceptada (`tests/e2e/*-browser-only.mjs`), **C** = jornada Chromium no Compose sobre Next, Fastify e PostgreSQL reais (`tests/integration/compose-runtime.test.js`, começando em `goto /new-queue/`), **O** = OBS/CEF nativo.

| Página | Fluxos principais (incl. erro/recuperação) | U | A | B | C | O | Veredito |
|---|---|---|---|---|---|---|---|
| `/` visão geral | snapshot, estado vazio, falha da API e nova tentativa | sim | parcial | **não** | **não** (só checagem HTTP de rota, linha 393) | n/a | CONCERNS |
| `/queues` | ciclo de vida, configurações, recompensa, entrada manual, resolução de recompensa, reenvio de chamada, limpeza, histórico, reordenação/prioridade, arquivamento | sim | sim | sim (8 scripts) | sim | n/a | PASS nos fluxos cobertos. A limpeza só tem teste unitário e a entrega no chat nunca é observada |
| `/new-queue` | criação manual, criação com recompensa aceita/incerta, validação, prévia da mensagem | sim | sim | sim | sim (só manual) | n/a | PASS (manual). A criação com recompensa só tem cobertura B |
| `/commands` | carregar políticas, editar cargo mínimo, conflito/falha ao salvar | sim | sim | **não** | **não** | n/a | CONCERNS |
| `/connection` | início do OAuth, callback `?oauth=error`, desconexão, estados de credencial | sim | parcial | **não** | **não** | n/a | CONCERNS (maior risco) |
| `/operations` | lista, nova tentativa, resultados `unknown`, falha | sim | parcial | **não** | **não** | n/a | CONCERNS |
| `/settings` | troca e persistência do idioma, rótulo da conta, falha de CSRF | sim | sim | **não** | **não** | n/a | CONCERNS |
| `/widgets` | criar/revogar capability, copiar URL, opções de privacidade | sim | sim | **não** | **não** | n/a | CONCERNS |
| `overlay` | polling de 1 s, revogação, segredo no fragmento, fronteira do bundle, paridade | sim | sim | sim (4 scripts) | não | **não** | CONCERNS (falta OBS) |

### Fluxos SEM evidência de navegador, por risco

1. **`/connection`: OAuth de ponta a ponta e recuperação de erro.** Envolve credenciais e redirecionamentos e bloqueia tudo que depende da Twitch.
2. **`/widgets`: criar/revogar capability e o overlay perceber a revogação.** É uma fronteira de privacidade e segurança.
3. **`/settings`: troca de idioma refletida no painel, no chat e no overlay, mantida após recarregar.** Esse idioma controla o idioma do chat (Lente 4).
4. **`/commands`: edição de política com conflito de versão.** Uma política errada muda em silêncio quem pode usar comandos no chat.
5. **`/operations`: resultados `unknown`/`retry`.** A veracidade financeira aparece aqui.
6. **Limpeza em `/queues` no navegador** e **criação com recompensa na camada C**.
7. **`/` visão geral** com a API fora do ar.
8. **Overlay no OBS/CEF nativo** (#57).

### Lista mínima de novos E2E (proposta, não implementada)

| # | Camada | Cenário |
|---|---|---|
| E1 | B | `/connection`: iniciar OAuth sem token no DOM ou na URL; `?oauth=error` mostra recuperação localizada; desconexão com confirmação e com falha |
| E2 | C | `/widgets`: criar capability → abrir overlay → revogar na UI → overlay para de renderizar dentro da janela de polling |
| E3 | C | `/settings`: trocar para `en` → recarregar → painel em `en`; o catálogo de chat projetado reflete `en` |
| E4 | B | `/commands`: alterar o cargo mínimo e salvar; depois, um 409 de versão desatualizada mostra recuperação sem perder a edição |
| E5 | B | `/operations`: `unknown` e `retry` nunca aparecem como "confirmado" |
| E6 | B | Limpeza em `/queues`: prévia → confirmação → feedback; caminho de cancelamento |
| E7 | B | `/`: erro 500 mostra mensagem genérica com `referenceId`, e a nova tentativa recupera |
| E8 | O | Checklist nativo do OBS/CEF para o overlay (recarga, revogação), registrado como evidência |

## Lente 4 — Respostas no chat da Twitch

### Inventário de mensagens enviadas

- **Não há sussurros.** Nenhuma chamada `whisper` existe em `apps/`.
- **Respostas a comandos:** `chat-handler.mjs` → `reply()` → `twitch.sendChatMessage`, sem aguardar resultado e com `.catch(onError)`. Os textos vêm de `apps/web/localization/catalogs/chat/{pt-BR,en,es}.tsv`, com fallback pt-BR fixo em `CHAT_FALLBACKS`. A ajuda e o ping vêm de `help.mjs`.
- **Notificação de chamada:** enfileirada em `queue-routes.mjs:613/619` (painel) e em `chat-handler.mjs:208` (`!<fila> proximo`). É renderizada e enviada pela outbox durável `outbox/chat-worker.mjs` → `helix-adapter.mjs:173`.
- Os avisos de seguidor têm limite por pessoa. Os outros comandos passam por `claimChatCommand` (banco) ou por um cooldown de 5 s em memória (mods e streamer ficam isentos).

### Achados

| ID | Sev. | Achado | Evidência |
|---|---|---|---|
| CH-1 | ALTA | **A mensagem de chamada padrão existe só em pt-BR e não diz como confirmar presença.** O worker e o `proximo` usam `'{user}, sua vez!'`. Além disso, `validCallMessage()` na API troca *em silêncio* um template ausente ou com mais de 350 caracteres por esse texto. O padrão do painel é localizado e inclui `{command}` → `!<slug> presente`. Em fila criada pela API ou no fallback, quem assiste em en/es recebe texto em português e ninguém explica como confirmar antes do prazo. Esse é exatamente o escopo da OPS-14/#65. | `chat-worker.mjs:26`, `chat-handler.mjs:207`, `queue-routes.mjs:811`, `panel/en.tsv:647` |
| CH-2 | ALTA | **A rota de criação não valida os placeholders.** A atualização de configurações rejeita `{tokens}` desconhecidos (`:395`), mas a criação (`:351`, `:362`) só verifica o tamanho. Tokens desconhecidos vão para o chat sem alteração. | `queue-routes.mjs` |
| CH-3 | MÉDIA | **`{uid}` vira um fragmento já formatado** (`" · UID 123"`), não o valor puro. O template `UID: {uid}` gera `UID:  · UID 123`. A prévia do painel usa `uid: ''` e por isso não mostra esse resultado. A privacidade está correta (resolvida no envio), mas o significado do token não está documentado. | `chat-worker.mjs:24-30`, `new-queue-form.jsx:24-27` |
| CH-4 | MÉDIA | **A chamada é renderizada duas vezes, de formas divergentes.** O `proximo` monta o texto com `previousPosition` e o enfileira. O worker ignora esse texto e renderiza de novo com `callPosition` e outra fonte de conta. Esse trabalho é descartado, e os dois caminhos podem divergir com o tempo. | `chat-handler.mjs:205-209` |
| CH-5 | MÉDIA | **As novas tentativas perdem o dado de rate limit e não têm limite.** O `catch {}` chama `retryDelay({})` e ignora o `retryAfterSeconds` do erro 429. `isSent:false` com `dropReasonCode` (por exemplo, AutoMod) é tentado indefinidamente, com espera de até 1 h. Não há estado terminal `failed` nem motivo visível para quem opera. Nunca vira confirmação, o que é seguro, mas quem opera fica sem um sinal acionável. | `chat-worker.mjs` |
| CH-6 | MÉDIA | **O sufixo de truncamento da ajuda está fixo em pt-BR** (`'… Catálogo completo no painel.'`). `renderQueueCommandHelp` e `renderPingResponse` não passam o sufixo localizado, então uma ajuda longa em en/es termina em português. O fallback `'usuario'` vem sem acento. | `help.mjs` |
| CH-7 | MÉDIA | **As respostas a comandos não têm garantia de entrega.** Comandos que mudam estado (`sair`, `remover`, `limpar confirmar`, `abrir`) gravam a mudança e depois respondem. Se a resposta se perder, o chat fica sem retorno. Para confirmações simples isso é aceitável, mas a decisão precisa ser registrada. A única mensagem durável é a chamada. O anúncio de início de atendimento (#65) ainda não existe. | `chat-handler.mjs:138-143` |
| CH-8 | BAIXA | **Faltam plurais.** `clear_confirm` e `clear_done` geram "1 pessoas" e "1 reembolsos". | catálogos de chat |
| CH-9 | BAIXA | **Texto com gênero em pt-BR/es** ("você foi chamado", "adicionado/agregado"). Vale considerar uma redação neutra. | catálogos |
| CH-10 | BAIXA | **Tratamento de tamanho.** `slice(0,500)` conta unidades UTF-16 e pode cortar um emoji ao meio. As listas de chamados e em atendimento no `lista` não têm limite antes do truncamento. | `chat-handler.mjs:117,170-174` |
| CH-11 | BAIXA | **UID na lista** segue `showUidInList`, conforme `docs/front-end-spec.md:32`. O formato do UID em `add` não é validado no handler; essa validação é delegada ao repositório e não foi verificada aqui. | `chat-handler.mjs:260` |
| CH-12 | DOC | **`!<fila> presente` não está documentado** no `docs/USER_GUIDE-en_US.md`, e não encontrei guia de uso em pt-BR em `docs/pt-BR/`. | grep |
| CH-13 | TESTE | Os testes de chat são só unitários (27 casos no handler e 4 no worker). Não há testes para o texto das respostas em es, para o truncamento da ajuda, para o 429 nem para `dropReasonCode`. Não há evidência de entrega real na Twitch. | `tests/unit/chat-*.test.js` |

### Veracidade

Os estados pendentes têm redação honesta. O prazo da chamada só começa com `sent === true`. A privacidade do UID é reavaliada no envio. Nenhuma mensagem diz que um reembolso foi confirmado quando ele só foi solicitado. Ponto positivo.

### Lacunas de planejamento e relação com a OPS-14 / #65

- CH-1, CH-3, CH-4 e CH-7 (anúncio durável de início de atendimento) pertencem à **OPS-14/#65**, que continua separada (`docs/project-completion-roadmap.md:19`, `issue-triage.md:30`). A OPS-15 não deve assumi-los. A prévia do painel promete uma instrução de presença que o servidor nunca gera sozinho em filas criadas pela API ou no fallback. Registre essa divergência na story da OPS-15 como conhecida, não como paridade.
- CH-2, CH-5 e CH-6 não estão em nenhuma story. Recomendo que o @po os inclua na #65 ou abra uma sub-issue (via @devops).
- O token `{command}` existe só no padrão do catálogo do painel e não está em `CALL_MESSAGE_TOKENS`. Antes de implementar a #65, decida se ele vira um token real no servidor ou se é expandido ao salvar.

## Gate (este escopo)

**CONCERNS.** `/queues` e `/new-queue` (manual): PASS. `/`, `/commands`, `/connection`, `/operations`, `/settings` e `/widgets`: CONCERNS (sem evidência de navegador). `overlay`: CONCERNS (sem OBS/CEF). Respostas no chat: CONCERNS (CH-1/CH-2 ALTA). Esses achados não bloqueiam o trabalho de painel da OPS-15, porque o comportamento do chat é escopo da OPS-14. Eles bloqueiam qualquer alegação de paridade de chat ou de idioma.

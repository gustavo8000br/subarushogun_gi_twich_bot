# OPS-15 — Decisão de contrato da API (S-04, S-05, S-06, S-14)

- Data: 2026-10-22 · Autoria: @architect (Aria) · Tipo: gate de planejamento (sem código, sem migrations, sem alterações em issues)
- Entradas: `api-contract-research.md` (@analyst), `structural-review.md` S-04/S-05/S-06/S-14, código em `feat/ops-15-next-panel` HEAD `4a44468`.
- Rótulos: **VERIFICADO** (lido no código ou em fonte oficial nesta sessão), **PARCIAL** (fonte incompleta ou secundária), **NÃO VERIFICADO** (inferência; precisa de teste neste projeto).
- Limite: revisão de mesa. Nada aqui foi executado contra PostgreSQL, API reiniciada, navegador ou OBS. Cada "decisão" abaixo é um contrato a ser provado com Red primeiro; não é evidência de que algo funciona.

## 0. Correções e novas constatações em relação à pesquisa

| # | Constatação | Rótulo |
|---|-------------|--------|
| N1 | Os números de linha da pesquisa estão defasados: o preHandler está em `queue-routes.mjs:115-138`, a chave com escopo de sessão em **`:127`**, o retorno antecipado em 5xx em `:141`; os hooks de sessão em `local-session.mjs:36-62`. | VERIFICADO |
| N2 | **Nenhum dos clientes lê o texto de `error`.** O `request()` vanilla guarda só `code`/`referenceId`/`status` (`apps/web/app.js:45-56`) e renderiza via `presentPanelError` (`apps/web/panel-error-presentation.mjs`), que nunca usa a prosa do servidor. O cliente Next faz o mesmo (`apps/frontend/lib/api/client.mjs:41-45`). A afirmação da pesquisa de que "o vanilla lê `error`" está errada. `error` só é fixado por testes (73 ocorrências em `tests/unit/queue-routes.test.js`). | VERIFICADO |
| N3 | **503 deliberados** das rotas (Twitch indisponível: `queue-routes.mjs:490,508,522,539` etc.) também caem no retorno `>= 500`, então uma resposta normal de "Twitch fora do ar" também deixa a chave presa em `processing`. O S-04 não é só sobre quedas. | VERIFICADO |
| N4 | **Credencial em repouso:** o id da sessão é o valor do cookie. Ele é gravado em `processed_operations.operation_key` (`:127`) e em `audit_logs.actor_id` (`queue-repository.mjs:485,502,513,...`; `schema.prisma:140`). Hoje é inofensivo só porque as sessões morrem com o processo; vira vazamento de credencial válida se as sessões passarem a ser persistentes (opção A do S-05). | VERIFICADO |
| N5 | O id da sessão também amarra o fluxo OAuth da Twitch (`queue-routes.mjs:228,305,318,323`). Um reinício da API no meio do OAuth quebra esse fluxo independentemente do S-05; a reinicialização não o recupera (a pessoa reinicia a conexão). | VERIFICADO |
| N6 | A fixture QRA já modela `LOCAL_SESSION_REQUIRED` para 401 (`tests/e2e/fixtures/qra-api-fixtures.mjs:68`), e o catálogo já mapeia `PANEL_OPERATION_ALREADY_IN_PROGRESS` (`apps/web/panel-error-presentation.mjs:29`), embora o servidor nunca o envie. As fixtures estão à frente do servidor. | VERIFICADO |
| N7 | A conclusão é gravada no `onSend`, **fora** da transação de domínio. Uma queda entre o commit de domínio e `completePanelOperation` deixa `processing` com o trabalho já confirmado. Qualquer tomada de lease pode, portanto, reexecutar uma operação já confirmada. | VERIFICADO (código); consequência por rota NÃO VERIFICADA |
| N8 | Só o fetch do token OAuth tem timeout explícito (`twitch/oauth.mjs:28`, 10 s). O grep não encontrou `requestTimeout` do Fastify nem timeout nas demais chamadas Twitch, então "a rota mais longa" hoje não tem limite. | PARCIAL (só grep) |
| N9 | `draft-ietf-httpapi-idempotency-key-header-07` está Expired, sem RFC e sem sucessor listado (reconferido em 2026-10-22). A RFC 9457 é Standards Track (julho de 2023), torna obsoleta a 7807, permite extensões que devem ser ignoradas se desconhecidas e proíbe expor detalhes de implementação. | VERIFICADO |

## 1. S-04 — Idempotência

### Decisões

| ID | Decisão | Justificativa / trade-off |
|----|---------|---------------------------|
| D4.1 | **5xx = falha reexecutável, não resposta armazenada**, mas só para rotas comprovadamente seguras para reexecução. Cada rota recebe uma classe: `reexecutable` (guarda de domínio comprovada por teste em PostgreSQL: checagem de versão, `idempotencyKey @unique` da outbox, pré-condição de estado) ou `terminal_unknown`. Em 5xx: `reexecutable` → a linha vira `failed_retryable` (sem corpo) e a mesma chave + mesmo fingerprint executa de novo. `terminal_unknown` → a linha vira `completed` com `503 { code: 'OPERATION_OUTCOME_UNKNOWN' }` armazenado, e a UI orienta a pessoa operadora a atualizar o estado (os fluxos "incertos" já existentes). | O "armazenar o 5xx" puro do Stripe v1 é seguro, mas deixa a pessoa operadora travada (o mesmo problema relatado no S-04). O "liberar" puro só é seguro onde reexecutar é inofensivo (N7). O híbrido torna o caso inseguro explícito em vez de contar com a sorte. Toda rota começa como `terminal_unknown` e só é promovida com evidência. |
| D4.2 | **Lease** em `processing`: `lease_until = now() + 60 s`. Uma requisição com a mesma chave e o mesmo fingerprint após a expiração assume com uma única instrução condicional (`UPDATE ... WHERE operation_key = $1 AND state = 'processing' AND lease_until < now() RETURNING ...`); zero linhas = outra requisição é dona → 409. Nunca ler-e-depois-escrever. A tomada segue a classe da rota de D4.1 (`terminal_unknown` → `OPERATION_OUTCOME_UNKNOWN` armazenado, sem reexecução). | 60 s só faz sentido se toda chamada externa dentro da requisição tiver timeout bem abaixo disso (N8). **Pré-condição:** timeouts explícitos (proposta: ≤ 15 s) nas chamadas Twitch dos caminhos de requisição, verificados por rota antes de o lease entrar. |
| D4.3 | **Payload divergente → 422 `IDEMPOTENCY_KEY_REUSED`** (draft §2.7), no lugar do 409 atual. | Nenhum cliente distingue 409 de 422 (N2: ambos mapeiam por `code`), então a troca de status é segura para os dois painéis. VERIFICADO pela leitura dos dois clientes; precisa ser fixado por teste. |
| D4.4 | **Em andamento (lease válido) → 409 `IDEMPOTENCY_IN_PROGRESS` + `Retry-After: 2`**. Renomear ou criar alias para a chave de catálogo existente `PANEL_OPERATION_ALREADY_IN_PROGRESS` (N6); um único código, escolhido pelo proprietário (ver §8). | O cliente não entra em laço automático em 409; a UI pode oferecer nova tentativa após a dica. |
| D4.5 | **Retenção:** apagar linhas `panel_mutation` em `completed`/`failed_retryable` com mais de **24 h**, e linhas `processing` cujo lease expirou há mais de 24 h. O reaper roda na inicialização da API e em intervalo no processo da API (não no worker, que não é dono das linhas do painel). Publicar a política em `endpoint-catalog-inventory.md` (draft §2.3). Só linhas com `kind = 'panel_mutation'` são tocadas; as linhas de cooldown/mensagem do chat e de `queue.local_archive.challenge` (`queue-repository.mjs:405-423,598-664`) mantêm seu próprio ciclo de vida. | 24 h cobrem qualquer tempo de vida de página neste produto (as chaves vivem no estado do componente). |
| D4.6 | **Escopo da chave: remover o id da sessão.** Nova chave: `panel:v2:${idempotencyKey}`. O app tem uma única pessoa operadora local; a chave é um UUID v4 gerado no cliente (122 bits aleatórios). | Resolve o acoplamento S-04/S-05 (um reinício não muda mais o escopo) e tira a credencial de `operation_key` (N4). Trade-off: uma resposta armazenada pode ser reproduzida por qualquer sessão nesta máquina que conheça a chave. Mesma máquina, mesma pessoa operadora, só loopback: aceito. O prefixo `v2` evita colisão com linhas antigas, que são removidas pelo D4.5. O servidor também deve restringir o formato da chave ao que os clientes enviam (só UUID, ou manter a regex exigindo ≥ 32 caracteres) — escolha do proprietário em §8. |
| D4.7 | **Cliente: uma chave por intenção da pessoa usuária.** Uma intenção (clicar em "chamar próxima", enviar "criar fila", confirmar "limpar" etc.) cria a chave uma vez, guardada no estado do componente (`useRef`), nunca em `localStorage`. A mesma chave só é reutilizada no caminho incerto (`status 0`, 5xx com `failed_retryable`, 409 em andamento e a nova tentativa única do S-05). A chave é descartada quando o resultado é conhecido (2xx, 4xx, `OPERATION_OUTCOME_UNKNOWN`). Qualquer mudança no payload do formulário cria nova intenção (senão 422). Sem laços automáticos de nova tentativa de mutação. | Coerente com a UX de resultado incerto já existente. O vanilla mantém UUID por chamada (sem mudança; será removido). |
| D4.8 | **Cabeçalho de replay** `idempotency-replayed: true` mantido; o caso especial do segredo de uso único do overlay (`queue-routes.mjs:142-146`) mantido sem mudança. Replays nunca reenviam `set-cookie` nem outros cabeçalhos armazenados. | |
| D4.9 | **Migration: sim, aditiva, responsabilidade do @data-engineer** (perguntas em §7). Guardar o estado em `result Json` funcionaria, mas a tomada atômica e o reaper precisam de colunas indexadas. | |

## 2. S-05 — Sessão e CSRF

| ID | Decisão | Justificativa / trade-off |
|----|---------|---------------------------|
| D5.1 | Códigos no hook `onRequest`: 401 `LOCAL_SESSION_REQUIRED`, 403 `CSRF_INVALID`, 403 `ORIGIN_INVALID`, 403 `HOST_INVALID`. Mesmos status de hoje. | `tests/unit/local-session.test.js` só confere status (pesquisa §4), então continua verde; acrescentar asserções de `code`. |
| D5.2 | **Opção C agora:** manter o armazenamento em memória. O cliente faz **uma** reinicialização transparente (promise compartilhada single-flight para chamadas concorrentes) em `LOCAL_SESSION_REQUIRED` ou `CSRF_INVALID` e depois **uma** nova tentativa da mesma requisição com a **mesma chave de idempotência**. GETs: sempre elegíveis. Mutações: elegíveis porque esses 401/403 vêm do `onRequest`, antes do preHandler de idempotência e do handler, então nada foi executado (VERIFICADO pela ordem dos hooks no código; a fixar por teste). Nunca tentar de novo em `ORIGIN_INVALID`/`HOST_INVALID`, `SESSION_INITIALIZATION_FAILED` ou numa segunda falha de sessão; nesse caso, mostrar a mensagem do catálogo "sessão reiniciada — recarregue o painel". | Mais estreito do que "reenviar mutações automaticamente": só a requisição rejeitada antes de qualquer trabalho é repetida, uma vez, com a mesma chave. Precisa de aprovação do @ux-design-expert (≥ 9,0) porque muda o que a pessoa operadora vê. |
| D5.3 | **Opção A (cookie de sessão persistente assinado/criptografado) fica adiada** e **bloqueada** até que: (a) `audit_logs.actor_id` e todo outro uso em repouso deixem de gravar o id bruto da sessão (usar um id de operador não secreto ou um HMAC do id), (b) exista uma solução para segredo durável (geração, permissões de arquivo, rotação com 2 chaves), (c) a amarração do estado OAuth seja revista (N5). Reavaliar só se a reinicialização se mostrar incômoda no uso real. | A sem (a) transforma cada linha de auditoria numa credencial válida (N4). C não tem segredo novo, tabela nem migration. |
| D5.4 | Endurecimento opcional, na mesma fatia do D5.1: rejeitar mutações cujo `Sec-Fetch-Site` esteja presente e não seja `same-origin` (sinal primário da OWASP), mantendo a checagem de Origin como fallback. | Barato; precisa de teste com e sem o cabeçalho (CEF/OBS podem omiti-lo — nunca exigi-lo). |

## 3. S-06 — Envelope de erro

- **Decisão D6.1:** todo corpo não 2xx é `{ code, referenceId?, error? }`. `code` é o contrato (SCREAMING_SNAKE, enumerado). `referenceId` só em falhas inesperadas (já feito por `safe-http-error-handler.mjs`). `error` permanece como **campo de diagnóstico obsoleto** enquanto os testes atuais o fixam e depois é removido. Nenhum cliente pode renderizá-lo (já é assim, N2).
- **D6.2:** manter `application/json`. Adotar os nomes de campo da RFC 9457 depois (`type: urn:queuebot:error:<code>`, `status`, `title`) só após a remoção do vanilla; `code` continua como membro de extensão. Clientes ignoram membros desconhecidos (RFC 9457 §3.2).
- **D6.3:** localização só no cliente: `ERROR_KEYS[code]` → chave de catálogo em en/es/pt-BR; desconhecido → `panel.error.generic`. Paridade de catálogos garantida por `validate:localization`.
- **D6.4:** teste de guarda: varrer os registros de rota (ou exercitar cada caminho de falha) e falhar se algum `reply.code(>=400).send(...)` não tiver `code` da lista enumerada.

### Pontos que ainda enviam texto pt-BR sem `code` (VERIFICADO por grep no HEAD)

| Arquivo | Linhas | Área |
|---------|--------|------|
| `apps/api/src/http/local-session.mjs` | 41, 46, 49, 56, 60 | host, origem, sessão, CSRF |
| `apps/api/src/http/queue-routes.mjs` | 121, 124, 130, 135, 136 | idempotência |
| `queue-routes.mjs` | 179, 199, 211, 219, 223, 224, 234, 236, 246, 253, 256, 263, 264, 265 | catálogo de comandos / autorização de seguidores |
| `queue-routes.mjs` | 271, 277, 281, 283 | operações, reconciliação |
| `queue-routes.mjs` | 291, 293, 299, 306 | configuração / app Twitch |
| `queue-routes.mjs` | 342, 345, 348, 373 (`userError`) | criação de fila |
| `queue-routes.mjs` | 441, 456, 461, 462, 470, 474, 477, 478, 485, 486 | fila / entrada / prioridade |
| `queue-routes.mjs` | 490, 508, 515, 517, 518, 522, 531, 536, 539 | associação de recompensa (alguns têm `referenceId`, mas não `code`) |
| `queue-routes.mjs` | 545, 546, 547, 565, 581, 589, 590, 611, 617, 631, 636, 642, 654, 663, 675, 694, 753, 761 | entrada manual, transições, chamada, limpeza, ciclo de vida |
| `queue-routes.mjs` | 797, 803, 804, 806 | nomes de conta |
| `queue-routes.mjs` | 812-821 `userError()` | mapeia códigos de domínio para texto pt-BR, mas **descarta o código de domínio** do corpo |
| `apps/api/src/http/overlay-routes.mjs` | 34, 54, 68, 77, 90, 99, 111, 114, 117 | administração do widget e widget público |

`userError()` é o ganho mais barato: o código de domínio já existe (`DUPLICATE_QUEUE_KEY`, `RESERVED_QUEUE_KEY`, ...); basta enviá-lo como `code`.

### Plano em etapas que mantém os testes verdes

1. **Aditivo:** acrescentar `code` ao lado do `error` existente em cada ponto. Testes com `toEqual({ error })` vão falhar, então na mesma mudança atualizá-los para `toEqual({ code, error })` (explícito, sem afrouxar para `toMatchObject`). As fixtures que já têm `code` (QRA-01..04, 08) permanecem; QRA-05/06/07 ganham `QUEUE_NOT_FOUND`, `ENTRY_NOT_WAITING`/`INVALID_QUEUE_POSITION`, `ENTRY_NOT_WAITING`.
2. **Catálogo:** chaves para cada código novo em en/es/pt-BR e extensão de `ERROR_KEYS`; `panel-error-presentation.test.js` ganha uma linha por código.
3. **Teste de guarda** (D6.4) é ligado depois que a etapa 1 cobrir todos os pontos.
4. **Após a remoção do vanilla (autorizada pelo proprietário):** remover `error`, atualizar asserções para só `{ code }`; nomes da RFC 9457 opcionais.

## 4. S-14 — Comparação de caminho

- **D14.1:** comparar o pathname sem query string nos três lugares: `local-session.mjs:55` (isenção de sessão), `local-session.mjs:58` (isenção de CSRF de `/callback`) e `queue-routes.mjs:116` (isenção de idempotência). Um helper compartilhado para que não divirjam. Usar o pathname interpretado, não `routeOptions.url` (indefinido em 404 no `onRequest`; não reconferido na documentação do Fastify nesta rodada — NÃO VERIFICADO).
- Nota de segurança: a mudança amplia as isenções apenas às variantes `?query` do **mesmo** caminho; não pode normalizar `//api/session`, `%2F` ou barra final para um casamento. Testes: `/api/session?x=1` → isento; `/api/session/`, `/api/sessionx`, `/api//session`, `/api/%73ession` → não isentos; `/callback?code=..` → isento de CSRF só para GET, como hoje.

## 5. Compatibilidade com os testes e fixtures existentes

| Arquivo | Impacto |
|---------|---------|
| `tests/unit/queue-routes.test.js` | Muitas asserções `toEqual` com `{ error }` (etapa 1 do S-06); `beginPanelOperation` falso sem lease/estado de falha (`:81-85,:113`); 409 de fingerprint → 422; caminhos 5xx passam a concluir como `failed_retryable` / `OPERATION_OUTCOME_UNKNOWN`. |
| `tests/unit/local-session.test.js` | Hoje só status: compatível; acrescentar códigos e casos do S-14. |
| `tests/unit/overlay-routes.test.js` | Uma asserção de `error`; acrescentar códigos. |
| `tests/unit/next-api-client.test.js` | Fixa fábrica de chave, `REQUEST_FAILED/0`, `SESSION_INITIALIZATION_FAILED`; acrescentar reinicialização single-flight, uma nova tentativa, mesma chave, sem nova tentativa em ORIGIN/HOST. |
| `tests/unit/panel-error-presentation.test.js` | Linhas para códigos novos; possível renomeação de `PANEL_OPERATION_ALREADY_IN_PROGRESS`. |
| `tests/unit/next-queue-clear.test.js`, `next-queue-creation.test.js`, `next-queue-lifecycle.test.js`, `next-queue-entry-actions.test.js`, `next-locale-picker.test.jsx` | Reuso da chave por intenção no caminho incerto. |
| `tests/integration/queue-repository.test.js` (`:641,654` em andamento; `:1807,1868` desafio de arquivamento) | Novos casos de lease/tomada/falha/replay/reaper; as linhas de desafio de arquivamento não podem ser tocadas pelo reaper. |
| `tests/integration/qra-postgres-fixtures.test.js` (`:773-780`), `tests/helpers/ops15/qra-postgres-fixtures.mjs`, `tests/integration/postgres-foundation.test.js` (`:55-58`) | Formato do schema muda se houver colunas novas. |
| `tests/e2e/fixtures/qra-api-fixtures.mjs` e `tests/e2e/queue-*-browser-only.mjs` (creation-uncertain, manual-entry-recovery, reward-settings-recovery, settings-recovery, lifecycle, reward-resolution, call-resend) | Prova, em navegador real, da nova tentativa com a mesma chave e da reinicialização de sessão. |
| `tests/unit/aiox-static-review.test.js` | Sem impacto; nenhuma mudança de revisor. |

## 6. Revisão de segurança (mudanças de CSRF e sessão)

- **Modelo de ameaça:** página ou extensão hostil no mesmo navegador; outros processos locais. Atacantes remotos são barrados por loopback + checagem de Host. VERIFICADO (código); o modelo de ameaça é uma premissa aceita pelo proprietário.
- **Reinicialização + nova tentativa (D5.2):** `/api/session` é um GET que define o cookie e devolve o token CSRF. Uma página de outro site não consegue ler essa resposta (política de mesma origem; nenhum cabeçalho CORS encontrado — VERIFICADO por grep), e a checagem de Origin rejeita mutações de outra origem. A nova tentativa é feita pelo nosso próprio cliente depois de ler o token novo, então não enfraquece o CSRF. Risco a testar: um `<img src=/api/session>` de outro site pode criar sessões (crescimento de memória) — já hoje; o `Map` de sessões cresce sem limite (VERIFICADO, `local-session.mjs:6,71`). Acrescentar limite ou reuso na mesma fatia.
- **Sem token CSRF em cookie, sem double-submit ingênuo** (OWASP). A opção C mantém o synchronizer token.
- **Escopo da chave sem sessão (D4.6):** o replay fica limitado a sessões da mesma máquina que já conheçam uma chave de 122 bits. Aceito para app local com uma pessoa operadora; registrado como decisão do proprietário.
- **Credencial em repouso (N4):** tirar o id da sessão de `operation_key` reduz a exposição agora; `audit_logs.actor_id` continua sendo bloqueio duro para a opção A.
- **Logs:** códigos novos e eventos de lease não podem registrar chaves, tokens, cookies ou corpos (regra do projeto). Registrar `code`, padrão de rota e, no máximo, um hash truncado da chave de operação.
- **Corpos de erro:** apenas códigos, sem mensagens internas (RFC 9457 §5, regra do projeto).

## 7. Perguntas para o @data-engineer (dono do schema)

1. Colunas ou JSON: acrescentar `state text`, `lease_until timestamptz null`, `updated_at timestamptz`, `kind text` em `processed_operations`, ou manter tudo em `result` e usar `UPDATE` condicional por caminho JSON? Qual dá uma tomada realmente atômica no PostgreSQL em READ COMMITTED?
2. Backfill: linhas `panel_mutation` existentes presas em `processing` (formato antigo `panel:<sessão>:<chave>`) — apagar ou marcar `failed_retryable`? Elas nunca mais serão casadas após o D4.6, então apagar parece seguro; confirmar.
3. Linhas que não são do painel (cooldown/mensagem do chat, desafio de arquivamento): as colunas devem ser anuláveis / com default para que esses escritores (`queue-repository.mjs:405-423,598-664`) não mudem? Ou as linhas do painel devem ir para uma tabela separada?
4. Índices: índice parcial em `(updated_at) WHERE kind = 'panel_mutation'` e em `(lease_until) WHERE state = 'processing'` — vale a pena no volume esperado (uma pessoa operadora, poucas centenas de linhas por dia)?
5. `completePanelOperation` deveria rodar dentro da transação de domínio (fecha o N7 nas rotas que usam uma)? É viável com o formato atual do repositório, e qual o custo?
6. Segurança da migration: só aditiva, sem reescrita de tabela, reversível por migration para frente; confirmar contra as fixtures PostgreSQL da QRA.

## 8. Decisões do PROPRIETÁRIO

1. Aceitar a política híbrida de 5xx do D4.1 (padrão `terminal_unknown`, promoção por rota com evidência em PostgreSQL) em vez de liberar sempre ou armazenar sempre.
2. Aceitar remover o id da sessão da chave (D4.6) e o trade-off de replay; escolher a regra de formato da chave (só UUID ou regex atual com ≥ 32 caracteres).
3. Aceitar a troca de status 409 → 422 para payload divergente.
4. Escolher um único código de "em andamento": `IDEMPOTENCY_IN_PROGRESS` (novo) ou o existente `PANEL_OPERATION_ALREADY_IN_PROGRESS`.
5. Aceitar a opção C agora e a opção A adiada/bloqueada (D5.3).
6. Aprovar a nova tentativa única e limitada de uma mutação rejeitada pelo `onRequest` (D5.2).
7. Retenção de 24 h.
8. Momento de remover `error` e de adotar os nomes da RFC 9457 (ligado à autorização, já reservada, de remover o vanilla).

**@ux-design-expert (≥ 9,0 antes de qualquer fatia voltada à pessoa usuária):** texto e fluxo para "sessão reiniciada — recarregue", reinicialização silenciosa (se algum indicador aparece), "operação em andamento — tente de novo em instantes", `OPERATION_OUTCOME_UNKNOWN` ("confira o estado atual antes de repetir") e quais ações expõem o botão "repetir a mesma ação". Revisão estática e validação real em navegador/OBS são notas separadas.

## 9. Rollout em fatias (Red primeiro)

| Fatia | Escopo | Critério de entrada | Evidência Red primeiro | Critério de saída |
|-------|--------|---------------------|------------------------|-------------------|
| 1 | Códigos do S-06 nos pontos de sessão + idempotência, helper do S-14, `userError` envia o código de domínio | Itens 3-4 do proprietário; story + issue pelo @devops | Testes unitários falhando que exigem `code` em cada ponto e a matriz de caminhos do S-14 | Todos os gates verdes; nenhuma mudança de comportamento além dos campos do corpo e da isenção com query string |
| 2 | Demais pontos do S-06 + catálogos + teste de guarda | Fatia 1 integrada | Teste de guarda falha listando os pontos sem código | Guarda verde; `validate:localization` verde; catálogos en/es/pt-BR |
| 3 | Reinicialização de sessão + uma nova tentativa no cliente (só Next) | Nota UX ≥ 9,0; itens 5-6 do proprietário | Testes unitários: single-flight, uma nova tentativa, mesma chave, sem nova tentativa em ORIGIN/HOST; teste de integração com reinício da API falha hoje | Teste de reinício passa; e2e em navegador para a reinicialização |
| 4 | Servidor do S-04: migration, lease, estado de falha, 422, 409+Retry-After, reaper, escopo v2, timeouts externos | Respostas do @data-engineer em §7; itens 1-2 e 7 do proprietário | Integração PostgreSQL (migrations reais, banco descartável) falhando para: preso após 5xx, tomada após lease expirado, tomada concorrente (exatamente um vencedor), divergência 422, replay, reaper preserva linhas que não são do painel | Tudo verde em PostgreSQL isolado; sem SQLite nem mocks de Prisma |
| 5 | Promoção por rota para `reexecutable` | Fatia 4 | Por rota: teste de execução duplicada falha ou prova a guarda | Tabela de rotas documenta a classe de cada uma com referência ao teste |
| 6 | Chaves por intenção no cliente do S-04 | Fatias 3-5; textos de UX | Testes unitários + suítes e2e de recuperação falham com chave nova a cada tentativa | Mesma chave observada na nova tentativa no e2e em navegador |
| 7 | Remover `error`; RFC 9457 opcional | Remoção do vanilla autorizada | Testes exigindo só `{ code }` | Gates verdes |

## 10. Complexidade (dimensões do Spec Pipeline)

| Dimensão | Nota (1-5) | Motivo |
|----------|------------|--------|
| Escopo | 4 | ~90 pontos de resposta, 2 módulos HTTP, repositório, schema, cliente Next, catálogos, muitos testes |
| Integração | 3 | Chamadas Twitch dentro dos caminhos de requisição determinam o lease e a segurança da reexecução |
| Infraestrutura | 3 | Migration aditiva + reaper; nenhum serviço novo |
| Conhecimento | 3 | Padrões de idempotência/lease são conhecidos; o comportamento das guardas por rota não está verificado |
| Risco | 4 | Execução duplicada de operações Twitch/financeiras se uma rota for promovida por engano |
| **Total** | **17 → COMPLEX** | Executar como stories/fatias separadas com ciclo de revisão; não juntar a fatia 4 com trabalho de UI |

## 11. Riscos

| Risco | Mitigação |
|-------|-----------|
| Reexecução após operação confirmada mas não concluída (N7) | Padrão `terminal_unknown`; promoção só com prova em PostgreSQL; avaliar concluir dentro da transação de domínio (§7 P5) |
| Lease menor que uma requisição real (N8) | Timeouts externos explícitos antes do lease entrar |
| Tempestade de novas tentativas | Sem laços automáticos de mutação; reinicialização única; apenas dica `Retry-After` |
| Volume de mudanças em testes escondendo mudança de comportamento | Atualização explícita de `toEqual` por ponto, sem afrouxar para matchers parciais |
| `Map` de sessões sem limite | Limite ou reuso de sessões na fatia 3 |
| Opção A no futuro vazar credenciais pelos logs de auditoria (N4) | Bloqueio duro no D5.3 |

## 12. Fontes

- Draft IETF (Expired, reconferido em 2026-10-22): <https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/>
- RFC 9457: <https://www.rfc-editor.org/rfc/rfc9457.html>
- Stripe, requisições idempotentes: <https://docs.stripe.com/api/idempotent_requests>
- Brandur Leach, chaves de idempotência estilo Stripe em Postgres: <https://brandur.org/idempotency-keys>
- OWASP CSRF Prevention Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html>
- Armadilhas citadas pela comunidade (PARCIAL, secundário): reserva atômica vs checar-e-inserir, chaves presas por queda sem lease, gravar o resultado na mesma transação — <https://www.techinterview.org/post/3233467855/lld-idempotency/>, <https://docs.gleap.io/documentation/s2s/errors-idempotency>, <https://oneuptime.com/blog/post/2026-01-30-idempotency-implementation/view>

## 13. Veredito

**GO para o planejamento da implementação** (stories, issues, revisões do @data-engineer e do @ux-design-expert). **NO-GO para a implementação** até que estejam registradas as decisões do proprietário em §8, as respostas do @data-engineer em §7 (para a fatia 4) e a nota UX ≥ 9,0 (para as fatias 3 e 6). As fatias 1-2 dependem só dos itens 3-4 do proprietário, mais story e issue.

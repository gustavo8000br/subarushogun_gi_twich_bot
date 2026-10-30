# OPS-21 — Reforçar o contrato da API do painel: idempotência, recuperação de sessão, códigos de erro

[English](../../../stories/OPS-21/story.md)

**Status:** Pronta (GO do `@po` em 2026-10-22, 9/10) — gates de planejamento restantes pendentes (`@data-engineer`, `@ux-design-expert` para as fatias 3 e 6, `@qa`). Implementação por `@dev` somente após os gates, com issue criada pelo `@devops` e quando o estado da migração do painel da OPS-15 permitir; as fatias 1–2 podem ir primeiro. **Issue:** pendente `@devops` (a criar antes da implementação; sem comentários em issue).
**Origem:** Achados S-04, S-05, S-06 e S-14 da revisão estrutural ([structural-review.md](../OPS-15/structural-review.md)); pesquisa do `@analyst` ([api-contract-research.md](../OPS-15/api-contract-research.md)); decisão do arquiteto ([api-contract-decision.md](../OPS-15/api-contract-decision.md), D4.1–D4.9 e D5.1–D5.4, 7 fatias no §9, complexidade 17 COMPLEXA no §10, perguntas ao `@data-engineer` no §7, decisões do proprietário no §8).
**Relacionadas:** OPS-15 (migração do painel Next; a remoção do painel vanilla está reservada e exige autorização explícita do proprietário); FND-3 (outbox durável); FND-9 (ciclo de fila/recompensa).
**Coordenação necessária:** `$aiox-po` (validação), `$aiox-data-engineer` (migration e respostas do §7), `$aiox-ux-design-expert` (score ≥ 9,0/10 para as fatias 3 e 6), `$aiox-qa` independente, `$aiox-devops` (issue), `$aiox-architect` (consultado na promoção por rota).

## Problema

O contrato da API do painel tem quatro fragilidades ligadas (documento de decisão, §0–§4):

- **S-04 Idempotência.** Um 5xx deixa o registro em `processing` para sempre (o hook `onSend` retorna cedo em `>= 500`), inclusive 503 deliberados de rota, como “Twitch indisponível”. Uma queda entre o commit de domínio e o `completePanelOperation` também deixa `processing` com o trabalho já gravado. A chave tem escopo no id da sessão em memória, então reiniciar a API muda o escopo, e o cliente Next cria um UUID novo a cada chamada, de modo que o replay nunca cobre o caso para o qual existe.
- **S-05 Sessão.** As sessões são um `Map` em memória; reiniciar a API invalida todos os cookies, o cliente guarda o token CSRF em cache e nunca reinicializa, e 401/403 não trazem `code`, então a pessoa operadora precisa recarregar tudo sem saber por quê.
- **S-06 Códigos de erro.** Cerca de 90 pontos de resposta enviam texto pt-BR sem `code`, e os clientes os reduzem a `REQUEST_FAILED`. O `userError()` também descarta o código de domínio que já conhece.
- **S-14 Comparação de caminho.** As isenções de `/api/session` e `/callback` comparam o `request.url` exato, então uma query string as quebra (três lugares).

O id da sessão também é gravado em repouso (`processed_operations.operation_key`, `audit_logs.actor_id`), o que hoje é inofensivo apenas porque as sessões morrem com o processo.

## História

Como pessoa operadora do painel local de filas,
eu quero que a API responda toda falha com um código de erro estável, se recupere sozinha quando a API reiniciar e nunca deixe uma operação travada nem a execute duas vezes quando eu tentar de novo,
para que eu possa confiar em uma nova tentativa depois de um resultado incerto e entender o que aconteceu sem recarregar nem adivinhar.

## Critérios de aceite (refinados)

Cada CA rastreia ao documento de decisão. As evidências seguem as regras do projeto: unidade e fixtures ficam separados de PostgreSQL isolado (migrations reais, instância descartável), navegador real e OBS/CEF.

### Fatia 1 — Códigos de sessão e idempotência, helper de caminho (S-06 parcial, S-14)

1. Os hooks `onRequest` respondem 401 `LOCAL_SESSION_REQUIRED`, 403 `CSRF_INVALID`, 403 `ORIGIN_INVALID` e 403 `HOST_INVALID`, com os mesmos status HTTP de hoje. `tests/unit/local-session.test.js` ganha asserções de `code` (D5.1).
2. Os pontos de idempotência enviam `code`: chave ausente ou inválida 400 `IDEMPOTENCY_KEY_REQUIRED`; repositório indisponível 503 `IDEMPOTENCY_STORE_UNAVAILABLE`; divergência de payload `IDEMPOTENCY_KEY_REUSED` (o status continua 409 até a fatia 4); em andamento 409 `PANEL_OPERATION_ALREADY_IN_PROGRESS` (lista de códigos da pesquisa §3, achado N6 e decisão do proprietário 3).
3. O `userError()` envia como `code` o código de domínio que já mapeia (por exemplo `DUPLICATE_QUEUE_KEY`, `RESERVED_QUEUE_KEY`), mantendo `error` (decisão §3).
4. O corpo de cada ponto alterado mantém `error` durante esta story. Asserções com `toEqual({ error })` são atualizadas de forma explícita para `toEqual({ code, error })`, nunca afrouxadas para `toMatchObject`. Fixtures que já têm `code` permanecem (decisão §3, passo 1).
5. Um único helper compartilhado compara o pathname sem a query string nos três lugares: bypass de sessão e isenção de CSRF do `/callback` em `local-session.mjs`, e bypass de idempotência em `queue-routes.mjs`. Testes: `/api/session?x=1` é isento; `/api/session/`, `/api/sessionx`, `/api//session` e `/api/%73ession` não são isentos; `/callback?code=..` é isento de CSRF apenas para GET, como hoje (D14.1).
6. Endurecimento opcional na mesma fatia (D5.4): mutações com `Sec-Fetch-Site` presente e diferente de `same-origin` são rejeitadas; a checagem de Origin continua como reserva; o cabeçalho nunca é exigido (CEF/OBS pode omiti-lo). Testado com e sem o cabeçalho. Se ele será entregue fica registrado nesta story; se for entregue, os dois testes são obrigatórios.
7. Red primeiro: testes unitários falhando para o `code` de cada ponto e para a matriz de caminhos do S-14. Nenhuma mudança de comportamento além dos campos do corpo e da isenção com query string.

### Fatia 2 — Pontos restantes do S-06, catálogos, teste-guarda

8. Todos os pontos não-2xx restantes listados na decisão §3 (catálogo de comandos e autorização de seguidores, operações, reconciliação, configuração, criação de fila, fila/entrada/prioridade, associação de recompensa, transições, chamada, limpeza, ciclo de vida, rótulos de conta e `overlay-routes.mjs`) enviam um `code` de uma lista enumerada, mantendo `error`. A lista é publicada em `endpoint-catalog-inventory.md`.
9. Todo código novo tem chave de catálogo em en, es e pt-BR e entrada em `ERROR_KEYS`; códigos desconhecidos caem em `panel.error.generic`. `panel-error-presentation.test.js` ganha uma linha por código; `npm run validate:localization` passa (D6.3). Os clientes nunca exibem texto do servidor. O texto novo do catálogo é visível para a pessoa usuária, então passa por revisão do `@ux-design-expert` (≥ 9,0, regra do projeto) antes de a fatia 2 ser integrada; até lá, os códigos novos podem mapear para `panel.error.generic`.
10. Um teste-guarda (varredura de rotas ou exercício de cada caminho de falha) falha se qualquer `reply.code(>=400).send(...)` não tiver um `code` enumerado. Red primeiro: falha antes e lista os pontos sem código (D6.4).
11. Fixtures QRA: QRA-05/06/07 ganham `QUEUE_NOT_FOUND`, `ENTRY_NOT_WAITING`/`INVALID_QUEUE_POSITION` e `ENTRY_NOT_WAITING`, como na decisão §3, passo 1.

### Fatia 3 — Recuperação de sessão no cliente Next (S-05, opção C)

12. Ao receber `LOCAL_SESSION_REQUIRED` ou `CSRF_INVALID`, o cliente Next faz **uma** reinicialização transparente da sessão, com promessa compartilhada single-flight para chamadores concorrentes, e então **uma** nova tentativa da mesma requisição com a **mesma** chave de idempotência. GETs são sempre elegíveis; mutações são elegíveis porque esses 401/403 vêm do `onRequest`, antes do preHandler de idempotência e do handler (ordem dos hooks fixada por teste) (D5.2, decisão do proprietário 4).
13. Sem nova tentativa em `ORIGIN_INVALID`, `HOST_INVALID`, `SESSION_INITIALIZATION_FAILED` ou numa segunda falha de sessão. O painel então mostra a mensagem do catálogo “sessão reiniciada — recarregue o painel”. Um fluxo OAuth da Twitch interrompido por reinício da API não é recuperado pela reinicialização; a pessoa operadora reinicia a conexão (achado N5).
14. O armazenamento de sessões em memória tem limite ou reaproveita sessões, para que chamadas não autenticadas a `GET /api/session` não o façam crescer sem limite (decisão §6).
15. Red primeiro: testes unitários de single-flight, uma nova tentativa, mesma chave e nenhuma tentativa em ORIGIN/HOST em `tests/unit/next-api-client.test.js`; um teste de integração de reinício da API que falha hoje; um e2e em navegador real para a reinicialização. Texto e fluxo (inclusive se algum indicador aparece durante a reinicialização silenciosa) passam por `@ux-design-expert` ≥ 9,0 antes da implementação.
16. A opção A (cookie persistente assinado/criptografado) **não** é implementada. Fica adiada e bloqueada até que: (a) `audit_logs.actor_id` e qualquer outro uso em repouso deixem de gravar o id bruto da sessão; (b) exista uma story de segredo durável (geração, permissões de arquivo, rotação com duas chaves); (c) o vínculo do estado OAuth seja reverificado (D5.3, decisão do proprietário 4).

### Fatia 4 — Máquina de estados de idempotência no servidor (S-04 servidor)

17. Migration aditiva sob responsabilidade do `@data-engineer` em `processed_operations` (colunas de estado, lease, data de atualização e tipo, e índices conforme as respostas do §7), sem reescrita de tabela, reversível por migration futura, e sem exigir mudança nos escritores das linhas não-painel (cooldown/mensagem de chat, `queue.local_archive.challenge`) (D4.9, §7 Q1–Q6).
18. A chave de operação passa a ser `panel:v2:<key>`, sem o id da sessão; a regex atual da chave é mantida e as chaves precisam ter pelo menos 32 caracteres. Linhas antigas `panel:<sessão>:<key>` nunca mais casam; são apagadas ou coletadas conforme decidido no §7 Q2 (D4.6, decisão do proprietário 3).
19. Linhas `processing` carregam um lease de 60 s. Uma requisição com a mesma chave e o mesmo fingerprint após a expiração assume a linha com **um único comando condicional** (`UPDATE ... WHERE operation_key = $1 AND state = 'processing' AND lease_until < now() RETURNING ...`); zero linhas significa que outra requisição é a dona. Nunca ler e depois escrever. Sob concorrência, exatamente uma requisição vence (D4.2).
20. Política de 5xx (híbrida): cada rota é `reexecutable` ou `terminal_unknown` e **começa como `terminal_unknown`**. Em 5xx, `terminal_unknown` conclui a linha com `503 { code: 'OPERATION_OUTCOME_UNKNOWN' }` armazenado; `reexecutable` marca `failed_retryable` sem corpo e a mesma chave e o mesmo fingerprint executam de novo. A tomada do lease segue a classe da rota: `terminal_unknown` devolve o `OPERATION_OUTCOME_UNKNOWN` armazenado, sem reexecução (D4.1, D4.2, decisão do proprietário 2). Isso inclui 503 deliberados de rota (achado N3).
21. Divergência de payload responde **422** `IDEMPOTENCY_KEY_REUSED` (antes 409). Um teste fixa que os dois painéis mapeiam por `code` e não ramificam em 409 vs 422 (D4.3, decisão do proprietário 3).
22. Em andamento (lease válido) responde 409 `PANEL_OPERATION_ALREADY_IN_PROGRESS` com `Retry-After: 2`; nenhum código novo é criado (D4.4, decisão do proprietário 3).
23. O replay mantém `idempotency-replayed: true`; o caso especial do segredo único do overlay permanece; replays nunca reenviam `set-cookie` nem outros cabeçalhos armazenados (D4.8).
24. A retenção é de 24 h. Um reaper, executado na inicialização da API e em intervalo no processo da API (não no worker), apaga linhas `kind = 'panel_mutation'` em `completed` ou `failed_retryable` com mais de 24 h, e linhas `processing` cujo lease expirou há mais de 24 h. Nunca toca em linhas não-painel. A política é publicada em `endpoint-catalog-inventory.md` (D4.5, decisão do proprietário 2).
25. Existem timeouts explícitos (proposta ≤ 15 s) em toda chamada à Twitch dentro de caminhos de requisição, verificados por rota **antes** de o lease ser entregue; hoje só a busca do token OAuth tem um (D4.2, achado N8).
26. Logs dos novos códigos e eventos de lease nunca contêm chaves, tokens, cookies ou corpos; no máximo `code`, padrão da rota e hash truncado da chave (decisão §6).
27. Red primeiro em PostgreSQL isolado com migrations reais (sem SQLite, sem mocks de Prisma): travado após 5xx, tomada de lease expirado, tomada concorrente (exatamente um vencedor), divergência 422, replay, 409 em andamento com `Retry-After` e reaper preservando linhas não-painel. Testes existentes são atualizados de forma explícita: `beginPanelOperation` falso (lease/estado de falha), 409 para 422, caminhos 5xx, `tests/integration/queue-repository.test.js`, fixtures PostgreSQL da QRA e `postgres-foundation`.
28. A fatia 4 não é agrupada com trabalho de UI (decisão §10).

### Fatia 5 — Promoção por rota a `reexecutable`

29. Uma rota passa de `terminal_unknown` a `reexecutable` **somente** com um teste PostgreSQL que prove sua guarda de domínio (checagem de versão, `idempotencyKey @unique` do outbox ou pré-condição de estado) contra execução duplicada, incluindo falha depois do commit de domínio e antes do `completePanelOperation` (achado N7). Por rota: um teste de execução duplicada que falha primeiro ou prova a guarda.
30. A tabela de rotas documenta a classe de cada rota com referência ao seu teste. Rotas sem evidência permanecem `terminal_unknown`; não há promoção em massa (decisão do proprietário 2). Se o `completePanelOperation` roda dentro da transação de domínio (§7 Q5) fica registrado como insumo desta fatia.

### Fatia 6 — Chaves por intenção no cliente Next (S-04 cliente)

31. Uma intenção (clicar em “chamar próximo”, enviar “criar fila”, confirmar “limpar” etc.) cria uma chave uma vez, mantida no estado do componente (`useRef`), nunca em `localStorage`. A mesma chave é reutilizada apenas no caminho incerto (`status 0`, 5xx com `failed_retryable`, 409 em andamento e a nova tentativa única após reinicialização do CA 12). A chave é descartada quando o resultado é conhecido (2xx, 4xx, `OPERATION_OUTCOME_UNKNOWN`). Mudar o payload cria uma nova intenção. Sem laços de nova tentativa automática de mutação (D4.7).
32. O painel vanilla mantém UUIDs por chamada, sem mudança (D4.7).
33. Texto e fluxo de UX (`OPERATION_OUTCOME_UNKNOWN` “confira o estado atual antes de repetir”, “operação em andamento — tente de novo em instantes”, quais ações expõem “tentar a mesma ação de novo”) passam por `@ux-design-expert` ≥ 9,0 antes da implementação. Revisão estática e validação em navegador/OBS reais têm scores separados.
34. Red primeiro: as suítes unitárias (`next-queue-clear`, `next-queue-creation`, `next-queue-lifecycle`, `next-queue-entry-actions`, `next-locale-picker`) e os e2e de recuperação em navegador (creation-uncertain, manual-entry-recovery, reward-settings-recovery, settings-recovery, lifecycle, reward-resolution, call-resend) falham com chave nova por tentativa; a mesma chave é observada na nova tentativa em navegador real.

### Fatia 7 — Remover `error` (somente junto com a remoção do vanilla)

35. O campo `error` é removido somente junto com a remoção do painel vanilla autorizada pelo proprietário; as asserções passam a `{ code }` apenas. Opcional: nomes de campo da RFC 9457 (`type: urn:queuebot:error:<code>`, `status`, `title`), com `code` mantido como membro de extensão (D6.1, D6.2, decisão do proprietário 4).

## Decisões (proprietário, 2026-10-22)

1. **Story separada.** O trabalho é esta story, OPS-21, com issue criada pelo `@devops`.
2. **Política híbrida de 5xx.** Cada rota começa como `terminal_unknown`; a promoção a `reexecutable` é por rota e somente com evidência em PostgreSQL. O lease é de 60 s com tomada atômica; a retenção é de 24 h (D4.1, D4.2, D4.5).
3. **Chave e códigos.** O escopo da chave é `panel:v2:<key>`, sem o id da sessão (D4.6); a regex atual da chave é mantida, com pelo menos 32 caracteres; divergência de payload muda de 409 para 422 `IDEMPOTENCY_KEY_REUSED` (D4.3); o código existente `PANEL_OPERATION_ALREADY_IN_PROGRESS` (mais `Retry-After`) é reaproveitado para “em andamento” em vez de criar um novo (D4.4).
4. **Recuperação de sessão, opção C.** Uma reinicialização transparente com single-flight e exatamente uma nova tentativa com a MESMA chave de idempotência (D5.2). O cookie persistente fica adiado e bloqueado até que o id bruto da sessão deixe de chegar a `audit_logs` e a `operation_key` (D5.3). O campo `error` é removido somente junto com a remoção do vanilla (D6.1).

## Fora do escopo

- Opção A (cookie de sessão persistente assinado/criptografado, tabela de sessões) — adiada e bloqueada (CA 16).
- Remoção do painel vanilla e qualquer cutover (exige autorização explícita do proprietário); remoção de `error` e content type da RFC 9457 até lá.
- Laços de nova tentativa automática de mutação; um código novo de idempotência para “em andamento”.
- Alterar o fluxo OAuth da Twitch ou recuperar um fluxo OAuth interrompido por reinício da API.
- Edições de código, migrations ou issues nesta etapa de planejamento; bump de versão, commit, push, release.
- Alegações de validação em Twitch real, OBS/CEF ou navegador antes de essas suítes rodarem.

## Gates de planejamento antes da implementação

- [x] Pesquisa do `@analyst`: idempotência, sessões/CSRF, envelope de erro, comparação de caminho ([api-contract-research.md](../OPS-15/api-contract-research.md), 2026-10-22; apenas revisão de mesa).
- [x] Decisão do `@architect`: D4.1–D4.9, D5.1–D5.4, D6.1–D6.4, D14.1, fatias e complexidade 17 COMPLEXA ([api-contract-decision.md](../OPS-15/api-contract-decision.md), 2026-10-22; GO para planejamento, NO-GO para implementação até os itens abaixo).
- [x] Decisões do proprietário 1–4 registradas (2026-10-22).
- [x] Validação do `@po` desta story (checklist de 10 pontos; 2026-10-22, 9/10, GO; veja Validação do PO).
- [x] Respostas do `@data-engineer` ao §7 da decisão (Q1–Q6) e desenho da migration, necessárias antes da fatia 4 ([data-model.md](data-model.md), 2026-10-22; GO de planejamento com condições no §13; só desenho, nada executado).
- [ ] Plano e revisão do `@ux-design-expert`, score ≥ 9,0/10, necessários para as fatias 3 e 6, registrados nesta story (revisão estática distinta de validação visual, em navegador e com tecnologia assistiva).
- [ ] Plano de testes do `@qa`: PostgreSQL isolado, separação de evidências, Red primeiro por fatia.
- [ ] `@devops` cria a issue no GitHub (e vincula esta story); sem comentários em issue.

### Critérios de entrada por fatia (decisão §9)

| Fatia | Critérios de entrada |
|-------|----------------------|
| 1 | Decisão do proprietário 3; story e issue pelo `@devops` |
| 2 | Fatia 1 integrada; revisão de UX do texto novo do catálogo antes da integração (CA 9) |
| 3 | UX ≥ 9,0; decisão do proprietário 4 |
| 4 | Respostas do `@data-engineer` ao §7; decisões do proprietário 2 e 3 |
| 5 | Fatia 4 |
| 6 | Fatias 3–5; texto de UX ≥ 9,0 |
| 7 | Remoção do vanilla autorizada pelo proprietário |

## Dependências e riscos

- **Depende de:** o estado da migração do painel da OPS-15 permitir o trabalho (as fatias 1–2 podem ir primeiro); respostas do `@data-engineer` para a fatia 4; score de UX para as fatias 3 e 6; guardas existentes do outbox da FND-3 para a fatia 5.
- **Interação com a OPS-20:** a OPS-20 (elegibilidade de reembolso, issue #76) adiciona rotas do painel e uma ação manual de reembolso em `queue-routes.mjs` e toca no outbox financeiro da FND-3. Seus novos pontos não-2xx precisam de códigos enumerados (guarda do CA 10), suas mutações começam como `terminal_unknown` (CA 20) e só são promovidas com a prova da fatia 5, e a chave de outbox `financial:{redemption_id}` é uma guarda a citar, não a alterar. A story integrada por último faz rebase sobre a outra; nenhuma muda o escopo da outra.
- **Tabela de idempotência:** `processed_operations` é compartilhada com linhas de cooldown/mensagem de chat e `queue.local_archive.challenge`; o worker não é dono das linhas do painel (CA 17, CA 24).
- **Complexidade:** 17 → COMPLEXA (escopo 4, integração 3, infraestrutura 3, conhecimento 3, risco 4). Executar em fatias com ciclo de revisão.
- **Execução dupla:** um 5xx após uma mudança de domínio já gravada (N7) pode reexecutar uma operação Twitch ou financeira se uma rota for promovida indevidamente. Mitigação: padrão `terminal_unknown`, promoção apenas com prova em PostgreSQL.
- **Lease menor que uma requisição real:** chamadas Twitch sem limite (N8). Mitigação: timeouts explícitos antes de o lease ser entregue (CA 25).
- **Replay entre sessões:** sem o id da sessão na chave, uma resposta armazenada pode ser reproduzida por qualquer sessão desta máquina que conheça a chave de 122 bits. Aceito pelo proprietário para um app de operador único em loopback.
- **Credencial em repouso:** o id bruto da sessão em `audit_logs.actor_id` bloqueia a opção A.
- **Tempestade de novas tentativas:** sem laços automáticos de mutação; uma reinicialização; `Retry-After` é só dica.
- **Retrabalho de testes:** muitas asserções `{ error }`; atualizações explícitas de `toEqual`, sem afrouxar.
- **Não verificado (revisão de mesa):** comportamento de `routeOptions.url` no `onRequest` (usa-se o pathname), comportamento das guardas por rota e ausência de timeouts além da busca OAuth (apenas grep). O rascunho IETF do Idempotency-Key está Expirado; é usado como vocabulário, não como padrão.

## Segurança de testes e dados

Testes primeiro (Red). Garantias de PostgreSQL exigem integração em instância PostgreSQL isolada e descartável com migrations reais; nunca SQLite nem mocks de Prisma; não tocar em volumes ativos. Mantenha separadas as evidências de fixtures/mocks, testes unitários, PostgreSQL, navegador real e OBS/CEF. Falhas inesperadas da API retornam texto genérico localizado com `referenceId` e nunca dados internos. Sem bump de versão, push ou release sem autorização explícita do proprietário. Gates antes de fechar: `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist`, `npm run review:static` (somente OpenGrep).

## Definição de pronto

- As fatias 1–6 cumprem seus CAs e os critérios de saída do §9 da decisão, cada uma com sua evidência Red primeiro registrada por classe de evidência.
- Todos os quality gates acima verdes; gate do `@qa` registrado; lista de arquivos e checklists atualizados em en e pt-BR.
- A fatia 7 continua bloqueada pela remoção do vanilla autorizada pelo proprietário; se a story fecha com a fatia 7 em aberto ou se a fatia 7 vai para uma story seguinte é decisão do proprietário.

## Validação do PO (2026-10-22)

- **Validador:** `@po` (Pax). **Checklist:** 10 pontos (`story-lifecycle.md`) mais `story-draft-checklist.md`. **Score: 9/10 — GO** (status Rascunho → Pronta). A implementação continua bloqueada pelos gates pendentes e pelos critérios de entrada das fatias.
- **Rastreabilidade:** os 35 CAs rastreiam a D4.1–D4.9, D5.1–D5.4, D6.1–D6.4, D14.1, achados N3–N8, decisão §3/§6/§10 ou decisões do proprietário 1–4. Nenhuma invenção encontrada. Os códigos do CA 2 vêm da pesquisa §3; o código de “em andamento” segue a decisão do proprietário 3.
- **Tamanho:** 35 CAs são aceitáveis porque estão agrupados por fatia e cada fatia é testável de forma independente; sem cortes. Recomendação: uma sub-issue por fatia, para que cada fatia tenha PR e gate próprios.
- **Correções aplicadas:** (1) revisão de UX para o texto do catálogo da fatia 2, visível para a pessoa usuária (CA 9, entrada da fatia 2); (2) interação com a OPS-20 e a tabela compartilhada `processed_operations` registradas nas dependências; (3) CA 6 tornado testável (registrar se será entregue); (4) definição de pronto adicionada.
- **O que impede 10:** respostas pendentes do `@data-engineer` ao §7, UX ≥ 9,0 para as fatias 2, 3 e 6, plano de testes do `@qa` e a issue do `@devops`; o valor de timeout do CA 25 ainda é “proposta ≤ 15 s”; fechar a story com a fatia 7 pendente exige decisão do proprietário.

## Lista de arquivos

- `docs/stories/OPS-21/story.md` (novo)
- `docs/pt-BR/stories/OPS-21/story.md` (novo)
- `docs/stories.md` (entrada no índice)
- `docs/pt-BR/stories.md` (entrada no índice)

Os arquivos de implementação serão listados aqui pelo `@dev` após os gates.

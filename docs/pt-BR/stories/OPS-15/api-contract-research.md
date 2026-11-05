# OPS-15 — Pesquisa de contrato da API (S-04, S-05, S-06, S-14)

- Data: 2026-10-22 · Autor: @analyst (Atlas) · Tipo: somente pesquisa (sem código, sem alteração de issues)
- Entrada: `docs/pt-BR/stories/OPS-15/structural-review.md` (S-04, S-05, S-06, S-14) e o código no HEAD atual de `feat/ops-15-next-panel`.
- Rótulos de evidência: **VERIFICADO** (lido na fonte oficial ou no código do repositório), **PARCIAL** (fonte incompleta ou secundária), **NÃO VERIFICADO** (inferência ainda não testada neste projeto).
- Limite: pesquisa de mesa. Nada aqui foi executado contra PostgreSQL, navegador ou API reiniciada. Cada recomendação exige os testes listados no §6 antes de qualquer alegação de que funciona.

## 1. Fatos do código confirmados (VERIFICADO, repositório)

| # | Fato | Local |
|---|------|-------|
| C1 | O `preHandler` de idempotência só roda em mutações de `/api/*` e pula quando `request.url === '/api/session'` (comparação exata, incluindo a query string). | `apps/api/src/http/queue-routes.mjs:100-101` |
| C2 | Chave ausente ou inválida → 400; repositório indisponível → 503; fingerprint diferente → 409; `in_progress` → 409. Todas essas respostas têm texto pt-BR **sem `code`**. | `queue-routes.mjs:104-136` |
| C3 | `operationKey = panel:${localSession.id}:${key}`: **a chave fica atrelada ao id da sessão em memória**. | `queue-routes.mjs:127` |
| C4 | O `onSend` retorna cedo quando `reply.statusCode >= 500`, então `completePanelOperation` nunca roda e a linha fica em `state: 'processing'` sem lease nem expiração. | `queue-routes.mjs:139-150`; `apps/api/src/persistence/queue-repository.mjs:285-305` |
| C5 | `processed_operations` tem apenas `operation_key` (PK), `result Json` e `created_at`. Não há `updated_at`, coluna de expiração nem índice para limpeza. A máquina de estados vive dentro do JSON. | `apps/api/prisma/schema.prisma:175-180`; migration `202610020001_foundation` |
| C6 | As sessões ficam num `Map` do módulo. O cookie `queuebot_session` é `HttpOnly; SameSite=Lax; Secure`, sem `Max-Age`. As respostas 401/403 têm texto pt-BR sem `code`. `/api/session` e o bypass do 401 também comparam `request.url` de forma exata. | `apps/api/src/http/local-session.mjs:6,40-58,62-74` |
| C7 | O cliente Next guarda o `csrfToken` durante toda a vida da página e cria **um UUID novo a cada chamada**, a menos que quem chama passe `idempotencyKey`. Falha de transporte vira `REQUEST_FAILED/status 0`, e do corpo da resposta só `payload.code` é aproveitado (sem ele, `REQUEST_FAILED`). | `apps/frontend/lib/api/client.mjs:1-50` |
| C8 | O painel vanilla faz o mesmo: UUID novo por chamada e CSRF obtido uma única vez na inicialização. | `apps/web/app.js:25,47-48,848` |

Achado novo a partir de C3 + C6 (não consta na revisão estrutural): **S-04 e S-05 estão acoplados.** Mesmo que o cliente reutilize a chave, um restart da API gera um novo id de sessão. A mesma chave do cliente passa a corresponder a outro `operationKey`, e o resultado anterior nunca é reproduzido. Corrigir só o S-04 não cobre o caso "a API caiu no meio da requisição e voltou".

## 2. Pesquisa externa

### 2.1 Cabeçalho Idempotency-Key (IETF)

- O `draft-ietf-httpapi-idempotency-key-header-07` (2025-10-15) está **expirado** no datatracker (última atualização em 2026-04-18), sem RFC prevista. **VERIFICADO** — <https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/>. Use-o como vocabulário e boa prática, não como norma obrigatória.
- Semântica (**VERIFICADO**, <https://www.ietf.org/archive/id/draft-ietf-httpapi-idempotency-key-header-07.html>):
  - §2.2: a chave "MUST be unique and MUST NOT be reused with another request with a different request payload". §2.4: o servidor MAY usar fingerprint.
  - §2.3: o recurso MAY expirar chaves e "SHOULD define such expiration policy and publish it".
  - §2.6: após a conclusão, o servidor "SHOULD respond with the result of the previously completed operation, success or an error". Para requisição concorrente, responde com conflito.
  - §2.7: chave ausente → **400**; mesma chave com payload diferente → **422**; operação ainda em andamento → **409**. Para outros 4xx/5xx, o cliente segue a documentação do recurso. O draft não define de forma normativa como guardar ou liberar um resultado 5xx (**lacuna**).
- Diferença em relação ao código atual: hoje, fingerprint diferente retorna **409**; o draft pede **422**.

### 2.2 Provedores

- **Stripe** (API v1): guarda status e corpo "after endpoint execution begins", **inclusive 500**. Falhas de validação e conflitos com uma requisição ainda em execução **não** são guardados e podem ser repetidos. As chaves podem ser removidas após 24 h. Os parâmetros são comparados, e divergência gera erro. Recomenda UUID v4 e nada de dados pessoais na chave. Na API v2, a Stripe conclui o trabalho que falhou em vez de reproduzir o erro. **VERIFICADO** — <https://docs.stripe.com/api/idempotent_requests> (consultado em 2026-10-22).
- **Adyen**: chaves valem de 7 a 14 dias. Uma duplicata que chega com a primeira ainda em andamento recebe 422/409 com código 704. O cabeçalho de resposta `transient-error: true` significa "repita depois com a mesma chave". Um 503 com código 703 indica que o armazenamento de idempotência está indisponível. **VERIFICADO** — <https://docs.adyen.com/development-resources/api-idempotency/>. Se resultados transitórios são guardados: **NÃO VERIFICADO** (a documentação não diz).
- **PayPal** (`PayPal-Request-Id`): após timeout ou **5xx**, repita com o mesmo id; a nova tentativa devolve o estado atual da requisição anterior. A retenção depende da API, e duplicatas simultâneas podem falhar. **PARCIAL** — <https://developer.paypal.com/api/rest/reference/idempotency/>.
- **Brandur Leach, "Implementing Stripe-like Idempotency Keys in Postgres"** (2017-10-27): **lease** via `locked_at` (um lock mais antigo que o timeout pode ser assumido por uma nova requisição; caso contrário, 409); pontos de recuperação para cada fase atômica; num 500 inesperado, **o lock é liberado** para que uma nova tentativa possa rodar; falha externa permanente grava uma resposta final, e falha transitória responde 503 com a chave ainda reutilizável; chaves são removidas após 24 a 72 h. **VERIFICADO** (fonte secundária, mas reconhecida) — <https://brandur.org/idempotency-keys>.

**Síntese:** há duas políticas válidas para 5xx:
(a) *guardar e reproduzir* o 5xx (Stripe v1). Só é segura se o 5xx significar "nada foi gravado".
(b) *liberar* a chave: marcar como `failed` e deixar que uma nova tentativa com o mesmo fingerprint rode de novo, ou deixar o lease expirar (Brandur, PayPal, erros transitórios da Adyen).
Neste repositório, as rotas gravam estado no PostgreSQL e linhas na outbox dentro de transações de domínio, então um 5xx depois do commit é possível (por exemplo, uma falha de serialização ao montar a resposta). A opção (b) só é segura se as proteções de domínio (versões, `idempotencyKey @unique` da outbox em `schema.prisma:116`) tornarem a reexecução inofensiva. Isso está **NÃO VERIFICADO** para cada rota e precisa ser confirmado rota a rota, como o S-04 já aponta.

### 2.3 Sessões e CSRF

- **OWASP CSRF Prevention Cheat Sheet** (**VERIFICADO**, <https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html>):
  - Aplicações com estado usam o synchronizer token, e esse token não deve ir num cookie.
  - Aplicações sem estado devem usar o double-submit *assinado*: um HMAC com segredo do servidor, vinculado ao id da sessão e com um valor aleatório. O double-submit ingênuo não é recomendado.
  - `Sec-Fetch-Site` é o sinal principal, e a checagem de Origin é obrigatória como fallback.
  - SameSite é apenas defesa em profundidade. Um cabeçalho customizado (`X-CSRF-Token`) obriga o navegador a fazer preflight CORS em requisições de outra origem.
- **`@fastify/secure-session`**: sessão sem estado no servidor, com o cookie cifrado via libsodium. As chaves podem ser rotacionadas com um array (no máximo 2 recomendadas), e o `expiry` padrão é de 1 dia. **VERIFICADO** — <https://github.com/fastify/fastify-secure-session>. Limite de tamanho do cookie e ritmo de manutenção: **NÃO VERIFICADO**.
- O app roda em loopback, com uma única pessoa operadora. A ameaça é uma página hostil no mesmo navegador, não um atacante remoto. As checagens de Host e Origin já existem (C6).

### 2.4 Contrato de erros

- **RFC 9457** (julho de 2023, substitui a RFC 7807): `application/problem+json`. `type` é uma URI e o identificador principal (padrão `about:blank`). `title` não muda entre ocorrências, "except for localization". `detail` descreve a ocorrência específica. Membros de extensão são permitidos, e clientes devem ignorar os desconhecidos. Não expor detalhes internos. **VERIFICADO** — <https://www.rfc-editor.org/rfc/rfc9457.html>.
- Leitura prática: um membro de extensão estável `code` (SCREAMING_SNAKE) é uma extensão válida da RFC 9457. O cliente localiza pelo `code` usando os catálogos en/es/pt-BR que já existem. O texto do servidor passa a ser opcional e serve só para diagnóstico.

## 3. Contratos recomendados

### S-04 — Máquina de estados de idempotência

1. **Estados** guardados em `result` (ou em colunas, ver §5): `processing` (com `leaseUntil`), `completed` (status + corpo) e `failed_retryable`.
2. **Em caso de 5xx**, o `onSend`/`onError` grava `failed_retryable` (sem corpo). Uma nova tentativa com **a mesma chave e o mesmo fingerprint** roda de novo. Fingerprint diferente → **422 `IDEMPOTENCY_KEY_REUSED`** (draft §2.7).
3. **Lease**: um `processing` com `leaseUntil` vencido (sugestão: 60 s, acima do timeout da rota mais lenta, incluindo chamadas à Twitch) é considerado abandonado. A próxima requisição com o mesmo fingerprint o assume de forma **atômica** (`UPDATE … WHERE state='processing' AND lease_until < now()` condicional), nunca com ler e depois gravar. Isso cobre a queda do processo, quando o `onSend` nunca chega a rodar.
4. **Em andamento** (lease válido) → **409 `IDEMPOTENCY_IN_PROGRESS`** com `Retry-After: 2`.
5. **Reprodução**: manter `idempotency-replayed: true` para resultados 2xx/4xx que foram guardados. Manter o caso especial do segredo único do overlay (`queue-routes.mjs:142-146`).
6. **Escopo**: trocar `operationKey` de `panel:${sessionId}:${key}` para `panel:${key}` (a chave é um UUID aleatório de 122 bits, e só existe uma pessoa operadora) ou para um escopo durável de operador. Sem isso, o caso de restart do §1 continua descoberto. Trade-off: com a chave desvinculada da sessão, uma chave vazada poderia reproduzir uma resposta guardada para outra sessão na mesma máquina. Num app local de um único usuário em loopback isso é aceitável, mas precisa do aval do @architect.
7. **Retenção**: apagar linhas `completed`/`failed` após 24 h (como a Stripe), por um reaper no worker existente ou na inicialização, e publicar essa política em `endpoint-catalog-inventory.md` (draft §2.3).
8. **Cliente**: uma chave por **intenção da pessoa usuária** (`createIntent()` devolve `{ key }`), reutilizada só no caminho incerto (falha de transporte, `status 0`, 5xx reexecutável, 409 em andamento). A chave é descartada quando o resultado é conhecido (2xx/4xx). Ela vive no estado do componente (`useRef`), não em `localStorage`, para nunca sobreviver à página. Mutações **não** são repetidas automaticamente: a pessoa usuária é quem dispara a nova tentativa, como os fluxos de UX "incerto" já preveem.

Trade-offs: com `failed_retryable` e reexecução, a correção passa a depender das proteções de domínio, que precisam ser verificadas por rota (chamar, limpar, criar, excluir, recompensa, configurações). A alternativa, guardar o 5xx (Stripe v1), é mais simples e segura contra duplicação, mas deixa a pessoa operadora travada até trocar de chave. É o problema de hoje com outra cara.

### S-05 — Persistência de sessão e recuperação após restart

Opções, em ordem, para um app local de um único usuário:

| Opção | Sobrevive ao restart | Custo | Observações |
|---|---|---|---|
| A. Cookie sem estado assinado/cifrado (`@fastify/secure-session` ou HMAC) + token CSRF = HMAC(segredo, sessionId) | Sim, se o segredo for persistido | Baixo, sem tabela | Exige um segredo durável (variável de ambiente ou arquivo/linha gerado). Rotação exige 2 chaves. |
| B. Tabela de sessões no PostgreSQL | Sim | Migration + limpeza | Mesmo padrão de `processed_operations`, com mais peças móveis. Permite revogação. |
| C. Manter a sessão em memória + reinicialização transparente | Não, mas se recupera sozinha | O menor | Uma ida e volta extra a cada restart. Junto com o item 6 do S-04, a reprodução continua funcionando. |

**Recomendação: C agora, A depois se necessário.** A opção C resolve a falha visível sem novos segredos nem tabelas:

- Servidor: 401 `{ code: 'LOCAL_SESSION_REQUIRED' }`, 403 `{ code: 'CSRF_INVALID' }`, 403 `{ code: 'ORIGIN_INVALID' }` / `HOST_INVALID`.
- Cliente: ao receber `LOCAL_SESSION_REQUIRED` ou `CSRF_INVALID`, chamar `initializeSession()` de novo (single-flight, com promise compartilhada) e **repetir uma única vez**. GET é sempre repetido. Uma mutação só é repetida se tiver chave de idempotência e tiver sido **rejeitada antes do preHandler** (401/403 vêm do `onRequest`, então nada foi executado). Isso é seguro e mais estreito que o "nunca reenviar mutação automaticamente" da revisão. Exige decisão de UX (nota ≥ 9,0) e aval do @architect.
- `ORIGIN_INVALID`/`HOST_INVALID` nunca são repetidos; mostrar mensagem localizada.
- Se a segunda tentativa falhar, mostrar a mensagem do catálogo "Sessão reiniciada — recarregue o painel".

A opção A faz o cookie sobreviver ao restart. O token CSRF passa a ser derivado em vez de armazenado, o que segue o double-submit assinado da OWASP. Manter `X-CSRF-Token` e as checagens de Origin, e somar uma checagem de `Sec-Fetch-Site`, que custa pouco.

### S-06 — Envelope de erro

- Toda resposta não-2xx retorna `{ code, referenceId? }`, mantendo `error` enquanto o painel vanilla existir. Opcionalmente, enviar `application/problem+json` com `type: "urn:queuebot:error:<code>"`, `title`, `status` e `code`. Recomendação: **adotar os nomes de campos da RFC 9457, mas o contrato continua sendo o `code`** (o cliente já lê `code`). A troca do content type pode esperar a remoção do vanilla, para não quebrar o parser dele.
- Lista inicial de códigos (de C2/C6): `IDEMPOTENCY_KEY_REQUIRED` (400), `IDEMPOTENCY_KEY_REUSED` (422), `IDEMPOTENCY_IN_PROGRESS` (409), `IDEMPOTENCY_STORE_UNAVAILABLE` (503), `LOCAL_SESSION_REQUIRED` (401), `CSRF_INVALID` (403), `ORIGIN_INVALID` (403), `HOST_INVALID` (403), além dos pontos de operações, reconciliação e setup citados no S-06 (`queue-routes.mjs:271-306`).
- Cliente: mapear `code` → chave de catálogo (`errors.<CODE>`) em en/es/pt-BR, com fallback para o genérico `REQUEST_FAILED`. Nunca exibir o texto do servidor.
- Proteção: um teste sobre a tabela de rotas que verifica se todo `reply.code(>=400).send` inclui um `code` de uma lista enumerada, mais um teste de paridade de catálogos (`validate:localization`).

### S-14 — Comparação de caminho

Comparar o pathname já parseado. No `onRequest` do Fastify, `request.routeOptions.url` (o padrão da rota) é preenchido depois do roteamento e fica `undefined` em 404. Usar `new URL(request.url, 'http://local').pathname`, ou `request.url.split('?')[0]`, funciona igual nos dois hooks. Aplicar nos três pontos: `local-session.mjs:54,56` (a comparação com `/callback`) e `queue-routes.mjs:100`. Risco baixo. A documentação oficial do Fastify sobre `routeOptions` no `onRequest` não foi consultada nesta rodada (**NÃO VERIFICADO**), por isso a abordagem pelo pathname é a mais segura.

## 4. Impacto em testes e fixtures existentes (testes que fixam o comportamento atual)

- `tests/unit/queue-routes.test.js` — os fakes em memória de `beginPanelOperation` (`:81-85`, `:113`) modelam `processing`/`in_progress` sem lease; 409 para conflito de fingerprint; várias asserções de `statusCode` 500/503 (`:522,801,818,1297,1409`) cujas linhas passariam a ficar `failed_retryable`.
- `tests/integration/queue-repository.test.js:641,654` — fixa `in_progress` para inícios concorrentes. É preciso somar casos de travado, expirado, falho e reprodução contra migrations reais.
- `tests/integration/postgres-foundation.test.js`, `tests/integration/qra-postgres-fixtures.test.js`, `tests/helpers/ops15/qra-postgres-fixtures.mjs` — tocam `processed_operations` e mudam se houver colunas novas.
- `tests/unit/local-session.test.js` — só verifica os status 401/403 (não o texto), então é compatível. Somar asserções de `code` e casos com query string (S-14).
- `tests/unit/next-api-client.test.js:14,76,86,113` — fixa a fábrica de chaves injetada, `REQUEST_FAILED/status 0` e `SESSION_INITIALIZATION_FAILED`. Os testes de reinicialização/repetição e de chave por intenção entram aqui.
- `tests/unit/next-queue-clear.test.js`, `next-queue-creation.test.js`, `next-queue-lifecycle.test.js`, `next-queue-entry-actions.test.js`, `next-locale-picker.test.jsx`, `panel-error-presentation.test.js` — citam `REQUEST_FAILED`/idempotência e precisam de ajuste para chave por intenção e mapeamento de códigos.
- Fixtures E2E: `tests/e2e/fixtures/qra-api-fixtures.mjs` e as suítes `*-uncertain/*-recovery-browser-only.mjs` (creation-uncertain, manual-entry-recovery, reward-settings-recovery, settings-recovery, call-resend) codificam a UX de resultado incerto e são o lugar de provar a nova tentativa com a mesma chave.
- Vanilla: `apps/web/app.js` lê o texto de `error`, então `error` deve ser mantido até a remoção (`tests/unit/web-route.test.js` não é afetado).

## 5. Migração, compatibilidade e decisões

- **A idempotência precisa de migration?** Tecnicamente dá para fazer sem (guardando `leaseUntil` e `failed_retryable` dentro de `result Json`). A recomendação é **sim, uma migration aditiva** em `processed_operations`: `state text`, `lease_until timestamptz`, `updated_at timestamptz` e um índice em `(updated_at)` para o reaper. Motivos: a tomada condicional atômica fica em SQL e a limpeza fica eficiente. Não criar tabela nova; as linhas são compartilhadas com outros valores de `kind`, então a mudança precisa preservar as linhas que não são do painel. **Decisão do @data-engineer** (DDL, backfill das linhas `processing` atuais para `failed_retryable`, rotina de retenção).
- **Decisões do @architect**: política para 5xx (liberar ou guardar), escopo da chave (sem o id da sessão), duração do lease, opção de sessão C ou A, regra de repetição automática para rejeições antes do preHandler, momento de adotar o content type da RFC 9457.
- **@ux-design-expert**: textos e fluxos para "sessão reiniciada", "operação em andamento, tentando de novo" e "resultado incerto — repetir a mesma ação" (≥ 9,0 antes de implementar).
- **Compatibilidade**: manter o campo `error` e o 409 para operação em andamento. Mudar o conflito de fingerprint de 409 para 422 altera o status. O painel vanilla deve tratá-lo apenas como falha genérica (**NÃO VERIFICADO** — conferir os handlers em `apps/web/app.js`). Tirar o id da sessão da chave deixa linhas antigas órfãs, mas sem efeito; o reaper as remove.
- Evidência necessária: integração em PostgreSQL (migrations reais) para reprodução, conflito, em andamento, tomada de lease vencido, nova tentativa após falha e limpeza; um teste de restart da API (reiniciar a instância do Fastify e verificar que o cliente reinicializa a sessão e que a nova tentativa com chave reproduz o resultado); e2e no navegador para os fluxos incertos.

## 6. Ordem de implementação priorizada

1. **Códigos do S-06 para erros de idempotência e sessão** (sem mudança de comportamento, desbloqueia o cliente, risco baixo) + o teste de proteção sobre a tabela de rotas.
2. **S-14, comparação por pathname** (trivial, no mesmo PR do item 1).
3. **S-05 opção C**: reinicialização single-flight no cliente + uma nova tentativa para GETs e para mutações com chave rejeitadas antes do preHandler, mais a mensagem localizada de fallback (exige revisão de UX).
4. **S-04 no servidor**: migration do @data-engineer, lease + `failed_retryable` + 422 + reaper, chave sem o id da sessão; testes de integração em PostgreSQL.
5. **S-04 no cliente**: chaves por intenção nos caminhos incertos de chamar, limpar, criar, excluir, recompensa e configurações; suítes e2e de recuperação.
6. Pontos restantes do S-06 (operações, reconciliação, setup) e chaves de catálogo; remover `error` e avaliar `application/problem+json` após a remoção do vanilla.
7. Opcional: S-05 opção A (sessão assinada persistente), se a reinicialização após restart se mostrar incômoda.

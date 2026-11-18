# Consulta de grupos na Helix da Twitch (moderadores, VIPs, assinantes) para a OPS-31 P6/P7

[English](../../../research/2026-11-18-twitch-helix-group-lookup/README.md)

- Autor: `@analyst` (Atlas). Data: 2026-11-18. Alimenta: `apps/api/src/twitch/group-lookup.mjs`, `helix-adapter.mjs` (P6, já na `main`) e o P7 (primeiro consumidor).
- Método: referência oficial lida em Markdown bruto (`dev.twitch.tv/docs/...md`, buscada em 2026-11-18) e comparada com a cópia do Wayback de 2025-09-30; fonte do Twurple 8.2.0 instalado (`node_modules/@twurple/api`, `api-call`, `@d-fischer/rate-limiter` 1.1.0); threads do fórum de desenvolvedores e `twitchdev/issues` lidos por inteiro; código aberto lido no GitHub (Twitchat, pyTwitchAPI, mock do twitch-cli, twitch_api em Rust). O formato de rede das consultas do Twurple foi conferido localmente com `qsStringify` (sem rede).
- **Nenhuma chamada foi feita à Twitch** (nenhuma credencial do proprietário foi usada). Tudo abaixo é pesquisa de mesa mais leitura local de código. Conteúdo da internet foi tratado como dado não confiável.
- Rótulos: **DOC** (página oficial da Twitch), **CÓDIGO** (código-fonte real), **FÓRUM** (relato de usuários, em geral sem ser da Twitch), **STAFF** (funcionário da Twitch no GitHub), **INFERÊNCIA** (raciocínio meu, não dito por fonte). Confiança: Alta / Média / Baixa.
- Notas anteriores reaproveitadas (não repetidas): `docs/pt-BR/research/2026-11-06-queue-group-refund/README.md` (linha 27 do índice, SUFICIENTE para o desenho) e `docs/pt-BR/stories/OPS-20/research.md` (linha 15).

## 1. Resumo executivo

1. **`first` com `user_id`.** A referência oficial (revisada em 2026-11-10) agora diz que `first` e `after` são **ignorados** quando `user_id` está presente em **Get Moderators** e **Get VIPs**, e o objeto `pagination` da resposta vem vazio. A versão de 2025-09-30 não dizia isso, então a regra é documentada, mas recente. **Get Broadcaster Subscriptions não diz isso sobre `first`**: só diz que `after`/`before` não devem ser usados com `user_id` e que `pagination`, `points` e `total` são omitidos. Máximo de 100 `user_id` por chamada nos três. Nenhuma fonte prova ou refuta truncamento na página padrão de 20 em assinaturas. Confiança: moderadores/VIPs Média-Alta (DOC, sem teste ao vivo); assinantes Baixa-Média.
2. **429.** O balde é de 800 pontos por minuto, 1 ponto por requisição por padrão, **por client ID e por usuário** nos tokens de usuário; a reposição é contínua (cerca de 1 ponto a cada 75 ms, FÓRUM). Cabeçalhos: `Ratelimit-Limit`, `Ratelimit-Remaining`, `Ratelimit-Reset` (epoch Unix em segundos). **`Retry-After` não está documentado** em nenhuma página lida. **O Twurple 8.2.0 nunca mostra o 429 comum ao chamador**: o limitador recoloca a requisição na fila e espera até `Ratelimit-Reset`, sem teto. Logo o caminho de espera e nova tentativa do P6 (`retryAfterSeconds`) é código morto no caso normal, e uma chamada limitada aparece como `timeout`, não `rate_limited`. Confiança: Alta (código-fonte).
3. **Canal não afiliado e escopos.** As páginas dos três endpoints **não listam 403 nem 404**. O 401 cobre escopo ausente, token inválido e `broadcaster_id` errado; não se distinguem pelo status, e a Twitch diz para não depender do texto da mensagem. Para assinaturas em canal não afiliado os relatos **divergem**: HTTP 400 `channel_id must be a partner or affiliate` (FÓRUM, 2021) contra resultado vazio (FÓRUM, 2024). Um 200 vazio seria lido como "não é membro", então a checagem do tipo de canal deve ficar e falhar fechado. Confiança: Baixa para o comportamento em não afiliado; Alta para escopos e 401.
4. **Prime e presente (gift).** Assinaturas Prime aparecem (FÓRUM, 2020) como `tier` `1000` comum e não se distinguem (FÓRUM, 2023). Assinaturas de presente aparecem com `is_gift: true` para quem recebeu; `gifter_*` vêm como string vazia nos outros casos (DOC). Em 2020 pacotes de presente sumiam da lista, corrigido pela Twitch em 2020-09-09 (STAFF). Assinatura expirada: sem declaração oficial. Atraso de propagação de uma assinatura nova: sem número oficial (relatos de FÓRUM de minutos a uma hora, de 2018, na API Kraken antiga). Confiança: Média para presença de Prime/gift; Baixa para expiração e latência.
5. **Constantes recomendadas** (detalhe na seção 9): moderadores 100 (como está); VIPs 100 depois que o passo A2 do RT-A passar, senão manter 20; assinantes manter 20 **ou** enviar `first=100` explícito via `api.callApi` (tira a dependência da dúvida aberta); apertar a regex de id para `^[1-9][0-9]{0,18}$`; tratar o 429 escondido pelo Twurple como `timeout`; mapear erros sem status (`CachedRefreshFailureError`) para `unauthorized`.

## 2. P1: `first`, `user_id`, limites, ids desconhecidos

| Ponto | Get Moderators | Get VIPs | Get Broadcaster Subscriptions |
|---|---|---|---|
| Máximo de `user_id` por chamada | 100 (DOC) | 100 (DOC) | 100 (DOC) |
| Repetir o parâmetro | sim, `user_id=1&user_id=2` (DOC) | sim (DOC) | sim (DOC) |
| `first` com `user_id` | **Ignorado** (DOC 2026-11-10; ausente no texto de 2025-09-30) | **Ignorado** (DOC; idem) | **Não dito.** `after`/`before` "não especifique" com `user_id` |
| `after` com `user_id` | Ignorado; `pagination` vazio (DOC) | Ignorado; `pagination` vazio (DOC) | Não usar; `pagination` omitido (DOC) |
| Página padrão / máxima sem `user_id` | 20 / 100 (DOC) | 20 / 100 (DOC) | 20 / 100 (DOC) |
| Mais de 100 ids | Não documentado | **400** "número de `user_id` excede o máximo" (DOC) | Não documentado |
| Id inválido | 400 "ids devem ser inteiros positivos" (DOC) | 400 "`user_id` não é válido" (DOC) | Não documentado |
| Id que não é membro / não é do canal | Só voltam os moderadores da lista; duplicados ignorados (DOC) | Quem não é VIP é ignorado (DOC) | Só filtra; `data` vazio se nenhum (DOC) |
| Id numérico inexistente | Não documentado | Não documentado | Não documentado |

Evidências e contradições:

- As páginas brutas atuais estão na tabela de fontes (S1-S3). A cópia do Wayback de 2025-09-30 (S4) traz o mesmo limite de 100 ids, mas **nenhuma** frase "ignorado", e o Get Moderators então dizia "na mesma ordem em que você especificou"; o texto novo diz "sem ordem particular". A entrada do changelog de 2026-11-10 (S5) diz que a migração para o novo estilo de documentação corrigiu "códigos de status, motivos de erro e detalhes de autorização" e que `points`/`total` são omitidos (não nulos) com `user_id`. Portanto o texto novo é uma correção deliberada, o que apoia (não prova) que descreve o comportamento real.
- Em assinaturas, a resposta omite `pagination` quando há `user_id`. **INFERÊNCIA (Média-Baixa):** um desenho sem cursor foi feito para devolver todos os resultados (até 100) numa página; senão o que passasse de 20 nunca poderia ser buscado. Nada oficial diz isso.
- Clientes reais: o pyTwitchAPI envia `first=20` (padrão) junto com até 100 `user_ids` para moderadores e assinaturas e levanta `ValueError` acima de 100 (S14, `twitch.py` linhas 1525-1565, 1701-1735, 3620-3655); nenhum problema de truncamento foi achado. O Twitchat nunca usa o filtro `user_id`; lista tudo com `first=100` e segue o cursor (S13). O mock do twitch-cli (S15) modela `user_id` para VIPs, mas é mock, não evidência de produção. O Twurple 8.2.0 envia **nenhum `first`** em `checkVipForUsers` e `getSubscriptionsForUsers`, e `getModerators` passa `limit` como `first` (S10).
- Nenhuma thread de fórum ou issue sobre `first` combinado com `user_id` foi achada (várias buscas). Não achar não é prova.
- VIP e moderador não podem ser a mesma pessoa: a Twitch responde 422 ao adicionar como VIP quem é moderador (Twitchat `TwitchUtils.ts` por volta das linhas 2179-2260, S13; mock do twitch-cli linha 158, S15). Útil só como fato de consistência.

**Veredito P1.** Moderadores: 100 ids por chamada é seguro pela DOC (Média-Alta). VIPs: idem pela DOC (Média-Alta; a regra tem 8 dias na data desta nota). Assinantes: não provado; 20 é seguro qualquer que seja a regra (Alta), 100 precisa do RT-A A1 ou de `first=100` explícito.

## 3. P2: 429, cabeçalhos, comportamento do Twurple

Lado Twitch (DOC, S6 guia):
- Balde de fichas; cada endpoint custa 1 ponto por padrão; "se o balde ficar sem pontos em 1 minuto, a requisição retorna 429". Um balde para tokens de app e outro para tokens de usuário; limites de token de usuário são "por client ID por usuário por minuto". Os três endpoints de leitura não declaram custo especial.
- Cabeçalhos em toda resposta: `Ratelimit-Limit` (exemplo 800), `Ratelimit-Remaining`, `Ratelimit-Reset` ("timestamp Unix epoch que identifica quando o balde volta a ficar cheio"). No 429, "use `Ratelimit-Reset` para saber quanto esperar".
- "Alguns endpoints podem devolver 429 por motivos alheios ao balde geral... é preciso ler a mensagem de erro" (DOC). Exemplo no changelog: endpoints de ban/unban (S5).
- 503: "tente de novo uma vez" (DOC).
- `Retry-After`: a string não aparece em nenhuma página lida (guia, moderação, assinaturas, changelog; `grep` com 0 ocorrências). Não encontrado.
- FÓRUM: a reposição é contínua, "1 a cada 0,075 s (800 por min)" (Dist, 2020-08-21, S16); um balde zerado permite cerca de uma requisição a cada 75 ms; com token bearer 800/min por usuário, 30/min só com Client-ID (BarryCarlyon, 2020-01-14, S17). Uma thread de 2023 relata 429 com `Ratelimit-Remaining` perto de 799 e `Ratelimit-Reset` igual ao instante atual, sem solução (S18). Trate `Ratelimit-Reset` como dica que pode estar errada.

Twurple 8.2.0 (CÓDIGO, lido em `node_modules`):
- Build Node: um `HelixRateLimiter` por usuário (`PartitionedRateLimiter`, chave = id do usuário) (S10, `ApiClient.js` linhas 28-38). `needsToRetryAfter`: com status 429 **e** `ratelimit-remaining` ausente ou 0, devolve `reset*1000 - agora`; a requisição volta ao início da fila e é reenviada depois desse atraso, **sem limite de tentativas** (`ResponseBasedRateLimiter._runRequestBatch`). A promessa do chamador fica pendente. `Ratelimit-Reset` ausente é lido como 0 e trava a fila (classe de bug confirmada pelo mantenedor, issue 285 do Twurple, S19).
- Um 429 com `Ratelimit-Remaining` acima de 0 (o caso "outro motivo") **não** é repetido; vira `HttpStatusCodeError` com `statusCode` 429, **sem cabeçalhos** (`api-call/lib/errors/HttpStatusCodeError.js`). Portanto `retryAfterSeconds` é sempre nulo (como o dev registrou).
- 5xx e erros de rede lançados são repetidos dentro do Twurple: `retries: 3, minTimeout: 500, factor: 2` (esperas de 0,5 s, 1 s, 2 s) (`BaseApiClient._callApiInternal`). Com o teto de 3 s por chamada do P6, um 5xx aparece como `timeout`, não `twitch_unavailable`, a menos que a primeira repetição já responda.
- 401: o Twurple renova o token uma vez e repete (`_callApiUsingInitialToken`). Usuário já sabido com refresh token morto lança `CachedRefreshFailureError` (sem `statusCode`) antes de qualquer requisição (`RefreshingAuthProvider.js` linhas 325-326); token sem o escopo lança `Error` simples ("does not have any of the requested scopes") (`auth/lib/helpers.js` linha 249). Os dois viram `lookup_error` no P6 (o caso do escopo é pego antes pela checagem local).
- O mantenedor confirma o desenho de espera: "O cliente espera o limite resetar para você poder fazer requisições de novo" (issue 358 do Twurple, 2022-05-12, S20).
- Consequência para o P6: como o limitador é por usuário e a consulta usa o token do broadcaster, uma chamada que estourou o tempo do nosso lado **continua na fila do limitador** (o Twurple não tem aborto por chamada) e ainda dispara depois; e, com o balde vazio, toda outra chamada com esse token (recompensas, resgates) espera atrás dela. Com 3 leituras por decisão de reembolso e 800 pontos/min a exposição é pequena, mas uma rajada de decisões pode esgotar o balde.

Boa prática vista em código real: o Twitchat espera até `ratelimit-reset` mais 1 s mais até 5 s de jitter e repete (S13, `TwitchUtils.ts` linhas 3987-3991); o pyTwitchAPI dorme até `Ratelimit-Reset` mais 0,1 s quando o status é 429 ou o restante é 0 (S14, linhas 444-449). Nenhum usa `Retry-After`.

**Veredito P2.** Alta no modelo documentado pela Twitch e no comportamento do Twurple. Baixa no conteúdo de um 429 real (cabeçalhos, texto do corpo), que precisa do RT-A A5.

## 4. P3: canal não afiliado, `broadcaster_type`, escopos, 401/403

- **Códigos de status (DOC, atual):** Get Moderators e Get VIPs listam 200, 400, 401; Get Broadcaster Subscriptions lista 200, 400, 401. **Nenhum 403 e nenhum 404 são documentados nos três.** (Só Check User Subscription lista 403 "acesso bloqueado, alguns produtos não estão disponíveis pela API" e 404 "não é assinante".)
- **Motivos do 401 (DOC):** cabeçalho ausente ou não é token de usuário; token sem o escopo; token inválido; `broadcaster_id` diferente do usuário do token; Client-Id diferente do token. A Twitch dá o mesmo status para todos. O guia da API diz "seu código não deve depender de strings de mensagem de erro" (S6). Portanto use status mais estado local, nunca a mensagem. Exemplos de FÓRUM de textos: `Missing channel:read:subscriptions scope` (2019, S21), `Insufficient authorization in token` (2021, S22). Só ilustrativos.
- **Escopos (DOC):** moderadores `moderation:read` ou `channel:manage:moderators`; VIPs `channel:read:vips` ou `channel:manage:vips`; assinaturas `channel:read:subscriptions`. `broadcaster_id` deve ser igual ao usuário do token: só o token do próprio broadcaster funciona. O escopo novo `moderator:read:vips` na página de escopos lista só o EventSub Channel Moderate, não o Get VIPs (S7). Os endpoints de moderadores e VIPs serem só do broadcaster é reclamação conhecida (FÓRUM, 2023 e 2026, S23).
- **Canal não afiliado, assinaturas (conflito):**
  - FÓRUM 2021-08-25 (S24): `GET /helix/subscriptions?broadcaster_id=...` devolveu **400** `{"error":"Bad Request","status":400,"message":"channel_id must be a partner or affiliate"}`; o autor disse que antes era 200 sem resultados. BarryCarlyon: quem não é parceiro nem afiliado "não pode ter assinantes".
  - FÓRUM 2024-11-25 (S25): canal com `broadcaster_type` em branco obteve resultado "vazio"; resposta: "não podem ter assinantes... ou não está inscrito no programa de assinaturas". A thread não mostra o status HTTP.
  - DOC: nenhum 400 desse tipo é listado. **Quem vence:** nenhum pode ser declarado. O relato de 2021 é preciso (corpo completo), mas antigo e de uma pessoa; o de 2024 é recente, mas vago. Planeje para os dois: 400, e 200 com `data` vazio.
- **Moderadores / VIPs em canal não afiliado:** nada achado. Nenhuma fonte diz que dão erro. Qualquer canal pode ter moderadores; a disponibilidade de VIP em canais novos não foi verificada.
- **`broadcaster_type`:** devolvido pelo **Get Users** (`GET /helix/users`) como `affiliate`, `partner` ou string vazia (DOC, S8). O Get Users aceita qualquer token (FÓRUM, S25). Dist confirmou em 2019 que "indica se são parceiro, afiliado ou nenhum" (S26). Desatualização depois de ganhar ou perder o status de afiliado: não encontrada. As recompensas personalizadas de Pontos do Canal exigem afiliado ou parceiro (linhas 5 e 27 do índice), então uma fila que precisa de decisão de reembolso normalmente roda em um desses canais.
- **Importante para o P6:** um 200 vazio em assinantes é indistinguível de "não é membro". A checagem de tipo em `getBroadcasterType` é, portanto, o que protege contra falso negativo. O QA notou que tipo `null` (falha de leitura) não bloqueia a consulta; para o grupo de **assinantes** isso deixa a brecha (ver seção 9).

**Veredito P3.** Escopos e 401: Alta (DOC). Distinguir causas do 401: impossível pelo status (Alta). Resposta em não afiliado: Baixa (relatos de fórum em conflito, nada oficial).

## 5. P4: Prime, presente, expirada, latência

- **Campos (DOC):** `is_gift` booleano; `gifter_id/login/name` são strings vazias quando `is_gift` é falso; doador anônimo tem id `274598607` (conta `ananonymousgifter`); `tier` é `1000`, `2000` ou `3000`; `plan_name` é "o nome da assinatura". `points`/`total` omitidos com `user_id`. Assinaturas de contas excluídas são omitidas, então uma página pode ter menos itens que `first` (DOC).
- **Prime:** "Todas as assinaturas válidas aparecem, qualquer que seja a forma de pagamento" para assinaturas grátis da Amazon (BarryCarlyon, 2020-05-06, S27, FÓRUM). O endpoint "não parece ter dado que distinga prime de tier 1" (daftpenguin, 2023-06-20, S28) e BarryCarlyon concordou que a API sozinha não distingue; uma marca "recorrente" era só pedido no UserVoice (S29, 2023-11). Sem declaração oficial. **Conclusão:** Prime conta como assinante `1000` comum; não tente distinguir.
- **Presente:** quem recebeu aparece com `is_gift: true`. Histórico: em agosto de 2020 assinantes de pacotes de presente (os maiores pacotes mais afetados, um pacote de 50) sumiam do Get Broadcaster Subscriptions em comparação com a exportação do painel (twitchdev/issues 187 e 184, S30, S31). Um funcionário da Twitch (lleadbet) anunciou a correção em 2020-09-09. Mesma mensagem (STAFF): a contagem do painel e o `total` da API diferem por exatamente um porque a API **inclui a assinatura do próprio broadcaster** e o painel a esconde. Isso responde em parte o item aberto "broadcaster na própria lista" da nota anterior: em 2020 a assinatura do próprio broadcaster estava na lista da API (Média; vale só se o broadcaster assina o próprio canal).
- **Expirada / cancelada:** sem declaração oficial. Um trecho de fórum (não aberto por inteiro) diz que a lista inclui quem cancelou mas segue ativo até o fim do período, e que quem some "expirou ou não foi criado". Baixa. NÃO VERIFICADO.
- **Latência:** nenhum número da Helix. FÓRUM 2018 (Kraken v3/v5, S32): assinante novo às vezes ausente por minutos, uma vez por mais de uma hora; Dist: o endpoint "não é feito para ser lista de eventos de assinatura, só lista de todos os assinantes". Relato de 2019 de quatro assinantes que apareceram na manhã seguinte na v5 (S33). Nada recente. NÃO VERIFICADO na Helix de hoje; RT-A A8.
- **Veredito P4.** Presença de Prime e presente: Média. Expiração e latência: Baixa.

## 6. P5: outros riscos

1. **Documentação migrada em 2026-11-10.** Novo sistema de documentação com correções; as regras da seção 2 têm 8 dias. Reler antes do P7 começar se passarem algumas semanas (gatilho abaixo).
2. **Chamadas penduradas não são abortáveis** (Twurple 8.2.0): ver seção 3. O `AbortSignal` só pode ser definido globalmente pelo `fetchOptions` do cliente, não por chamada (CÓDIGO: `callTwitchApiRaw` espalha `fetchOptions`).
3. **Timeouts:** a repetição própria do Twurple para 5xx pode gastar até cerca de 3,5 s antes do erro final; o teto de 3 s do P6 vira `timeout`. Os dois seguram a decisão, então é seguro, mas o código de motivo fechado fica menos preciso.
4. **Ids como string:** todos os ids da resposta são strings (exemplos da DOC). O P6 compara strings; bom. Ids numéricos acima de 2^53 quebrariam uma conversão para número; não converta.
5. **Ids repetidos:** o Get Moderators ignora duplicados (DOC); o código já deduplica.
6. **Consistência eventual:** moderador ou VIP adicionado há segundos pode não aparecer; não medido. A decisão é um retrato de um instante; o P7 grava `group_checked_at` (já no desenho).
7. **Não encontrado:** depreciação anunciada desses três endpoints. O changelog de 2025-01 a 2026-11 não tem entrada para eles, salvo as correções de 2026-11-10.

## 7. Tabela de fontes

Buscadas em 2026-11-18, salvo indicação. Confiança = quanto a fonte sustenta a afirmação para a qual é citada.

| # | URL | Tipo | Data | O que prova | Conf. |
|---|---|---|---|---|---|
| S1 | https://dev.twitch.tv/docs/api/reference/moderation.md (Get Moderators, Get VIPs) | DOC | revisada 2026-11-10 | 100 ids, `first`/`after` ignorados com `user_id`, códigos, escopos | Alta |
| S2 | https://dev.twitch.tv/docs/api/reference/subscriptions.md (Get Broadcaster Subscriptions, Check User Subscription) | DOC | 2026-11-10 | 100 ids, sem regra de `first`, campos, códigos | Alta |
| S3 | https://dev.twitch.tv/docs/api/reference/users.md (Get Users) | DOC | 2026-11-10 | valores de `broadcaster_type` | Alta |
| S4 | https://web.archive.org/web/20250930192946/https://dev.twitch.tv/docs/api/reference | DOC (arquivo) | 2025-09-30 | texto antigo sem as frases "ignorado" | Alta |
| S5 | https://dev.twitch.tv/docs/change-log.md | DOC | até 2026-11-10 | lista de correções; sem depreciação desses endpoints | Alta |
| S6 | https://dev.twitch.tv/docs/api/guide.md | DOC | 2026-11 | balde, cabeçalhos, 429, 503, regra da string de mensagem | Alta |
| S7 | https://dev.twitch.tv/docs/authentication/scopes.md | DOC | 2026-11 | escopo por endpoint | Alta |
| S8 | Igual à S3 | DOC | | `affiliate`, `partner`, vazio | Alta |
| S9 | `docs/pt-BR/research/2026-11-06-queue-group-refund/README.md` | nota do projeto | 2026-11-05 | desenho anterior da consulta de papéis | Média |
| S10 | `node_modules/@twurple/api` 8.2.0 (`HelixModerationApi.js` 88-100, `HelixChannelApi.js` 164-173, `HelixSubscriptionApi.js` 65-74, `ApiClient.js` 28-38, `BaseApiClient.js` 305-360, `utils/HelixRateLimiter.js`) e `@d-fischer/rate-limiter` 1.1.0 (`ResponseBasedRateLimiter.js`) | CÓDIGO | instalado | formato da requisição, limitador, repetição, 429 engolido | Alta |
| S11 | `node_modules/@twurple/auth` (`RefreshingAuthProvider.js` 319-330, `helpers.js` 244-255) | CÓDIGO | instalado | erros sem status | Alta |
| S12 | `node_modules/@twurple/api-call` (`HttpStatusCodeError.js`, `helpers/transform.js`) | CÓDIGO | instalado | erro de 429 sem cabeçalhos | Alta |
| S13 | https://github.com/Durss/Twitchat `src_front/utils/twitch/TwitchUtils.ts` (linhas 1005-1060, 1310-1346, 2179-2260, 3987-3991; snapshot da master em 2026-11-18) | CÓDIGO | 2026-11-18 | padrão listar-tudo, espera do 429 em `ratelimit-reset`, exclusão mod/VIP | Média |
| S14 | https://github.com/Teekeks/pyTwitchAPI `twitchAPI/twitch.py` (linhas 444-449, 1525-1565, 1701-1735, 3620-3655) | CÓDIGO | 2026-11-18 | trava de 100 ids, `first=20` padrão enviado, espera do 429 | Média |
| S15 | https://github.com/twitchdev/twitch-cli `internal/mock_api/endpoints/channels/vips.go` (linhas 66-110, 158), `moderation/moderators.go`, `subscriptions/subscriptions.go` | CÓDIGO (mock) | 2026-11-18 | a CLI oficial modela o filtro `user_id`; não é comportamento de produção | Baixa |
| S16 | https://discuss.dev.twitch.com/t/are-buckets-really-fully-refilling-every-60-seconds/27829 | FÓRUM | 2020-08-21 | reposição contínua de 1 a cada 75 ms | Média |
| S17 | https://discuss.dev.twitch.com/t/ratelimit-limit-has-decreased-out-of-blue/23740 | FÓRUM | 2020-01-14 | 800 com bearer, 30 sem; 1 ponto por requisição | Média |
| S18 | https://discuss.dev.twitch.com/t/are-rate-limit-headers-broken/45841 | FÓRUM | 2023-05-22 | cabeçalhos podem enganar; sem solução | Baixa |
| S19 | https://github.com/twurple/twurple/issues/285 | FÓRUM (mantenedor) | 2021-08 a 2022-05 | `Ratelimit-Reset` ausente lido como 0 trava a fila | Média |
| S20 | https://github.com/twurple/twurple/issues/358 | FÓRUM (mantenedor) | 2022-05-12 | o cliente espera o reset | Média |
| S21 | https://discuss.dev.twitch.com/t/i-met-message-missing-channelsubscriptions-scope/21452 | FÓRUM | 2019-06-11 | exemplo de corpo do 401 | Média |
| S22 | https://discuss.dev.twitch.com/t/issue-with-get-moderators-endpoint/31230 | FÓRUM | 2021-04-11 | 401 com token de app | Média |
| S23 | https://discuss.dev.twitch.com/t/why-does-getting-a-list-of-moderators-vips-require-broadcaster-permissions/45114 | FÓRUM | 2023-04-13 | token só do broadcaster | Média |
| S24 | https://discuss.dev.twitch.com/t/broadcaster-subscription-400-error/33242 | FÓRUM | 2021-08-25 | 400 `channel_id must be a partner or affiliate` | Média |
| S25 | https://discuss.dev.twitch.com/t/get-active-subscription-information/61814 | FÓRUM | 2024-11-25 | resultado vazio com `broadcaster_type` em branco; status não mostrado | Baixa |
| S26 | https://discuss.dev.twitch.com/t/check-if-user-is-a-affilate-partner-to-twitch/20808 | FÓRUM | 2019-04-08 | Get Users mostra o tipo | Média |
| S27 | https://discuss.dev.twitch.com/t/how-can-i-see-a-users-subscriptions-with-the-new-api/25372 | FÓRUM | 2020-05-06 | toda assinatura válida aparece, qualquer pagamento | Baixa-Média |
| S28 | https://discuss.dev.twitch.com/t/distinguishing-prime-sub-from-recurring-sub-in-subscriptions-api/46189 | FÓRUM | 2023-06-20 | Prime não se distingue | Média |
| S29 | https://discuss.dev.twitch.com/t/get-only-recurring-sub-with-the-api/50341 | FÓRUM | 2023-11-07 | sem marca de recorrente; só UserVoice | Média |
| S30 | https://github.com/twitchdev/issues/issues/187 | issue com STAFF | 2020-08-05 a 2020-09-16 | assinantes de pacotes de presente ausentes vs painel | Média |
| S31 | https://github.com/twitchdev/issues/issues/184 | issue com STAFF | 2020-08-04 a 2020-09-09 | correção; a API inclui a assinatura do próprio broadcaster | Média |
| S32 | https://discuss.dev.twitch.com/t/how-fresh-can-i-expect-the-subscribers-endpoint-data-to-be/16318 | FÓRUM | 2018-06-23 | atrasos de minutos a mais de uma hora (API antiga) | Baixa |
| S33 | https://discuss.dev.twitch.com/t/subscribers-broken-delayed-on-v5/20359 | FÓRUM | 2019-03-04 | assinantes atrasados na v5 | Baixa |
| S34 | https://discuss.dev.twitch.com/t/helix-get-broadcaster-subscriptions-only-returning-20/22833 | FÓRUM | 2019-10-14 | página padrão é 20, `first` muda (sem `user_id`) | Média |

## 8. Não encontrado / não verificado

- Se `first` é ignorado quando `user_id` é usado em **assinaturas** (nenhuma fonte). Fechado pelo RT-A A1.
- Comportamento do Get Moderators e do Get Broadcaster Subscriptions com mais de 100 ids (só o VIPs documenta um 400). RT-A A3.
- O que a Twitch devolve para id numérico inexistente, `0`, zeros à esquerda ou id de 40 dígitos. RT-A A4.
- Conteúdo ao vivo de um 429: cabeçalhos presentes, texto do corpo, algum `Retry-After`. RT-A A5.
- Status e corpo atuais dos três endpoints em canal não afiliado (conflito 2021 vs 2024). RT-A A6.
- Se o Prime aparece com `plan_name` que o distinga. RT-A A7.
- Assinaturas expiradas ou canceladas-mas-ativas na lista; atraso de propagação de assinatura, moderador ou VIP novos na Helix atual. RT-A A8.
- Se `broadcaster_type` fica desatualizado após ganhar ou perder o status de afiliado.
- Se o broadcaster aparece nas próprias listas de moderadores e VIPs (só assinaturas tem declaração STAFF de 2020).
- Relatos no GitHub ou Discord do Twurple sobre `getSubscriptionsForUsers`, `checkVipForUsers`, `getModerators` com `userId` (buscado; nenhum achado). Nenhum teste do Twurple para isso foi lido.
- O mock do twitch-cli e os padrões do pyTwitchAPI não provam o comportamento de produção.
- Foi usada leitura resumida por ferramenta de busca em algumas páginas de fórum; as citações foram conferidas contra o texto devolvido, não contra capturas de tela.

## 9. Recomendações

### Ao `@dev` (início do P7 ou um commit só de testes antes dele; não mudar o comportamento do P6 em silêncio)

| Item | Recomendação | Por quê |
|---|---|---|
| `GROUP_LOOKUP_CHUNK_SIZE.moderator` | manter 100 | DOC: `first` ignorado; máximo 100 ids |
| `.vip` | 20 agora; 100 depois do RT-A A2 (ou já, aceitando só a DOC) | a DOC diz ignorado (regra recente); 20 é estritamente seguro |
| `.subscriber` | 20 agora; para chegar a 100 com segurança, chamar `api.callApi({type:'helix', url:'subscriptions', scopes:['channel:read:subscriptions'], userId: broadcasterId, query:{broadcaster_id, user_id: ids, first: '100'}})` no lugar de `getSubscriptionsForUsers` (`callApi` é público; arrays na query viram `user_id` repetido, verificado localmente) | tira a dependência da dúvida aberta sobre `first`; a resposta mantém `user_id` |
| Validação de id | trocar `NUMERIC_ID` por `^[1-9][0-9]{0,18}$` | o Get Moderators dá 400 para não inteiro positivo; um id ruim derrubaria o lote inteiro dos outros 19 |
| 429 | não confiar em `retryAfterSeconds`; manter o caminho fail-fast; esperar `timeout` no limite comum; ambos seguram | o Twurple engole o 429 normal (S10, S12) |
| Chamadas penduradas | aceitar o vazamento, mas limitar consultas simultâneas numa rajada de decisões (3 leituras por decisão) e registrar um contador de `timeout` | a chamada tardia fica na fila do limitador por usuário |
| Mapeamento de erro | tratar `error.name === 'CachedRefreshFailureError'` como `unauthorized`; manter o mapa por status | esse erro não tem `statusCode` |
| 400 | acrescentar um código fechado (por exemplo `bad_request`) e tratar como falha, nunca "não é membro"; um 400 em assinaturas com tipo não afiliado é o comportamento de 2021 | a DOC lista 400 nos três |
| 200 vazio em assinantes | "não é membro" decisivo só quando `getBroadcasterType` devolveu `affiliate` ou `partner`; se o tipo for `null` ou `none`, devolver `channel_not_eligible` ou `unknown` para o grupo de assinantes | um 200 vazio pode ser a resposta de não afiliado (S25) |
| Prime / presente | contar todo registro devolvido como assinante, ignorar `tier`, `is_gift`, `plan_name` | Prime é tier 1000 e não se separa |
| Não depender de texto de mensagem | classificar por status mais estado local | DOC (S6) |

Testes necessários (não precisa de novos fakes de rede, só destes casos): um lote com 400 falha só seus ids; `CachedRefreshFailureError` dá `unauthorized`; id `0`, `007`, 20 dígitos dão `lookup_error` sem chamada; lista vazia de assinantes com tipo `null` não é "não é membro"; o teste de 429 que falta e que o QA já pediu (L1).

### Ao `@ux-design-expert`

- Códigos de motivo que a pessoa pode ver: `timeout` agora também significa "a Twitch está lenta ou limitando"; manter uma mensagem calma ("não foi possível checar, segurado para revisão"), sem prometer prazo de nova tentativa (a Twitch não dá nenhum).
- Mostrar "Reconecte a Twitch para restaurar o acesso aos grupos" para `scope_missing` e `unauthorized` igualmente, já que a Twitch junta escopo ausente, token expirado e revogado num só 401 (QA L75-01).
- O texto deve dizer que a checagem de assinantes só funciona em canal afiliado ou parceiro, e que assinaturas Prime e de presente contam como assinantes.
- Não exibir "não é assinante" como definitivo para quem acabou de assinar; a latência não foi medida.

### Roteiro de experimento para o proprietário (RT-A, não executado)

Use um canal de teste e um token descartável; nunca cole tokens em tickets. Registre só status, cabeçalhos e forma do corpo.

| Passo | Ação | Fecha |
|---|---|---|
| A1 | Assinaturas com `first=1` e dois `user_id` que são ambos assinantes (a assinatura do próprio broadcaster conta, se existir) | `first` ignorado? |
| A2 | Igual para VIPs e moderadores com `first=1` e dois membros | confirma a DOC |
| A3 | 101 ids em cada endpoint (mistura de válidos e inválidos) | comportamento de excesso |
| A4 | ids `0`, `abc`, `007`, número de 40 dígitos, id numérico sem conta | validação |
| A5 | Rajada de leituras num client descartável até o 429; registrar todos os cabeçalhos e o corpo | conteúdo do 429, `Retry-After` |
| A6 | As três chamadas num canal de teste não afiliado | resposta em não afiliado |
| A7 | Assinatura Prime e de presente numa conta de teste | `plan_name`, `is_gift` |
| A8 | Assinar, adicionar moderador, adicionar VIP com conta de teste; consultar a cada 5 s | atraso de propagação |
| A9 | Revogar o escopo nas conexões da Twitch e expirar o token | corpo do 401 e erro do Twurple |

## 10. Gatilhos de revisão

- A Twitch muda as páginas de Get Moderators, Get VIPs, Get Broadcaster Subscriptions ou o guia de limites (acompanhar o RSS do changelog).
- O `@twurple/api` sai da 8.2.0 (o comportamento do limitador e das repetições é específico da versão).
- O RT-A produz qualquer resultado que contradiga a seção 2, 3 ou 4.
- O P7 mostra consultas estourando o tempo em campo, ou um 400/403/404 não coberto aqui.
- O projeto passa a aceitar canais não afiliados, ou a Twitch muda quem pode ter recompensas personalizadas.
- Reaparece um relato de inconsistência da lista de assinantes ou de pacotes de presente como as issues 184/187 do twitchdev.

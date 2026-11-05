# OPS-15 — Server-Sent Events (SSE) no painel Next: nota de pesquisa

> English: [`docs/stories/OPS-15/sse-research.md`](../../../stories/OPS-15/sse-research.md)

- **Autor:** @analyst (Atlas) — 2026-10-27
- **Gatilho:** decisão do proprietário (2026-10-27) de atualizar o painel Next em tempo real por SSE. O `docs/research-index.md` não tinha nota sobre isso (LACUNA). A `panel-defects-architecture-review.md` só cita SSE como alternativa.
- **Escopo:** só pesquisa. Nenhum código foi alterado. Esta nota não substitui um teste no ambiente do projeto.
- **Rótulos:** VERIFIED = confirmado em documentação oficial ou no código instalado; PARTIAL = confirmado em parte ou deduzido do código/especificação; UNVERIFIED = não confirmado.

## Base instalada (lida do repositório, 2026-10-27)

| Item | Valor | Rótulo |
|---|---|---|
| Fastify | `5.12.5` (`package.json` da raiz) | VERIFIED |
| Next.js | `16.4.1` | VERIFIED |
| Plugin de SSE instalado | nenhum (`node_modules/@fastify` não tem `sse`; não há `fastify-sse-v2`) | VERIFIED |
| Proxy em dev | `apps/frontend/scripts/dev-proxy-config.mjs`: os `rewrites` mandam `/api/*`, `/overlay/api/*`, `/health` e `/callback` para o Fastify | VERIFIED |
| Proxy em produção | os mesmos `rewrites` (`beforeFiles`) para `FASTIFY_INTERNAL_ORIGIN` (padrão `https://localhost:3109`). O painel roda num **servidor customizado** `node:https` + `getRequestHandler()` (`start-production.mjs`) | VERIFIED |
| HTTPS em dev | `next dev --experimental-https` | VERIFIED |
| Protocolo até o navegador | o servidor `node:https` usa **HTTP/1.1** (sem HTTP/2) em produção. O `--experimental-https` de dev também é HTTP/1.1 | VERIFIED (produção, pelo código) / PARTIAL (dev, não medido) |
| Sessão | o `onRequest` de `local-session.mjs` confere `Host`, `Origin` (só se vier), sessão por cookie (`Map` em memória) em `/api/*` e CSRF só fora de GET/HEAD | VERIFIED |
| `compress` no `next.config` | não definido (padrão `true`) | VERIFIED |

## Q1. Fastify: plugin, cabeçalhos, heartbeat, reconexão e limpeza

**Opções.**

1. **`@fastify/sse`** (da organização oficial do Fastify). Está no npm como `0.6.1`, com `peerDependencies: { fastify: "^5.x" }` e última alteração em 2026-10-18. É compatível com a 5.12.5 (VERIFIED com `npm view`).
   - **API:** opção de rota `sse: 'only' | 'dual' | 'manual'`, `reply.sse.send()` (objeto, string, async generator ou Readable), `reply.sse.keepAlive()`, `reply.sse.onClose(cb)`, `reply.sse.close()`, `reply.sse.lastEventId`, `reply.sse.replay(cb)` e `reply.sse.isConnected`. O `heartbeatInterval` fica no nível do plugin (padrão 30 000 ms), e cada rota pode usar `heartbeat: false` (VERIFIED, README).
   - **Ressalvas:** ainda está na versão **0.x**, então a API pode mudar. O projeto é pequeno (28 estrelas e 3 issues abertas na leitura). Sobre backpressure, o README só diz que é "eficiente" (PARTIAL). Com `sse: 'only'`, uma requisição com `Accept: application/json` recebe 406.
2. **`fastify-sse-v2`** (da comunidade). Versão `4.2.2`, com `peerDependencies: fastify >=4` e última alteração em 2026-01-27 (VERIFIED com `npm view`). É maduro, mas não é mantido pela organização do Fastify.
3. **Resposta crua** com `reply.hijack()` + `reply.raw.writeHead/write`. Segundo a documentação do Reply, depois do `hijack()` o Fastify não roda mais `onSend` nem a serialização, e o handler passa a controlar a resposta. Não traz dependência, mas heartbeat, `drain` e limpeza ficam por conta do código. VERIFIED (docs) / dedução de desenho PARTIAL.

**Recomendação:** usar o `@fastify/sse` com versão exata (o projeto já fixa versões) e `heartbeatInterval` de **15 000 ms**, por causa do timeout de 30 s do proxy (veja a Q2). Se o @architect não aceitar uma dependência 0.x, a alternativa é `reply.hijack()` com um helper pequeno (cerca de 60 linhas). Os dois caminhos funcionam; o plugin não é obrigatório.

**Ciclo de vida e cabeçalhos.**
- Os hooks `onRequest` (a sessão local) rodam **antes** do handler. Por isso o stream herda a checagem de `Host`, `Origin` e sessão sem código extra (VERIFIED em `local-session.mjs`; a ordem dos hooks do Fastify foi VERIFIED na documentação).
- **Cabeçalhos:**
  - `Content-Type: text/event-stream; charset=utf-8`
  - `Cache-Control: no-cache, no-transform` (o `no-transform` é importante, veja a Q2)
  - `Connection: keep-alive` (só em HTTP/1.1)
  - `X-Accel-Buffering: no` (só faz diferença com nginx e não atrapalha; o projeto não usa nginx — relevância PARTIAL)
- **Heartbeat:** uma linha de comentário `:\n\n` a cada ~15 s. A especificação da WHATWG sugere ~15 s por causa de proxies que derrubam conexões ociosas (VERIFIED).
- **Campo `retry:`:** define o tempo de reconexão do cliente (VERIFIED, especificação). Sugestão: `retry: 3000`.
- **`Last-Event-ID`:** o navegador reenvia esse cabeçalho na reconexão automática (VERIFIED, especificação). O servidor lê o valor em `reply.sse.lastEventId` ou em `request.headers['last-event-id']`.
- **Limpeza:** no `close` de `request.raw` / `reply.raw`, tire o assinante do emissor em processo e limpe o timer do heartbeat. Com `@fastify/sse`, use `reply.sse.onClose()`. Feche também todos os streams no `onClose` da instância do Fastify (desligamento gracioso); sem isso, o `app.close()` fica esperando as conexões abertas. Isso é PARTIAL: o Fastify 5 tem `forceCloseConnections`, então confira o valor atual.
- **Backpressure:** se `write()` devolver `false`, não acumule numa fila sem limite. Como o desenho manda só invalidações pequenas (Q4), a política certa é **agrupar**: guarde só uma marca de "sujo" por tópico. Se o buffer continuar cheio, feche o stream; o cliente reconecta e busca os dados de novo. PARTIAL (desenho).

## Q2. Proxy do Next (dev e produção)

Lido direto do código do Next 16.4.1 instalado (VERIFIED):

- **`rewrites` para uma URL externa fazem streaming, sem buffer.** O `server/lib/router-utils/proxy-request.js` usa `httpxy`, faz `proxyRes.pipe(res)` e destrói a requisição de origem quando o navegador fecha (`res.on('close', () => proxyReq.destroy())`). O stream SSE chega ao navegador pedaço a pedaço, e a desconexão do cliente chega ao Fastify (a limpeza no `close` da Q1 vai disparar).
  - Um relato da comunidade diz que os `rewrites` do Next 15/16 fazem buffer de SSE no modo standalone ([revisão no cubic.dev](https://cubic.dev/pr/lfnovo/open-notebook/pull/770)). O código instalado não mostra isso nesse caminho.
  - Rótulo: VERIFIED para o caminho do código; o relato da comunidade é UNVERIFIED para este projeto.
- **Timeout de 30 s no proxy.** A cadeia é `proxyRequest(..., config.experimental.proxyTimeout)` → `proxyTimeout || 30000` → `proxyReq.setTimeout(30000, destroy)`. É um timeout de **ociosidade do socket**: um stream que passa 30 s sem mandar bytes é cortado. Consequências:
  - (a) o heartbeat precisa ser **menor que 30 s** (15 s). O padrão de 30 s do `@fastify/sse` **empata** com esse limite e precisa ser trocado;
  - (b) outra saída é definir `experimental.proxyTimeout` no `next.config`. Como é experimental, prefira o heartbeat.
  - VERIFIED (código).
- **A compressão gzip retém o SSE.** O `router-server.js` instala o middleware `compression` a menos que `compress: false`, inclusive em servidor customizado ([docs do Next, `compress`](https://nextjs.org/docs/app/api-reference/config/next-config-js/compress), atualizada em 2025-06-16: "when using `next start` or a custom server").
  - O middleware trata `text/*` como compressível e envolve a resposta em gzip. O zlib segura os bytes até um flush que o proxy nunca chama, então os eventos chegam atrasados ou em rajadas.
  - Esse mesmo middleware **não comprime quando a resposta traz `Cache-Control: no-transform`** (`shouldTransform`). A correção exata é pôr `Cache-Control: no-cache, no-transform` na resposta SSE do Fastify.
  - `compress: false` global não é necessário, e o Next não recomenda desligar a compressão.
  - VERIFIED (código + docs). O efeito real no navegador é UNVERIFIED até o teste no ambiente.
- **Route handler do Next (`app/api/.../route.ts`) como proxy de streaming:** desnecessário. Acrescenta um segundo salto com seus próprios riscos de buffer. Não recomendado.
- **Acesso direto ao Fastify (outra porta):** viraria outra origem, o que quebra as premissas da checagem de `Origin`, do cookie `SameSite=Lax` e do CSRF. Não recomendado.
- **Limite de conexões.** Em HTTP/1.1, os navegadores permitem **6 conexões por origem** (nota do MDN sobre `EventSource`; a WHATWG alerta para isso e sugere um shared worker). Em produção, o painel usa HTTP/1.1 (`node:https`).
  - Um SSE por aba ocupa 1 das 6 conexões. Com 3 ou mais abas do painel e os fetches normais, o painel pode travar.
  - Mitigação: **um stream por aba**. Se o proprietário costuma abrir várias abas, compartilhe um único stream com `BroadcastChannel` + eleição de líder ou com um `SharedWorker` (mais tarde).
  - O HTTP/2 tiraria esse limite, mas exige `node:http2` no servidor customizado e não se justifica agora.
  - VERIFIED (especificação/MDN) / impacto PARTIAL.

## Q3. Cliente: `EventSource` vs. streaming com `fetch`

- **`EventSource` (recomendado).** É um GET na mesma origem, e os cookies vão junto (mesma origem, sem precisar de `withCredentials`). Ele não aceita cabeçalhos customizados (VERIFIED, especificação), mas isso não é problema: o stream é um GET só de leitura, e o hook de sessão não exige CSRF em GET. A reconexão é automática, com `Last-Event-ID` e `retry`.
- **`fetch` + `ReadableStream`:** permite cabeçalhos (como `X-CSRF-Token`) e controle total do backoff. Em troca, o parser, a reconexão e o `Last-Event-ID` ficam por sua conta. Só compensa se algum cabeçalho virar obrigatório, o que não é o caso agora.
- **CSRF e Origin:** o stream não tem efeito colateral, então não precisa de token CSRF. Outro site não consegue ler o stream: não recebe o cookie (o `SameSite=Lax` bloqueia em sub-requisições cross-site) e não recebe CORS. A checagem de `Origin` só roda quando o cabeçalho vem. Num GET da mesma origem, o navegador costuma omitir esse cabeçalho (especificação Fetch, tainting `basic`). PARTIAL: confirmar num navegador real.
- **Reconexão e backoff:**
  - Em erro de rede, a especificação reconecta sozinha e deixa o navegador acrescentar backoff.
  - Já **qualquer status diferente de 200, ou um Content-Type errado, fecha de vez** (`readyState = CLOSED`, sem reconexão) — VERIFIED.
  - Por isso o cliente precisa de um laço próprio: no `error` com `readyState === CLOSED`, espere com backoff exponencial + jitter (por exemplo, de 1 s até 30 s), chame `GET /api/session` de novo e abra um novo `EventSource`.
- **Reinício do servidor (a sessão em memória se perde):**
  - A reconexão recebe `401`, e o `EventSource` fecha (status diferente de 200).
  - O laço acima recupera: o `/api/session` cria um cookie e um token CSRF novos, o cliente guarda o token novo, reabre o stream e faz um **refetch completo** (os IDs de evento antigos não valem para um processo novo).
  - VERIFIED (código + especificação) / fluxo PARTIAL.
- **Aba oculta (`visibilitychange`):** os navegadores não fecham o `EventSource` em abas em segundo plano. Para quem faz live, o painel costuma ficar numa aba de fundo durante a transmissão. Por isso, por padrão, **não** feche o stream quando a aba ficar oculta. No `visible`, faça um refetch barato das telas ativas para corrigir o que se perdeu com o throttling. PARTIAL: o throttling varia entre navegadores e precisa de teste.

## Q4. Desenho do canal

- **Um stream por aba:** `GET /api/events` (o nome final fica com o @architect).
- **Eventos de invalidação, não dados completos.**
  - Eventos: `queue.changed`, `calls.changed`, `operations.changed` (outbox), `rewards.sync.changed` e `health.changed`. Além deles, `hello` (manda o `instanceId` do servidor) e o comentário de heartbeat.
  - O `data` leva só `{ topic, version }`, sem dados pessoais.
  - O cliente busca os dados de novo pelos endpoints REST que já existem e que já tratam autenticação, localização e erros.
  - Motivo: uma única fonte de verdade (REST), payloads pequenos, nenhum segundo serializador para manter em sincronia com a API, e as regras de privacidade da Q5 ficam fáceis de verificar.
- **Ordem e deduplicação:** use `id: <instanceId>-<seq monotônico>`. O cliente guarda a última `version` de cada tópico e ignora as mais antigas. Vários eventos do mesmo tópico em ~100–250 ms viram um único refetch (debounce).
- **Retomada:**
  - Ao reconectar com `Last-Event-ID` do mesmo `instanceId`, o servidor pode mandar só os tópicos que mudaram desde aquele seq (com um buffer circular pequeno, por exemplo os últimos 256 eventos).
  - O caminho mais simples e seguro é mandar **sempre** um evento `resync`, que manda o cliente buscar tudo de novo.
  - Recomendação: comece com `resync` em toda (re)conexão e só adote o buffer circular se o refetch for pesado.
  - Se o `instanceId` mudar, o servidor reiniciou e o cliente faz o refetch completo.
- **Fallback:** se o stream não abrir depois de N tentativas (por exemplo, 3) ou de 60 s, passe para **polling lento** (15–30 s) dos mesmos endpoints e continue tentando o SSE em segundo plano. Mostre um aviso discreto de "tempo real indisponível" (a UX fica com o @ux-design-expert).
- **Overlay:** continua com o polling de 1 s por enquanto (OBS/CEF, outro modelo de sessão). Migrá-lo para SSE é outra decisão e exige teste no OBS.

## Q5. Segurança e privacidade

- **Nunca vão no stream:**
  - tokens (Twitch, sessão, CSRF), cookies e cabeçalhos;
  - UID ou IDs de pessoas usuárias da Twitch;
  - texto de chat, texto de resgate ou outra entrada de pessoas usuárias, e nomes de exibição em texto livre;
  - mensagens de erro, stacks e connection strings.

  Só vão tópico, versão/seq, `instanceId` e, no máximo, contadores ou estados que o painel já mostra. Isso segue a regra do projeto para logs JSON.
- **Logs:** registre abertura e fechamento de conexão com hash da sessão/`referenceId` e contagens. Nunca registre o corpo do evento.
- **Limites:** no máximo um número de streams por sessão (por exemplo, 4) e no total (por exemplo, 32). O stream excedente recebe `429`, e o cliente entra no laço de backoff. Feche os streams de uma sessão que expirar. O heartbeat detecta sockets mortos.
- **Erros inesperados** dentro do stream: mande um `event: error` genérico só com o `referenceId` e feche. Nunca mande a mensagem.
- **Testes automatizados:**
  - **Vitest + Fastify real** numa porta efêmera (`app.listen({ port: 0 })`) + `fetch` lendo o `ReadableStream`. Cobrir:
    - cabeçalhos (`text/event-stream`, `no-transform`);
    - 401 sem sessão;
    - heartbeat (fake timers ou intervalo curto);
    - evento quando o domínio muda;
    - limpeza quando o cliente aborta (a contagem de assinantes volta a 0);
    - limite por sessão;
    - payload sem campos proibidos (assert de uma allow-list de chaves).
  - **Um teste pelo proxy do Next** (servidor de dev) que prove que não há gzip nem corte em 30 s: um evento em t+0 e outro em t+40 s precisam chegar. É teste de integração, não unitário.
  - **E2E no navegador** só para: reconexão automática, recuperação depois de reiniciar o Fastify (401 → sessão nova), várias abas e aba em segundo plano.
  - Os fluxos de domínio que dependem de PostgreSQL continuam usando um PostgreSQL isolado (regra do projeto).

## Q6. Alternativas (só como nota)

- **WebSocket (`@fastify/websocket`):** é bidirecional, mas o painel só precisa de servidor → cliente, e os comandos já vão por REST com CSRF. Exigiria:
  - `Upgrade` passando pelo proxy do Next (o httpxy suporta `ws`, mas em algumas configurações o caminho de upgrade do Next é diferente do dos `rewrites`; não verificado);
  - autenticação própria no handshake;
  - reconexão própria.

  É mais complexidade sem ganho.
- **Long polling:** funciona em qualquer lugar, mas gera mais requisições e mais latência. Só serve como fallback.
- **Por que SSE basta:** é um painel local, com uma pessoa operando, poucos eventos e um único sentido. Cookies e mesma origem já estão resolvidos, a reconexão é nativa e é HTTP comum pelo proxy que já existe.

## Desenho recomendado (resumo)

1. **Fastify:** `@fastify/sse` (versão exata) ou `reply.hijack()`. Rota `GET /api/events`, atrás do hook de sessão `onRequest` existente, com:
   - cabeçalhos `text/event-stream`, `Cache-Control: no-cache, no-transform` e `X-Accel-Buffering: no`;
   - heartbeat de 15 s e `retry: 3000`;
   - limpeza no fechamento e no `app.close()`;
   - limites por sessão e no total.
2. **Domínio:** um emissor em processo publica `{topic}` depois de cada commit (fila, chamadas, outbox, sincronização de recompensas, saúde). A camada SSE agrupa os eventos e manda `{topic, version}`.
3. **Proxy:** mantenha os `rewrites` e não defina `compress: false`. Conte com o `no-transform` + heartbeat abaixo de 30 s.
4. **Cliente:** um `EventSource` por aba. Cada evento dispara um refetch dirigido com debounce. Laço próprio de backoff no `CLOSED`, renovando a sessão por `/api/session`. Refetch completo no `hello` com `instanceId` novo. Fallback para polling lento.
5. **Privacidade:** só invalidações, com teste de allow-list.

## Riscos

- O `@fastify/sse` está na 0.x e é pequeno, então há risco de mudança de API ou de bug. Mitigação: versão exata, ou `hijack`.
- O heartbeat padrão de 30 s do plugin empata com o timeout de 30 s do proxy do Next. Se não for trocado, os streams caem a cada ~30 s.
- Volta o gzip se uma mudança futura remover o `no-transform` ou se outra camada passar a comprimir.
- O limite de 6 conexões trava o painel com várias abas abertas.
- Tempestade de refetch se os eventos não forem agrupados.
- O `experimental.proxyTimeout` e o comportamento do proxy interno do Next podem mudar entre versões.

## O que só um teste no ambiente confirma

1. Os eventos chegam um a um (sem gzip e sem buffer) pelo `next dev --experimental-https` **e** pelo `start-production.mjs`. O `curl -N -H 'Accept-Encoding: gzip'` não deve mostrar `Content-Encoding` e deve mostrar a saída aos poucos.
2. Um stream ocioso por mais de 30 s, com heartbeat de 15 s, não é cortado.
3. A desconexão do navegador fecha o assinante no Fastify (a contagem volta a 0).
4. Se o navegador manda `Origin` no `EventSource` da mesma origem, e se a checagem de `Host` aceita a requisição que passou pelo proxy.
5. Reinício do Fastify → 401 → recuperação com sessão nova.
6. O comportamento numa aba em segundo plano durante uma live de verdade e com 3 ou mais abas.

## Fontes (acessadas em 2026-10-27)

- WHATWG HTML Standard, Server-sent events: https://html.spec.whatwg.org/multipage/server-sent-events.html — VERIFIED
- README do `@fastify/sse`: https://github.com/fastify/sse — VERIFIED (npm `0.6.1`, peer `fastify ^5.x`)
- `fastify-sse-v2` no npm: https://www.npmjs.com/package/fastify-sse-v2 — VERIFIED (`4.2.2`)
- Fastify Reply (`hijack`, `raw`): https://fastify.dev/docs/latest/Reference/Reply/ — VERIFIED
- Fastify Hooks: https://fastify.dev/docs/latest/Reference/Hooks/ — VERIFIED
- Next.js `compress`: https://nextjs.org/docs/app/api-reference/config/next-config-js/compress — VERIFIED (atualizada em 2025-06-16)
- MDN `EventSource` (nota sobre o limite de 6 conexões): https://developer.mozilla.org/en-US/docs/Web/API/EventSource — VERIFIED
- Código instalado: `node_modules/next/dist/server/lib/router-utils/proxy-request.js`, `node_modules/next/dist/server/lib/router-server.js`, `node_modules/next/dist/compiled/compression`, `node_modules/next/dist/compiled/httpxy` (Next 16.4.1) — VERIFIED
- Comunidade: revisão no cubic.dev sobre `rewrites` do Next 16 fazendo buffer de SSE: https://cubic.dev/pr/lfnovo/open-notebook/pull/770 — UNVERIFIED para este projeto
- Comunidade: Medium, SSE lento no Next.js: https://medium.com/@oyetoketoby80/fixing-slow-sse-server-sent-events-streaming-in-next-js-and-vercel-99f42fbdb996 — complementar

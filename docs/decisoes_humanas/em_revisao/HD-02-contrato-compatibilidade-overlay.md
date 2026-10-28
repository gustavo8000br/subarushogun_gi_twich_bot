# HD-02 — Contrato de compatibilidade do overlay

> **SUPERADA em 2026-10-28 pela decisão do proprietário** (sem usuários ativos até o `rc`, OW-09 de 2026-10-27; o alias `/overlay.html` foi removido na Onda 3 do cutover; a rota do overlay é `/overlay?ref=<referência>#<capability>`, servida pelo Next sem redirecionamento, e `/overlay.html` recebe o 404 do Next). Veja [`docs/pt-BR/stories/OPS-15/cutover-wave-3.md`](../../pt-BR/stories/OPS-15/cutover-wave-3.md) (em inglês: `docs/stories/OPS-15/cutover-wave-3.md`). O caminho `/overlay.html` abaixo permanece inalterado como registro histórico. Situação da Onda 3 em 2026-10-28: implementada e validada pelo `@dev`, aguardando o veredito do `@qa`.

**Status:** Decisão do proprietário registrada (2026-10-19); build/runtime de produção e validação OBS/CEF continuam pendentes. A reconciliação arquitetural com #57 continua aberta.
**English:** [HD-02 — Overlay compatibility contract](../../human_decisions/in_review/HD-02-overlay-compatibility-contract.md)

## Problema

A decisão do proprietário é que Next.js sirva a página do overlay em desenvolvimento e produção. Fastify continua como autoridade de API, dados, domínio e Twitch. O overlay precisa permanecer dinâmico quando a conta ou a fila muda, preservando o contrato atual da capability.

## Contrato proposto

O caminho permanece `/overlay.html?ref=<referência>#<capability>`, com Next como servidor do documento em todos os modos:

| Modo | Documento `GET /overlay.html` | API de leitura | Origem emitida |
| --- | --- | --- | --- |
| Desenvolvimento local | Next dev em HTTPS, bind `127.0.0.1`, rewrite `/overlay.html` para `/overlay/` | `/overlay/api/*` same-origin no Next, encaminhado ao Fastify HTTPS local | Next loopback HTTPS, porta `NEXT_DEV_PORT` |
| Produção local | Servidor Node Next em HTTPS na porta `3000` do contêiner, mapeada para a `APP_PORT` pública do host | `/overlay/api/*` same-origin via Next, encaminhado por HTTPS confiável de loopback ao Fastify privado em `API_PORT` (`3109`) | Next HTTPS, `PUBLIC_BASE_URL` |

O caminho, `ref` não secreto, segredo no fragmento, hash persistido, header bearer, leitura de um widget, revogação/rotação e separação da sessão administrativa permanecem iguais. O renderer no navegador consulta a projeção atual sem cache uma vez por segundo e atualiza ao voltar à janela; Fastify calcula os valores da conta/fila atual. Next apenas serve a página/assets e encaminha a leitura. O segredo não entra em query/path, logs, cache ou resposta de projeção. O HTTPS local usa a CA gerada pelo bootstrap. Não permitir HTTP, host LAN, fallback permissivo de TLS ou API cross-origin em produção. O Compose publica somente a porta local existente em loopback do host; Fastify não fica diretamente acessível pelo host.

Links de desenvolvimento anteriores apontavam para a origem da API. Em dev, `/overlay.html?ref=...` no Fastify redireciona temporariamente para a origem Next configurada sem incluir o fragmento no `Location`; o navegador mantém o fragmento. O bind local do Next fica restrito a `127.0.0.1`; somente Codespaces explicitamente detectado usa `0.0.0.0`. Em produção, Next é dono de `/overlay.html` e `/_next/*`; antes do cutover do painel, encaminha os demais caminhos/assets legados do painel ao Fastify. `/api/*`, `/overlay/api/*`, `/health` e `/callback` são encaminhados ao Fastify. A URL pública única do produto permanece a mesma.

## Opções

| Opção | Escolha | Efeito |
| --- | --- | --- |
| **A — Next serve a página, Fastify serve a API (escolhida pelo proprietário)** | Next serve `/overlay.html` em desenvolvimento e produção pela porta HTTPS local existente; leituras same-origin são encaminhadas ao Fastify privado. Capability e polling ao vivo são preservados; o painel legado é encaminhado temporariamente até seus gates de cutover. | Mantém a página no Next, autoridade de dados/domínio no Fastify, porta pública única e links existentes. Exige servidor Node de produção, confiança TLS, precedência de rotas, inicialização/health do contêiner e validação OBS/CEF nativa. |
| B — Fastify serve o documento | Fastify sempre serve `/overlay.html`; Next não hospeda a página. | Contradiz a direção explícita do proprietário. |
| C — Remover a bearer capability | Adotar a proposta de projeção sem capability em OPS-13/#57. | Muda autorização e isolamento por widget; requer decisão arquitetural separada, análise de ameaças, revisão de segurança, critérios/testes substitutos e aprovação humana. |

**Decisão:** A, escolhida pelo proprietário. Next static export não fornece o rewrite/runtime de produção necessário; produção usa o servidor Node Next. Rewrites encaminham API e callback ao Fastify; o polling de um segundo mantém atuais as projeções de conta e fila. **Inferência arquitetural:** Fastify privado e gateway HTTPS Next preservam uma única origem local pública mantendo as decisões de domínio/dados fora do Next. Confiança TLS no CEF e compatibilidade com OBS real ainda exigem validação nativa, não podem ser inferidas de Chromium comum. O Fetch Standard especifica que um redirect cujo `Location` não tem fragmento herda o fragmento original, preservando links antigos de desenvolvimento sem enviar a capability ao servidor. Fontes: [OBS Browser Source](https://obsproject.com/kb/browser-source), [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [Next.js rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites), [Fetch Standard — redirect fragment](https://fetch.spec.whatwg.org/#concept-location-url).

## Relação com decisão anterior e OPS-13/#57

Em 2026-10-19 o proprietário escolheu Next como servidor da página do overlay e manteve Fastify como autoridade de API/dados. A decisão anterior de preservar a capability continua válida. Isso não fecha a reconciliação arquitetural com #57 nem autoriza remover a capability.

**Decisão humana:** opção A resolvida. As verificações restantes são gates de implementação e validação técnica, não uma escolha de produto pendente.

# OPS-26 — Comandos de sistema do chat: `ping` com a latência real da Twitch e o comando `status` exclusivo do streamer

[English](../../../stories/OPS-26/story.md)

**Status:** Draft (redigida pelo `@sm` em 2026-10-27; ainda não validada pelo `@po`). **Issue:** pendente (o `@devops` cria quando a story ficar pronta; sem comentários em issues).
**Origem:** defeito **D-8** encontrado na bateria ao vivo de 2026-10-26: o chat respondeu `Pong 🏓 Bot ativo · v0.2.0-0000000-beta · Twitch: latência indisponível` ([live-battery-2026-10-26-results.md](../OPS-15/live-battery-2026-10-26-results.md), LB-23) enquanto o `/health` informava `twitch_api_ping_ms: 219` na mesma instância (relato do proprietário, 2026-10-27); o proprietário já viu "indisponível" várias vezes. Pedido do proprietário em 2026-10-27: um comando `status` exclusivo do streamer.
**Relacionadas:** OPS-15 (o painel Next; esta story começa só depois do merge da branch); OPS-22 (operações financeiras exibidas pelo `status`); OPS-23 (SSE; nenhum código dela é reaproveitado aqui); OPS-14 / #65 (comportamento localizado do chat, sem arquivo de story no repositório); o catálogo de comandos e os catálogos de localização (pt-BR, en, es).
**Itens registrados:** inventário ST-19 (esta story, que carrega o defeito D-8), TS-13 e TS-14 (testes), OW-17 (checagem ao vivo do proprietário de `ping`/`status`); ver [backlog-inventory](../../process/backlog-inventory.md).
**Por que a LB-23 é PASS e o D-8 é um defeito:** a bateria ao vivo atribuiu **PASS** à LB-23 porque verificou apenas que o bot responde `ping`; em 2026-10-27 o proprietário classificou a latência ausente (`latência indisponível` enquanto o `/health` mostrava 219 ms) como defeito D-8. As duas afirmações são verdadeiras; o resultado da bateria não é reescrito.
**Coordenação necessária:** `$aiox-po` (validação, forma exata da versão), `$aiox-architect` (como medir a latência sem pressão de rate limit nem custo; de onde o `status` lê os dados), `$aiox-ux-design-expert` (textos e formatos no chat, nota >= 9,0 no escopo revisado), `$aiox-qa` independente, `$aiox-devops` (issue). `$aiox-analyst` só se surgir uma LACUNA (um endpoint leve da Helix para medir latência): consulte antes [research-index.md](../../research-index.md).

## Problema

- **D-8 — o `ping` do chat não traz a latência da Twitch que o sistema já mede.** O `/health` calcula o tempo da sonda (`health-route.mjs`, `pingMs`), enquanto a resposta do chat lê `twitchHealth?.pingMs` (`apps/api/src/commands/help.mjs:76-79`) e cai em "indisponível" quando não recebe nada. Por que o chat não recebe a medição do `/health` **ainda não foi verificado**; a investigação faz parte desta story.
- **O streamer não tem uma visão única, no chat, da saúde do bot.** Não existe comando que mostre recompensas, uptime, conexões, latência, versão, filas e operações pendentes em uma resposta.

## Decisões do proprietário (2026-10-27)

1. Esta é uma story nova, status Draft, que entra **somente depois da migração/cutover e depois de a branch `feat/ops-15-next-panel` ser mergeada no `main`**: ST-01 (#69) integrada no `main` é dependência explícita; o card fica Bloqueado até lá. Prioridade P2, dificuldade M.
2. A resposta do `ping` **sempre** traz o tempo de resposta real da Twitch; nunca "indisponível" quando a Twitch responde. O formato esperado é `Pong 🏓 - vMAJOR.MINOR.PATCH-stage - <valor>ms.` (exemplo `Pong 🏓 - v0.2.0-beta - 219ms.`). A versão real hoje é `v0.2.0-0000000-beta` (ver `validate:version`); **Fixado pelo `@po` (2026-10-28, `[AUTO-DECISION]`): o formato do proprietário é vinculante, sem o segmento do commit.** Se o proprietário quiser o segmento do commit de volta, isso é uma nova decisão do proprietário. O `@architect` apenas confirma de onde vem a string.
3. **Teste automatizado obrigatório** (decisão do proprietário): falha se o ping do chat não trouxer o valor em ms quando o `/health` ou o adaptador tem medição, cobrindo medição presente, ausente e Twitch com falha; mais uma verificação ao vivo no checklist do proprietário.
4. O `status` é **exclusivo do streamer** (proprietário/streamer; espectadores recebem uma recusa curta); a permissão é fixa no catálogo de comandos, não configurável por espectadores.

## História

Como streamer,
quero que o `ping` do chat mostre a latência real da Twitch e um comando `status` que resuma o bot,
para ver na live, em uma mensagem, se o bot e a Twitch estão saudáveis, sem abrir o painel e sem um "indisponível" enganoso.

## Escopo

**Dentro:**

- Corrigir o D-8: investigar a causa, fazer o `ping` usar uma medição real, erro curto e honesto com código quando a medição realmente falhar.
- Formato do `ping` conforme decidido (decisão 2 do proprietário).
- Novo comando `status`, exclusivo do streamer. **Lista mínima** proposta (extensível; cada item rastreia ao pedido do proprietário): recompensas criadas por fila (sincronizada / pausada / aberta); uptime do bot; conexão com a Twitch (API, chat, integração: connected / degraded); tempo de resposta da Twitch; versão; filas ativas e abertas; operações pendentes e contagem de `needs_review`. Nada sensível: sem tokens, UID, texto de chat nem de resgate.
- Mensagens dentro do limite do chat (dividir ou abreviar); textos localizados em pt-BR, en e es.
- Permissão fixa no catálogo de comandos.

**Fora:**

- Mudar quem pode executar outros comandos, ou tornar configurável a permissão do `status`.
- Comandos novos além do pedido do proprietário. **Sugestão para o proprietário (fora do escopo):** `version` e `uptime` como comandos separados só se o `status` não os cobrir; hoje cobre.
- Mudanças no painel, SSE, ou no `/health` além do que o arquiteto precisar para compartilhar a medição.
- Bump de versão, commit, push, PR, release.

## Critérios de aceite

As classes de evidência ficam separadas: unitário, integração (PostgreSQL quando há leitura de dados), E2E de chat com fixtures e canal ao vivo. Todo comportamento começa com um teste que falha.

1. **Dado** que o adaptador ou o `/health` tem uma medição de latência, **quando** um espectador ou o streamer executa `ping`, **então** a resposta é `Pong 🏓 - vMAJOR.MINOR.PATCH-stage - <valor>ms.` (sem o segmento do commit; exemplo `Pong 🏓 - v0.2.0-beta - 219ms.`; a versão vem da mesma fonte do `validate:version`, sem segunda constante de versão) com o valor medido e nunca "indisponível". **Teste (obrigatório):** falha se o valor faltar havendo medição; o teste unitário também afirma a forma da versão.
2. **Dado** que ainda não existe medição, **quando** o `ping` roda, **então** o bot faz uma medição (uma chamada leve à Helix) e responde com ela; **dado** que a medição falha, **então** responde um erro curto e honesto com código (sem valor inventado, sem mensagem interna), e a falha é registrada em log sem dados de usuário. **Teste (obrigatório):** os três casos, presente / ausente / Twitch com falha.
3. **Dado** muitos `ping` em pouco tempo, **quando** rodam, **então** a medição é cacheada ou limitada de modo a não pressionar rate limit nem custo da Twitch; a política é fixada pelo `@architect` e testada com fake timers.
4. **Dado** a investigação do D-8, **então** a causa (por que o chat não usou a medição do `/health`) fica registrada nesta story com a evidência, e a correção é test-first.
5. **Dado** que o streamer executa `status`, **quando** ele responde, **então** mostra a lista mínima acima em texto localizado, dentro do limite do chat (o limite é o de 500 caracteres do helper `bounded()` existente em `apps/api/src/commands/help.mjs`; dividido em várias mensagens quando preciso), sem token, UID, texto de chat nem de resgate.
6. **Dado** que um espectador (ou qualquer não-streamer) executa `status`, **quando** é processado, **então** a resposta é uma recusa curta localizada e nenhum dado é mostrado; a permissão vive no catálogo de comandos e não pode ser alterada pelo painel.
7. **Dado** pt-BR, en e es, **quando** `ping` e `status` respondem, **então** os textos existem nos três catálogos e `npm run validate:localization` passa; o `@ux-design-expert` aprova formatos e redação (>= 9,0 no escopo revisado, dizendo o que a revisão não cobre).
8. **Dado** que o chat é exercitado com fixtures (E2E), **então** `ping` e `status` produzem as mensagens de saída esperadas para Twitch conectada, degradada e com falha.
9. **Dado** que o proprietário executa a verificação ao vivo (OW-17), **então** o `ping` real no canal mostra um valor em ms próximo do valor do `/health` da mesma instância, e o `status` real mostra os campos esperados; o resultado é registrado como classe de evidência ao vivo separada.

## Dependências

- **Depende de:** ST-01 / issue #69 integrada no `main` (explícita); GO do `@po` e issue do `@devops`; decisão do `@architect` sobre medição e fonte de dados; plano do `@ux-design-expert`; OPS-22 entregue ou estável para a parte de operações do `status`.
- **Conjunto de escrita:** handlers de comandos do chat, o catálogo de comandos e os três catálogos de chat (depois da onda 2 do cutover / DP-3 ficam em `apps/shared/localization/catalogs/`; a story começa depois do merge, então use esse caminho); coordenar com a OPS-24 (TypeScript) se os arquivos já tiverem sido convertidos.

## Riscos

- **Rate limit e custo:** uma chamada Helix por `ping` poderia ser abusada por spam no chat. Mitigação: CA 3.
- **Vazamento de dado sensível no `status`:** Mitigação: allowlist explícita de campos, teste que afirma as chaves exatas da saída.
- **Limite do chat e três idiomas:** Mitigação: CA 5 e 7 com testes de tamanho por idioma.
- **Causa-raiz desconhecida:** a causa do D-8 pode ser fiação ou temporização, não só formatação. Mitigação: CA 4 antes da correção.

## Complexidade (estimativa do `@sm`)

Escopo 2, integração 3, infraestrutura 1, conhecimento 2, risco 2 = **10 → STANDARD**. Dificuldade **M**, prioridade **P2**.

## Valor de negócio

O streamer vê uma latência verdadeira e o status completo do bot dentro do chat, e um "indisponível" falso e recorrente desaparece.

## Plano de testes

1. **Unitário:** medição e formatação da latência (presente, ausente, com falha), forma da versão, divisão de mensagens por idioma, política de taxa com fake timers, allowlist de campos do `status`.
2. **Integração:** `status` lendo filas, recompensas e operações de um PostgreSQL isolado com migrations reais (nunca mocks de Prisma).
3. **E2E de chat (fixtures):** CA 8.
4. **Canal ao vivo:** CA 9, condicionado ao proprietário (OW-17), registrado à parte.
5. **Gates:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist`, `npm run review:static`; o `@qa` emite o veredito antes de o `@devops` comitar.

## Gates de planejamento antes da implementação

- [ ] Validação do `@po` (10 pontos) e GO; forma exata da versão fixada.
- [ ] O `@devops` cria a issue.
- [ ] `@architect`: método de medição, cache/limite, fonte de dados do `status`.
- [ ] `@ux-design-expert`: textos e formatos do chat, nota >= 9,0.
- [ ] Plano de testes do `@qa`.
- [ ] Nota do `@analyst` só se houver LACUNA (endpoint leve da Helix); `docs/research-index.md` consultado antes.
- [ ] Branch `feat/ops-15-next-panel` mergeada no `main` (ST-01 / #69 integrada).

## Definição de pronto

- Os CA 1-8 têm evidência Red-first por classe; o CA 9 executado com o proprietário ou dispensado explicitamente por ele.
- Todos os quality gates verdes; veredito do `@qa` registrado; File List e checklists atualizados em inglês e pt-BR.

## Validação do rascunho pelo SM (story-draft-checklist, 2026-10-27)

1. Objetivo e contexto: claros (evidência do D-8, pedido do proprietário). PASS.
2. Orientação técnica: arquivos nomeados como pistas; causa-raiz explicitamente não verificada. PASS.
3. Referências: LB-23 e os resultados ao vivo. PASS.
4. Autossuficiência: formato, permissão e dependências declarados. PASS.
5. Testes: teste obrigatório de três casos, classes separadas. PASS.
6. Análise estática: `npm run review:static` nos gates. PASS.
- Resultado: pronta para o `@po`. A lista de campos do `status` é uma proposta marcada como tal; nada além disso foi inventado.

## File List

- `docs/stories/OPS-26/story.md` (nova)
- `docs/pt-BR/stories/OPS-26/story.md` (nova)
- `docs/stories.md` (entrada no índice)
- `docs/pt-BR/stories.md` (entrada no índice)

## Change Log

- 2026-10-27 — `@sm` (River): story redigida a partir do defeito D-8 (LB-23) e do pedido do proprietário pelo comando `status` exclusivo do streamer. Status Draft. Bloqueada até o merge da branch no `main`.
- 2026-10-28 — `@sm` (River): aplicadas as correções obrigatórias 1-3 e as recomendações 1-2 do `@po`. O CA 1 agora fixa a forma da versão (`vMAJOR.MINOR.PATCH-stage`, sem segmento do commit); D-8 e OW-17 aparecem com seus IDs do inventário (ST-19, TS-13, TS-14, OW-17, já no inventário desde a quinta atualização); a explicação LB-23 PASS versus D-8 está no cabeçalho; o conjunto de escrita cita o caminho dos catálogos pós-onda 2; o CA 5 informa o limite de 500 caracteres. Status inalterado (Draft; o status é do `@po`).
- 2026-10-28 — `@sm` (River): decisão 2 do pt-BR alinhada ao texto em inglês (forma da versão fixada sem o segmento do commit; removida a redação antiga "com ou sem o segmento do commit", que contradizia o CA 1). Sem mudança no corpo em inglês.

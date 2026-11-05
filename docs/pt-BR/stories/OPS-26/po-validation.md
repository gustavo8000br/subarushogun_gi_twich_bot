# OPS-26 — Validação do `@po` (`*validate-story-draft`, 10 pontos)

[English](../../../stories/OPS-26/po-validation.md)

**Validador:** `@po` (Pax) — **Data:** 2026-10-28 — **Modo:** YOLO (autônomo; decisões marcadas com `[AUTO-DECISION]`)
**Story:** [story.md](story.md) (pt-BR) e [en](../../../stories/OPS-26/story.md), como redigida pelo `@sm` em 2026-10-27 (completa: todas as seções presentes, com Change Log e verificação do rascunho pelo `@sm`). **Issue:** pendente.
**Fontes conferidas:** `.claude/rules/story-lifecycle.md`, `.aiox-core/development/tasks/validate-next-story.md`, linha LB-23 de [live-battery-2026-10-26-results.md](../OPS-15/live-battery-2026-10-26-results.md), `apps/api/src/commands/help.mjs` linhas 76-79 (`renderPingResponse` lê `twitchHealth?.pingMs`; sem valor, usa `chat.ping.unavailable`), `apps/api/src/health-route.mjs` linhas 42-84 (sonda em cache `pingMs`, exposta como `twitch_api_ping_ms`), `apps/api/src/commands/catalog.mjs` (permissões fixas de `streamer` já existem), os catálogos de chat `apps/web/localization/catalogs/chat/{pt-BR,en,es}.tsv`, `package.json` (`validate:version`), `docs/process/backlog-inventory.md`.

## Veredito

**GO — 9,0/10.** O status continua **Draft (Rascunho)**: vale a regra do projeto "Ready = GO do `@po` + issue existente", a issue não existe e o proprietário colocou a story **depois** do cutover e do merge da `feat/ops-15-next-panel` no `main` (ST-01 / #69). O `@po` **não** marca Ready.

## Notas

| # | Ponto | Nota | Evidência / observação |
|---|---|---|---|
| 1 | Título claro e objetivo | 1,0 | Dois comandos, cada um com seu resultado. |
| 2 | Descrição completa | 1,0 | D-8 com a resposta exata do chat e o valor do `/health`; as pistas de código são reais (`help.mjs:76-79`, `health-route.mjs`); a causa raiz está marcada com honestidade como não verificada. |
| 3 | CAs testáveis | 1,0 | Nove CAs Dado/Quando/Então; o teste de três casos exigido pelo proprietário (presente / ausente / Twitch com falha) está explícito nos CAs 1-2; allowlist e recusa são testáveis. |
| 4 | Escopo IN/OUT | 1,0 | O IN se rastreia até o pedido do proprietário; o OUT deixa `version`/`uptime` só como sugestão, sem painel, sem SSE, sem bump. |
| 5 | Dependências | 0,5 | ST-01/#69 mergeada no `main`, `@architect`, UX, OPS-22. Descontos: o D-8 e o novo ID de trabalho do proprietário **OW-17** ainda não estão registrados no inventário do backlog (só nesta story); o write set não diz que os catálogos de localização mudam para `apps/shared/localization/catalogs/` na Onda 2 do cutover (DP-3), então o caminho que a story vai tocar é o de depois da Onda 2. |
| 6 | Complexidade | 1,0 | 10 → STANDARD, M, P2. |
| 7 | Valor de negócio | 1,0 | Acaba com um "indisponível" falso e recorrente e dá ao streamer a saúde do bot em uma mensagem. |
| 8 | Riscos | 1,0 | Rate limit, vazamento de dados (teste de allowlist), tamanho do chat × 3 idiomas, causa raiz desconhecida. |
| 9 | Definição de pronto | 1,0 | Evidência Red-first por classe; CA 9 executado ou dispensado explicitamente pelo proprietário; gates listados. |
| 10 | Alinhamento com fontes/decisões do proprietário | 0,5 | Coincide com as decisões do proprietário de 2026-10-27. Descontos: (a) a forma da versão fica aberta entre a decisão 2 do proprietário (`vMAJOR.MINOR.PATCH-stage`, exemplo `v0.2.0-beta`) e o CA 1 (`<versão>`); (b) a LB-23 está marcada como **PASS** nos resultados da bateria ao vivo, enquanto esta story a classifica como defeito D-8 — a story deve dizer por quê (a bateria conferiu que o `ping` responde; o proprietário depois classificou a latência ausente como defeito). |

**Template / campos de executor:** as stories deste projeto não usam os campos `executor` / `quality_gate` do `story-tmpl.yaml`; não gera desconto. **Plano de análise estática:** `npm run review:static` está nos gates, com a lista completa de gates do projeto; achados bloqueiam. **Segurança:** allowlist dos campos do `status` com teste das chaves exatas; sem tokens, UID, texto de chat ou de resgate; erro honesto com código, sem mensagem interna; falha registrada em log sem dados de pessoas usuárias. PASS.

## `[AUTO-DECISION]` Forma exata da versão no `ping` (gate de planejamento "forma exata da versão fixada")

`[AUTO-DECISION]` Qual forma de versão o `ping` mostra? → **O formato do proprietário vale: `Pong 🏓 - vMAJOR.MINOR.PATCH-stage - <valor>ms.`, ou seja, sem o segmento do commit (hoje `Pong 🏓 - v0.2.0-beta - 219ms.`).** O `@architect` confirma só *de onde* vem a string (derivar da mesma fonte do `validate:version`, sem uma segunda constante de versão). (Motivo: a decisão 2 do proprietário define o formato e dá o exemplo; o segmento de commit `0000000` aparece só na string de runtime de hoje, não no pedido do proprietário. Se o proprietário quiser o segmento de commit de volta, é uma nova decisão dele.) O `@sm` escreve isso no CA 1 e marca a metade "forma exata da versão fixada" do primeiro gate de planejamento.

## Correções exigidas (dono da edição: `@sm`, en e pt-BR; antes do gate do `@architect`)

1. **CA 1:** trocar `<versão>` pela forma fixada acima (`vMAJOR.MINOR.PATCH-stage`, sem segmento de commit) e incluí-la no teste unitário do CA 1.
2. **Inventário:** registrar o D-8 (defeito, fonte LB-23) e a OW-17 (verificação ao vivo de `ping`/`status` pelo proprietário) em `docs/process/backlog-inventory.md` (+ pt-BR), ligados a esta story (isso está no brief do `@sm` de 2026-10-27; listado aqui para não se perder).
3. **Nota de origem:** uma frase explicando que a LB-23 foi marcada PASS por "o bot responde ao `ping`" e que o proprietário classificou a latência ausente como defeito D-8 em 2026-10-27.

## Ajustes recomendados (não bloqueiam)

1. Write set: nomear o caminho dos catálogos depois da Onda 2 do cutover (`apps/shared/localization/catalogs/`, DP-3) em vez de "os três catálogos de localização", já que a story começa depois do merge.
2. CA 5: declarar o limite de tamanho do chat usado pelo helper existente `bounded()` (500 caracteres, `help.mjs`) como limite para dividir as mensagens, para que o teste de tamanho tenha um número.

## Status final

**GO 9,0/10 — Draft mantido** (sem issue; bloqueada até a ST-01/#69 ser mergeada no `main`). Próximo passo: o `@sm` aplica as correções exigidas 1-3; os gates do `@architect`, do `@ux-design-expert` e do `@qa` rodam quando a story for desbloqueada; o `@devops` cria a issue quando ela estiver pronta; então o `@po` registra a transição Draft → Ready no Change Log da story. O `@po` não editou o arquivo da story (write set desta sessão).

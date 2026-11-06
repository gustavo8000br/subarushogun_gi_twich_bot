# Issue body for OPS-32 (queue cycle calendar, per-game presets and the "Old queues" tab)

[Português (pt-BR)](../pt-BR/process/issue-body-changes-2026-11-06c.md)

**Date:** 2026-11-06. **Author:** `@sm` (River). **For:** `@devops`, who creates the issue **OPS-32** with the body below, **only after the `@po` GO** (never as a comment; the blocks are in Portuguese because they go to the issue body, with the English mirror without checkboxes, as the [issue body template](issue-body-template.md) asks). Nothing was created by `@sm`. The slices FT-79..FT-85 become sub-issues just-in-time. **No owner box is ticked here.** Decisions the owner already gave are listed as "registered" in the text (not as boxes); one decision is pending (OD-32-1), with the recommended option first.

## Issue body (to create)

````markdown
## Português

**OPS-32 — Calendário de ciclos da fila: reinício automático por jogo, presets por jogo e guia "Filas antigas".** Story em Rascunho: [story](docs/pt-BR/stories/OPS-32/story.md); nota de pesquisa do `@analyst` (autoavaliação 8,9/10; as páginas oficiais dos jogos não puderam ser lidas): [nota](docs/pt-BR/research/2026-11-06-queue-calendar/README.md). Item do inventário ST-25; fatias FT-79..FT-85. Depende da OPS-31 (#115). Relacionadas: OPS-22, OPS-23.

**Escopo (pedido do dono, 2026-11-06):** a fila reinicia sozinha na hora do reset do jogo (jogos conhecidos; o streamer escolhe o jogo e o servidor); ao escolher o jogo, o produto sugere criar as filas e as recompensas (presets editáveis; nada é criado antes da confirmação); a fila reiniciada vai para a guia "Filas antigas", guardada por 7 dias; o streamer, mesmo offline no reset, decide depois, por pessoa ou em lote, se devolve os pontos.

**Decisões do dono já registradas (2026-11-06):** (a) o reinício é automático para jogos conhecidos e o streamer escolhe o jogo; (b) o produto sugere filas e recompensas ao escolher o jogo, com presets editáveis e criação só depois da confirmação; (c) guia "Filas antigas" com retenção de 7 dias, decisão por pessoa ou em lote; (d) o que ocorre com resgates ainda pendentes depois dos 7 dias é a **política padrão definida pelo streamer nas Configurações** (vale também para o reinício com o streamer offline); valores possíveis: devolver, manter pendente, cumprir; recomendação do `@analyst`: devolver no dia 7 com aviso nos dias 5 a 6 (valores finais: ponto para o `@po` e o `@architect`).

**Fatias (ordem sugerida):** FT-79 catálogo versionado e confirmação do dono; FT-80 seleção do jogo e sugestão de filas e recompensas; FT-82 guia "Filas antigas" e retenção; FT-81 reinício automático e "calendário vencido"; FT-83 política padrão nas Configurações e aviso antes do fim da retenção; FT-84 cancelamentos em lote no fim da retenção; FT-85 testes reais no canal de testes. Todas P2, Backlog, depois da OPS-31.

**Só um teste real fecha (canal de testes SubaruShogun):** (T1) se a Twitch expira ou devolve sozinha um resgate UNFULFILLED; (T2) se `Update Redemption Status` funciona com o broadcaster offline; (T3) se um cancelamento restaura limites e tempo de recarga para o novo ciclo; (T4) se os pendentes de uma fila arquivada aparecem misturados com os do novo ciclo na fila de pedidos da Twitch.

**Riscos:** o catálogo envelhece a cada versão (o produto recusa reiniciar sem linha futura confirmada e mostra "calendário vencido"); fuso e servidor; pontos retidos por até 7 dias; cancelamentos em lote no dia 7 e limite da Helix; ids guardados por 7 dias são dado pessoal (logs sem UID); marcas dos jogos (só texto simples). **Fora de escopo:** ciclos próprios definidos pelo streamer (pergunta futura).

## English

OPS-32 — queue cycle calendar: automatic reset by game, per-game presets and the "Old queues" tab. Draft story ([story](docs/stories/OPS-32/story.md)); `@analyst` note (self-assessment 8.9/10; the official game pages could not be read, so the owner confirms every catalog row against the in-game countdown); inventory ST-25, slices FT-79..FT-85; depends on OPS-31 (#115). Registered owner decisions (2026-11-06): (a) the queue restarts by itself for known games and the streamer chooses the game; (b) the product suggests queues and rewards when the game is chosen (editable presets, created only after confirmation); (c) "Old queues" tab with 7-day retention, decided per person or in batch, even if the streamer was offline at the reset; (d) pending redemptions after 7 days follow the default policy the streamer sets in Settings (refund, keep pending, fulfill; recommended: refund on day 7 with a warning on days 5 to 6; final values for `@po`/`@architect`). Real-test items: expiry of an UNFULFILLED redemption, `Update Redemption Status` while offline, restored limits after a cancel, and pending items of an archived queue mixed with the new cycle's. Out of scope: streamer-defined cycles (future question). Pending owner decision: whether this enters the 0.4.0-beta or comes later (OD-32-1).

### Owner decisions (read-only mirror, no checkboxes)

- OD-32-1 — Does OPS-32 enter the 0.4.0-beta or come later? Options: A — after the 0.4.0-beta (recommended: it depends on OPS-31 and on the owner's row-by-row confirmation of the catalog); B — inside the 0.4.0-beta; C — postpone.
- A-01 — Owner action: confirm each cycle row of the catalog against the in-game countdown before it enters.

## Decisões do dono

### OD-32-1 — A OPS-32 entra na 0.4.0-beta ou depois?
**Por que importa:** define o escopo do próximo bump; a OPS-32 depende da OPS-31 e de uma confirmação linha a linha do catálogo feita por você.
**Contexto:** [story](docs/pt-BR/stories/OPS-32/story.md); [escopo planejado da 0.4.0-beta](docs/pt-BR/process/kanban-board-design.md); [nota de pesquisa](docs/pt-BR/research/2026-11-06-queue-calendar/README.md).
- [ ] **A — Depois da 0.4.0-beta (recomendado)**: a OPS-32 segue para o bump seguinte, depois da OPS-31; a 0.4.0-beta fica menor.
- [ ] **B — Dentro da 0.4.0-beta**: a OPS-32 entra no escopo da 0.4.0-beta, depois da OPS-31; o bump espera mais.
- [ ] **C — Adiar**: nenhuma data; a OPS-32 fica como candidata.
Observação (opcional):
Quem executa depois: `@sm` e `@devops` (escopo e quadro)
Efeito no quadro: ST-25 e FT-79..FT-85 seguem em Rascunho/Backlog; muda só a linha do escopo da 0.4.0-beta
Tipo: Reservada (sem marca, espera o dono)

### A-01 — Confirmar cada linha do catálogo na contagem regressiva do jogo
**Contexto:** o `@analyst` não conseguiu ler as páginas oficiais dos jogos; cada linha de ciclo (jogo, modo, servidor, início, fim) só entra no catálogo depois da sua confirmação na contagem regressiva do próprio jogo. Só é necessário quando a FT-79 estiver pronta para dados.
- [ ] **Feito**: marque quando concluir a ação.
Observação (opcional):
Quem executa depois: `@analyst` e `@dev` (editam o catálogo)
Efeito no quadro: libera a FT-81 para rodar de verdade

## Gates
- [ ] Story Pronta (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

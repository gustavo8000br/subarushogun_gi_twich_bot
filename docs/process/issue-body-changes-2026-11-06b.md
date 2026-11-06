# Issue body for OPS-31 (natural queue notices and refund of channel points by group)

[Português (pt-BR)](../pt-BR/process/issue-body-changes-2026-11-06b.md)

**Date:** 2026-11-06. **Author:** `@sm` (River). **For:** `@devops`, who creates the issue **OPS-31** with the body below (never as a comment; the blocks are in Portuguese because they go to the issue body, with the English mirror without checkboxes, as the [issue body template](issue-body-template.md) asks). Nothing was created by `@sm`. The slices FT-71..FT-78 become sub-issues just-in-time. **No owner box is ticked here.** Decisions the owner already gave are listed as "registered" in the text (not as boxes); there is no open decision (the section is the single line `Nenhuma decisão pendente.`).

## Issue body (to create)

````markdown
## Português

**OPS-31 — Fila natural e devolução de pontos do canal por grupo.** Story em Draft: [story](docs/pt-BR/stories/OPS-31/story.md); nota de pesquisa do `@analyst` (viabilidade SUFICIENTE, 9,1/10): [nota](docs/pt-BR/research/2026-11-06-queue-group-refund/README.md). Item do inventário ST-24; fatias FT-71..FT-78. Relacionadas: OPS-20, OPS-22, FT-70.

**Escopo (proposta do dono, 2026-11-06, para a 0.4.0-beta+):** aviso no chat ao entrar na fila; não compareceu/pular/reordenar com mensagem; mensagem de fim de atendimento e "próximo" no widget; pausar/fechar a fila com aviso (resgates novos recusados com reembolso); devolução de pontos por grupo (inscritos, moderadores, VIPs, lista própria do streamer; o streamer conta como do grupo) a critério do streamer.

**Decisões do dono já registradas (2026-11-06):** o fluxo continua cumprindo (`fulfill`) ao iniciar o atendimento para resgates normais; um escopo OAuth por grupo ativado (canais já conectados reautorizam uma vez); falha na consulta do grupo pede decisão ao streamer ("verificar grupo"), nunca devolve nem cumpre sozinho; **momento único da devolução: ao terminar o atendimento** (o resgate fica `UNFULFILLED` durante o atendimento e vira `CANCELED` ao concluir; sem devolução ao entrar nem ao iniciar), e o painel explica, no próprio controle, que os pontos só voltam depois que o atendimento terminar; **ao cancelar, pular ou marcar não compareceu uma entrada de grupo especial, o streamer decide na hora se os pontos voltam** (painel com duas escolhas, decisão gravada antes da chamada à Twitch, uma única operação final por resgate, aviso no chat nos 3 idiomas; sem devolução automática; o mapeamento de "não devolver" é questão de desenho do `@architect`).

**Só um teste real fecha (canal de testes SubaruShogun):** (1) se a Twitch expira um resgate UNFULFILLED; (2) se um resgate CANCELED restaura limites/tempo de recarga da recompensa; (3) se `...redemption.update` dispara para mudanças do próprio app; (4) como o Prime aparece; (5) se o broadcaster aparece nas próprias listas; (6) o que a segunda autorização traz.

**Riscos:** corrida cumprir x cancelar (uma operação final por resgate); consulta falha; pontos retidos; abuso; UID em log.

## English

OPS-31 — natural queue notices and refund of channel points by group. Draft story ([story](docs/stories/OPS-31/story.md)); `@analyst` note (SUFFICIENT, 9.1/10); inventory ST-24, slices FT-71..FT-78. Scope is an owner proposal (2026-11-06) for the 0.4.0-beta+. Registered owner decisions: fulfill at service start stays for normal redemptions; one OAuth scope per enabled group; lookup failure asks the streamer ("check group"); **a single refund moment, when the service ends** (the redemption stays UNFULFILLED during the service and is CANCELED on conclusion; no refund on joining or on start), and the panel says on the control itself that points only return after the service ends; **on cancel, skip or no-show of a special-group entry the streamer decides on the spot** whether the points return (no automatic refund). Six items only a real test closes (see the Portuguese text).

### Owner decisions (read-only mirror, no checkboxes)

- None pending. Registered: cancel, skip or no-show of a special-group entry is decided by the streamer on the spot (2026-11-06).

## Decisões do dono

Nenhuma decisão pendente.

## Gates
- [ ] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

# Issue body changes, second round of 2026-11-05 (OPS-26, OPS-25, #80 and #104)

[Português (pt-BR)](../pt-BR/process/issue-body-changes-2026-11-05b.md)

**Date:** 2026-11-05. **Author:** `@sm` (River). **For:** `@devops`, who creates the two issues and edits the two main bodies below (never as a comment; never untick an owner box; re-read the body just before writing). Nothing was applied by `@sm`. The blocks are in Portuguese because they go to the issue bodies; the English mirror is inside each block as the [issue body template](issue-body-template.md) says. Follows [issue-body-changes-2026-11-05](issue-body-changes-2026-11-05.md).

## OPS-26 — criar a issue (título: "OPS-26 — Comandos de sistema do chat: `ping` com a latência real da Twitch e `status` do streamer")

Rótulos e vínculo: os mesmos das demais issues de story; sem pai. É a **mãe das fatias de `ping`** (FT-ping) e do `status`; a TS-13 e a TS-14 são parte desta story. Cartão no quadro: ST-19 (Situação Pronto para a fatia A; `status` continua Bloqueado até a 0.4.0-beta).

````markdown
## Português

Corrige o defeito **D-8** (bateria ao vivo de 2026-10-26, LB-23): o chat respondeu "latência indisponível" enquanto `/health` tinha `twitch_api_ping_ms: 219`. Story: `docs/stories/OPS-26/story.md`; validação do `@po`: `docs/stories/OPS-26/po-validation.md` (GO 9,0 para a fatia A).

**Escopo por fatia (decisão do proprietário, 2026-11-05):**
- **Fatia A, agora (antes do bump):** `ping` sempre devolve a latência medida em `Pong 🏓 - vX.Y.Z-estágio - <n>ms.`; teste obrigatório de três casos (medida presente / ausente / Twitch falhando); sem pressão de rate limit.
- **Fatia B, 0.4.0-beta:** `status` exclusivo do streamer, com lista de campos permitidos (recompensas por fila, uptime, conexão com a Twitch, latência, versão, filas, pendências e `needs_review`), em pt-BR/en/es e dentro do limite de tamanho do chat (TS-14).
- Verificação ao vivo do `ping` e do `status` no canal: ação do proprietário (OW-17, lista "OBS e Twitch reais").

## English

Fixes defect **D-8** (live battery of 2026-10-26, LB-23): chat said "latency unavailable" while `/health` had `twitch_api_ping_ms: 219`. Story: `docs/stories/OPS-26/story.md`; `@po` validation: `docs/stories/OPS-26/po-validation.md` (GO 9.0 for slice A).

**Scope by slice (owner decision, 2026-11-05):** slice A now (before the bump): `ping` always carries the measured latency, mandatory three-case test, no rate-limit pressure. Slice B in the 0.4.0-beta: streamer-only `status` with an allowlist of fields, pt-BR/en/es, within the chat length limit (TS-14). Live check of both commands on the channel is an owner action (OW-17).

### Owner decisions (read-only mirror, no checkboxes)

- None pending. Decided on 2026-11-05: slice A (`ping`) now, `status` in the 0.4.0-beta.

## Decisões do dono

Nenhuma decisão pendente.

### A-01 — Verificar o `ping` e o `status` reais no canal
**Contexto:** depois de cada fatia pronta, enviar `ping` (e, na fatia B, `status`) no chat do canal de testes; registrar o resultado como evidência ao vivo separada (OW-17, lista "OBS e Twitch reais").
- [ ] **Feito**: marque quando concluir a ação.
Observação (opcional):
Quem executa depois: `@qa` registra o resultado
Efeito no quadro: OW-17 passa a Concluído

## Gates
- [ ] Story Ready (`@po`) (GO 9,0 do `@po` em `docs/stories/OPS-26/po-validation.md`; o `@devops` marca ao criar a issue)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`: não se aplica (sem banco de dados)
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0): só se o texto visível do `status` mudar
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

## OPS-25 — criar a issue (título: "OPS-25 — Validar o widget da conta no overlay do painel Next")

Vínculo: a **#57 continua aberta** e vira acompanhamento desta issue (sem fechar nada; o dono decide). Cartão no quadro: ST-18; quando a issue existir o `@devops` vincula a #57.

````markdown
## Português

Valida o widget da conta no overlay do painel Next (substitui a validação do bug OPS-13 / #57). Story: `docs/stories/OPS-25/story.md`; validação do `@po`: `docs/stories/OPS-25/po-validation.md` (GO 8,8 para o subconjunto antes do bump).

**Escopo (decisão do proprietário, 2026-11-05):** antes do bump confere-se só o **subconjunto do widget (AC-W-1..7) no OBS local desta máquina** (Linux nativo); recarregar a fonte de navegador mantém o rótulo da conta, sem auto-expiração; troca de conta por `!fila conta` e pelo painel; revogação mostra o estado seguro. A validação completa (Windows e macOS, nota do `@ux-design-expert` >= 9,0) fica para depois da migração. Um defeito achado vira story própria; resultado de plataforma sem sessão real não é afirmado.

## English

Validates the account widget on the Next panel overlay (replaces the OPS-13 / #57 bug validation). Story: `docs/stories/OPS-25/story.md`; `@po` validation: `docs/stories/OPS-25/po-validation.md` (GO 8.8 for the pre-bump subset).

**Scope (owner decision, 2026-11-05):** before the bump only the **widget subset (AC-W-1..7) on this machine's local OBS** (native Linux) is checked: reloading the browser source keeps the account label, no self-expiry, account change by `!fila conta` and by the panel, revocation shows the safe state. The full validation (Windows and macOS, `@ux-design-expert` score >= 9.0) stays after the migration. A defect becomes its own story; no platform result is claimed without a real session.

### Owner decisions (read-only mirror, no checkboxes)

- None pending.

## Decisões do dono

Nenhuma decisão pendente.

### A-01 — Recarregar a fonte no OBS local e conferir o rótulo
**Contexto:** com o painel Next no ar, recarregar a fonte de navegador no OBS local e conferir que o rótulo da conta permanece (lista "OBS e Twitch reais", OW-03).
- [ ] **Feito**: marque quando concluir a ação.
Observação (opcional):
Quem executa depois: `@qa` registra a evidência nativa
Efeito no quadro: ST-18 sai de Bloqueado

## Gates
- [ ] Story Ready (`@po`) (GO 8,8 do `@po` em `docs/stories/OPS-25/po-validation.md`; o `@devops` marca ao criar a issue)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`: não se aplica (sem banco de dados)
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0): nota >= 9,0 na validação completa
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

## #80 — OPS-22 (corpo principal)

Na seção "Acompanhamentos não bloqueantes (gate de 2026-11-05)", acrescentar (só texto; as caixas do dono não mudam):

- FT-55 — defeito D-6, só diagnóstico: logs estruturados `twitch_integration_degraded` em toda transição para `degraded` (P2, Pronto). A causa raiz só é afirmada com a stream ao vivo (ação do proprietário). Não bloqueia o cutover. Sub-issue da #80 só na hora de implementar.

English mirror (no checkboxes): FT-55 — defect D-6, diagnosis only: structured `twitch_integration_degraded` logs on every `degraded` transition (P2, Ready); the root cause is claimed only with the stream live (owner action); does not block the cutover.

## #104 — OPS-27 (corpo principal)

Acrescentar, em texto simples, no fim da seção em português e no espelho em inglês: "Fora do escopo da 0.4.0-beta (decisão do proprietário, 2026-11-05): a OPS-27 não entra nesse bump; o dono não a marcou. A story continua Ready e entra em outro ciclo." / "Out of the 0.4.0-beta scope (owner decision, 2026-11-05): OPS-27 does not enter that bump because the owner did not mark it; the story stays Ready and goes in another cycle." Caixas do dono e Gates não mudam.

## Quadro (não é corpo de issue)

O `@devops` carrega os 7 rascunhos novos (FT-55 Pronto; TS-21 e FT-56..FT-60 Backlog, Ordem 8.8) e atualiza as notas dos cards ST-18 e ST-19. Escopo planejado da 0.4.0-beta: seção 2.1 do [inventário](backlog-inventory.md). Sem comentários em issues.

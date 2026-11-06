# Issue body changes after the live test of 2026-11-06 (reconciliation of OPS-15)

[Português (pt-BR)](../pt-BR/process/issue-body-changes-2026-11-06.md)

**Date:** 2026-11-06. **Author:** `@sm` (River). **For:** `@devops`, who applies the text below to the main body of the issue (never as a comment; never tick or untick an owner box; re-read the body just before writing). Nothing was applied by `@sm`. The blocks are in Portuguese because they go to the issue bodies; the English mirror goes below the Portuguese text as the [issue body template](issue-body-template.md) says. Sources: `docs/stories/OPS-15/qa-gate-2026-11-06.md` (section 9), `docs/stories/OPS-15/po-validation-bugs-pre-bump.md`, the `@qa` report g1106d (local, not versioned) and the [recorded decisions](../human_decisions/done/recorded-project-decisions.md).

## #69 — OPS-15 (seção do checklist do dono; relato por item, sem marcar nenhuma caixa do dono)

**Como aplicar:** o `@devops` acrescenta a lista abaixo ao corpo principal da #69 (nota "Reconciliação de 2026-11-06"), sem marcar nem desmarcar nenhuma caixa; as caixas do dono continuam com o dono, e as dos agentes só com a evidência citada. Reler o corpo logo antes de gravar.

**Com evidência (relato; o dono decide se marca):**

- OWN-07, OWN-08, OWN-09 (widget no OBS nativo): `npm run test:e2e:overlay` PASS no OBS 32.2.2 / CEF 127 (Linux): 8 widgets, 80 atualizações, máximo 1055 ms (todas até 2000 ms), TLS seguro, transparência e redimensionamento; matriz AC-W na cena `Sem_nome`. Fonte: `docs/stories/OPS-15/qa-gate-2026-11-06.md`, seção 8, 2026-11-06. Limites: só Linux; build de produção no OBS (FT-64) e AC-W-3 (TS-23) seguem abertos.
- OWN-10 (OAuth): conexão ativa no canal de testes exclusivo (`twitch_integration connected`, canal lido de `/api/setup`). Fonte: mesmo gate, seção 9, 2026-11-05/06.
- OWN-11 (fila com recompensa): `teste-a` e `teste-r` criadas; `reward.create` e `reward.set_open` confirmados só depois da Twitch; sem `unknown`, 409 ou 5xx. Fonte: mesmo gate, seção 9.
- OWN-12 (resgate, chamada e presença): resgate real de 50 pontos, chamada no chat (`chat.call` confirmado), `!teste-r2 presente` PASS (confirmação no chat), `redemption.fulfill` confirmado e resgate `FULFILLED`. Fonte: relatório `g1106d` do `@qa` (local, não versionado) e gate, seção 9, 2026-11-06.
- OWN-13 (reembolso/cancelamento) — **parcial**: o produto cancelou sozinho o segundo resgate (`rejection_reason=duplicate_active_entry`), `redemption.cancel` confirmado, `remote_status=CANCELED`, sem falso sucesso. A **rejeição pelo criador** na fila da Twitch não foi testada (TS-27).
- OWN-14 (entrega pela outbox; observação do `@sm`, não pedida): `chat.call` e `redemption.fulfill` confirmados na outbox, 0 operações pendentes ou sem resolução. Fonte: relatório `g1106d`.

**Pendente de agente (FT-09 e itens ligados):**

- OWN-16, OWN-17, OWN-18: checagem por agentes no navegador (foco após salvar a fila, 390×844, diálogo do link único do widget), dentro da FT-09.
- TODO-01 (validação por rota), TODO-04 (S-13, `@ux-design-expert`): FT-01 e plano de UX.
- TODO-02 (E2E E1 a E8): ciclo de testes da FT-06 (a FT-03 foi fundida nela).
- TODO-03 (S-03) e TODO-05 (resíduo do export estático): provavelmente cobertos pelas ondas 4 a 6 (FT-42, FT-43); confirmar na FT-09.
- TODO-06 e TODO-07 (revisões finais de `@qa` e `@architect`; repetir a auditoria de testes legados): FT-09.
- Rejeição pelo criador (parte da OWN-13): TS-27.

**Pendente do dono:**

- OWN-01 a OWN-04 (instalador no Windows) e OWN-05, OWN-06 (fluxo de desenvolvimento no Windows): OW-01 e OW-02, sem prazo. Nota: o `dev:stop` do dono apagou o banco de dev; o resultado esperado da OWN-06 foi reescrito (o `dev:stop` apaga o banco de desenvolvimento descartável): **"início em segundo plano e parada limpa"**, sem exigir banco mantido.
- MAC-01 (macOS): D-05 = B, conseguir um Mac e validar antes do `rc`; nenhum resultado de macOS é afirmado.

**Decidida (registro; a caixa continua do dono):**

- OWN-15 (leitor de tela): risco aceito pelo dono em 2026-11-05, sem validação.
- OWN-19 (critério de rollback): substituída; `legacy` é só referência histórica.
- OWN-20 (cutover e remoção do painel vanilla): autorizada por ondas e executada (ondas 4 a 6 no PR #101, merge `4488443`).
- OWN-21 (alias `/overlay.html`): decidida em 2026-10-27 (OW-09); o caminho antigo não existe mais desde o cutover.

**Contagem:** 29 itens = 8 com evidência (7 completos e a OWN-13 parcial), 10 pendentes de agente, 7 pendentes do dono, 4 decididos. Os itens `AGT-*` não fazem parte desta nota.

## Quadro (não é corpo de issue)

O `@devops` carrega os 4 rascunhos novos (FT-68, FT-69, FT-70, TS-27, todos Backlog), move o card FT-10 para Concluído e o card FT-09 de Bloqueado para Pronto, e confere as contagens do [desenho do quadro](kanban-board-design.md) (105 ativos, 49 arquivados).

## English mirror (for the issue body, after the Portuguese text)

- **With evidence:** OWN-07 to OWN-09 (native OBS e2e PASS, qa-gate-2026-11-06 section 8); OWN-10 (OAuth connected on the exclusive test channel); OWN-11 (queues and rewards created, confirmed only after Twitch); OWN-12 (real redemption, call, `!teste-r2 presente` PASS, fulfill confirmed); OWN-13 **partial** (automatic cancellation by the product, `duplicate_active_entry`, `CANCELED` confirmed; the creator's rejection was not tested, TS-27); OWN-14 (outbox deliveries confirmed; `@sm` remark).
- **Pending for an agent (FT-09 and linked items):** OWN-16 to OWN-18 (browser checks), TODO-01 to TODO-07 (see the Portuguese text for the owner of each).
- **Pending for the owner:** OWN-01 to OWN-06 (Windows, OW-01 and OW-02, no date; the OWN-06 expected result was reworded (`dev:stop` deletes the disposable dev database): **"background start and clean stop"**, with no kept database required), MAC-01 (macOS, D-05 = B, before `rc`).
- **Decided:** OWN-15 (screen reader risk accepted, 2026-11-05), OWN-19 (superseded), OWN-20 (authorized by waves and executed), OWN-21 (decided 2026-10-27).
- **Count:** 29 items = 8 with evidence (7 complete, OWN-13 partial), 10 pending for an agent, 7 pending for the owner, 4 decided.

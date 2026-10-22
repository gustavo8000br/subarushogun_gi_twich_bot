# OPS-19 — Confirmar recompensa Twitch ao iniciar atendimento

[English](../../../stories/OPS-19/story.md)

**Status:** Em andamento — comportamento solicitado pelo proprietário; implementação na `feat/ops-15-next-panel`. **Issue:** [#78](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/78), criada por `$aiox-devops`.
**Relacionado:** outbox financeira FND-3; ciclo de fila/recompensa FND-9; paridade do painel OPS-15 (sem ampliar o escopo da OPS-15).
**Coordenação de dados:** Reutilizar `Redemption.expectedStatus`, a outbox existente de intenção única por resgate, leases/retries do worker e reconciliação remota. Sem migration de schema ou operação no banco ativo.

## História

Como streamer que opera o atendimento pela fila do painel auto-hospedado,
quero que a Twitch confirme o resgate de pontos assim que eu iniciar o atendimento do viewer,
para que a recompensa não continue pendente na Twitch enquanto o atendimento segue sendo acompanhado no painel.

## Critérios de aceite

1. Uma transição local `called → in_progress` de um resgate registra atomicamente a intenção durável existente `redemption.fulfill` e o estado remoto esperado `FULFILLED`; entradas manuais e transições externas não criam uma segunda intenção.
2. O worker financeiro envia/reconcilia o fulfillment pelas regras existentes de retry, lease e classificação da verdade remota. O painel não informa confirmação remota até a Twitch confirmar ou a reconciliação observar `FULFILLED`; pendente/desconhecido/conflito permanece visível nas projeções existentes de operações/saúde.
3. Um evento Twitch `FULFILLED` observado externamente enquanto a entrada local está `in_progress` confirma a operação financeira e a sincronização do resgate, mas não marca o atendimento como concluído, remove a entrada ativa nem reseta a conta atual vinculada ao owner. O streamer conclui o atendimento separadamente.
4. A conclusão local posterior reutiliza a intenção financeira existente e não pode criar duplicidade nem cancelamento contraditório. Depois do início do atendimento, remover a entrada não pode substituir a intenção de fulfillment por uma intenção de reembolso/cancelamento.
5. A ação do painel e a resposta localizada do comando de chat ao iniciar atendimento distinguem “fulfillment solicitado/pendente” de “confirmado pela Twitch”; não dizem que os pontos foram confirmados apenas porque a transição local teve sucesso.
6. PostgreSQL isolado real com migrations reais verifica atomicidade da transição, estado esperado, idempotência de intenção única, conclusão/remoção e fulfillment externo durante atendimento. Testes da fronteira Twitch usam fakes; nenhum write Twitch real é alegado.
7. Cópia em inglês, espanhol e pt-BR permanece alinhada. Não há migration de banco, bump de versão ou expansão da API pública.

## Testes e segurança de dados

- Escrever primeiro regressões de transição/processador/cliente (Red), depois integração PostgreSQL usando o harness de container descartável existente.
- Preservar o PostgreSQL ativo de desenvolvimento e `npm run dev`; os testes devem usar seu próprio container PostgreSQL tmpfs.
- Executar lint, typecheck, validação de localização, testes focados e diff-check. Suíte completa/QA independente permanecem gates separados até serem executados.

## Plano UX e revisão retrospectiva delimitada

- Este registro foi incluído após a implementação da interface, quando o proprietário estabeleceu a regra obrigatória de UX primeiro; ele não afirma que a implementação anterior foi planejada sob essa regra.
- Necessidade: o streamer precisa saber que o atendimento local começou enquanto o fulfillment Twitch continua pendente, sem receber uma falsa confirmação da Twitch.
- Feedback planejado: manter o resultado na fila afetada como estado inline (não apenas toast transitório); distinguir fulfillment pendente de ação local aceita cuja atualização da fila falhou; manter a verdade final Twitch na projeção existente de operações. Usar cópia alinhada em EN/ES/pt-BR e expor semanticamente o estado sem mover o foco.
- Revisão AIOX UX delimitada da implementação: **9,4/10** (somente código). O feedback Next revisado aparece inline com `role="status"`; o toast vanilla também é um status polite e o próprio texto informa pendência/falha de atualização, então a cor não é o único sinal. A cópia é localizada e evita falsa confirmação. Não foram realizados testes de browser, contraste, leitor de tela ou pesquisa com usuários; esta nota não representa OPS-19 nem o produto em geral.
- Base de acessibilidade: o critério WCAG 2.1 4.1.3 do W3C exige que mensagens de status sejam programaticamente determináveis sem exigir foco. A técnica W3C `role=status` descreve um padrão suficiente. Consulte [WCAG 2.1 4.1.3](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-21/) e [WAI ARIA22](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22). Essas fontes orientaram a revisão, mas não significam conformidade completa.

## Lista de arquivos

- `apps/api/src/domain/entry-transitions.mjs` e `apps/api/src/persistence/queue-repository.mjs` — intenção de fulfillment ao iniciar o serviço e proteção de intenção única em transições posteriores.
- `apps/api/src/twitch/redemption-processor.mjs` — registro do fulfillment remoto durante serviço ativo sem encerrar o estado local do atendimento.
- `apps/api/src/commands/chat-handler.mjs`, `apps/frontend/features/queues/queue-entry-actions.mjs`, `apps/web/app.js` — feedback verdadeiro de pendência no chat e nas duas implementações do painel.
- `apps/web/localization/catalogs/{panel,chat}/{en,es,pt-BR}.tsv`, `CHANGELOG-beta.md`, `docs/pt-BR/CHANGELOG-beta.md` — feedback localizado e notas beta.
- `tests/unit/{entry-transitions,twitch-event-processor,next-queue-entry-actions,chat-command-handler,vanilla-fulfillment-feedback}.test.js`, `tests/integration/queue-repository.test.js` — regressões de comportamento, evento externo, feedback dos dois painéis, atomicidade e intenção única.
- `docs/stories/OPS-19/story.md`, `docs/pt-BR/stories/OPS-19/story.md`, `docs/stories.md`, `docs/pt-BR/stories.md` e handoffs bilíngues.

## Histórico de alterações

| Data | Alteração | Autor |
| --- | --- | --- |
| 2026-10-19 | Proprietário solicitou fulfillment automático do resgate Twitch ao iniciar o atendimento, mantendo o estado local do atendimento independente do estado financeiro Twitch. | `$aiox-master` |
| 2026-10-19 | Implementados intenção atômica de fulfillment ao iniciar o serviço, sincronização de evento remoto sem concluir prematuramente o atendimento, proteção de intenção única e feedback localizado de pendência. Evidências focadas estão no handoff ativo. | `$aiox-dev` |
| 2026-10-19 | Estado remoto de resgate divergente agora é marcado como conflito, não confirmado; adicionadas regressões PostgreSQL e do feedback do painel vanilla. A pesquisa confirmou que a Twitch só atualiza resgates `UNFULFILLED` e reporta mudanças por EventSub. | `$aiox-dev` |
| 2026-10-20 | Registrados o plano UX e a revisão delimitada de **9,4/10 somente código** para o feedback de fulfillment em filas/chat; verificações browser e de tecnologia assistiva continuam pendentes. | `$aiox-ux-design-expert` |

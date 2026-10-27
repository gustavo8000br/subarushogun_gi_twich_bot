# OPS-15 — Resultados da bateria real, rodada 1 (2026-10-26)

[English](../../../stories/OPS-15/live-battery-2026-10-26-results.md)

Executor: Orion (navegador/chat) com checagens no banco; **ainda não validado pelo @qa**. Roteiro: [live-battery-2026-10-26.md](live-battery-2026-10-26.md). Canal `subarushogun`, ao vivo, autorizado pelo proprietário. Rodada parcial: 10 de 43 casos executados; o resto está NÃO EXECUTADO.

| Caso | Resultado | Evidência |
|---|---|---|
| P-03 linha de base de recompensas | PASS | Painel da Twitch: 0 recompensas personalizadas antes da execução |
| LB-05 fila manual B | PASS | Banco: `manual_only`, sem recompensa, prazo 3 |
| LB-06 fila A com recompensa | PASS | Banco: `synced`, fechada, `reward.create` confirmado; painel mostra `[TESTE] Fila A QA`, 1.000.000 |
| LB-23 ping | PASS | `Pong 🏓 Bot ativo · v0.2.0-0000000-beta · Twitch: latência indisponível` |
| LB-25 lista de filas | PASS | `Filas disponíveis: teste-b (fechada), teste-a (fechada).` |
| LB-27 entrada + duplicado pelo alias | PASS | adicionada; duplicado recusado |
| LB-28 posição | PASS | posição 1 (`lista` não executado) |
| LB-29 chamada + aviso | PASS com defeito D-2 | o aviso saiu com `(posição ?)` em vez de `posição 1` |
| LB-30 presença | PASS | `call_acknowledged_at` preenchido |
| LB-31 atender/concluir | PASS | status `completed`, sem outbox financeira |
| LB-34 limpar (confirmar em minúsculas) | PASS | `Fila limpa: 1 pessoas removidas; 0 reembolsos…` |
| LB-35 limpar com `CONFIRMAR` | **FAIL — D-1 confirmado** | a prévia se repetiu em vez de limpar |
| LB-42/43 limpeza | PASS | duas filas `deleted`, `reward.delete` confirmado, 0 resgates; painel voltou a 0 recompensas personalizadas |

## Defeitos
- **D-1:** `!<fila> limpar CONFIRMAR` (qualquer caixa que não seja minúscula exata) não confirma; o parser aceita, mas `chat-handler.mjs:266` compara de forma exata. Precisa de story, correção do `@dev` com teste primeiro e gate do `@qa`.
- **D-2:** o aviso de chamada mostra `{position}` como `?` quando a entrada é chamada por `proximo` (o roteiro esperava `1`). Falta confirmar se o `?` é intencional para entradas já chamadas.
- **D-3 (relato do proprietário):** depois de excluir uma fila, a aba aberta continua em `/queues` sem mensagem de sucesso e sem redirecionamento; deveria mostrar "excluída com sucesso" e ir para a lista de filas ou para "nova fila" quando não restar nenhuma.
- **D-4 (relato do proprietário):** depois de criar uma fila, o painel não navega para a fila criada; deveria navegar.
- **D-5 (relato do proprietário, instância anterior, não reproduzível agora; banco e log desta instância têm 0 resgates):** depois de um resgate manual da recompensa pelo chat da Twitch, o proprietário teve de confirmar o resgate no painel da Twitch, e excluir a fila de teste teve problema de sincronia. Precisa de um teste dedicado de resgate real, com o proprietário resgatando, com `@data-engineer` e `@dev`.

## NÃO EXECUTADO (nesta rodada)
Painel LB-01…04, 07…18; widgets/overlay LB-19…22; chat LB-24, 26, 32, 33, 36…38; recuperação LB-39…41. Overlay e os fluxos pela extensão ficam para a próxima rodada; o OBS nativo é do proprietário.

## Fluxo de resgate reproduzido ao vivo (2026-10-27, o proprietário resgatou 10 pontos durante uma live real)
1. Fila `teste-r` com recompensa aberta; o proprietário resgatou: resgate `observed`/`UNFULFILLED`, entrada `waiting` (origem resgate). A integração apareceu `degraded` desde o início da live (D-6), mas o evento chegou.
2. Chamada pelo painel: `chat.call` confirmado; o chat mostrou a mensagem padrão; `!teste-r presente` do proprietário respondeu certo.
3. **Iniciar atendimento:** a outbox criou `redemption.fulfill` e ele foi para `unknown` / `remote_state_unavailable` após 1 tentativa; o resgate ficou `pending`/`UNFULFILLED` na Twitch (D-5). Concluir: entrada `completed`, nada mudou na Twitch.
4. A página de operações mostrou "Estado desconhecido" com Tentar novamente/Resolução manual; Tentar novamente fez a tentativa 2 com o mesmo resultado (falha consistente).
5. **Excluir fila:** o diálogo do painel prometeu cancelamento; a fila foi para `deleting`/`delete_pending`, `reward.delete` em `unknown` (`queue_deletion_financial_conflict`); nenhum cancelamento chegou a ser criado. "Sincronizar agora" não destravou.
6. A Twitch recusou excluir a recompensa com 1 resgate pendente (é preciso concluir ou rejeitar). Limpeza manual na Twitch: resgate rejeitado (10 pontos devolvidos) e recompensa excluída; a lista de recompensas personalizadas voltou a ficar vazia. **A fila local continua presa em `deleting` (banco de dev descartável).**
- **D-6:** `/health` `twitch_integration: degraded` desde o início da live, sem linha de log.
- **D-7 (relato do proprietário):** as páginas do painel não se atualizam dinamicamente; é preciso recarregar manualmente.
- Em investigação: `redemption-sync-research.md` (@analyst) e `panel-defects-architecture-review.md` (@architect).

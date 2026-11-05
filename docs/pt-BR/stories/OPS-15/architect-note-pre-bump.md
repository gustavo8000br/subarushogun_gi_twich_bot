# Nota do arquiteto antes do @dev: D-8 ping, FT-53, D-6 (2026-11-05)

English: `docs/stories/OPS-15/architect-note-pre-bump.md`. Entradas: `po-validation-bugs-pre-bump.md` (AC-D8, AC-F53, AC-D6) e o código lido nesta data. Sem LACUNA no `docs/research-index.md` (linhas 17 e 20); sem pesquisa na web. Só desenho; sem código, sem git.

## D-A1. D-8 `ping`: uma sonda assíncrona compartilhada

Estado atual: `registerHealthRoute` (`apps/api/src/http/health-route.mjs`) é dono da sonda, do cache de 60 s e do voo único (`pendingProbe`); o chat lê `getTwitchHealth()` pelo `createTwitchHealthBridge`, um retrato passivo (nulo quando o `/health` não foi chamado). O relógio é `Date.now` (não monotônico).

Decisão:
- **Onde:** novo módulo `apps/api/src/twitch/shared-api-probe.mjs`, `createSharedApiProbe({ probe, getIntegrationStatus, nowMs = () => performance.now(), ttlMs, failureTtlMs })`, criado uma vez em `server.mjs` sobre `runtime.integration.probeTwitchApi`. A rota de saúde e o handler do chat recebem a mesma instância; o cache privado da rota sai (o parâmetro `probeCacheMs` é substituído pelo TTL da sonda).
- **Relógio:** `performance.now()` (monotônico), `Math.max(0, Math.round(delta))`, ms inteiros. `twitch.ping()` continua `GET /helix/users?id=<broadcaster>` via Twurple.
- **TTL:** sucesso 30 s, falha 5 s (cache negativo, para a Twitch em falha não ser martelada pelo chat). Ambos são constantes nomeadas em um objeto de configuração, injetáveis nos testes (timers falsos). 30 s (não 60 s) aproxima o `ping` da realidade; uma chamada Helix a cada 30 s fica muito abaixo do limite.
- **Quem dispara:** quem pedir primeiro (`/health` ou `!fila ping`) com o cache vencido; os demais aguardam a mesma promessa (voo único), então AC-D8-3 e AC-D8-5 valem por construção: uma medição, dois leitores.
- **Contrato:** `read()` devolve `{ state: 'ok', ms }`, `{ state: 'failed' }` ou `{ state: 'not_connected' }`. `not_connected` quando o estado da integração não está em `connected | degraded | reconciling | ineligible` (o mesmo conjunto que o `/health` usa hoje); nesse caso, zero chamadas Helix. O `/health` mapeia `ok` para `status: connected, pingMs`, `failed` para `status: degraded, pingMs: null` e `not_connected` para o mapeamento de hoje. Campos públicos do `/health` inalterados.
- **Timeout:** a sonda é limitada a 5 s (`Promise.race`); estouro conta como `failed`. O chat nunca trava numa Helix parada.
- **Invalidação:** o cache cai quando a integração muda para um estado não conectado (ou a instância Twurple é recriada: `clearSession` em `integration.mjs`), para que 219 ms antigos nunca sobrevivam a uma reconexão.
- **Códigos de erro (fechados):** confirmo `TWITCH_PROBE_FAILED` (a sonda lançou, devolveu não-true ou estourou o tempo) e `TWITCH_NOT_CONNECTED`. Sem terceiro código: timeout é falha. O código é texto fixo, nunca `error.message`.
- **Resposta sem medição** (`chat.ping.error`, três catálogos; `{version}`, `{code}`): pt-BR `Pong 🏓 - {version} - sem medição da Twitch ({code}).`; en `Pong 🏓 - {version} - no Twitch measurement ({code}).`; es `Pong 🏓 - {version} - sin medición de Twitch ({code}).` O sucesso mantém `Pong 🏓 - {version} - {latency}ms.` Sem número inventado, sem erro bruto. A revisão final do texto fica com o `@ux-design-expert` (é texto de chat, não do painel).
- **Handler do chat:** `getTwitchHealth` é trocado por `probeTwitchApi: () => sharedProbe.read()` e aguardado; o cooldown de 5 s continua. A formatação da versão (AC-D8-4) lê a mesma fonte `VERSION` do `validate:version`; função pura, nunca lança.
- **Compatibilidade:** `createTwitchHealthBridge` deixa de ser necessário (a sonda é criada antes dos dois consumidores); remover com o teste dele, ou manter um adaptador fino em um passo; o `@dev` escolhe, o contrato é o acima.

Riscos: (1) sonda falha envenenando o cache: limitado pelo TTL de falha de 5 s; (2) `pendingProbe` preso após lançamento: limpar em `finally`; (3) vazamento: o texto do erro nunca sai do módulo. Testes: os cinco casos nomeados de AC-D8-1/2/3/5 com relógio e adaptador falsos; AC-D8-6 com `ApiClient` real e `fetch` falso (Twurple falso); um teste de que a invalidação na mudança de estado força nova chamada.

## D-A2. FT-53: `reason` fechado no 409

Estado atual: `cancelQueueDeletion` (`domain/queue-service.mjs`) conhece o `errorCode` em `fail()`, mas lança `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` sem ele; a rota (`http/queue-routes.mjs`) responde `{ code, error }` em todas as recusas.

Decisão: `fail()` anexa `reason` ao erro lançado a partir de um **mapeamento fechado do `errorCode`**; a rota copia `reason` para o corpo só se estiver na lista permitida, e só para esse `code`.

| `errorCode` (interno) | `reason` (público) |
|---|---|
| `authorization_required` (401) | `authorization_required` |
| `queue_deletion_cancel_verification_unavailable` (5xx, rede) | `verification_unavailable` |
| `queue_delete_reward_absent` | `reward_absent` |
| `queue_delete_reward_diverged` | `reward_diverged` |
| `queue_delete_cancel_reward_not_paused` | `reward_not_paused` |

- O código interno nunca é exposto como tal; o valor público é o mapeado. Fora da tabela: campo omitido (AC-F53-2 "sem reason"). Texto livre é impossível por construção.
- **Compatibilidade do DTO:** `reason` é aditivo e opcional; `code` e `error` não mudam, então clientes antigos seguem funcionando (beta, sem usuários). O painel decide por `reason === 'authorization_required'` para o texto específico e a ação "autorizar novamente"; qualquer outro valor ou ausência cai no texto genérico atual. Os textos do painel ficam nos três catálogos; `@ux-design-expert` >= 9,0 (AC-F53-3).
- Riscos: `reason` virar oráculo do estado da Twitch (baixo: já visível na auditoria e ao mesmo dono autenticado); vazar a mensagem do adaptador (os testes canário existentes ficam verdes). Corrida: nenhuma nova, o mapeamento roda depois de `failQueueDeletionCancellation` ter gravado. Testes (PostgreSQL, migrations reais): a linha 401 do PG36-05 verifica o `reason` no corpo; uma linha 5xx verifica `verification_unavailable`; teste canário no corpo; teste de contrato de que todo `reason` emitido está na lista permitida. Teste do painel com a fixture do 409.

## D-A3. D-6: log estruturado de toda transição para `degraded`

Estado atual: só `reconciliation_partial` / `reconciliation_failed` registram (`logReconciliationDegraded`, evento `twitch_reconciliation_degraded`); os caminhos `onDisconnect` e `onRevoked` de `integration.mjs` chamam `publishStatus('degraded', ...)` em silêncio.

Decisão: registrar dentro de `publishStatus` (ponto único), não em cada chamada, para nenhuma fonte futura ficar muda.
- Evento `twitch_integration_degraded`, `level: warn`, `source: 'twitch.integration'`, `details: { reason, trigger?, type?, revokeStatus? }`.
- **Lista fechada de `reason`:** `eventsub_disconnected` (já estabelecido), `eventsub_startup_disconnected` (nunca estabelecido), `subscription_revoked` (com `type` = tipo da assinatura e `revokeStatus` do enum fechado da Twitch), `reconciliation_partial`, `reconciliation_failed`. Os motivos de reconciliação mantêm a linha `twitch_reconciliation_degraded` inalterada (AC-D6-2); a linha nova vale só para as três fontes EventSub, e `publishStatus` só a escreve quando a chamada traz um desses motivos, evitando linha duplicada na reconciliação.
- **Sem ruído:** guardar `lastDegradedKey = reason|type|revokeStatus`; escrever só quando o estado entra em `degraded` ou a chave muda; zerar a chave em qualquer estado não degradado. Uma linha por transição (AC-D6-3).
- **Segurança:** envolver em `try/catch` como `logReconciliationDegraded`; falha de log nunca muda o estado. `type` e `revokeStatus` passam por uma lista permitida pequena antes do log (valor desconhecido vira `other`), então texto livre da Twitch, token, UID ou corpo de chat não entram.
- Testes (runtime EventSub falso do Twurple, sem rede): desconexão antes do `onConnected` registra `eventsub_startup_disconnected` uma vez e a nova tentativa não repete; desconexão após conectar registra `eventsub_disconnected`; revogação de tipo não-chat registra `subscription_revoked` com `type`; reconciliador falso `partial` gera só a linha antiga; logger que lança deixa o estado `degraded`; teste canário na linha serializada (sem `Bearer`, sem UID).

## Ordem e responsabilidade
1. **@dev, Red primeiro:** logs do D-6 (AC-D6-1/3), depois FT-53 (AC-F53-1/2, PostgreSQL), depois D-8 (AC-D8-1/2/3/5 com relógio falso).
2. Green de menor prioridade: AC-D8-4, 6, 7, 8; texto do painel após a nota de UX.
3. **Depende do dono:** "pode transmitir" para a causa raiz do D-6 e OW-17 `ping` ao vivo (AC-D8-9); nenhum entra no gate do `@dev` nem do `@qa`.

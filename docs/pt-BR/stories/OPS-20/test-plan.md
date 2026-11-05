# OPS-20 — Plano de testes (elegibilidade de devolução de pontos)

[English](../../../stories/OPS-20/test-plan.md)

**Autor:** `@qa` (Quinn), 2026-10-21. **Story:** [story.md](story.md) (17 CAs, decisões do proprietário 1–8), issue [#76](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/76).
**Entradas:** [research.md](research.md) (incl. rodada 2), [data-model.md](data-model.md) (testes 1–32), [architecture.md](architecture.md) (três fatias, F1–F14), [ux-plan.md](ux-plan.md) (testes 1–26, M1–M7), [ux-research.md](ux-research.md), [test-research.md](test-research.md).
**Natureza:** apenas portão de planejamento. Nenhum código de produto, teste, migration, comando Docker, suíte de testes ou chamada à Twitch foi escrito ou executado. Os padrões do repositório abaixo vêm de leitura somente de `tests/unit`, `tests/integration/{queue-repository,qra-postgres-fixtures,compose-runtime}.test.js`, `tests/helpers/isolated-postgres-cleanup.mjs`, `tests/e2e/*-browser-only.mjs` e `package.json` em `feat/ops-15-next-panel`.

## 0. Resultado do portão

**Veredito: CONCERNS** (plano aprovado para início da implementação, com as observações da seção 13). **Nota de qualidade do plano: 9,0/10** (o plano, não o produto). Nada aqui é evidência de que a funcionalidade funciona.

## 1. Padrões do repositório reaproveitados

| Padrão | Onde existe hoje | Uso na OPS-20 |
|---|---|---|
| Vitest, `tests/unit/*.test.js(x)`, RTL para `.jsx` | `next-queue-settings-form.test.jsx`, `queue-confirmation-copy.test.js` | avaliador, mapeamento do adapter, mapeador de status, textos, componentes RTL |
| Container PostgreSQL descartável + volume, `prisma migrate deploy` real (duas vezes), limpeza verificada | `tests/integration/queue-repository.test.js`, `tests/helpers/isolated-postgres-cleanup.mjs` | todos os testes de API + PostgreSQL e de worker |
| Rotas Fastify reais + adapter Twitch só de teste + PostgreSQL descartável | `tests/integration/qra-postgres-fixtures.test.js`, `tests/helpers/ops15/qra-postgres-fixtures.mjs` | rotas de override/lote/configuração/limpeza, CSRF/sessão |
| Asserções golden de outbox em `financial:{redemption_id}` | `queue-repository.test.js` (~l.331–467) | guarda de preservação de padrão (seção 9) |
| Scripts `playwright-core` com API simulada | `tests/e2e/*-browser-only.mjs`, `tests/e2e/fixtures/qra-api-fixtures.mjs` | E2E só de navegador (seção 7) |
| Compose isolado + Chrome | `tests/integration/compose-runtime.test.js`, `isolated-compose-cleanup.mjs` | smoke Compose Chromium (seção 7) |
| Relógio falso `vi.useFakeTimers({ now })` | `next-call-deadline.test.jsx` | agendamento do worker (relógio injetado) |
| Testes unitários de worker | `financial-outbox-worker.test.js`, `outbox-loop.test.js`, `twitch-adapter.test.js` | worker de elegibilidade, adapter |

Arquivos novos propostos (nomes sugeridos ao `@dev`): `tests/fakes/subscriber-status-provider.mjs`, `tests/unit/refund-eligibility-policy.test.js`, `tests/unit/subscriber-status-adapter.test.js`, `tests/unit/eligibility-worker.test.js`, `tests/unit/refund-decision-status.test.js`, `tests/integration/refund-eligibility-repository.test.js`, `tests/integration/refund-eligibility-migration.test.js`, `tests/integration/refund-eligibility-worker.test.js`, `tests/integration/refund-override-routes.test.js`, `tests/e2e/refund-eligibility-browser-only.mjs`.

## 2. Camadas e o que cada uma NÃO prova

| Código | Camada | Prova | NÃO prova |
|---|---|---|---|
| U | Unitário (Node/RTL, sem banco) | regras do avaliador, mapeamento de respostas documentadas, lotes, matemática de agendamento, textos/plurais, semântica de componentes | constraints do banco, corridas, Twitch, navegador real |
| P | API + PostgreSQL (PG 18 descartável, migrations reais, ≥ 2 conexões reais para corridas) | padrões preservados, CHECKs, uma intenção por resgate, escritas guardadas, auditoria, DTOs de rota | comportamento da Helix, renderização |
| W | Worker com fakes em PostgreSQL real | lease, retry, 429/back-off, idempotência **contra o nosso modelo da Twitch** | limites reais, latência, Twurple sob carga |
| B | Só navegador (`playwright-core`, API simulada) | papéis no DOM, foco, texto de live region, teclado, viewport, regras do axe (se adotado) | API real, anúncios de TA, OBS/CEF |
| C | Compose Chromium (Compose isolado, fronteira Twitch falsa) | painel + API + banco + worker integrados | Twitch real, tecnologia assistiva |
| M | TA manual (NVDA, VoiceOver) e checagens manuais de leitura/visual | anúncios e usabilidade do build testado | o que estiver fora do checklist |
| T | Twitch real | — | **Bloqueio documentado** (seção 12) |

Evidência de uma camada nunca é relatada como evidência de outra. Toda evidência na story deve citar código da camada, comando, commit e data.

## 3. Matriz de rastreabilidade (CA → testes → camada)

IDs: `DM-n` = teste n do data-model §7; `UX-n` = teste n do ux-plan §10; `EV`, `AD`, `WK`, `RC`, `E2E`, `AT` = este plano.

| CA | Testes | Camadas |
|---|---|---|
| 1 Valores da regra, padrão todo mundo | DM-1, DM-2, DM-3, DM-26; EV-1..EV-3; REG-1..REG-4 | U, P |
| 2 Públicos streamer/mods/VIPs, padrão desligado, nota de presente | DM-7, DM-31; EV-4..EV-8, EV-P3; UX-1, UX-2, UX-10; E2E-1, E2E-2 | U, P, B |
| 3 Definição de inscrito (presente; tier mínimo fora do MVP) | DM-5, DM-6; EV-9, EV-10, EV-P6; AD-3 | U, P |
| 4 Regra vale para os seis gatilhos; chaves seguem decidindo "quando" | DM-3, DM-4, DM-15, DM-20; EV-11 (chave desligada → sem linha); P-T1..P-T6 (um por gatilho × regra) | U, P |
| 5 Decidido uma vez, persistido antes do outbox, só formato válido | DM-10, DM-11, DM-27, DM-32; AD-5, AD-6; RC-4 | U, P, W |
| 6 Conteúdo da auditoria, sem gifter/UID/texto nos logs | DM-6, DM-9, DM-16; AD-10 (captura de log); WK-10 | U, P, W |
| 7 Desconhecido nunca é adivinhado, fica pendente, painel pergunta | DM-8, DM-9; AD-1..AD-9; WK-3..WK-6; UX-3, UX-4; E2E-4 | U, P, W, B |
| 8 Override manual devolver/negar, motivo, idempotente | DM-12, DM-13, DM-22, DM-23, DM-24, DM-28; RC-2, RC-3, RC-5; UX-9, UX-15, UX-16; E2E-5, E2E-6 | U, P, B |
| 9 Escopo de inscrições opcional, novo consentimento, oculto sem afiliado, "zero inscritos" ≠ não inscrito | AD-7, AD-8; DM-8; WK-7 (rearme após consentimento); UX-2, UX-12, UX-19; E2E-8, E2E-9 | U, P, W, B |
| 10 Escopos opcionais de mod/VIP, streamer sem chamada à API | EV-4, EV-P5; DM-31; AD-7; WK-8 | U, P, W |
| 11 Lotes de limpeza ≤ 100, back-off em 429, resultado por resgate, 404 ≠ devolução | DM-14; AD-2, AD-3, AD-11; WK-1, WK-2, WK-9; RC-1 | U, P, W |
| 12 Texto da limpeza por resultado, só "pedida/pendente" | UX-6, UX-18; CP-1..CP-3; E2E-7 | U, B |
| 13 Tratamento de não elegível manter/automático por gatilho, texto verdadeiro | DM-20, DM-21, DM-25; P-T1..P-T6 × tratamento; UX-3, UX-11; E2E-3 | U, P, B |
| 14 Regras do outbox durável, desconhecido nunca vira cancel/no-op calado | DM-10, DM-27, DM-28, DM-30; RC-1..RC-6; WK-1..WK-6 | P, W |
| 15 Textos do formulário en/es/pt-BR, manual-only oculto, UX ≥ 9,0 | UX-1, UX-2, UX-7, UX-8, UX-10..UX-12; E2E-1..E2E-3, E2E-10; AT-1..AT-9 | U, B, M |
| 16 Migration, padrões, sem mudança de dados, snapshot/rollback | DM-1, DM-2, DM-18, DM-19, DM-29; MG-1..MG-4 | P |
| 17 PostgreSQL isolado real; fakes na Twitch; evidências separadas | toda a suíte P/W; seção 2; seção 11 | P, W |

Linhas por gatilho `P-T1..P-T6` (P): `removed_waiting`, `removed_while_called`, `viewer_left_called`, `no_show`, `queue_cleared`, `queue_deleted`, cada um × regra (`everyone`, `nobody`, `subscribers` com resposta falsa inscrito/não inscrito/desconhecido) × tratamento (`keep_unfulfilled`, `auto_fulfill`) × chave por gatilho (ligada/desligada onde existir). Verificar linha de decisão, resolução, linhas do outbox por chave, `redemptions.expected_status` e evento de auditoria.

CP-1..CP-3 (U): pré-visualização da limpeza por regra × tratamento; linhas de resultado omitem zeros; nunca "devolvidos/confirmado" antes da confirmação da Twitch.

## 4. Mapeamento dos testes PostgreSQL do data-engineer (DM-1..DM-32)

Todos na camada P (DM-27..DM-30 também exercitam W), PostgreSQL 18.6 descartável com migrations reais, sem SQLite e sem mocks de Prisma.

| DM | Tema | CA | Fatia | Concorrência |
|---|---|---|---|---|
| 1 | migration com dados (todos os modos de fila) | 1, 16 | 1 | — |
| 2 | CHECK da regra + NOT NULL | 1, 16 | 1 | — |
| 3 | preservação golden do padrão em todos os gatilhos | 1, 4 | 1 | — |
| 4 | `nobody` em todo gatilho | 4 | 1 | — |
| 5 | tier/presente gravados, outbox na mesma TX | 3, 5 | 2 | — |
| 6 | presente excluído | 3 | 2 | — |
| 7 | flags streamer/mod/VIP | 2 | 2 | — |
| 8 | desconhecido por código de motivo, sem outbox | 7 | 2 | — |
| 9 | matriz de CHECK §2.2 | 6, 7 | 1 | — |
| 10 | decisão dupla no mesmo resgate | 5, 14 | 1 | 2+ conexões |
| 11 | rechecagem desconhecido → conhecido uma vez | 5 | 2 | — |
| 12 | override devolver; segundo/versão velha rejeitados | 8 | 3 | — |
| 13 | marcar atendido em pending_check | 8 | 3 | — |
| 14 | limpeza de 230, lote compartilhado, 429 parcial | 11 | 2 | — |
| 15 | exclusão de fila convertida pela regra + gating | 4 | 1 | — |
| 16 | sem texto de override/UID/gifter/token em safe_detail e logs | 6 | 1 (estender 2, 3) | — |
| 17 | FK RESTRICT | 16 | 1 | — |
| 18 | migration de rollback em cópia descartável | 16 | 1 | — |
| 19 | CHECK do tratamento + padrão | 13, 16 | 1 | — |
| 20 | não inscrito manter vs automático | 13 | 2 | — |
| 21 | regras de CHECK 6–8 | 13 | 1 | — |
| 22 | guarda UNFULFILLED | 8 | 3 | — |
| 23 | override devolver vs marcar atendido | 8, 14 | 3 | 2+ conexões |
| 24 | lote de 120 linhas, repetição | 8 | 3 | — (mais RC-5 concorrente) |
| 25 | exclusão bloqueada por linhas pendentes | 4, 13 | 3 | — |
| 26 | everyone nunca gera awaiting/fulfill | 1 | 1 | — |
| 27 | D1 check_pending + tarefa de checagem, tentativas | 5, 14 | 2 | — |
| 28 | corrida worker vs override | 8, 14 | 2/3 | 2+ conexões |
| 29 | ciclo de vida de next_check_at (D2) + CHECK | 7 | 2 | — |
| 30 | D3 tarefa de checagem fora de contadores/claim financeiros | 14 | 2 | — |
| 31 | OD-1 públicos aditivos | 2, 10 | 2 | — |
| 32 | Q5 imutabilidade | 5 | 1 | — |

DM-18 e DM-1 precisam de "migrations até N-1": copiar o subconjunto de migrations para um diretório da execução **dentro do projeto** (por exemplo, numa área de teste ignorada do repositório), nunca em `/tmp` (regra do proprietário), removido no `afterAll`.

## 5. Avaliador puro (`RefundEligibilityPolicy.evaluate`)

### 5.1 Orientado a tabela (`it.each`, camada U)

Domínio: regra {everyone, subscribers, nobody} × isBroadcaster {v,f} × flags {streamer, mods, VIPs} (8 combinações) × countGiftedSubs {v,f} × inscrição {nenhuma, t1000, t2000, t3000, presente, desconhecida(motivo)} × moderador {sim, não, desconhecido, não consultado} × VIP {sim, não, desconhecido, não consultado}. Colunas esperadas: `decision`, `statusSource`, `audienceMatch`, `subscriberStatus`, `tier`, `isGift`, `unknownReason`, `lookups[]`.

- EV-1 `everyone` → eligible, `not_required`, sem consultas, para qualquer outra entrada.
- EV-2 `nobody` → not_eligible, `not_required`, sem consultas.
- EV-3 regra fora do domínio → lança erro (erro de programação), nunca uma decisão.
- EV-4 streamer: `broadcaster_self`, nunca consulta, eligible sse `includeBroadcaster`.
- EV-5 inscrito, flags desligadas → eligible, `audienceMatch` nulo (decisão 7).
- EV-6 moderador não inscrito, mods ligado → eligible, `moderator`; mods desligado → not_eligible.
- EV-7 VIP idem.
- EV-8 sem `statuses` em `subscribers` → `needs_lookup` só com `subscription`; `moderator`/`vip` só com flag ligada (OD-1).
- EV-9 presente + `countGiftedSubs=false` → not_eligible, `isGift=true`, tier mantido.
- EV-10 tier gravado para todo tier; nenhuma entrada de tier mínimo aceita (fora do MVP).
- EV-11 gatilho com chave desligada → avaliador não chamado (teste no domínio: nenhuma linha de decisão).
- EV-12 curto-circuito: inscrição elegível + moderador desconhecido → eligible; inscrição desconhecida + flag de mod ligada e moderador sim → eligible; não inscrito + moderador exigido desconhecido → unknown com esse motivo.
- EV-13 "zero inscritos" (`ok` com `byUserId` vazio) → not_subscriber só com status `ok`; lote `unknown` → unknown.

### 5.2 Propriedades (camada U)

Usar fast-check **se adotado** (seção 14); senão, laço exaustivo com semente sobre o domínio finito acima (mesma garantia aqui, sem dependência nova).

- EV-P1 determinismo e pureza: mesma entrada → saída igual em profundidade; sem acesso a relógio/rede (espiar `Date.now`, `fetch`).
- EV-P2 `everyone` nunca precisa de consulta; `nobody` sempre not_eligible.
- EV-P3 públicos monotônicos: ligar qualquer flag nunca transforma eligible em not_eligible ou unknown.
- EV-P4 desconhecido exigido e relevante nunca gera `not_eligible`; gera `unknown`, a menos que outra fonte conhecida torne a pessoa elegível.
- EV-P5 streamer nunca gera consulta.
- EV-P6 inscrito de presente elegível sse `countGiftedSubs`.
- EV-P7 a saída sempre satisfaz os CHECKs do data-model §2.2 (`decision`/`unknownReason`, `subscriber` ⇔ tier+presente, `not_required` ⇒ `not_checked`): um validador compartilhado é aplicado a toda saída gerada, ligando U a P.

## 6. Testes de contrato do adapter Twitch e worker

### 6.1 Adapter (`TwitchSubscriberStatusAdapter`, camada U)

Primário: fake em nível HTTP atrás do cliente Twurple 8.2.0 **real** (undici `MockAgent` com `disableNetConnect`, ou injeção por `fetchOptions`; escolha do `@dev`). Secundário: fake na porta para tudo acima do adapter.

| ID | Caso | Esperado |
|---|---|---|
| AD-1 | 429 com `Ratelimit-Remaining: 0` e `Ratelimit-Reset` = agora+N (relógio falso) | documentar o comportamento: Twurple espera e repete (VERIFICADO no código, test-research §0); um resultado final, espera total limitada por `lookupTimeoutMs`, sem espera dobrada com o nosso back-off |
| AD-2 | 429 com `Remaining > 0`, ou sem cabeçalho de reset | `{status:'unknown', reason:'rate_limited', retryAt}`; `retryAt` de fallback limitado sem cabeçalho |
| AD-3 | 99/100 ids → uma requisição; 101 → duas; 230 → três (100/100/30); cada `user_id` uma vez na query | Twurple não divide em lotes (F10) |
| AD-4 | 400 por um id malformado no lote | lote inteiro `unknown` (`lookup_error`), nunca 99 × not_subscriber; ids validados `^\d{1,32}$` antes da chamada |
| AD-5 | pessoa ausente em `data` com 200 e formato válido | `not_subscriber` |
| AD-6 | corpo malformado, sem `tier`, `is_gift` não booleano, `data` parcial, tier desconhecido | `malformed_response`, nunca ok parcial |
| AD-7 | pré-checagem: falta `channel:read:subscriptions` (e `moderation:read`, `channel:read:vips` com flags) | `scope_missing`, **nenhuma requisição HTTP** |
| AD-8 | canal não afiliado/parceiro (`getChannelEligibility`) e 403 "not a partner or affiliate" | `channel_ineligible`; outro 403 → `forbidden` |
| AD-9 | 401 → refresh do Twurple → ainda 401 | `unauthorized`; com refresh bem-sucedido, a requisição repetida passa uma vez (caso de refresh de token) |
| AD-10 | 5xx, erro de rede, timeout | `server_error` / `lookup_error` / `timeout` |
| AD-11 | classificação só pelo status: mesmo status com mensagem diferente → mesmo motivo | F6 |
| AD-12 | logs e erros sem ids, logins, campos de gifter, tokens | captura do structured-logger |
| AD-13 | endpoints de moderadores/VIPs: mesmo lote de 100 e mapeamento | F5 |
| AD-14 | `updateRedemptionStatusByIds` continua um id por tarefa no MVP (`financial.redemptionUpdateBatchMax=1`); configuração acima de 50 rejeitada | F3 |

### 6.2 Worker de elegibilidade (camada U com repositório falso + camada W em PostgreSQL)

Relógio injetado no worker e no repositório; testes PostgreSQL gravam timestamps explícitos no passado/futuro em vez de dormir (relógio falso não move o `now()` do PostgreSQL).

| ID | Caso |
|---|---|
| WK-1 | claim ≤ batchMax linhas de **uma** fila; dois workers em duas conexões pegam conjuntos disjuntos (`SKIP LOCKED`), repetido 20–50 vezes com barreira |
| WK-2 | 429 → lote inteiro segue `pending_check`, `next_check_at` = reset + jitter limitado, worker pausa; uma tentativa contada por reset |
| WK-3 | 5xx/timeout → back-off exponencial, para em `maxAttempts` (5) ou `maxAgeMinutes` (60) e vai para "Esperando você" |
| WK-4 | `malformed_response` → uma nova tentativa, depois para |
| WK-5 | `scope_missing`, `unauthorized`, `forbidden`, `channel_ineligible` → sem retry automático |
| WK-6 | nenhuma transação aberta durante a chamada ao provedor (fake que verifica uma sonda "em transação", mais `pg_stat_activity` sem `idle in transaction` do worker durante uma chamada falsa retida) |
| WK-7 | novo consentimento concede o escopo → linhas `scope_missing` rearmadas uma vez (nova rodada `eligibility:{id}:{round+1}`) |
| WK-8 | consultas de mods/VIPs só para não inscritos com flag ligada |
| WK-9 | o avaliador usa o `rule_snapshot` da linha, não a regra atual da fila (mudar a regra entre gatilho e checagem, R7) |
| WK-10 | logs do worker: só códigos, contagens e ids de lote |
| WK-11 | não pega antes de `next_check_at`; pega em/depois; reset no passado → atraso mínimo |
| WK-12 | lease expirado no meio da chamada: resposta tardia não sobrescreve rodada mais nova nem linha resolvida |

### 6.3 Corrida e idempotência (camada P/W, ≥ 2 conexões `pg`/Prisma reais, barreira, 20–50 repetições, asserção no estado das tabelas)

- RC-1 **devolução dupla**: N transições/decisões paralelas no mesmo resgate → exatamente uma linha de decisão e uma linha `financial:{id}` no outbox.
- RC-2 **marcar atendido duplo**: dois overrides `mark_served` paralelos → um `redemption.fulfill`, um `override_applied`, um `override_rejected` (ou `stale_version`).
- RC-3 **override vs worker** (DM-28 nas duas ordens): override primeiro → update guardado do worker altera 0 linhas; worker primeiro → override rejeitado `already_has_financial_intent`.
- RC-4 dois workers no mesmo `check_batch_id` → cada linha concluída uma vez, `check_attempts` +1 por tentativa executada.
- RC-5 lote duplo com o mesmo `resolutionBatchId`, enviado em paralelo → uma execução, as duas respostas iguais ao resultado gravado.
- RC-6 confirmação de limpeza dupla (chat + painel) → uma limpeza, um lote, sem segundas linhas de decisão.

## 7. E2E e fluxos de navegador (plano de UX)

Só navegador (B) com API simulada no estilo `qra-api-fixtures`; Compose Chromium (C) só para E2E-C1..C3. Cada cenário B em 1280 × 800 e 390 × 844, com variante só teclado.

| ID | Fluxo | Camada | Ref. UX |
|---|---|---|---|
| E2E-1 | Configuração: escolher "Só inscritos" → blocos C/D/F aparecem após o grupo; foco fica no radio; dica "Mais opções aparecem abaixo" presente; fila manual-only e canal não afiliado ocultam a seção; fila manual convertida mostra resumo somente leitura | B | UX-1, UX-2, UX-10 |
| E2E-2 | Campos condicionais: subscribers → everyone → subscribers mantém flags; payload envia valores ocultos inalterados | B | UX-1 |
| E2E-3 | Aviso irreversível ao **Salvar** (não na troca do radio): manter → automático abre S1, foco padrão "Manter pendente", Escape mantém rascunho e devolve foco ao Salvar, aceitar envia uma vez | B | UX-11 |
| E2E-4 | Lista "Precisa da sua decisão": contagem no resumo, selo abre e foca o título, dois grupos por motivo, exibida também em fila `deleting`, oculta com 0 | B | UX-13, UX-14 |
| E2E-5 | Override manual R1/M1: alertdialog rotulado/descrito, motivo obrigatório (vazio → foco, `aria-invalid`, erro `role="alert"`), limite 280, preset gravado; linhas de não elegível e de cancelamento da checagem no R1 | B | UX-9, UX-15 |
| E2E-6 | Lote marcar atendido: checkbox de cabeçalho misto, limite 100, poda na atualização com contagem podada, um motivo por lote, **resultado parcial** em linhas feitos/ignorados/rejeitados, 409 de versão velha recarrega | B | UX-5, UX-16 |
| E2E-7 | Textos de limpar/excluir por regra × tratamento: everyone/subscribers-manter/subscribers-auto/nobody-manter/nobody-auto, plural 1 e n, botões com verbo, linhas de resultado sem zeros, linha de exclusão esperando + botão de salto | B | UX-18 |
| E2E-8 | Aviso de novo consentimento: alerta do bloco E, formulário sujo mostra "salve antes", três pontos de entrada chamam uma ação, linhas no cartão de conexão só quando necessárias | B | UX-12, UX-19 |
| E2E-9 | Ida e volta de permissão com OAuth falso: concedida com contagem / sem pendências / negada | C | UX-21 |
| E2E-10 | 390 × 844: sem rolagem horizontal, alvos ≥ 44 × 44, diálogos cabem, botão destrutivo por último; reflow com zoom 200% | B | UX-24 |
| E2E-11 | Chat falso: mensagens por regra nunca juntam nome de pessoa com status de inscrição | U + C | UX-26 |
| E2E-C1 | Configurar subscribers + manter, limpar, respostas do worker falso movem linhas de verificando → esperando, devolver uma, lote para o resto | C | UX-20 |
| E2E-C2 | Exclusão bloqueada por decisões pendentes, resolver, exclusão continua; recompensa excluída só após a resolução | C | UX-22 |
| E2E-C3 | Fila padrão (everyone) de ponta a ponta inalterada: limpar e remover geram o outbox e o texto de hoje | C | REG |
| E2E-A | Varredura axe da configuração, seção de decisão e diálogos no estado-alvo (se adotado): zero serious/critical; itens `incomplete` vão para revisão manual | B | UX-25 |

OD-UX-1: "Só inscritos"/"Ninguém" só aparecem no painel com a fatia 3, então E2E-1..E2E-8 rodam na fatia 3; as fatias 1–2 têm um teste B provando que as opções **não** aparecem.

## 8. Checklist manual de tecnologia assistiva (camada M)

Registrar ferramenta + versão, navegador + versão, SO, commit do build, pessoa testadora e data. O axe não tem regra de live region e encontra cerca de 57 % dos problemas WCAG, então estes itens são obrigatórios antes do release.

- AT-1 NVDA + Firefox/Chrome (Windows): nome do grupo da regra e opções anunciados; setas mudam a seleção.
- AT-2 Checkboxes condicionais de público alcançáveis e compreendidos após "Mais opções aparecem abaixo".
- AT-3 Aviso de permissão faltando e "Permitir na Twitch" alcançáveis e anunciados.
- AT-4 S1/R1/M1/B1/C1/D1: título e depois descrição lidos ao abrir, foco dentro, Escape volta ao acionador ou ao título de fallback.
- AT-5 Live region de resultado anunciada uma vez por resultado; mudanças do polling não anunciadas (exceto a linha de linha focada removida).
- AT-6 Linhas de decisão: botões repetidos distinguíveis pelo nome da pessoa; estado misto do checkbox anunciado.
- AT-7 VoiceOver + Safari (macOS) repete AT-1..AT-6.
- AT-8 VoiceOver + Safari iOS em 390 × 844 (M3); TalkBack opcional (M4).
- AT-9 Zoom 200% e uso só por teclado sem perda de foco para `body`.
- Manual sem TA: M5 teste de leitura (streamer pt-BR + pessoa de fala es), M6 rótulos do painel da Twitch, M7 contraste de `.is-warning`/`button-danger`.

## 9. Guarda de regressão: preservação do padrão

- REG-1 Migration com dados (DM-1): toda linha existente recebe `everyone`/`false`/`false`/`false`/`true`/`keep_unfulfilled`; colunas antigas idênticas (comparar JSON completo da linha antes/depois).
- REG-2 Outbox golden (DM-3): com `everyone` e cada um dos seis gatilhos × combinações atuais das chaves, linhas do outbox (tipo, chave, status), `expected_status` e `financialDecision` da auditoria iguais à saída anterior à OPS-20. O fixture golden é gravado **antes** das mudanças de código da fatia 1 (evidência Red) e versionado como dado de teste.
- REG-3 Nenhum `awaiting_streamer`/`fulfill_requested` com `everyone` (DM-26); nenhuma chamada de inscrições à Helix com `everyone`/`nobody` (o provedor falso verifica zero chamadas).
- REG-4 Suítes existentes seguem verdes sem mudança: `queue-repository.test.js`, `financial-outbox-worker.test.js`, `queue-domain-service.test.js`, `queue-confirmation-copy.test.js`, `clear-confirmation.test.js`, `next-queue-clear*.test.js`. Qualquer edição de valor esperado nesses arquivos exige motivo escrito na story (só mudanças de texto da OD-UX-2).
- REG-5 Textos de chat/painel com `everyone` mantêm o sentido de hoje (teste golden de texto, U1.2), com o novo termo "devolver os pontos".
- REG-6 OAuth: escopos obrigatórios inalterados; conexão existente sem os novos escopos continua passando no health e nos fluxos atuais (CA 9).

## 10. Critérios de entrada/saída por fatia

Evidência Red primeiro em toda fatia: para cada comportamento novo, a execução com falha (comando, commit, nomes dos testes que falharam, motivo de falha que corresponde ao comportamento ausente, não erro de sintaxe) fica registrada na story **antes** do commit de implementação, depois a execução verde. Commits só de refatoração mantêm a suíte verde.

| Fatia | Entrada | Saída (tudo obrigatório) |
|---|---|---|
| **1** migration, avaliador, everyone/nobody, caminhos forçados pela regra | migração da OPS-15 concluída; este plano PASS/CONCERNS; fixture golden (REG-2) gravado no código atual; migration revisada pelo data-engineer | EV-1..EV-13, EV-P1..EV-P7; DM-1..4, 9, 10, 15..19, 21, 26, 32; REG-1..REG-6; MG-1..MG-4; teste B: subscribers/nobody não expostos; guarda de terminologia UX-8; quality gates verdes |
| **2** porta, adapter, worker, lotes, 429, escopos, novo consentimento, regra subscribers | saída da fatia 1; OD-1 respondida (feito, decisão 7); decisões de dependência da seção 14 tomadas; 429 interno do Twurple (F11) lido no código e AD-1 escrito em Red | AD-1..AD-14; WK-1..WK-12; RC-1, RC-4; DM-5..8, 11, 14, 20, 27, 29..31; mapeador de status UX-3, UX-4; suíte REG ainda verde |
| **3** override, lote, listas, gating, textos | saída da fatia 2; UX ≥ 9,0 estático nos textos finais; OD-UX-2/3 aplicadas | DM-12, 13, 22..25, 28; RC-2, RC-3, RC-5, RC-6; UX-1..UX-19; E2E-1..E2E-11, E2E-C1..C3, E2E-A (se adotado); checklist AT/M executado ou listado como pendente com ciência do proprietário; revisão final de UX; bloqueio de Twitch real reafirmado |

Quality gates em toda saída de fatia: `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist`, `npm run review:static`.

### Checagens de migration (MG, camada P)

- MG-1 portão de drift: após `migrate deploy` em banco descartável vazio, `prisma migrate diff ... --exit-code` retorna 0. **Os flags devem ser confirmados no `--help` do Prisma 6.19.3** (a documentação atual descreve a v7); registrar o comando exato usado.
- MG-2 revisão de SQL só de expansão: apenas ADD COLUMN / CREATE TABLE / CHECK / INDEX; começa com `SET LOCAL lock_timeout`.
- MG-3 nova execução de `migrate deploy` não faz nada (padrão existente).
- MG-4 migration de rollback em cópia descartável (DM-18); testes do código anterior passam sobre ela.

## 11. Segurança dos dados de teste

- Só containers/volumes PostgreSQL descartáveis criados por execução, com nomes e labels únicos; limpeza por `isolated-postgres-cleanup.mjs`/`isolated-compose-cleanup.mjs`, conferindo labels de propriedade antes de remover. Nunca tocar volumes, imagens ou containers ativos de desenvolvimento.
- Nenhum teste lê o `DATABASE_URL` do ambiente de desenvolvimento; a connection string vem do container iniciado pelo teste.
- Nada é gravado em `/tmp` ou fora do projeto (regra do proprietário); cópias de migrations e artefatos da execução ficam em caminhos ignorados do projeto e são removidos no `afterAll`.
- Twitch: só fakes; `disableNetConnect` (ou equivalente) para nenhum teste alcançar `api.twitch.tv`; ids falsos seguem `^\d{1,32}$` e são sintéticos.
- Fixtures sem logins reais, tokens ou dados de gifter; motivos de override sintéticos.
- Cada teste cria sua própria fila/slug (`randomUUID`) para arquivos paralelos não colidirem.

## 12. Twitch real: bloqueio documentado (camada T)

Não executável neste plano. Exige canal de teste afiliado, pelo menos um inscrito pago, um de presente e um Prime, um moderador e um VIP, os escopos opcionais e um novo consentimento. Perguntas que só T responde: representação do Prime (F2), streamer na própria lista de inscrições, orçamento real de 429 e Twurple sob carga (F7, F11), expiração/limite de UNFULFILLED pendentes (F8), latência, rótulos do painel da Twitch (M6). Nenhuma nota de release ou evidência da story pode afirmar nada disso.

## 13. Riscos, ressalvas e checagens não executadas

| # | Item | Efeito no portão |
|---|---|---|
| C1 | Nada deste plano foi executado; contagens e comportamentos são planejados. | inerente |
| C2 | Dependências (axe, fast-check, fake HTTP) não decididas; o plano tem alternativas sem dependência (laço exaustivo com semente, axe injetado por `page.addScriptTag` só se adotado, injeção por `fetchOptions`). | CONCERNS |
| C3 | O retry interno de 429 do Twurple (VERIFICADO no código) pode absorver esperas além de `lookupTimeoutMs`; o AD-1 precisa definir o comportamento combinado esperado antes do código da fatia 2. | CONCERNS |
| C4 | Flags do `migrate diff` no Prisma 6.19.3 não verificados (a documentação mostra a v7). | CONCERNS (MG-1) |
| C5 | Ator streamer vs moderador (architecture A2) não verificado; testes de `resolved_by = moderator` dependem de papéis existirem. | CONCERNS |
| C6 | A linha do portão do `@architect` na story ainda diz "OD-1 pendente", embora a decisão 7 do proprietário a tenha resolvido; o `@po` deve alinhar o texto. | docs |
| C7 | Suporte a plural no catálogo de chat não verificado (OPS-14, #65); E2E-11 checa só privacidade. | acompanhamento |
| C8 | Testes de corrida são probabilísticos; 20–50 repetições reduzem mas não eliminam falsos positivos; falhas nunca devem ser repetidas em silêncio. | inerente |
| C9 | Twitch real, TA e checagens visuais ficam pendentes por natureza. | bloqueio/manual |

Checagens não executadas: todos os testes deste plano; `npm run review:static` e os demais gates não foram executados (nenhum código mudou).

## 14. Dependências a adicionar (decisões do `@dev`/`@architect`, com pesquisa na documentação oficial)

| Candidata | Finalidade | Alternativa sem ela |
|---|---|---|
| `fast-check` (+ opcional `@fast-check/vitest`) | propriedades EV-P com shrinking | laço exaustivo com semente sobre o domínio finito |
| `@axe-core/playwright` ou `axe-core` injetado | varredura WCAG automatizada E2E-A | asserções de papel/foco no Playwright + TA manual |
| undici `MockAgent` (exposição do undici embutido no Node a verificar) ou `msw` | fake HTTP do AD atrás do Twurple real | fake na porta + injeção por `fetchOptions` |
| `testcontainers` | — | não recomendado; manter o padrão de container descartável do repositório |

## 15. Veredito e nota

**Veredito: CONCERNS.** Motivos: rastreabilidade completa CA → teste → camada para os 17 CAs; os 32 testes do data-engineer mapeados por CA e fatia; cobertura do avaliador, do adapter (variantes de 429, erros 4xx de lote → unknown, escopo, não afiliado, lotes de 100 ids, refresh), do worker e de corridas com ≥ 2 conexões reais; entrada/saída por fatia com Red primeiro; guarda de regressão; separação de evidências e segurança de dados definidas. As ressalvas C2–C5 são decisões ou verificações que precisam fechar antes ou durante a fatia 2, não defeitos do plano.

**Nota de qualidade do plano: 9,0/10.** Não é maior porque: as escolhas de dependência estão abertas (C2), a interação com o 429 do Twurple está especificada como "observar e então fixar a expectativa" (C3), o comando de drift do Prisma 6.19 não está fixado (C4) e os testes de papel do ator dependem de uma suposição não verificada (C5).

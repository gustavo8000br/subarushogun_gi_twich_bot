# OPS-20 — Pesquisa de testes (insumo para o gate de plano de testes do `@qa`)

[English](../../../stories/OPS-20/test-research.md)

**Autor:** `@analyst` (Atlas), 2026-10-21. **Natureza:** somente pesquisa; nenhum código, migration, Docker ou chamada à Twitch foi executado. Entradas: [story.md](story.md), [architecture.md](architecture.md), [data-model.md](data-model.md), [ux-plan.md](ux-plan.md).
**Rótulos:** VERIFICADO (VERIFIED) = lido em documentação oficial ou no código-fonte instalado em 2026-10-21; PARCIAL (PARTIAL) = fonte oficial confirma parte, o resto é inferência ou comunidade; NÃO VERIFICADO (UNVERIFIED) = não confirmado.

## 0. Linha de base do repositório (somente leitura, 2026-10-21)

| Fato | Status |
|---|---|
| Runner é Vitest 5.0.3 (`npm test`, `test:unit`, `test:integration`); fake timers já são usados (`tests/unit/next-call-deadline.test.jsx`). | VERIFICADO |
| A integração com PostgreSQL usa container `docker` descartável + volume nomeado, removidos por `tests/helpers/isolated-postgres-cleanup.mjs`, e roda `prisma migrate deploy` real duas vezes (`tests/integration/queue-repository.test.js` ~l.674). | VERIFICADO |
| `FOR UPDATE SKIP LOCKED` já existe em `apps/api/src/persistence/queue-repository.mjs`. | VERIFICADO |
| Testes de navegador usam scripts `playwright-core` (`tests/e2e/*-browser-only.mjs`). `@axe-core/playwright`, `fast-check`, `msw`, `nock` e `testcontainers` **não** são dependências. | VERIFICADO |
| Prisma 6.19.3, Twurple 8.2.0. | VERIFICADO |
| **Novo:** `HelixRateLimiter.needsToRetryAfter` do Twurple (código instalado 8.2.0) refaz a chamada internamente em 429 **quando `Ratelimit-Remaining` está ausente ou é 0**, esperando `Ratelimit-Reset*1000 - Date.now()`. Um 429 com `Remaining > 0` chega a quem chamou. Isso resolve parte de F11/R4 da arquitetura. | VERIFICADO (código), comportamento sob carga NÃO VERIFICADO |

Adicionar dependências (axe, fast-check, MSW) é decisão de `@dev`/`@architect` com pesquisa em documentação oficial; esta nota só lista opções.

## 1. Cliente Twitch Helix: fakes e testes de contrato

| Opção | O que prova | Limites | Status |
|---|---|---|---|
| **Fake na porta** (`tests/fakes/subscriber-status-provider.mjs`, planejado) | Comportamento de worker/domínio para ok, 429+reset, 5xx, corpo malformado, escopo ausente, timeout | Nada sobre o mapeamento Twurple/HTTP | Primário recomendado (arquitetura §2) |
| **Fake HTTP** (`MockAgent` do undici ou `setupServer` do MSW) atrás do cliente Twurple real | Mapeamento do adapter: query com ≤ 100 `user_id`, usuário ausente = não inscrito, `tier`, `is_gift`, classificação 401/403/429/5xx, retry interno de 429 do Twurple | Os fakes refletem nossa leitura da documentação, não a Twitch | Recomendado só para o adapter |
| **Twitch CLI `twitch mock-api`** | Smoke contra uma aproximação de terceiros | Beta aberto; "pode ficar fora de sincronia com a API de produção"; lista de endpoints não publicada; sem rate limit/429 documentado; VIPs não citados | Opcional, não é evidência da Twitch |
| Utilitários de teste do Twurple | — | Nenhum utilitário oficial encontrado; `ApiClient` aceita `fetchOptions` (`.d.ts` instalado) | NÃO VERIFICADO (nada encontrado) |

Casos que o plano deve exigir (tabela):
1. 429 com `Ratelimit-Remaining: 0` e `Ratelimit-Reset` = agora+N: verificar se o Twurple absorve (espera e refaz) — com relógio falso — e que o worker nunca mantém transação de banco aberta durante essa espera.
2. 429 com `Remaining > 0` ou sem cabeçalho de reset (a Twitch diz que alguns endpoints retornam 429 "por motivos não relacionados ao bucket geral"): o adapter mapeia para `rate_limited`, o lote inteiro continua `pending_check`, `next_check_at` = reset + jitter ou fallback limitado.
3. Lote de 100 ids: uma requisição; 101 ids: dois lotes (o Twurple não divide, F10). Um 400 por id malformado não pode marcar os outros 99 como não elegíveis: lote inteiro `unknown`.
4. 401 → `authorization_required`; 403/pré-checagem de escopo ausente → `scope_missing`, sem retry até novo consentimento.
5. Corpo malformado, timeout, `data` parcial → `unknown`, nunca `not_eligible`.
6. Classificação só pelo status HTTP, nunca pela mensagem (F6).

Fontes: guia da API Twitch, rate limits — https://dev.twitch.tv/docs/api/guide/ (VERIFICADO: token bucket, por client ID por usuário por minuto, `Ratelimit-Reset` em epoch, 429 por motivos não relacionados). Twitch CLI mock-api — https://dev.twitch.tv/docs/cli/mock-api-command/ (limites VERIFICADOS). undici MockAgent — https://github.com/nodejs/undici/blob/main/docs/docs/api/MockAgent.md (VERIFICADO `disableNetConnect`, `assertNoPendingInterceptors`; cabeçalhos na resposta e cobertura do `fetch` nativo do Node PARCIAL). MSW Node — https://mswjs.io/docs/integrations/node (PARCIAL). Twurple — `node_modules/@twurple/api/lib/utils/HelixRateLimiter.js` instalado.

## 2. Outbox durável, lease, retry e idempotência em PostgreSQL real

- **Manter o padrão do repositório** (container descartável, migrations reais, limpeza verificada) em vez de adicionar Testcontainers. Testcontainers (`@testcontainers/postgresql`, `snapshot()/restoreSnapshot()`) é alternativa equivalente, mas é dependência nova e também precisa de Docker. PARCIAL (documentação: https://node.testcontainers.org/modules/postgresql/).
- Documentação do PostgreSQL: `SKIP LOCKED` "oferece uma visão inconsistente dos dados… pode ser usado para evitar contenção de lock com vários consumidores acessando uma tabela tipo fila". VERIFICADO — https://www.postgresql.org/docs/current/sql-select.html. Por isso os testes precisam provar a correção com **duas ou mais conexões reais**, não um único cliente.
- Receitas de concorrência (inferência a partir da documentação, padrão da comunidade): abrir dois clientes `pg`; cliente A faz `BEGIN` + claim; cliente B faz claim em paralelo → conjuntos disjuntos; derrubar A sem commit → a expiração do lease torna as linhas disponíveis de novo; repetir a mesma chave de idempotência → uma linha.
- Testes de corrida que o plano deve listar: (a) dois workers pegando o mesmo `check_batch_id`; (b) worker concluindo uma checagem enquanto chega um override manual (um vence, o outro recebe `already_has_financial_intent` ou no-op protegido); (c) clear duplo / `mark-served` duplo com o mesmo `resolutionBatchId` devolve o resultado armazenado; (d) **reembolso duplo**: N transições paralelas na mesma redemption geram exatamente uma linha de outbox `redemption.cancel` (chave única + contagem); (e) lease expirando durante a chamada Helix: conclusão tardia não sobrescreve uma rodada mais nova (`eligibility:{id}:{round}`).
- Usar barreiras (promises liberadas juntas) e repetir cada corrida 20–50 vezes; verificar o estado das tabelas, não logs. Advisory locks (`pg_advisory_xact_lock`) só se o design os usar; nesse caso, os testes devem confirmar que têm escopo de transação. PARCIAL.

## 3. Testes de migration Prisma

- `prisma migrate deploy` aplica migrations pendentes, não usa shadow DB e não detecta drift. VERIFICADO — https://www.prisma.io/docs/orm/reference/prisma-cli-reference.
- `prisma migrate diff --exit-code` retorna 0 vazio / 1 erro / 2 mudanças. VERIFICADO. Atenção: a página atual é do Prisma 7 (`--shadow-database-url` removido, `--from-config-datasource`); o repositório fixa 6.19.3, então as flags devem ser conferidas no help da 6.19. PARCIAL.
- Checagens recomendadas: (1) **gate de drift**: após `migrate deploy` num banco descartável vazio, `migrate diff … --to-schema schema.prisma --exit-code` deve sair com 0; (2) **preservação de defaults**: aplicar migrations até a anterior à OPS-20, inserir filas com as combinações atuais dos três Booleanos, aplicar a OPS-20, verificar `refund_eligibility = 'everyone'`, cada coluna nova com o default documentado e as colunas antigas inalteradas; (3) **somente expansão**: revisão do SQL confirmando que a migration só adiciona colunas/tabela/CHECK (sem DROP/RENAME/troca de tipo); (4) reexecução idempotente de `migrate deploy` (já existe no repositório); (5) CHECKs rejeitando linhas inválidas (`next_check_at` em linha resolvida, teste 29 do data-model).
- Expand/contract como padrão: evidência complementar (guia da Prisma, https://www.prisma.io/docs/guides/data-migration). PARCIAL.

## 4. Automação de acessibilidade (Playwright + axe)

- `@axe-core/playwright`: `AxeBuilder({page}).include().withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()`; escanear depois que a UI chega ao estado-alvo (diálogo aberto, rádio alterado, texto da live region atualizado). Playwright: "testes automatizados não detectam todos os tipos de violação WCAG". VERIFICADO — https://playwright.dev/docs/accessibility-testing. README do axe: encontra "em média 57% dos problemas WCAG"; devolve `incomplete` para revisão manual. VERIFICADO — https://github.com/dequelabs/axe-core. Regras relevantes: `aria-dialog-name`, `aria-required-children`, `label`; não há regra para live region. VERIFICADO — rule-descriptions.md.
- O repositório usa scripts `playwright-core`, não `@playwright/test`; o axe-core pode ser injetado com `page.addScriptTag` + `axe.run()` sem o runner. PARCIAL (escolha de design do `@dev`).
- **Verificar com Playwright, não com axe:** grupo de rádio via `getByRole('radiogroup', {name})` e `getByRole('radio', {checked})`, setas mudam a seleção; o foco entra no diálogo ao abrir e volta ao gatilho ao fechar, Esc fecha; a live region existe **antes** de o texto mudar e tem `aria-live="polite"`/`role="status"`; o texto muda uma vez por resultado.
- **A automação não prova:** que NVDA/VoiceOver de fato anunciam o texto, ordem e verbosidade dos anúncios, compreensão do texto (en/es/pt-BR), contraste no OBS/CEF real, nem que o diálogo não confunde.
- Checklist manual (registrar leitor + versão + navegador): NVDA + Firefox/Chrome no Windows e VoiceOver + Safari no macOS: (1) Tab até o grupo da regra, nome e opções anunciados, setas mudam a seleção; (2) checkboxes condicionais de público anunciados quando aparecem; (3) aviso de escopo ausente e botão de reconexão alcançáveis e anunciados; (4) diálogo de limpeza: título + descrição lidos ao abrir, foco preso, Esc devolve o foco; (5) contagens por resultado (elegível/não elegível/pendente) anunciadas uma vez pela live region; (6) lista "precisa da sua decisão": ações de linha com nomes únicos; (7) zoom 200% e uso só com teclado. A evidência fica como "TA manual", separada do axe.

## 5. Avaliador puro de elegibilidade: tabela + testes baseados em propriedades

- Tabela (`it.each`) cobrindo a matriz completa: regra × é o streamer × flags (streamer/mods/VIPs) × status (inscrito/presente/tier/nenhum/unknown). É pequena (≈ 3 × 2 × 8 × 5) e documenta diretamente as decisões 1–7 do proprietário.
- Baseado em propriedades (fast-check, `fc.assert(fc.property(...))`, com shrinking até o contraexemplo mínimo; VERIFICADO — https://fast-check.dev/docs/introduction/getting-started/). Invariantes: `everyone` nunca exige consulta; `nobody` sempre `not_eligible`; qualquer entrada `unknown` relevante nunca gera `eligible`/`not_eligible`; flags de público são monotônicas (ligar uma flag nunca remove elegibilidade, decisão 7); o streamer nunca dispara consulta; inscrição presenteada é elegível se e somente se `countGiftedSubs`; saída determinística e sem I/O. Replay por seed e integração `@fast-check/vitest`: NÃO VERIFICADO na página lida. Se o fast-check não for adotado, um laço exaustivo com seed sobre o domínio finito dá a mesma garantia aqui.

## 6. Relógio falso para rechecagens com `next_check_at`

- Vitest `vi.useFakeTimers({ now })`, `vi.setSystemTime`, `vi.advanceTimersByTimeAsync` para o laço do worker e para a espera do Twurple (que usa `Date.now()`). A página oficial lida não documenta todas as APIs; o repositório já usa `useFakeTimers({ now })`. PARCIAL — https://vitest.dev/guide/mocking/timers.
- Fake timers **não** mudam o `now()` do PostgreSQL. Recomendação: injetar um relógio no worker/repositório e passar timestamps como parâmetros nas comparações de `next_check_at`/lease; nos testes com PostgreSQL, gravar linhas com timestamps explícitos no passado/futuro em vez de esperar. Casos: rechecagem não é pega antes de `next_check_at`; é pega no instante ou depois; jitter limitado; reset no passado → retry imediato com atraso mínimo; uma tentativa contada por reset.

## 7. Pirâmide de testes recomendada

1. **Unitários (maioria):** tabela + propriedades do avaliador; mapeamento do adapter com fake HTTP; formatação de textos/contagens; agendamento com relógio falso.
2. **API + PostgreSQL (muitos):** migrations, defaults, CHECKs, decisão persistida antes da outbox, idempotência, corridas, overrides, auditoria.
3. **Worker com fakes (alguns):** worker de elegibilidade + worker financeiro em PostgreSQL real com o fake da porta (429, 5xx, escopo ausente, expiração de lease).
4. **Browser-only (poucos):** Playwright com API simulada: formulário, radiogroup, diálogo, live region, varredura axe.
5. **Chromium no Compose (menos):** stack completa em Compose descartável, fluxos do painel ponta a ponta com fronteira Twitch falsa.
6. **TA manual (checklist)** e **Twitch real (bloqueado)**.

## 8. Matriz de separação de evidências

| Camada | Pode afirmar | Não pode afirmar |
|---|---|---|
| Unitário | Regras do avaliador, mapeamento do adapter para respostas documentadas, cálculo de agendamento | Constraints do banco, comportamento da Twitch |
| API + PostgreSQL (descartável, migrations reais) | Defaults preservados, constraints, uma intenção por redemption, segurança em corridas | Comportamento Helix, UI |
| Worker com fakes | Retry/lease/429 contra o **nosso modelo** da Twitch | Limites reais, latência, Twurple sob carga |
| Browser-only | Papéis no DOM, foco, texto da live region, regras do axe | API real, anúncios de TA, OBS/CEF |
| Chromium no Compose | Painel + API + banco integrados com Twitch falsa | Twitch real, tecnologia assistiva |
| NVDA/VoiceOver manual | Anúncios e usabilidade do build testado | Cobertura além do checklist |
| **Twitch real** | — | **Bloqueio documentado:** exige canal afiliado de teste, inscritos (inclusive presenteados), escopos opcionais e novo consentimento; Prime, streamer na própria lista, orçamento real de 429 e latência seguem NÃO VERIFICADOS |

Limitações: documentação lida uma vez em 2026-10-21; a página do Prisma reflete a v7, não a 6.19.3 fixada; nenhuma fonte comunitária sobre testes de corrida foi lida a fundo; nada disto substitui rodar os testes no projeto.

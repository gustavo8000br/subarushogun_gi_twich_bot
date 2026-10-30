# Estudo de migração do backend (custo de reescrever o backend vs endurecê-lo)

[English](../../process/backend-migration-study.md)

**Data:** 2026-10-27. **Autora:** `@architect` (Aria). **Branch:** `feat/ops-15-next-panel`. **Modo:** análise somente leitura + pesquisa na web. Nenhum código, configuração, teste ou story foi alterado. Nenhum servidor, Docker ou teste foi executado (havia uma instância de dev em uso).

**Pergunta do proprietário (2026-10-27):** "Compare os custos de migrar o backend inteiro para um mais eficiente e compatível com o modelo de trabalho que precisamos."

**Resposta curta:** **não** migrar a linguagem agora. Os defeitos que motivaram a pergunta (propriedade do Twurple que não existe, `statusCode` vs `status`, fakes que não refletem a biblioteca) são **defeitos de fronteira de tipos que o próprio verificador de tipos do repositório está configurado para não pegar** (`tsconfig.json` tem `"strict": false` e os parâmetros do adaptador não têm tipos JSDoc). Qualquer linguagem de destino ainda precisaria de bindings tipados para a Twitch, e nenhuma tem biblioteca Twitch tão completa quanto o Twurple 8.2.0. Uma reescrita custa estimados **10 a 24 semanas-pessoa com agentes** (Go/Rust/.NET) e congela OPS-15/OPS-20/OPS-21; endurecer o backend Node atual custa **2,5 a 5 semanas-pessoa**, pode ser fatiado e não congela entregas. O tempo de CI/testes é custo de **processo** (PostgreSQL em Docker, `next build`, Compose), que trocar de linguagem não remove.

## 1. Premissas do modelo de trabalho usadas

Fontes: `AGENTS.md`, `CLAUDE.md`, `.claude/rules/*.md`, `docs/process/backlog-inventory.md`, `docs/stories/OPS-15/*` (auditoria da suíte, pesquisa de sincronização de resgates, revisão de defeitos do painel).

| # | Premissa | Fonte |
|---|---|---|
| A1 | Produto local instalado no PC da pessoa streamer: Docker Compose + instalador por plataforma (Ubuntu validado, Windows planejado, macOS não validado) | AGENTS.md, `apps/infra/installer` |
| A2 | Um proprietário + agentes de IA; `@dev` test-first, `@qa` gate final independente, `@devops` comita | CLAUDE.md, regra agent-authority |
| A3 | CLI First, JavaScript ESM com JSDoc, Node 24.20.0 fixado | Constitution, `package.json` |
| A4 | Garantias de PostgreSQL só com PostgreSQL descartável e migrations reais, nunca SQLite/mocks | CLAUDE.md |
| A5 | Erros: texto genérico localizado + `referenceId`; logs sem corpo de chat, UID, tokens, headers | CLAUDE.md |
| A6 | Resultados `unknown` da Twitch ficam na outbox em estado seguro; resposta ausente nunca é confirmação | CLAUDE.md |
| A7 | Atualização do painel em tempo real via SSE (decisão do proprietário em 2026-10-27, conforme o pedido) | pedido; revisão de defeitos do painel F7 |
| A8 | `legacy` não é alvo de rollback; sem cutover sem autorização do proprietário | CLAUDE.md |
| A9 | Documentação, stories e changelogs bilíngues | CLAUDE.md |

## 2. Medições (estáticas, somente leitura; `wc -l`, `grep`, `find`)

| Item | Valor | Nível de evidência |
|---|---|---|
| Código do backend `apps/api/src` | **7.524 linhas em 45 arquivos** (`.mjs`) | Medido |
| Por módulo | persistence 2.679 (só `queue-repository.mjs` tem 2.460); twitch 1.332 (11 arquivos); http 1.118 (6); outbox 755 (5); commands 709 (5); domain 458 (8); server/runtime/health/web/config 391; observability 82 | Medido |
| Código compartilhado `apps/shared` | 1.300 linhas (localization 511, panel 705, browser 84); usado também pelo painel Next e pelo overlay | Medido |
| Outros apps (não backend) | `apps/frontend` 4.905, `apps/web` (vanilla, a remover) 1.430, `apps/infra` 728 | Medido |
| Rotas HTTP | **48** registros de rota (≈40 caminhos `/api/*` distintos + `/health`, `/callback`, overlay) | Medido (grep) |
| Workers / loops | 5 (`financial-worker`, `reward-worker`, `chat-worker`, `loop`, `timeout-loop`) | Medido |
| Módulos de comandos de chat | 5 (parser, catalog, authorization, help, chat-handler) | Medido |
| Prisma | 11 models, schema de 207 linhas, **14 migrations** | Medido |
| Dependências externas críticas | `fastify` 5.12.5, `@fastify/static`, `@prisma/client`/`prisma` 6.19.3 + `@prisma/adapter-pg` + `pg`, `@twurple/api`/`auth`/`eventsub-ws` 8.2.0 | Medido (`package.json`, imports) |
| Imports de bibliotecas de terceiros no backend | só 9 pontos (Twurple 4, Prisma/pg 3, Fastify 2) | Medido: o acoplamento às bibliotecas é **estreito** |
| Testes | unit 143 arquivos / 946 ocorrências `it|test` (1.286 em execução, pela auditoria); integração 21 arquivos / 250; e2e 15 scripts de navegador | Medido; contagem em execução da auditoria da suíte |
| Testes que tocam o backend | ≈63 arquivos unitários e 8 de integração referenciam `apps/api`/twitch/outbox | Medido (grep, aproximado) |
| Verificação de tipos | `tsc --noEmit` com `allowJs`, `checkJs`, **`strict: false`**; TypeScript 7.0.2; tags JSDoc no backend: 92 (≈1 a cada 80 linhas); 0 diretivas `@ts-` | Medido |
| Exemplo da classe de bug | `redemptionStatus(value)` tem `value` sem tipo, então `value?.status` compila embora `HelixCustomRewardRedemption` não tenha getter `status`; `error.status` é verificado onde o Twurple lança `HttpStatusCodeError.statusCode` | VERIFIED (`helix-adapter.mjs:15-19`, nota #20) |
| Tempo da suíte | `npm test` completo 105 s em paralelo / 240 s serial; o tempo está em 7 arquivos que sobem PostgreSQL + `migrate deploy`, na stack Compose e num `next build` completo | De `test-suite-audit-2026-10-23.md` (medido lá sob carga) |
| CPU/memória do backend no PC da pessoa streamer | **Não medido**. Nenhum perfil, incidente ou story relata pressão de CPU/RAM. Carga: um canal, poucos eventos por minuto, polling a cada 1–5 s | UNVERIFIED (lacuna) |

### 2.1 Ineficiência de runtime vs de processo

- **Processo (medido):** o tempo da suíte e do CI é dominado por PostgreSQL em Docker por arquivo, Compose, `next build` e início de workers do Vitest (auditoria da suíte). Reescrever o backend em Go/Rust mantém a integração com PostgreSQL (A4), o build do Next e a stack Compose, então remove quase nada desse tempo; e ainda acrescenta uma segunda toolchain no CI.
- **Runtime (não medido, ganho esperado baixo):** um processo Node 24 + Fastify + Prisma fica ocioso na ordem de dezenas de MB a ~100+ MB de RSS, enquanto um binário Go fica em unidades a dezenas de MB (UNVERIFIED para este app: conhecimento geral, sem medição do projeto). Num PC de streamer que já roda Docker Desktop/PostgreSQL e OBS, o processo do backend não é o maior consumidor; PostgreSQL e Docker são, e continuam em todas as opções.
- **Conclusão:** ≈ toda a "ineficiência" observada é de processo. O único argumento de runtime com peso real é **distribuição** (binário único vs Node + Docker), não CPU.

## 3. Alternativas e ecossistema (pesquisa 2026)

Notas existentes reaproveitadas (sem repetir): #1 stack FND-0, #5 FND-9, #6 OPS-3, #9 OPS-7, #10 OPS-8, #13/#14 contrato de API, #17 estratégia de testes OPS-20, #20 sincronização de resgates.

| Tema | Achado | Nível | Fonte (consultada em 2026-10-27) |
|---|---|---|---|
| Cliente Twitch em Go | `nicklaw5/helix` só Helix, "best effort"; último push visto 2025-03-24; sem transporte EventSub WebSocket encontrado; fork `litui/helix/v3` 3.0.1 (2025-01-08) só tem constantes EventSub | PARTIAL | [README](https://github.com/nicklaw5/helix/blob/main/README.md), [ecosyste.ms](https://awesome.ecosyste.ms/projects/github.com%2Fnicklaw5%2Fhelix), [pkg.go.dev litui](https://pkg.go.dev/github.com/litui/helix/v3) |
| Cliente Twitch em Rust | `twitch_api` (twitch-rs) 0.8.0 no docs.rs: Helix + tipos EventSub; o cliente WebSocket é montado pela aplicação (exemplos), sem listener gerenciado como o do Twurple | PARTIAL | [docs.rs](https://docs.rs/crate/twitch_api/latest), [GitHub](https://github.com/twitch-rs/twitch_api) |
| Cliente Twitch em .NET | `TwitchLib.EventSub.Websockets` estável 0.7.0 (2025-09-19), muitas previews; pré-1.0 | PARTIAL | [NuGet](https://packages.nuget.org/packages/TwitchLib.EventSub.Websockets/0.6.0-preview-dbc970c) |
| Linha de base Twurple | 8.2.0 fixado: auth provider com refresh, Helix, `EventSubWsListener`, `.d.ts` tipados, rate limiter | VERIFIED | notas #9, #10, #17, #20 (código instalado) |
| SSE no Fastify | `@fastify/sse` na organização fastify (rota `sse: true`, replay por `Last-Event-ID`, heartbeat), README 0.4.0; escrita direta em `reply.raw` também funciona | PARTIAL (versão/maturidade não confirmadas) | [README (espelho)](https://cdn.jsdelivr.net/npm/@fastify/sse@0.4.0/README.md) |
| Type stripping no Node | Relatado como estável no Node 24.12 LTS; só sintaxe apagável, sem checagem de tipos | PARTIAL (terceiros; página oficial não confirmada) | [blog](https://x-cmd.com/blog/251218), [docs Node (nightly)](https://nodejs.org/download/nightly/v24.0.0-nightly20250421e773e09c3f/docs/api/typescript.html) |

**Observação-chave:** em qualquer outra linguagem o projeto escreveria ou adotaria uma camada Twitch **menos madura** que o Twurple, e as 1.332 linhas de `apps/api/src/twitch` (OAuth, refresh, EventSub, Helix, reconciliação, recompensas) são justamente o código já validado ao vivo. Reescrever leva a área de maior risco para a biblioteca menos madura.

### 3.1 Alternativas

- **(a) Ficar no Node e endurecer (linha de base):** checagem estrita dos tipos JSDoc (ou `.ts` via type stripping depois), adaptadores tipados sobre classes reais do Twurple, mapeamento de erros, testes de contrato com instâncias reais do Twurple, SSE no Fastify.
- **(b) Node + NestJS:** mesmo runtime e bibliotecas (Twurple/Prisma utilizáveis), acrescenta DI/módulos/decorators. Sozinho não corrige a classe de bug (os tipos continuam mentindo nas fronteiras `any`); reescreve roteamento, wiring e a maior parte dos testes; decorators TypeScript conflitam com a regra JSDoc/ESM.
- **(c) Go:** binário único, pouca memória, bom feedback do compilador, SSE (`net/http` com flush) e PostgreSQL (`pgx`, `sqlc`, `goose`/`atlas`) bons. A camada Twitch teria de ser escrita em grande parte à mão (sessão EventSub WS, reconexão/keepalive, refresh). Boa ergonomia para agentes.
- **(d) Rust:** garantias mais fortes, `twitch_api` + `sqlx`; maior esforço, feedback de compilação mais lento, mais difícil para um único proprietário revisar código gerado por agentes.
- **(e) .NET:** publicação single-file multiplataforma, migrations do EF Core, TwitchLib pré-1.0. Python/FastAPI descartado: tipagem mais fraca que TS strict, sem ganho de distribuição.

## 4. Matriz comparativa

Notas 1–5 (5 é melhor). Pesos: risco 30%, custo 25%, ergonomia com agentes 15%, aderência às regras do projeto 15%, distribuição 10%, desempenho 5%.

| Critério (peso) | (a) Node endurecido | (b) NestJS | (c) Go | (d) Rust | (e) .NET |
|---|---|---|---|---|---|
| Risco (30) | 5 | 3 | 2 | 1 | 2 |
| Custo (25) | 5 | 3 | 2 | 1 | 2 |
| Ergonomia com agentes (15) | 4 | 3 | 5 | 3 | 4 |
| Aderência às regras (15) | 5 | 2 | 1 | 1 | 1 |
| Distribuição (10) | 2 | 2 | 5 | 5 | 4 |
| Desempenho (5) | 3 | 3 | 5 | 5 | 4 |
| **Total ponderado** | **4,50** | **2,75** | **2,75** | **2,10** | **2,40** |

Aderência às regras: qualquer backend fora de JS quebra "JavaScript ESM com JSDoc", a fixação do Node, o código compartilhado em `apps/shared` (localização e projeções do painel usadas pelo frontend) e o ferramental atual de `@dev`/`@qa`; exige mudança de regra pelo proprietário.

## 5. Custo de migrar (faixas, semanas-pessoa de trabalho com agentes, revisão do proprietário incluída)

| Item | (b) NestJS | (c) Go | (d) Rust | (e) .NET |
|---|---|---|---|---|
| Módulos a reescrever | 45 arquivos reestruturados, lógica em boa parte portável | 45 arquivos / 7,5 mil linhas + camada de cliente Twitch | idem + camada WS da Twitch | idem |
| Camada Twitch (OAuth, refresh, EventSub WS, Helix, reconciliação) | reaproveita Twurple | 2–4 | 3–5 | 2–3 |
| Persistência (2,7 mil linhas, 11 models, 14 migrations; Prisma → sqlc/pgx+goose, sqlx, EF Core) | 0,5–1 | 2–3 | 3–4 | 2–3 |
| HTTP (48 rotas, handler seguro de erros, sessão, CSRF, overlay) + SSE | 1–2 | 1,5–2,5 | 2–3 | 1,5–2,5 |
| Workers da outbox + comandos + domínio | 1–2 | 2–3 | 3–4 | 2–3 |
| Testes: ≈63 arquivos unitários + 8 de integração do backend reescritos; E2E mantidos (contrato HTTP) | 2–3 | 3–4 | 3–5 | 3–4 |
| CI/CD, Dockerfile, instalador, build multi-SO, documentação bilíngue | 0,5 | 1–2 | 1–2 | 1–2 |
| Revalidação ao vivo com a Twitch (recompensas, reembolsos, chat) | 0,5–1 | 1–2 | 1–2 | 1–2 |
| **Total** | **6–10** | **12–18** | **16–24** | **12–18** |

Custos e riscos comuns a qualquer reescrita:
- **Congelamento de entregas:** cutover da OPS-15, reembolsos da OPS-20, OPS-21 e as correções de sincronização de resgates param ou precisam ser feitos duas vezes. Com um único proprietário revisando, realisticamente 3–5 meses de calendário.
- **Migração de dados:** o schema PostgreSQL pode ficar (os dados não são movidos), mas o histórico de migrations precisa ser rebaselinado na nova ferramenta; `_prisma_migrations` teria de ser reconciliada nas cópias instaladas. Risco para linhas financeiras da outbox em estado `unknown` (A6).
- **Risco de regressão:** todo comportamento Twitch validado ao vivo é reaprendido; é exatamente de onde vieram os bugs recentes.
- **Segurança:** novo código de OAuth/armazenamento de token, sessão/CSRF e redação de logs precisa ser revisado de novo; as regras do OpenGrep são orientadas a JS e precisariam de novos rulesets.
- **Regra `legacy`:** não há rollback para o backend antigo; uma reescrita malsucedida teria de seguir em frente.

## 6. Custo de NÃO migrar e do caminho intermediário

**Custo de não fazer nada:** a classe de bug volta a cada nova superfície Twitch (a OPS-20 acrescenta Subscriptions/reembolsos). Evidência recente: um getter errado deixou operações financeiras em `unknown` e bloqueou a exclusão de fila (nota #20); o descompasso `statusCode` faz 401/403/404 reais parecerem transitórios. Custo recorrente estimado: 0,5–1,5 semana-pessoa por incidente (diagnóstico + pesquisa + correção + reteste ao vivo), além do tempo do proprietário em live.

**Caminho intermediário (recomendado):** manter Node/Fastify/Prisma/Twurple e fechar a lacuna de tipos. Esforço de **2,5–5 semanas-pessoa**, fatiado, sem congelar entregas. Por que corrige a classe: com `strict` (no mínimo `noImplicitAny` + `strictNullChecks`) e `@param {HelixCustomRewardRedemption} value`, `value.status` vira erro de compilação, e `error.statusCode` passa a ser o único campo acessível após `instanceof HttpStatusCodeError`. Testes de contrato que constroem instâncias **reais** do Twurple (não objetos simples) fecham a lacuna dos fakes.

## 7. Recomendação

**Não migrar a linguagem do backend agora. Executar o plano de endurecimento incremental (seção 9).** Reavaliar só se um gatilho da seção 8 disparar.

Trade-off aceito: mantemos o custo de distribuição Node + Docker e a memória ociosa maior, em troca de nenhum congelamento, nenhuma reescrita da camada Twitch e aderência total às regras.

## 8. Gatilhos objetivos para reavaliar

Reabrir este estudo (e fazer um spike em Go limitado a 1 semana, só da camada Twitch) se **qualquer** um destes ocorrer:

1. **Distribuição:** o instalador de Windows/macOS exigir abandonar o Docker (decisão do proprietário), ou o suporte ao instalador custar mais de 2 semanas-pessoa por SO por causa de Node/Docker.
2. **Runtime medido:** um perfil num PC de streamer de referência mostrar RSS do backend > 300 MB estável ou > 5% de CPU sustentada em ociosidade, já tendo tentado ajustes do Node.
3. **Classe de bug persiste:** depois de H-01..H-04 entregues, 2 ou mais incidentes em produção em 3 meses ainda causados por formato errado de propriedade/erro de biblioteca.
4. **Ecossistema:** o Twurple deixar de ser mantido (sem release por 12 meses enquanto a Twitch muda EventSub/Helix), ou uma biblioteca Twitch em Go/Rust chegar a 1.x estável com EventSub WebSocket gerenciado e refresh de token.

## 9. Plano de endurecimento incremental (mesmo formato do `backlog-inventory.md`)

Cada fatia precisa de issue GitHub criada pelo `@devops` antes da implementação, `@dev` test-first, `@qa` com gate final. Dificuldade: P ≤ meio dia, M 1–3 dias, G vários dias.

| ID | Item | Tipo | Story / issue | Status no fluxo | Gate atual / próximo e próximo dono | Bloqueado por | Prio | Dif | Requisitos-chave | Linha de raciocínio | Próximo passo concreto |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **H-01** | Mapeamento de erros do Twurple (`statusCode ?? status`, `Retry-After`) numa função usada pelo worker e pelo reconciliador | fatia | correção de sync de resgates (nota #20) | não iniciado | story pelo `@po`; `@dev` | nenhum | P0 | P | 401/403/404/429 reais classificados corretamente; testes com `HttpStatusCodeError` real | Bug financeiro latente (nota #20) | `@sm` rascunha a fatia |
| **H-02** | Adaptador Twitch tipado: tipos JSDoc das classes do Twurple em todas as fronteiras de `helix-adapter`/`eventsub-runtime`; remover o fallback `value.status` | fatia | idem | não iniciado | `@dev` | H-01 | P0 | M | `tsc` falha em getters inexistentes | Raiz da classe de bug | anotar os 11 arquivos de twitch |
| **H-03** | Testes de contrato com instâncias reais do Twurple (classes construídas a partir de fixtures JSON brutas de Helix/EventSub) | teste | idem | não iniciado | `@qa` define; `@dev` | H-02 | P1 | M | Nenhum fake de objeto simples para tipos do Twurple nos testes de twitch | Fakes divergiram da biblioteca | listar fakes nos ≈63 arquivos unitários do backend |
| **H-04** | Checagem estrita só em `apps/api` (`tsconfig.api.json`: `strict: true`, corrigir erros por módulo) | fatia | nova story | não iniciado | `@architect` define a config; `@dev` | H-02 | P1 | G | `npm run typecheck:api` estrito verde; `strict:false` da raiz inalterado até web/infra seguirem | Incremental, módulo a módulo | medir a contagem de erros em strict (uma execução `tsc` somente leitura pelo `@qa`) |
| **H-05** | Contrato HTTP tipado: JSON Schema por rota (nativo do Fastify) + tipos JSDoc compartilhados com o frontend via `apps/shared` | fatia | segue notas #13/#14 | não iniciado | `@dev` | H-04 | P2 | G | 48 rotas validadas na entrada/saída; contrato de erro genérico mantido (A5) | Evita divergência frontend/backend | escolher primeiro 5 rotas de maior valor |
| **H-06** | Canal SSE para o painel (`@fastify/sse` ou direto), revisão de sessão/CSRF, fallback para polling | story | S-G na revisão de defeitos do painel | não iniciado | nota de pesquisa #21 (SSE) já existe; plano `@ux-design-expert` ≥9,0; `@dev` | cutover da OPS-15 | P2 | G | `Last-Event-ID`, heartbeat, sem segredos nos eventos, compatível com proxy | Proprietário decidiu SSE em 2026-10-27 | aplicar a nota #21; pesquisar só LACUNA que ela deixar |
| **H-07** | Dividir `queue-repository.mjs` (2.460 linhas) por agregado | fatia | nova story | não iniciado | `@data-engineer` + `@dev` | H-04 | P2 | G | Sem mudança de comportamento; integração PostgreSQL verde | Maior arquivo, o mais difícil de tipar | planejar a divisão com `@data-engineer` |
| **H-08** | Aceleração do processo de testes (um container PostgreSQL + banco template por arquivo; remover `next build` duplicado) | teste | itens da auditoria da suíte | não iniciado | `@qa` + `@dev` | nenhum | P1 | M | Medição antes/depois | Processo é a ineficiência real | medir duração por arquivo isoladamente |
| **H-09** | Linha de base de runtime: medir RSS/CPU do backend ocioso e sob rajada de eventos reproduzida | teste | nova | não iniciado | `@qa` | nenhum | P3 | P | Números para o gatilho #2 | Fecha a lacuna de runtime | executar no PC de referência quando livre |

Esforço total H-01..H-08: **2,5–5 semanas-pessoa**, paralelizável com OPS-15/OPS-20 quando os conjuntos de escrita não se sobrepõem.

## 10. Decisões do proprietário necessárias

1. Aprovar "não migrar agora" e o plano de endurecimento H-01..H-09 (recomendado: sim).
2. Permitir checagem estrita de tipos por módulo começando por `apps/api` (mantém JS + JSDoc; ainda sem `.ts`). Migrar para arquivos `.ts` com type stripping do Node é decisão separada e posterior (evidência PARTIAL).
3. Confirmar que o Docker continua obrigatório no Windows/macOS (se não, o gatilho #1 dispara).
4. Ordem entre SSE (H-06) e tipagem (H-02..H-04): recomendado tipagem primeiro, SSE depois do cutover da OPS-15.

## Limitações

Sem medição de runtime (instância de dev em uso). As faixas de esforço são estimativas arquiteturais, não velocidade medida. Os achados de ecossistema de Go/Rust/.NET são PARTIAL (páginas de índice, não revisão de código). A contagem de erros em modo strict é desconhecida até uma execução `tsc` somente leitura.

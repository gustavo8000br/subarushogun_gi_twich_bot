# Convenções de linguagem, desempenho e migração para TypeScript (nota de pesquisa, Lote A)

[English](../../../research/2026-11-10-language-conventions-app/README.md)

- Autor: `@analyst` (Atlas). Data: 2026-11-10. Pesquisa de mesa (documentação oficial primeiro) mais medições somente leitura no repositório. Nenhum código, teste, configuração ou estado do git foi alterado. Apenas esta nota e a cópia em inglês foram escritas.
- Reaproveitamento (regra de ouro): a linha 23 de `docs/research-index.md` (`docs/stories/OPS-15/typescript-migration-research.md`, 2026-10-27) é **SUFICIENTE** para type stripping do Node, coexistência, testes de contrato Vitest/Twurple e a primeira análise do Biome. Ela é citada aqui, não repetida. Esta nota reverificou só os **gatilhos de revisão disparados** (TypeScript 7.0 lançado, estado do typescript-eslint, Biome 2.5/2.6, Next 16.4) e as **lacunas** (shutdown do Fastify, pool e consultas lentas do Prisma, profiling do Node, bundles e cache do Next, CSS, validação em tempo de execução).
- Rótulos de evidência: **DOC** = comprovado por documentação oficial ou pelo código instalado; **MEDIR** = depende de medição neste projeto; **COMUNIDADE** = opinião da comunidade ou fonte secundária; **NÃO VERIFICADO** = inferência. Cada recomendação traz um deles, com fonte e data.
- Versões do projeto lidas em 2026-11-10: Node 24.20.0 (fixado; a documentação do Node já mostra 24.22.2, **não troque a versão**), TypeScript 7.0.2, Next 16.4.1, React 19.3.1, Fastify 5.12.5, Prisma e `@prisma/client` 6.19.3 com o driver adapter `@prisma/adapter-pg`, Vitest 5.0.3, ESLint 10.12.0, Twurple 8.2.0.

## 0. Resumo executivo

1. **A migração para TypeScript é viável e de baixo risco para o runtime, e vale a pena na ordem bordas da API primeiro** (`twitch`, `outbox`, `http`), depois `persistence`, depois o restante. O Node 24.20.0 executa `.ts` nativamente (type stripping é Estável desde a v24.12.0, DOC), então a imagem Docker mantém "rodar o código-fonte", sem etapa de build.
2. **O ganho de segurança de tipos vem do `strict`, não da extensão do arquivo.** Medido hoje: a árvore inteira tem **0 erros** com o `strict:false` atual, **276 erros** com `--strict --noImplicitAny false` e **1.349 erros** com `--strict` (MEDIR, TS 7.0.2, 3,1 a 3,9 s por execução completa). Cerca de 75 % dos erros do strict são `any` implícito em parâmetros, que a conversão para anotações resolve de qualquer forma. Logo o custo de "JSDoc strict" e de "`.ts` strict" é parecido; o `.ts` acrescenta churn de renomeação e elimina a verbosidade do JSDoc.
3. **Não espere velocidade de execução do TypeScript.** Os tipos são apagados. O trabalho de desempenho deve vir de medição (Event Loop, memória, consultas lentas, bundle), não da linguagem (seções 5 a 7).
4. **Biome + `tsc --noEmit` continua sendo o gate de lint e de tipos recomendado** por ora. O typescript-eslint ainda não usa o TypeScript 7 (a API chega com a 7.1; o suporte está em revisão interna, 2026-09-29). As regras de Promise do Biome (`noFloatingPromises`, `noMisusedPromises`) ainda são **nursery** (DOC, lido em 2026-11-10).
5. **Achado mais valioso fora do TypeScript:** o caminho de shutdown da API (`apps/api/src/server.mjs`) não tem timeout, nem `try/catch`, nem saída forçada de reserva, e só fecha o servidor HTTP depois que os workers param. Isso é um contribuinte plausível do travamento da API sob `node --watch`. É uma **hipótese a medir**, não causa raiz confirmada (seção 4).
6. **O Prisma roda dois pools** (o adapter `PrismaPg` e um `pg.Pool` separado, ambos com os padrões do `pg`). Merece decisão consciente do `@data-engineer` (seção 5).
7. **Custo estimado:** cerca de 12 a 15 ciclos `@dev` + `@qa` (um ciclo = uma fatia/PR) para a API, coerente com as 5 a 7,5 pessoas-semana da nota #23 (NÃO VERIFICADO; reestimar após a fatia canário).

## 1. TypeScript no Node 24 (reverificado)

| Item | Achado | Rótulo / fonte |
|---|---|---|
| Estabilidade | Type stripping é **Stability 2 - Stable desde a v24.12.0**; aviso removido na 24.3.0; ligado por padrão desde a 23.6.0. A página já mostra a v24.22.2. | DOC, [Node 24 TypeScript](https://nodejs.org/docs/latest-v24.x/api/typescript.html), 2026-11-10 |
| Sem suporte sem `--experimental-transform-types` | `enum`, `namespace` com código em tempo de execução, parameter properties, `import x = ...`. Decorators falham no parse. `.tsx` não é suportado. Namespaces só de tipos funcionam. | DOC, mesma página |
| `tsconfig.json` | O Node **o ignora**; `paths` gera erro (use subpath imports iniciados por `#`). | DOC, mesma página |
| Imports | A extensão é obrigatória (`./x.ts`); imports só de tipo exigem `import type` (ou `verbatimModuleSyntax`). O Node recusa `.ts` dentro de `node_modules`. As linhas de stack trace são preservadas (tipos viram espaços). | DOC, mesma página |
| Flags recomendadas | `noEmit`, `target: esnext`, `module: nodenext`, `rewriteRelativeImportExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`. | DOC, mesma página |
| TypeScript 7.0 (2026-07-08) | Compilador nativo, builds completos 8 a 12x mais rápidos; **sem API programática até a 7.1**; `@typescript/typescript6` fornece o `tsc6` para ferramentas; `strict` passa a ser `true` por padrão, `types` padrão `[]`, `rootDir` padrão `./`; `--checkers`, `--builders`, `--singleThreaded` são experimentais. | DOC, [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), 2026-11-10 |
| Quebras de JSDoc na 7.0 | `@enum` não reconhecido, `@class` não cria mais construtores, `?` isolado inválido, `!` pós-fixo sem suporte etc. **Este repositório tem 0 usos** de `@enum`, `@class`, `@constructor` ou `@this` (grep; 368 tags JSDoc no total), logo não é afetado. | DOC + MEDIR (grep no repo) |
| `tsconfig.json` atual | Define `strict:false` explicitamente, então o novo padrão da 7.0 não muda o comportamento. Mantenha valores explícitos; não dependa de padrões após upgrades. | MEDIR (repo) |
| `tsc` como gate, custo de build | `tsc -p tsconfig.json --noEmit` sobre 15,8 mil linhas de `apps/` levou **3,9 s** (0 erros); a mesma execução com `--strict --noImplicitAny false` levou 3,1 s. O custo no CI é desprezível; as partes pesadas do CI continuam sendo o PostgreSQL em Docker e o `next build`. | MEDIR (2026-11-10, TS 7.0.2) |
| Coexistência `.mjs` <-> `.ts`, Vitest `.ts` | Já analisados: manter `allowJs` + `checkJs`, incluir `.ts` em `include`, `allowImportingTsExtensions`, importadores trocam `./x.mjs` por `./x.ts` na mesma fatia; o `include` do Vitest precisa aceitar `.ts`. | Nota #23 (SUFICIENTE) |
| Transformação no Vitest | O Vitest anuncia suporte embutido a TypeScript/JSX, mas a página lida **não** informa qual transformador é usado nem que os tipos não são checados; erros de tipo em testes só o `tsc` pega, se os testes estiverem em algum tsconfig. | DOC (parcial), [Vitest features](https://vitest.dev/guide/features.html), 2026-11-10; MEDIR o tempo de transformação |

Recomendação de convenção: manter `erasableSyntaxOnly` + `verbatimModuleSyntax` desde o primeiro arquivo `.ts` (DOC). Proibir `enum` e `namespace` de runtime; usar objetos `as const` mais um tipo união (COMUNIDADE, padrão amplamente usado).

## 2. Convenções modernas de JS/TS

| Convenção | Recomendação | Rótulo |
|---|---|---|
| ESM, extensões em imports relativos | Já é o estilo do repo (`.mjs`). Manter extensões explícitas; elas são obrigatórias para `.ts` de todo modo. | DOC (página do Node) |
| `strict` progressivo | Escada em um segundo tsconfig por pasta: (1) `strictNullChecks` e afins (`--strict --noImplicitAny false`: 276 erros no repo todo), (2) `noImplicitAny` por pasta convertida (mais 1.073 erros, quase todos anotações de parâmetro). Virar `strict: true` na raiz só quando todos os arquivos da API estiverem convertidos. | MEDIR (contagens) + Nota #23 |
| Promises | Sem promises flutuantes em workers e no código de shutdown. As regras `noFloatingPromises` (desde a v2.0.0) e `noMisusedPromises` do Biome existem, mas são **nursery**, severidade "information", com correções inseguras, e ativam o scanner de projeto e a inferência de tipos. Usar como `warn` só em `apps/api`, após checar falsos positivos. | DOC, [noFloatingPromises](https://biomejs.dev/linter/rules/no-floating-promises/), 2026-11-10; MEDIR (taxa de falso positivo) |
| Tratamento de erros | Manter a regra do projeto (texto genérico seguro + `referenceId`, sem stack para clientes). Em TS, ligar `useUnknownInCatchVariables` (parte do `strict`) e estreitar erros com um helper; nunca `catch (e: any)`. | DOC (referência do tsconfig, parte do `strict`) / opinião sobre o helper |
| Tipos de JSON e DTO | Tipos do Prisma e de `JSON.parse` existem só em tempo de compilação. Tudo que vem da rede, de coluna JSON ou do ambiente deve ser validado na fronteira. O Fastify já valida corpos com JSON Schema (Ajv); derive os tipos TS do mesmo schema (seção 4). | DOC (Fastify) |
| `satisfies` | Usar em configurações e tabelas de consulta para manter o tipo literal enquanto o formato é checado (recurso do TS 4.9). | COMUNIDADE/DOC (handbook do TS, não relido aqui); baixo risco |
| Schemas em tempo de execução | Preferido neste projeto: **JSON Schema puro + `json-schema-to-ts`** (sem nova biblioteca de runtime, nativo do Fastify). Alternativas com providers oficiais do Fastify: TypeBox e Zod. Escolha uma por módulo e não misture no mesmo escopo de plugin. | DOC, [Fastify type providers](https://fastify.dev/docs/latest/Reference/Type-Providers/), 2026-11-10 |
| `as const` em schemas em variáveis | Exigido com json-schema-to-ts; sem ele `type: 'object'` alarga para `string` e a inferência quebra; sem efeito em runtime. | DOC (mesma página) |
| Código não usado | Manter `no-unused-vars` com ignorar `_` (ESLint hoje, `noUnusedVariables` no Biome). | Nota #23 |

## 3. React e Next 16 App Router

Fatos do repo (MEDIR, 2026-11-10): 33 arquivos `.jsx` (3.289 linhas) em `apps/frontend`, 18 deles começam com `'use client'`; o `next.config.mjs` delega a `scripts/next-runtime-config.mjs`, que só configura `rewrites` (sem `typedRoutes`, sem `cacheComponents`); não há uso de `next/dynamic` nem de `React.lazy`.

| Tema | Achado | Rótulo / fonte |
|---|---|---|
| Server vs Client | Layouts e páginas são Server Components por padrão. Use Client Components só para estado, handlers, efeitos e APIs do navegador. **Um arquivo `'use client'` leva todos os seus imports e os componentes que renderiza diretamente para o bundle do cliente**; empurre a diretiva para a folha interativa. Props que cruzam a fronteira precisam ser serializáveis; filhos de servidor passam por `children`. Providers devem envolver o mais fundo possível. `server-only` é opcional, mas gera erro em tempo de build. | DOC, [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) (atualizada 2026-10-05), lida em 2026-11-10 |
| Hidratação | HTML primeiro, o RSC payload reconcilia as árvores, o JS hidrata os Client Components; navegações seguintes renderizam Client Components só no cliente. Para um painel de operador majoritariamente interativo e ao vivo, ganhos grandes de RSC não são óbvios: **meça** o JS hidratado por rota antes de refatorar. | DOC + MEDIR |
| Medição de bundle | `next analyze` (analisador de bundle do Turbopack, **desde a v16.1**) filtra por rota e cliente/servidor e rastreia cadeias de import; `--output` grava `.next/diagnostics/analyze` para comparar antes/depois; `next analyze export` emite JSON Lines (**v16.4+**, disponível na 16.4.1). `@next/bundle-analyzer` é o caminho do **Webpack**. Use `next analyze --output` como rota sem dependência nova. | DOC, [Package bundling](https://nextjs.org/docs/app/guides/package-bundling) (atualizada 2026-10-15) |
| Carregamento tardio | Mover trabalho pesado e não interativo (realce de sintaxe, gráficos, markdown) para Server Components; `optimizePackageImports` para pacotes com muitos exports. Aplicar **somente** depois que o analisador mostrar um módulo grande. | DOC (mesma página); MEDIR |
| Rotas tipadas | `typedRoutes: true` exige projeto TypeScript e gera `.next/types`; hrefs não literais precisam de `as Route`. Os helpers `PageProps`, `LayoutProps`, `RouteContext` são gerados por `next dev/build/typegen`. Esses benefícios só chegam quando o frontend for para `.tsx`. | DOC, [Next TypeScript](https://nextjs.org/docs/app/api-reference/config/typescript) (atualizada 2026-08-25) |
| TypeScript 7 no Next | O Next usa o CLI `tsc` local do projeto no `next build` por padrão (então o TS 7 funciona), imprime diagnósticos nativos e checa o tsconfig inteiro (testes incluídos se estiverem nele). `experimental.useTypeScriptCli` é experimental. O `next.config.ts` existe, mas a configuração `.mjs` pode ficar. | DOC (mesma página) |
| Cache e revalidação | Cache Components (`cacheComponents: true`, `'use cache'`, `cacheLife`, `cacheTag`, Partial Prerendering) é **opt-in** em apps existentes; a doc diz que ele e o Partial Prefetching serão ligados em todo lugar no próximo major. Para um painel local, autenticado, com dados ao vivo, o ganho esperado é pequeno. **Não ligar agora**; rever quando o Next 17 for anunciado. | DOC, [Caching](https://nextjs.org/docs/app/getting-started/caching) (atualizada 2026-10-06); opinião sobre aplicabilidade |

## 4. Fastify 5

O código instalado foi verificado: `handlerTimeout`, `preClose`, `forceCloseConnections` e `return503OnClosing` existem no Fastify 5.12.5 (DOC, `node_modules`).

| Tema | Achado | Rótulo / fonte |
|---|---|---|
| Sequência de fechamento | `close()` marca o fechamento, roda os hooks `preClose` (requisições ainda ativas), drena conexões conforme `forceCloseConnections`, para de escutar, roda `onClose` e então resolve. | DOC, [Server reference](https://fastify.dev/docs/latest/Reference/Server/), 2026-11-10 |
| Opções de conexão | `forceCloseConnections` padrão `"idle"` (keep-alive ocioso é destruído, **requisições em andamento continuam**); `true` destrói conexões persistentes; `return503OnClosing` padrão `true`; `keepAliveTimeout` 72 s; `connectionTimeout` 0; `requestTimeout` 0 (a doc recomenda valor não zero, por exemplo 120 s, sem proxy reverso); `handlerTimeout` 0 (503 + `request.signal` abortado ao expirar, cooperativo). Conexões upgradadas não são rastreadas e podem bloquear o `close()`; feche-as em `preClose`. | DOC (mesma página) |
| Rotas tipadas | Type providers oficiais: `@fastify/type-provider-json-schema-to-ts`, `-typebox`, `-zod`; reaplique `withTypeProvider` em cada plugin encapsulado; para schemas em variáveis use `as const`. | DOC, página Type Providers |
| Plugins e encapsulamento | Manter módulos de rota como plugins que recebem um `FastifyInstance` tipado; não alterar estado global a partir de plugins. | Notas #13 / #21 (SUFICIENTE) |
| Backpressure | Não documentado como recurso automático para streaming próprio. Limite filas e escritas no código da aplicação (concorrência de workers, buffers por cliente no SSE). O desenho do SSE já está na nota #21. | NÃO VERIFICADO (a doc é silenciosa) |

**Leitura do repo (`apps/api/src/server.mjs`, `runtime.mjs`, MEDIR por leitura de código):**

- `Fastify({ logger: false, bodyLimit: 32 * 1024, https })` usa todos os timeouts nos padrões (`requestTimeout`, `handlerTimeout`, `connectionTimeout` = 0).
- `SIGTERM`/`SIGINT` chamam `shutdown()` com `void`; `shutdown()` **não tem `try/catch`, nem timeout, nem caminho de saída**. `runtime.stop()` executa em sequência: loops de workers, loop de timeout, integração Twitch, `app.close()`, `prisma.$disconnect()`, `pool.end()`. Uma etapa que nunca resolve mantém o processo vivo para sempre; uma exceção vira rejeição não tratada.
- O servidor HTTP **continua aceitando requisições enquanto os workers e a integração Twitch param** (ele é fechado em quarto lugar).
- O `node --watch` (`apps/frontend/scripts/dev-runtime-config.mjs`) reinicia matando o processo; `--watch-kill-signal` existe desde a v24.4.0 (Active development) e o trecho da doc lido **não** informa o sinal padrão. Portanto o travamento é **plausivelmente** um destes: uma etapa de `runtime.stop()` esperando um tick em andamento, um handle aberto (WebSocket do Twurple, cliente do pool) ou uma conexão ativa (não ociosa). **Não confirmado.**
- **Receita de medição (sem alterar código de produção):** enviar SIGTERM a uma API de desenvolvimento em execução, marcar o tempo de cada etapa do `stop()` e imprimir `process.getActiveResourcesInfo()` após 5 s. O resultado é a evidência de causa raiz.
- **Convenção recomendada (opinião, prática padrão, MEDIR o efeito):** envolver `shutdown()` em `try/catch`, dar timeout a cada etapa, adicionar um hook `preClose` que encerre streams longos (necessário antes do SSE), considerar fechar o servidor HTTP **primeiro** (ele já responde 503 ao fechar) e adicionar um timer de saída forçada com `unref` para que uma etapa travada não prenda o processo.
- Definir `requestTimeout` explícito e um `handlerTimeout` conservador só depois de medir a rota legítima mais lenta (NÃO VERIFICADO quais valores são seguros).

## 5. Prisma e PostgreSQL

Mudanças de banco continuam com o `@data-engineer`; esta seção lista itens de medição, não decisões de schema.

| Tema | Achado | Rótulo / fonte |
|---|---|---|
| Tipos | `prisma-client-js` já gera `index.d.ts`; nenhuma mudança de generator é necessária (Nota #23). O Prisma 7 deprecia o `prisma-client-js` e torna driver adapters o padrão; **ficar na 6.19.3** até uma story de upgrade deliberada. | Nota #23; DOC (páginas v7) |
| Pools | A doc (engine v6) define `connection_limit` padrão = CPUs físicas x 2 + 1, `pool_timeout` 10 s, `connect_timeout` 5 s. Com driver adapter o pool pertence ao driver; a página diz que o `pg` usa `max` 10 por padrão na v7. **Este projeto cria `new PrismaClient({ adapter: new PrismaPg(...) })` e também `new pg.Pool(...)`**, então há dois pools independentes (até 2 x 10 conexões pelos padrões do `pg`, NÃO VERIFICADO para o adapter 6.19.3). Tornar os tamanhos explícitos e documentar o total frente ao `max_connections` do Postgres. | DOC, [Connection pool](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool), 2026-11-10; MEDIR |
| Consultas lentas | Habilitar eventos de consulta com `log: [{ emit: 'event', level: 'query' }]` e `prisma.$on('query', e => ...)` (campos `query`, `params`, `duration` em ms). No PostgreSQL descartável usar `pg_stat_statements` (exige `shared_preload_libraries`, `CREATE EXTENSION`, `compute_query_id`; `track = top` por padrão; memória compartilhada proporcional a `max`, padrão 5000 entradas). O Query Insights do Prisma é do Prisma Postgres, então não se aplica aqui. | DOC, [Prisma logging](https://www.prisma.io/docs/orm/prisma-client/observability-and-logging/logging), [PostgreSQL pg_stat_statements 18](https://www.postgresql.org/docs/current/pgstatstatements.html), 2026-11-10 |
| `EXPLAIN` | Rodar `EXPLAIN (ANALYZE, BUFFERS)` nas instruções ordenadas por `total_exec_time`, em um banco descartável com volume realista. | COMUNIDADE/prática padrão (docs do EXPLAIN do PostgreSQL não relidas) |
| N+1 | O Prisma define como uma consulta extra por resultado em um laço; remédios: `include`, filtro `in`, `relationLoadStrategy: "join"` (só para filtros simples de igualdade), agrupar `findUnique`. `findMany` não é agrupado. Indício no repo: `queue-repository.mjs` tem 22 `await` dentro de laços `for` (grep; pode ser trabalho sequencial intencional dentro de transações). **Apenas candidatos; confirmar com logs de consulta.** | DOC, [Query optimization](https://www.prisma.io/docs/orm/prisma-client/queries/query-optimization-performance); MEDIR |
| Transações | Manter mudanças de dinheiro/fila em uma única transação e verificar com testes de integração em PostgreSQL real (regra do projeto). | Regra do projeto |

## 6. Desempenho do Node (medir primeiro)

| Ferramenta | O que entrega | Rótulo / fonte |
|---|---|---|
| `performance.eventLoopUtilization()` (alias em `perf_hooks` desde a v24.12.0) | `idle`, `active`, `utilization` (ELU) acumulados ou como delta entre duas amostras; mede o tempo fora do provedor de eventos, **não CPU**. | DOC, [perf_hooks](https://nodejs.org/docs/latest-v24.x/api/perf_hooks.html), 2026-11-10 |
| `perf_hooks.monitorEventLoopDelay({ resolution })` | Histograma de atraso do Event Loop; a opção `samplePerIteration` foi adicionada na v24.19.0. Os campos do histograma e as unidades estavam na parte não lida da página; leia-os antes de usar. | DOC (parcial) |
| `--cpu-prof`, `--heap-prof` | Estáveis desde a v22.4.0 / v20.16.0; geram `.cpuprofile` / `.heapprofile`; `--cpu-prof-dir`, `--cpu-prof-interval` (padrão 1000 us), `--heap-prof-interval` (padrão 512 KiB). Abrir os arquivos no Chrome DevTools ou no Firefox Profiler; **nada a instalar**. | DOC, [Node CLI](https://nodejs.org/docs/latest-v24.x/api/cli.html), 2026-11-10 |
| `process.memoryUsage()` / `resourceUsage()` | Números de RSS e heap para uma linha de log periódica. | DOC (API conhecida, não relida) |
| `autocannon`, `clinic` | Geração de carga e flame graphs. Exigem instalação via npm. **Não instalar globalmente**: executar com cache e prefixo do npm **dentro do projeto** (por exemplo `npm exec --cache .local/npm-cache --prefix .local/tools ...`) ou adicionar uma devDependency fixada somente com aprovação do dono. O estado de manutenção do `clinic` não foi verificado. | COMUNIDADE / NÃO VERIFICADO |

Convenção: primeiro coletar uma linha de base (ocioso e sob carga roteirizada) de ELU, p99 do atraso, RSS e heap por 10 minutos com os workers Twitch rodando; só um indicador que cruze um limite combinado abre uma story de otimização. Isso deixa mensuráveis os gatilhos da pesquisa #22 do índice. Streams e filas limitadas se aplicam quando um caminho move dados grandes ou ilimitados; os loops do outbox são os candidatos (MEDIR).

## 7. CSS

Fatos do repo (MEDIR): 588 linhas (`panel.css` 540, `overlay.css` 48); 136 cores hexadecimais distintas contra apenas 9 custom properties declaradas e 111 usos de `var()`; `prefers-reduced-motion` é tratado nos dois arquivos (o overlay desliga a transição; o painel condiciona a animação de entrada a `no-preference`); `backdrop-filter` com blur aparece na barra superior fixa e nos fundos de diálogo (somente painel, não no overlay).

| Tema | Recomendação | Rótulo / fonte |
|---|---|---|
| Custom properties | Centralizar tokens de cor, espaçamento e raio em `:root` e fazer os componentes consumirem `var(--token)`. A razão 136 contra 9 mostra deriva. Baixo risco, sem custo em runtime. | MEDIR (repo) + COMUNIDADE |
| Movimento reduzido | `reduce` significa remover, reduzir **ou substituir** o movimento (trocar escala por um fade de opacidade, por exemplo); Baseline amplamente disponível desde janeiro de 2020. O padrão atual (porta `no-preference`) está correto. | DOC, [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion), 2026-11-10 |
| Contraste | WCAG 2.2 SC 1.4.3 (AA): 4,5:1 para texto normal, 3:1 para texto grande (18 pt ou 14 pt em negrito, cerca de 24 px ou 18,5 px); as razões não são arredondadas. O SC 1.4.11 pede 3:1 para UI não textual; o limite exato não constava na página lida. Verifique cada par `--text`/`--muted` com uma calculadora; as revisões de UX são donas da nota. | DOC, [WCAG 2.2 Understanding 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), 2026-11-10 |
| Desempenho de renderização | Animar `transform` evita reflow e repaint e pode rodar fora da thread principal (MDN); `opacity` não é coberta por essa página. O overlay usa uma transição de opacidade de 120 ms e nenhum blur, que é o caminho barato. Manter blur e sombras grandes fora do overlay; eles ficam no painel. | DOC (parcial), [MDN animation performance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance); MEDIR no OBS |
| Suporte no OBS/CEF | A versão do CEF embutida **não foi encontrada**: o OBS 28 veio com Chromium 103; um tópico posterior testou o Chromium 126 sem prometer lançamento; as builds variam por distribuição. Não usar CSS novo (nesting, `:has`, `@layer`, `color-mix`) em `overlay.css` até ler a versão no OBS real e confirmar o recurso lá. O gatilho da nota #3 se aplica. | COMUNIDADE / NÃO VERIFICADO, [tópico do OBS sobre CEF](https://github.com/obsproject/obs-studio/discussions/3853) |
| `!important` | `background: transparent !important` no overlay é deliberado para a transparência do OBS; manter documentado. | MEDIR (repo) |

## 8. Biome 2 versus ESLint + typescript-eslint

| Ponto | Achado | Rótulo / fonte |
|---|---|---|
| Versões | Biome v2.6 (2026-10-15: Markdown, YAML, SCSS, plugins JS em developer preview, `biome inspect`); v2.5 (2026-06-05: mais de 500 regras de lint, 73 regras nursery promovidas, `lint`/`check` cerca de 13 % mais rápidos, modo watch para regras com tipos). | DOC, [blog do Biome](https://biomejs.dev/blog/), [v2.5](https://biomejs.dev/blog/biome-v2-5/), 2026-11-10 |
| Regras de Promise | `noFloatingPromises` / `noMisusedPromises` são **nursery** (a página diz que o comportamento pode mudar; severidade information; correção insegura). O post da v2.5 não as lista entre as promovidas. | DOC, 2026-11-10 |
| typescript-eslint | A issue #10940 (suporte ao TS 7) está aberta: suporte à API do TypeScript 7.1 "cada vez mais estável", PR #12803 em revisão interna, primeira versão esperada com velocidade próxima da do TS 6 (estado de 2026-09-29). Nenhuma versão lançada usa o TS 7. Alternativa lado a lado: `@typescript/typescript6`. | DOC, [issue 10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940) |
| Lacuna | O Biome não lista equivalentes para `await-thenable`, `no-unnecessary-condition`, `switch-exhaustiveness-check`, `restrict-template-expressions` nem a família `no-unsafe-*` (página de rule-sources, segundo a nota #23). `tsc --strict` mais uma checagem `never` no `switch` cobre exaustividade como convenção. | Nota #23 |
| Estágio do projeto | O ESLint 10.12.0 funciona hoje em `.js/.mjs/.jsx`; precisa de parser TS e de uma cópia lateral do TS 6 para `.ts`. O Biome trata `.ts` sem a API do TypeScript. | Nota #23 |
| Recomendação | Manter a recomendação da Nota #23: **Biome + `tsc` strict por módulo**, sem typescript-eslint agora. **Gatilho de revisão:** o typescript-eslint lançar suporte ao TS 7.1, ou o Biome promover as regras de Promise para fora do nursery. Formatar em um commit isolado listado em `.git-blame-ignore-revs`. | DOC + Nota #23 |

## 9. Viabilidade da migração para TypeScript

**Linha de base medida (2026-11-10, TS 7.0.2, `tsc -p tsconfig.json --noEmit`, flags somente na linha de comando):**

| Execução | Erros | Tempo |
|---|---|---|
| Configuração atual (`strict:false`) | 0 | 3,9 s |
| `--strict --noImplicitAny false` | 276 (TS2339 93, TS2322 57, TS2345 38, TS18047 27, TS18046 20) | 3,1 s |
| `--strict` | 1.349 (TS7006 650, TS7031 263, TS2339 133, TS7005 65, TS7053 62) | n/d |

Erros do strict por pasta da API: `persistence` 416 (`queue-repository.mjs` sozinho 371), `twitch` 185, `http` 125 (`queue-routes.mjs` 92), `outbox` 97, `commands` 88, `domain` 56, `server` 27, `observability` 23. Fora da API: `apps/shared` cerca de 100 e `apps/frontend` cerca de 56.

**Custo estimado (NÃO VERIFICADO; um ciclo = uma rodada @dev + @qa para uma fatia/PR; as 5 a 7,5 pessoas-semana da nota #23 são coerentes):**

| Fatia | Escopo | Ciclos | Por que nesta ordem |
|---|---|---|---|
| TS-0 | escada de tsconfig + `.ts` no `include`, OpenGrep `typescript`, include do Vitest, `prisma generate` no CI antes do `tsc`, decisão do Biome, um arquivo canário por Docker e CI | 2 | Prova a cadeia de ferramentas antes do volume |
| TS-1 | `twitch/*` (13 arquivos, 1.520 linhas) strict, testes de contrato sobre classes reais do Twurple | 2 | A classe de bug vive na borda do adaptador (índice #20) |
| TS-2 | `outbox/*` (7 arquivos, 870 linhas) | 1 | Riscos de promise flutuante e de retry |
| TS-3 | `http/*` (5 arquivos, 1.120 linhas) mais json-schema-to-ts nas 5 rotas principais | 2 | Contrato de requisição/resposta |
| TS-4 | `persistence/*` (3.056 linhas): dividir antes o `queue-repository.mjs` (2.837 linhas), depois converter | 3 a 4 | Maior e mais arriscado; 371 erros strict |
| TS-5 | `domain`, `commands`, `observability` (15 arquivos, 1.317 linhas) | 1 a 2 | Principalmente lógica pura |
| TS-6 | `server.mjs`, `runtime*.mjs`, `strict: true` global, remover `checkJs` em `apps/api` | 1 | Fecha a migração |
| **Total** | | **12 a 15** | |

**Ganhos esperados (a medir, não prometidos):** (a) fração de defeitos reais em uma amostra triada de 50 erros strict de `twitch/*` e `outbox/*` (a classe de bug `status` e `statusCode` do Twurple); (b) menos fakes/mocks divergindo das classes reais do Twurple; (c) ciclo de feedback dos agentes (execução completa do `tsc` em 3 a 4 s); (d) esforço de revisão por PR. **Não se espera ganho de velocidade nem de memória em runtime** (tipos são apagados).

**Alternativa para comparar:** ficar em JavaScript mais JSDoc e apenas elevar o rigor. Os mesmos 1.349 erros precisam ser corrigidos nos dois caminhos; a troca de extensão acrescenta churn de caminhos de import, mas dá genéricos, `satisfies`, `interface`, sintaxe nativa e elimina a verbosidade do JSDoc. Dada a decisão do dono de 2026-10-27 (backend em TypeScript), a recomendação é `.ts`, com a escada de rigor entregando a maior parte do valor.

**O que não migrar (por ora):**

- `tests/` (158 arquivos `.js`, cerca de 25 mil linhas): manter JavaScript; tipar apenas helpers compartilhados novos que toquem os contratos tipados.
- Scripts que rodam fora do build da imagem ou em instaladores Windows (`apps/infra/scripts`, `apps/frontend/scripts`, `next.config.mjs`, `start-product.mjs`): baixo valor, maior risco de quebra.
- Migrations do Prisma, SQL e arquivos gerados.
- Frontend `.jsx` para `.tsx` (33 arquivos): segunda onda, opcional. Os benefícios são `typedRoutes` e tipos de props; o Next compila TSX independentemente do type stripping do Node.
- `apps/shared`: decidir junto com os responsáveis do frontend; é importado pelo Next e pela API.

**Ordem recomendada:** TS-0, TS-1, TS-2, TS-3, TS-4, TS-5, TS-6; frontend `.tsx` e rotas tipadas depois da TS-6, se o dono quiser. Executar a medição de shutdown (seção 4) e a linha de base de desempenho (seção 6) **em paralelo**, pois independem da linguagem.

**Riscos:** o OpenGrep ignorar `.ts` em silêncio (provar com uma fixture `.ts` com violação plantada); regressões de renomeação de imports (uma pasta por PR mais o teste de fumaça do Docker); erros strict no `queue-repository` alongando a TS-4; ferramentas que precisam da API do TypeScript ficam bloqueadas até a 7.1 (typescript-eslint, alguns editores para linguagens embutidas); construtor `@private` do Twurple em helpers de teste (nota #23); o CI precisa rodar `prisma generate` antes do `tsc`.

## 10. Checklist de convenções para o projeto

- [ ] `erasableSyntaxOnly` e `verbatimModuleSyntax` ligados desde o primeiro arquivo `.ts`; sem `enum` e sem `namespace` de runtime.
- [ ] Valores explícitos no tsconfig (não depender dos padrões do TS 7); `types` listado.
- [ ] Escada de rigor por pasta; sem `// @ts-nocheck` como estado de saída de uma fatia.
- [ ] `import type` para tipos; imports relativos com extensão.
- [ ] Validação de fronteira com o JSON Schema do Fastify e `json-schema-to-ts` (`as const` para schemas em variáveis); nenhum JSON/ambiente/JSON de banco sem validação.
- [ ] Sem promises flutuantes em workers e no shutdown; regras de Promise do Biome em `warn` primeiro em `apps/api`.
- [ ] `useUnknownInCatchVariables` e um helper para estreitar erros; erros genéricos seguros ao cliente com `referenceId`.
- [ ] Shutdown com `try/catch`, timeouts por etapa, `preClose` para streams e timer de saída forçada; medido antes e depois.
- [ ] Tamanhos de pool explícitos para o `pg.Pool` e o adapter do Prisma; log de consultas e `pg_stat_statements` no banco descartável antes de qualquer proposta de índice.
- [ ] Linha de base de ELU, p99 do atraso, RSS e heap registrada antes de qualquer story de desempenho.
- [ ] `next analyze --output` antes e depois de qualquer mudança de bundle; sem `next/dynamic` sem um módulo grande medido.
- [ ] Tokens CSS em `:root`; porta de movimento reduzido para toda animação; pares de contraste verificados; nenhum recurso CSS novo em `overlay.css` até a versão do CEF do OBS ser conhecida.

## 11. Riscos e limitações

- A documentação oficial foi lida por uma ferramenta de fetch que resume as páginas. Algumas páginas vieram truncadas (campos do histograma do `perf_hooks` do Node, trecho intermediário do CLI do Node) e estão marcadas como parciais. O sinal padrão do `node --watch` não constava no trecho.
- Não verificados: limite exato do WCAG 1.4.11, versão do CEF embutida no OBS, manutenção do `clinic`, docs do `EXPLAIN` do PostgreSQL, texto do handbook sobre `satisfies`, detalhes de `process.getActiveResourcesInfo()`.
- As estimativas de ciclos e o total de 12 a 15 são inferências a partir de contagens de erros e de linhas, não de velocidade medida.
- As contagens de erros strict incluem JS de `apps/shared` e `apps/frontend`. Foram produzidas só com flags de linha de comando; nenhum arquivo de configuração foi alterado.
- A análise do shutdown é por leitura de código; nenhum processo foi executado. Pesquisa de mesa não substitui testes no ambiente do projeto (PostgreSQL, navegador, Twitch real, OBS/CEF).
- Neste ambiente não há fan-out de workers Haiku para a ferramenta web; a pesquisa foi feita diretamente pelo agente principal.

## 12. O que depende do dono

1. Aprovar a **ordem e o momento** do TypeScript em relação ao cutover da OPS-15 (a migração só pode correr em paralelo se os conjuntos de escrita não se sobrepuserem).
2. Aprovar a ida para o Biome e seu commit único de formatação (churn de histórico).
3. Aprovar qualquer **nova devDependency** para ferramentas de carga/profiling (`autocannon`, `clinic`) ou aceitar o caminho só com ferramentas embutidas.
4. Decidir se a segunda onda `.jsx` para `.tsx` do frontend e o `typedRoutes` são desejados.
5. Decidir se `apps/shared` migra com a API ou com o frontend.
6. Autorizar uma verificação ao vivo no OBS para ler a versão do CEF antes de qualquer recurso CSS novo.

## 13. Autoavaliação (rubrica, alvo mínimo 9,0)

| Critério | Peso | Nota | Observação |
|---|---|---|---|
| Fontes oficiais primeiro, datadas, rotuladas | 20 % | 9,2 | 17 páginas oficiais lidas; rótulo em toda recomendação |
| Reaproveitamento do índice de pesquisa, sem repetir pesquisa | 10 % | 9,5 | Linha 23 reaproveitada; só gatilhos e lacunas pesquisados |
| Evidência ancorada no projeto (medida) | 20 % | 9,3 | Linha de base do `tsc` e escada strict medidas; fatos de shutdown e pool vêm do código |
| Viabilidade do TypeScript (ordem, custo, riscos, lista do que não migrar) | 20 % | 9,0 | Custo é estimativa; revalidar após a TS-0 |
| Cobertura dos 8 temas | 15 % | 8,7 | CSS/CEF do OBS, `EXPLAIN` e clinic verificados parcialmente |
| Honestidade sobre limites e decisões do dono | 10 % | 9,5 | Hipóteses marcadas como hipóteses |
| Paridade en / pt-BR, legibilidade | 5 % | 9,0 | |
| **Total ponderado** | | **9,1** | |

## Fontes (lidas em 2026-11-10)

- [Node.js 24 TypeScript](https://nodejs.org/docs/latest-v24.x/api/typescript.html), [perf_hooks](https://nodejs.org/docs/latest-v24.x/api/perf_hooks.html), [CLI](https://nodejs.org/docs/latest-v24.x/api/cli.html)
- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), [issue 10940 do typescript-eslint](https://github.com/typescript-eslint/typescript-eslint/issues/10940)
- [Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components), [Package bundling](https://nextjs.org/docs/app/guides/package-bundling), [TypeScript](https://nextjs.org/docs/app/api-reference/config/typescript), [Caching](https://nextjs.org/docs/app/getting-started/caching)
- [Fastify Server reference](https://fastify.dev/docs/latest/Reference/Server/), [Fastify Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/)
- [Prisma connection pool](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool), [logging](https://www.prisma.io/docs/orm/prisma-client/observability-and-logging/logging), [query optimization](https://www.prisma.io/docs/orm/prisma-client/queries/query-optimization-performance), [PostgreSQL pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html)
- [Blog do Biome](https://biomejs.dev/blog/), [Biome v2.5](https://biomejs.dev/blog/biome-v2-5/), [noFloatingPromises](https://biomejs.dev/linter/rules/no-floating-promises/)
- [Vitest features](https://vitest.dev/guide/features.html)
- [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion), [MDN desempenho de animações CSS e JS](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance), [WCAG 2.2 Understanding 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [Tópico do OBS sobre browser/CEF](https://github.com/obsproject/obs-studio/discussions/3853) (COMUNIDADE)
- Repositório (MEDIR): `package.json`, `tsconfig.json`, `apps/api/src/server.mjs`, `apps/api/src/runtime.mjs`, `apps/frontend/styles/*.css`, `apps/frontend/scripts/dev-runtime-config.mjs`, `node_modules/fastify`, `docs/pt-BR/stories/OPS-15/typescript-migration-research.md`

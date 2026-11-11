# Diagnóstico por linguagem (Fase 1 da Diretriz Mestra) - 2026-11-10

[English](../../../research/2026-11-10-language-diagnosis/README.md)

- Autor: `@architect` (Aria). Somente leitura e análise estática. Base: `main` em `dcfe3da` mais a árvore de trabalho não commitada daquele momento.
- **Nenhum desempenho foi medido** (sem benchmark, sem `vitest` completo, sem build pesado, sem carga): outros agentes usavam CPU e Docker. Todo número abaixo é contagem de linhas ou arquivos de `git ls-files` / `wc`, ou leitura de configuração.
- Escopo: só código do produto. As árvores do framework AIOX (`.aiox-core`, `.claude`, `.codex`, `.cursor`, `.gemini` e semelhantes) ficam de fora.
- Rótulos: **Comprovado** = confirmado lendo um arquivo deste repositório. **Oportunidade** = convenção ou ferramenta ausente que vale adotar, sem evidência de defeito. **A medir** = exige medição ou experimento antes de decidir. **A pesquisar** = depende do `@analyst`.

## 1. Inventário

| Linguagem / formato | Arquivos | Linhas | Onde | Ferramenta que cuida hoje |
|---|---|---|---|---|
| JavaScript `.js` | 158 | 25.495 | `tests/unit` (156 arquivos) e testes, mais `eslint.config.js`, `vitest.config.js` | ESLint (só `tests/**/*.js`); sem verificação de tipos |
| ESM `.mjs` | 144 | 15.774 | `apps/api/src` 47 / 8.195; `apps/shared` 22 / 1.424; `apps/frontend` 30 / 1.957; `apps/infra` 15 / 729; `tests` 29 / 3.464; `prisma.config.mjs` | ESLint + `tsc` (`checkJs`, JSDoc) em `apps/**`; `tests/**/*.mjs` fora do ESLint (veja P-02) |
| JSX | 55 | 6.476 | `apps/frontend` 33 / 3.289; `tests` 22 / 3.187 | ESLint só em `apps/frontend`; **sem** verificação de tipos (backlog TS-16, 59 erros registrados na OPS-24) |
| CSS | 2 | 588 | `apps/frontend/styles` | Nenhuma (sem stylelint, sem formatador) |
| TSV (catálogos i18n) | 15 | 2.958 | `apps/shared/localization/catalogs` (5 domínios x 3 idiomas) | `validate:localization` próprio |
| SQL | 14 | 307 | 13 migrations do Prisma + 1 `rollback.sql` | Prisma Migrate; testes de integração em PostgreSQL descartável |
| Schema Prisma | 1 | 207 | `apps/api/prisma/schema.prisma` (11 models/enums) | `prisma generate` (cliente tipado) |
| Shell | 2 | 637 | `apps/infra/installer/installer.sh` (593, `#!/bin/sh`), `.devcontainer/post-create.sh` (44, bash) | Testes de contrato e smoke; **sem ShellCheck** |
| PowerShell | 1 versionado (+1 não versionado) | 486 (+445) | `apps/infra/installer/installer.ps1`; `apps/infra/scripts/windows/Validar-SubaruShogun.ps1` é novo e não versionado | Testes de contrato + smoke no CI Windows; **sem PSScriptAnalyzer** |
| Batch `.bat` | 0 versionados | - | Gerado por `package-installer.mjs` (`.bat` poliglota com o `.ps1` em base64 UTF-16) | `installer-smoke` em `windows-latest`, teste `windows-native-contract` |
| YAML do GitHub Actions | 4 | 689 | `ci`, `quality-gates` (224), `main-cd` (154), `release` (292) | `actionlint` 1.7.12 (integração com ShellCheck **desligada**) |
| Dockerfile | 1 | 27 | raiz, 3 estágios, `node:24.20.0-alpine3.24` | Checagem do Compose + build da imagem no CI; **sem hadolint** |
| Compose | 3 | 145 | `compose.yaml` (95), `compose.dev.yaml`, `compose.build.yaml` | `docker compose config` no CI + testes `compose-contract` |
| JSON | 6 arquivos do produto | - | `package.json`, `package-lock.json`, 4 `tsconfig*.json` (mais `.devcontainer`) | Lock do `npm ci`; `tsc` |
| TOML / `.mdc` | 14 / 12 | 141 / 398 | Integração de IDEs do AIOX (`.gemini`, `.cursor`), não é código do produto | Sync do framework (`sync:ide:check`) |
| Regras estáticas | 1 | - | `.opengrep/rules.yml` (2 regras, `languages: [javascript]`) | OpenGrep via `npm run review:static` |

Total de código-fonte do produto: cerca de 47.700 linhas de JS/ESM/JSX (testes: cerca de 32.100) e 0 linhas de TypeScript.

## 2. Estado real das ferramentas

| Tema | Hoje | Planejado (OPS-24, nota de pesquisa #23) |
|---|---|---|
| Lint | ESLint 10.12 flat config, só `eslint:recommended`, `globals` escritos à mão, zero `eslint-disable` exceto 1 | Biome (lint + formatação); sem `typescript-eslint` (o TS 7 não tem API programática) |
| Formatação | **Nenhuma** (sem Prettier, sem Biome, sem `.editorconfig`); `.gitattributes` só fixa fim de linha (LF; CRLF em `.bat`/`.ps1`) | Biome, um commit só de formatação após a onda 4 do cutover |
| Tipos | `tsc` 7.0.2 (nativo), `allowJs` + `checkJs`, `strict: false`, `include` = `apps/**/*.{js,mjs}`; 0 erros; 0 `@ts-ignore/@ts-expect-error/@ts-nocheck` no código versionado | `.ts` executado pelo type stripping do Node 24.20 + `tsc --noEmit`; strict por pasta convertida; `erasableSyntaxOnly` |
| JSDoc | 368 tags em `apps` versionado (235 `@param`, 32 `@returns`, 83 `@type`, 18 `@typedef`); 61 `any`/`{*}`/`{Object}` explícitos em apps e testes | Viram anotações TS conforme os arquivos migram |
| Análise estática | OpenGrep, 2 regras, só JavaScript | Incluir `.ts`; provado com violação plantada |
| Lint de Actions | `actionlint -shellcheck=` (ShellCheck desligado) | - |
| Lint de Shell / PowerShell / Docker | Ausente | Não planejado |
| Testes | Vitest 5.0.3 (`tests/**/*.test.{js,jsx}`, timeouts de 120 s); scripts E2E com Playwright-core (18 arquivos em `tests/e2e`, rodados por `npm run test:e2e:*`, **fora do CI**, pela regra do `@qa`) | Incluir `.ts` no Vitest |
| CI | `quality-gates` (reutilizável): matriz de lint+typecheck por app (api, infra, frontend), lint de testes, smoke do instalador em 3 SOs, qualidade Windows, Vitest + PostgreSQL + Compose, análise estática (OpenGrep, actionlint, versão, localização), build do container, portão agregado | `tsc`/Biome entram na TS-0 |

## 3. Convenções: adotadas vs ausentes

| Linguagem | Adotadas | Ausentes |
|---|---|---|
| JS/ESM | ESM em todo lugar (`"type": "module"`), versão exata do Node (`engines`, `.nvmrc`, CI, Docker), versões exatas nas dependências de runtime (algumas ferramentas de dev usam `^`), `checkJs` com 0 erros, sem comentários de supressão, `no-unused-vars` com prefixo `_`, regra de fronteira de import (`no-restricted-imports`) | `strict`, `noImplicitAny`, formatador, testes sob verificação de tipos, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| JSX/React | React 19, Next 16 app router, pastas por feature | Regras `react-hooks` / `jsx-a11y`, verificação de tipos |
| CSS | Dois arquivos por superfície (painel, overlay) | Stylelint/formatação |
| Shell | `set -eu`, `$(...)`, expansões entre aspas, modo de teste e sobrescritas por env, `post-create.sh` usa `set -euo pipefail` | ShellCheck; `installer.sh` não tem `pipefail` (`sh` POSIX, intencional por portabilidade) nem `trap` de limpeza |
| PowerShell | `$ErrorActionPreference = 'Stop'`; o validador novo usa `Set-StrictMode -Version 2.0`, `-WhatIf`, `-Parse`, BOM UTF-8, CRLF | `installer.ps1` sem `Set-StrictMode`; PSScriptAnalyzer |
| Actions | Toda action de terceiros fixada por SHA de commit com comentário de versão; `permissions: contents: read` no workflow, `packages: write` só no job de publicação; `timeout-minutes` em todo job; `concurrency`; OpenGrep e actionlint fixados e verificados por checksum/assinatura; portão agregado obrigatório | `persist-credentials: false` no checkout (0 em todos), Dependabot/Renovate (sem configuração), `windows-latest` flutuante enquanto o Linux é fixo em `ubuntu-24.04` |
| Docker | Multi-stage, tag base fixada (patch), `USER 10001:10001` não-root, `init: true`, healthcheck em `bot` e `db`, `stop_grace_period`, porta só em localhost, segredos em volume somente leitura, `.dockerignore` exclui testes/docs/segredos | Fixação por digest; `read_only`, `cap_drop`, `no-new-privileges`, limites de memória/pids; política de restart para `bot`/`db`; devDependencies fora da imagem de runtime |

## 4. Problemas encontrados

| ID | Classe | Achado (evidência) | Impacto |
|---|---|---|---|
| P-01 | Comprovado | `tsconfig.json` com `strict: false`; sem `noImplicitAny`. 61 `any` explícitos e muitos parâmetros sem anotação passam pelo portão. | Propriedade errada de biblioteca ou formato de erro errado não é pego (motivo da OPS-24). |
| P-02 | Comprovado | `eslint.config.js` só lint em `tests/**/*.js`. `tests/**/*.mjs` (29 arquivos, 3.464 linhas) e `tests/**/*.jsx` (22 arquivos, 3.187 linhas) não casam com nenhum bloco de configuração, então o ESLint os ignora em silêncio. Confirmar com violação plantada antes de corrigir. | Cerca de 6.650 linhas de testes sem lint. |
| P-03 | Comprovado | `typecheck` inclui só `apps/**/*.{js,mjs}`: `tests/**` (cerca de 32.100 linhas) e todo `.jsx` (apps, 3.289 linhas) ficam sem verificação de tipos. `typecheck:frontend` cobre só `apps/shared/panel/**/*.mjs` (13 arquivos, 807 linhas). | Fakes podem divergir das classes reais sem falhar o compilador. |
| P-04 | Comprovado | `pg` 8.23.1 não traz tipos e `@types/pg` não está instalado (`import pg from 'pg'` é `any` implícito). Só passa porque `strict` está desligado. | Vira erro TS7016 quando o strict ligar; adicionar `@types/pg` (pesquisar se continua correto para `pg` 8.23). |
| P-05 | Comprovado | Nenhum formatador. | Deriva de estilo; diffs ruidosos; o commit de formatação do Biome tocará tudo. |
| P-06 | Comprovado | `actionlint -shellcheck=` desliga o ShellCheck dos blocos `run:`; sem ShellCheck em `installer.sh` e `post-create.sh`; sem PSScriptAnalyzer em `installer.ps1`/validador; sem hadolint no Dockerfile. | Defeitos de classe shell (aspas, variável não definida, portabilidade) só aparecem nos testes. |
| P-07 | Comprovado | `installer.ps1` define `$ErrorActionPreference = 'Stop'` mas não `Set-StrictMode`. | Erro de digitação em variável vira `$null` em silêncio. |
| P-08 | Comprovado | `installer.sh` é `#!/bin/sh` com `set -eu` e sem `pipefail`; usa pipes como `sed ... \| head`. | Falha do lado esquerdo do pipe fica escondida. Há alternativas portáveis (checar cada pipe ou usar capturas temporárias). |
| P-09 | Comprovado | Dockerfile: `npm ci` no estágio `dependencies` instala devDependencies (vitest, eslint, typescript, jsdom, playwright-core, CLI do prisma) e o estágio de runtime copia todo esse `node_modules`. | Imagem maior e superfície de ataque maior. A CLI do Prisma é necessária em runtime pelo `migrate`; o resto não. O tamanho está **a medir**. |
| P-10 | Comprovado | `compose.yaml`: só `bootstrap` tem valor de restart (`"no"`); `bot` e `db` não têm (a pilha dev usa `unless-stopped`). | Queda do bot ou reboot deixa o produto parado; confirmar a intenção com o `@devops` (o instalador pode reiniciar de forma explícita). |
| P-11 | Oportunidade | Endurecimento do Compose para `bot` e `migrate`: `read_only: true` + `tmpfs`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, `mem_limit`, `pids_limit`. O `bootstrap` roda como root (`0:0`) por desenho, para gravar segredos. | Menor raio de impacto. Exige validação em execução real (cache do Next, volume do PostgreSQL). |
| P-12 | Oportunidade | `actions/checkout` sem `persist-credentials: false` em todos os jobs; sem Dependabot/Renovate para SHAs de actions e npm. | O token fica em `.git/config` nos passos seguintes; SHAs fixados envelhecem. |
| P-13 | Oportunidade | `windows-latest` e `macos-15` flutuantes contra `ubuntu-24.04` fixo. Passos Windows/macOS sem `shell:` (passos "Package" e "Launch" do installer-smoke) rodam em `pwsh` no Windows e `bash` nos demais, com aspas diferentes. | Troca de imagem do runner pode quebrar a perna Windows sem mudança de código. |
| P-14 | Oportunidade | `.opengrep/rules.yml` tem 2 regras (sink HTML, log de credencial), só JavaScript. | Cobertura de regras para Dockerfile/YAML/shell não testada. |
| P-15 | Oportunidade | Imagens fixadas por tag (`node:24.20.0-alpine3.24`, `postgres:18.6-bookworm`), não por digest. | Re-publicação de tag não é detectada; troca entre reprodutibilidade e manutenção. |
| P-16 | Oportunidade | `-ExecutionPolicy Bypass` no lançador `.bat` gerado. | Comum em instaladores baixados; documentar e mostrar o hash do script nas notas da release. |
| P-17 | A medir | Atraso do Event Loop, RSS/heap, custo das consultas do queue-repository, tamanho do bundle do painel e do overlay do Next, tamanho da imagem, tempo de transformação do Vitest para `.ts`. | Veja a seção 7. |
| P-18 | A medir | Número de erros de `strict` por pasta (execução somente leitura de `tsc --strict` pelo `@qa`; o risco 3 da OPS-24 já exige isso antes de cada fatia). | Dimensiona cada fatia TS. |
| P-19 | A medir | Duração da suíte Vitest separada em unitária / integração (PostgreSQL + Compose) e tempo de relógio do CI por job (limite de 35 min no job de testes). | Decide onde um runner mais rápido ou sharding compensa. |

Achados positivos a preservar: 0 comentários de supressão, 1 `eslint-disable` (justificado), SHAs fixados, permissões mínimas nos workflows, usuário não-root no runtime, healthchecks, política explícita de LF/CRLF.

## 5. Viabilidade preliminar do TypeScript (sem medir)

Estado: a story é a **OPS-24** (Ready, issue #91, fatias TS-0..TS-5); o dono decidiu em 2026-10-27 que o backend vai para TypeScript, sem reescrita, com Docker obrigatório, type stripping do Node + `tsc --noEmit` e Biome no lugar do ESLint. Esta seção só confere se essas premissas continuam válidas em `dcfe3da`.

### 5.1 Superfície por módulo

| Módulo | Arquivos / linhas | Fronteira de terceiros | Já tipado por JSDoc | Veredito |
|---|---|---|---|---|
| `apps/api/src/twitch` | 13 / 1.520 | Twurple (tipado), `ws` | sim (maioria) | Migrar primeiro (TS-1): a classe de bug mora aqui |
| `apps/api/src/outbox` | 7 / 870 | Cliente Prisma (por injeção) | sim | TS-2 |
| `apps/api/src/http` | 5 / 1.120 (`queue-routes` 842) | Fastify (tipado) | sim | TS-3, com type provider de JSON Schema nas rotas principais |
| `apps/api/src/persistence` | 3 / 3.056 (`queue-repository` 2.837) | Prisma, `pg` (sem tipos, P-04) | sim | TS-4, dividir por agregado antes; o maior arquivo (35% da API) |
| Resto de `apps/api/src` (`domain`, `commands`, `observability`, raiz) | 19 / 1.629 | Nada pesado | sim | TS-5 e `strict` global |
| `apps/shared` | 22 / 1.424 + TSV | nenhuma | 17 de 22 arquivos | Não migrar agora: importado pelo Node e pelo bundler do Next (risco de extensão e loader, seção 5.4) |
| `apps/frontend` | 30 `.mjs` + 33 `.jsx` / 5.246 | React 19, Next 16 (tipados) | 31 de 63 | Não migrar para `.tsx`; manter JSDoc e corrigir os 59 erros de JSX (TS-16) |
| `apps/infra` | 15 / 729 | Node, js-yaml (tipado) | 5 de 15 | Manter `.mjs` + JSDoc + `tsc`; bootstrap e empacotador são pequenos e rodam antes de tudo |
| `tests` | 156 `.js` + 29 `.mjs` + 22 `.jsx` (cerca de 32.100) | Vitest, jsdom | n/a | Não converter. Antes, colocar os testes no `tsc` via `checkJs` |

### 5.2 Dependências sem tipos

Nenhuma bloqueia o trabalho. Twurple, Fastify, Next, React (`@types/react`), js-yaml e o cliente Prisma gerado trazem ou geram tipos. Só o `pg` não tem (P-04). Twurple tem uma armadilha conhecida: `HelixCustomRewardRedemption` expõe um construtor `@private` no `.d.ts` que os testes precisam contornar (nota de pesquisa, Q3).

### 5.3 Custo, ordem e dependências (estimativas NÃO VERIFICADAS, da OPS-24 e da nota #23; uma fatia = um ciclo)

| Ordem | Fatia | Ciclos | Risco principal |
|---|---|---|---|
| 0 | TS-0 ferramentas (tsconfig, paridade do Biome, OpenGrep `.ts`, Vitest `.ts`, `.dockerignore`, um arquivo canário por Docker e CI) | 2 a 3 | Portões que ignoram `.ts` em silêncio (três superfícies de config) |
| 1 | TS-1 `twitch/*` | 1 a 2 | Helper de teste com instâncias reais do Twurple |
| 2 | TS-2 `outbox/*` | 1 | Baixo |
| 3 | TS-3 `http/*` | 1 a 2 | Sobreposição com a OPS-21 em `queue-routes` |
| 4 | TS-4 `queue-repository` | 2 a 3 | Erros de strict aparecem em massa; tipagem Prisma de consultas brutas |
| 5 | TS-5 resto + `strict` global | 1 | Regressões de caminho de import `.mjs` para `.ts` |
| 6 | TS-16 JSX (JSDoc, continua `.jsx`) | 1 a 2 | Os 59 erros registrados não podem crescer |

Total de cerca de 9 a 14 ciclos, em média cerca de 1.550 linhas movidas por ciclo. A story a classifica como COMPLEX e ela não pode congelar o cutover; a OPS-22 vem antes, a OPS-23 espera só a TS-0 e a TS-2.

### 5.4 Riscos específicos deste repositório

- **O type stripping aceita só sintaxe apagável** e não verifica tipos: `erasableSyntaxOnly` mais o portão `tsc` obrigatório (um `node` verde não prova nada).
- **Especificadores `.ts` em `apps/shared`**: o comportamento do Next/Turbopack com `allowImportingTsExtensions` não foi verificado (A pesquisar); motivo para manter `apps/shared` em `.mjs`.
- **Três superfícies de ignorar em silêncio** (`include` do Vitest, globs do ESLint/Biome, `languages` do OpenGrep): o achado P-02 mostra que a mesma classe de falha já existe hoje nos testes.
- **Ligar o strict** é o custo real: o P-18 o dimensiona. Sem medir, nenhuma fatia deve ganhar data.
- **Docker/instalador**: a imagem copia `apps` como fonte e roda `node apps/infra/scripts/start-product.mjs`; o type stripping mantém esse modelo, mas o empacotador e os testes de contrato do Compose precisam rodar de novo a cada fatia.
- **O TypeScript 7.0.2 não tem API**: o `typescript-eslint` continua bloqueado; a nota de pesquisa lista os gatilhos de revisão (issue #10940, promoção das regras nursery do Biome).

### 5.5 O que não vale migrar (preliminar)

UI `.jsx` e `apps/shared` (decididos fora do escopo e acoplados ao bundler); os 156 testes unitários; os scripts de boot de `apps/infra`; shell/PowerShell (outra trilha de ferramentas, não TypeScript); schema Prisma; `.bat` gerado. Um primeiro passo barato que entrega boa parte da segurança de tipos sem renomear nada: `strict` por pasta nos `.mjs` atuais com JSDoc, mais testes sob `checkJs`. Se o `.ts` acrescenta o bastante sobre o JSDoc estrito é **uma decisão a tomar com as contagens de erro medidas (P-18)**: o dono decidiu por `.ts`; este diagnóstico só oferece o passo intermediário mais barato como opção, com o custo (sem sintaxe de anotação, genéricos verbosos em JSDoc, ergonomia pior para agentes).

## 6. Lacunas para o `@analyst`

Regra de ouro aplicada: a linha 23 de `docs/research-index.md` é SUFICIENTE para a rota TypeScript e não é reaberta. Só lacunas novas:

| Linguagem | Pergunta | Motivo |
|---|---|---|
| Shell | Opções do ShellCheck para `sh` POSIX (`-s sh`), tratamento de `pipefail`, idiomas de `trap` para instalador baixado, particularidades do `.command` no macOS | P-06, P-08 |
| PowerShell | Conjunto de regras do PSScriptAnalyzer para PowerShell 5.1, efeitos do `Set-StrictMode` num payload embutido via `[ScriptBlock]::Create`, prática de `-ExecutionPolicy Bypass` e opções de assinatura | P-06, P-07, P-16 |
| Batch | Práticas seguras para lançador `.bat` poliglota (payload UTF-16, leitura de `%~f0`, códigos de saída, aspas do `cmd`) | artefato gerado |
| Actions | `persist-credentials`, imagens de runner fixas (`windows-2025`), Dependabot para SHAs, integração ShellCheck do actionlint, situação do suporte a `queue: max` | P-12, P-13 |
| Docker | Política de digest, `npm ci --omit=dev` + onde fica a CLI do Prisma, `read_only`/`cap_drop` com Next e PostgreSQL 18, conjunto de regras do hadolint, norma de política de restart para produtos Compose locais | P-09, P-10, P-11, P-15 |
| JS/TS | `@types/pg` para `pg` 8.23; cobertura do Biome 2.x para regras de a11y de JSX e hooks do React; `allowImportingTsExtensions` com Next 16 e pacotes compartilhados; custo de adotar `noUncheckedIndexedAccess` | P-04, seção 5.4 |
| CSS | Maturidade do lint/formatação CSS do Biome vs Stylelint para 588 linhas | P-05 |
| SQL/Prisma | Lint de migrations Prisma (sqlfluff ou checagem de drift com `migrate diff` no CI), `prisma validate` no portão | nenhuma checagem encontrada no CI |
| TSV | Se o validador próprio precisa de schema (ou ferramenta no estilo `csvlint`) | baixa prioridade |

## 7. Plano de medição futura (só quando o dono mandar)

Princípios: medir em máquina ociosa, registrar a linha de base antes de qualquer mudança, três execuções e a mediana, o mesmo conjunto de dados, e guardar a saída bruta em `.local/` (ignorado pelo git).

| Métrica | Componente | Ferramenta | Observação |
|---|---|---|---|
| Atraso do Event Loop (P50/P95/P99, máx.) | API (Fastify) e workers | `perf_hooks.monitorEventLoopDelay` | Ocioso, rajada de chat e operações de fila |
| RSS e heap | Container da API/bot | `process.memoryUsage()`, `docker stats`, `--heap-prof` | Ocioso vs. após N operações de fila; procurar crescimento |
| Latência de requisição P50/P95/P99 | Rotas da API do painel | `autocannon` ou `k6` contra a pilha isolada | Nunca contra o volume do banco dev |
| Custo de consulta | `queue-repository` | PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)`, `pg_stat_statements`, log de consultas do Prisma | Só PostgreSQL descartável com migrations reais |
| Tamanho do bundle | Painel e overlay do Next | saída do `next build`, analisador de bundle | O orçamento do overlay importa para o CEF do OBS |
| Runtime do painel | Painel e overlay | Traces do Playwright, Lighthouse CI quando couber | Navegador real; o CEF do OBS é outra classe de evidência |
| Tamanho e camadas da imagem | Docker | `docker image ls`, `docker history`, `dive` | Linha de base antes do P-09 |
| Tempo de partida e healthcheck | Pilha Compose | `docker compose up --wait` cronometrado | Frio e quente |
| Custo do type-check e erros de strict | Repositório | `tsc --extendedDiagnostics`, contagem de `tsc --strict` por pasta | Alimenta P-18 e o dimensionamento das fatias TS |
| Tempo de teste/CI | Vitest, CI | tempos de `vitest --reporter=json`, duração dos workflows | Alimenta P-19; inclui a transformação `.ts` do Vitest |
| Tempo do instalador | Shell / PowerShell / `.bat` | Execuções cronometradas em Linux, macOS e Windows nativos | Só em sessões fornecidas pelo dono |

## 8. Próximos passos recomendados (para o Orion decidir)

1. Corrigir P-02 e P-03 de forma barata e test-first, como pequena mudança de ferramentas: estender o ESLint a `tests/**/*.{mjs,jsx}` e incluir `tests/**` no `checkJs` (contar os erros antes). É ortogonal à decisão sobre TypeScript.
2. Pedir ao `@analyst` as lacunas da seção 6, começando por shell/PowerShell/Actions/Docker (ainda sem nota de pesquisa).
3. Quando o dono autorizar a medição, executar a seção 7 em janela silenciosa, com o `@qa` responsável pela execução e os resultados numa nova nota datada.
4. Não alterar `AGENTS.md`, o escopo da OPS-24 nem código a partir deste documento; cada item acima é insumo para o backlog do `@po`/`@sm`.

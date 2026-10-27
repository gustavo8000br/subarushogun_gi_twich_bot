# OPS-15: Migração incremental do backend para TypeScript (nota de pesquisa)

[English](../../../stories/OPS-15/typescript-migration-research.md)

- Autor: `@analyst` (Atlas). Data: 2026-10-27. Pesquisa documental e inspeção somente leitura do repositório. Nenhum código foi alterado.
- Gatilho: em 2026-10-27, o proprietário decidiu que o backend (`apps/api`) **vai para TypeScript**. O Docker continua obrigatório, não haverá reescrita em outra linguagem, a mudança é incremental, o cutover da OPS-15 não é congelado e o feedback do compilador precisa ser rápido para agentes de IA.
- Regra de ouro: li primeiro a linha 22 do índice de pesquisa (`docs/process/backend-migration-study.md`). Dela reaproveitei as medições (7.524 linhas em 45 arquivos, 92 tags JSDoc, `strict:false`) e o plano de endurecimento H-01..H-09. A linha "Node type stripping" estava PARTIAL e esta nota a promove a VERIFIED. Pesquisei só o que faltava.
- Rótulos: **VERIFIED** (fonte oficial ou código do repositório/`node_modules`), **PARTIAL** (fonte secundária ou incompleta), **UNVERIFIED** (inferência ou estimativa).

## 0. Fatos do repositório que mudam o quadro (VERIFIED, lidos em 2026-10-27)

| Fato | Onde | Consequência |
|---|---|---|
| `typescript` está na **7.0.2**, o compilador nativo em Go | `package.json:79`, `node_modules/typescript/package.json` | A checagem de tipos já é rápida. O TS 7.0 **não tem API programática**, então o `typescript-eslint` não consegue usá-lo (Q5). |
| `tsconfig.json` tem `allowJs`, `checkJs`, `noEmit`, `NodeNext`, `skipLibCheck` e `strict:false`, e inclui só `apps/**/*.js`/`*.mjs` | `tsconfig.json` | Hoje nenhum `.ts` é checado. O `tsconfig.api.json` estende essa configuração para `apps/api/**`. |
| A imagem de runtime copia `apps/` como fonte e roda `node apps/infra/scripts/start-product.mjs`, sem build da API. O `prisma generate` roda dentro da imagem. | `Dockerfile` | A imagem já "roda fonte", e o type stripping mantém esse modelo. |
| O Prisma 6.19.3 usa `prisma-client-js`, e o cliente tipado já existe em `node_modules/.prisma/client/index.d.ts` | `docs/architecture.md:28`, `node_modules` | Não é preciso trocar o generator do Prisma para ter tipos. |
| O Vitest 5.0.3 inclui só `tests/**/*.test.{js,jsx}` | `vitest.config.js` | Arquivos `.test.ts` seriam ignorados. |
| O ESLint cobre só `apps/**/*.{js,mjs,jsx}` e `tests/**/*.js`, e não há `typescript-eslint` | `eslint.config.js` | Arquivos `.ts` não seriam analisados pelo lint. |
| As duas regras do OpenGrep usam `languages: [javascript]` | `.opengrep/rules.yml:3,13` | Provavelmente não varrem `.ts` (Q5). |
| Em runtime, o construtor de `HelixCustomRewardRedemption` é `(data, client)`. O `.d.ts` herda o construtor `@private` `(data)` de `DataObject`. `@twurple/common` exporta `getRawData` e `rawDataSymbol`. | `node_modules/@twurple/api/.../HelixCustomRewardRedemption.{js,d.ts}`, `node_modules/@twurple/common/lib/DataObject.*` | Testes de contrato podem criar instâncias reais a partir de JSON bruto, sem rede (Q3). |

## Q1. Type stripping no Node 24.20.0: rodar `.ts` direto ou compilar

**VERIFIED** ([docs do Node.js v24, "Modules: TypeScript"](https://nodejs.org/docs/latest-v24.x/api/typescript.html), lidos em 2026-10-27):

- **Linha do tempo:** o type stripping entrou na v22.6.0, ficou ativo por padrão na v23.6.0, perdeu o aviso de experimental na v24.3.0 e ficou **estável (Stability 2) na v24.12.0**. Na 24.20.0, `node arquivo.ts` funciona sem flag. A `--experimental-strip-types` não é mais necessária, e `--no-strip-types` desliga o recurso.
- **Sem checagem:** o Node troca os tipos por espaços em branco e **não checa tipos**. Linhas e colunas dos stack traces ficam preservadas.
- **Sintaxe não suportada** sem `--experimental-transform-types`: `enum`, `namespace` com código de runtime, parameter properties e import aliases. Decorators dão erro de parse. `.tsx` não é suportado.
- **Imports:** a extensão é obrigatória (`import './x.ts'`). Imports só de tipo exigem `import type` (use `verbatimModuleSyntax` para casar o comportamento).
- **`tsconfig.json`:** o Node **ignora** esse arquivo, então `paths` e downlevel não se aplicam. O Node também recusa `.ts` dentro de `node_modules`.
- **Configuração recomendada** (TS ≥ 5.8): `target: esnext`, `module: nodenext`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `rewriteRelativeImportExtensions` e, opcionalmente, `noEmit`. Quando `.ts` é só executado, `noEmit` com `allowImportingTsExtensions` faz o `tsc` aceitar especificadores `.ts`. `rewriteRelativeImportExtensions` só importa quando há emissão de `.js`.
- **Produção:** a página não recomenda nada explícito para produção e indica o `tsx` para quem precisa do `tsconfig` completo.

**TypeScript 7.0** ([anúncio de 2026-07-08](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)): é um port nativo, com builds completos típicos cerca de 8 a 12 vezes mais rápidos. Não traz API programática. O pacote de compatibilidade `@typescript/typescript6` (executável `tsc6`) permite rodar as duas versões lado a lado. Há detalhes PARTIAL em fontes secundárias ([Visual Studio Magazine](https://visualstudiomagazine.com/Articles/2025/12/02/Microsoft-Gets-Real-on-Native-TypeScript-Remake.aspx), [progresso do TS 7, dez/2025](https://devblogs.microsoft.com/typescript/progress-on-typescript-7-december-2025)): emissão de JS "não totalmente portada", `strict` como padrão e fim do suporte às tags JSDoc `@enum`/`@constructor`.

| Opção | Prós | Contras para este projeto |
|---|---|---|
| **A. Rodar `.ts` direto (type stripping) com `tsc --noEmit` como gate** | Sem etapa de build e com o Dockerfile quase igual (`COPY apps` já leva a fonte). Stack traces preservados. Os mesmos arquivos rodam em dev, testes e produção, sem dependência nova. É o feedback mais rápido para agentes (`tsc` nativo). | Só aceita sintaxe apagável (sem `enum`, parameter properties ou decorators). Não há checagem de tipos em runtime, então a CI **precisa** rodar `tsc`. Imports com `.ts`. Há algum custo de remoção dos tipos no startup (UNVERIFIED, esperado pequeno). |
| B. Compilar com `tsc` para `dist/` | Caminho padrão e conhecido. | A completude da emissão do TS 7 é PARTIAL. Acrescenta uma etapa de build e muda caminhos de `dist/` em `start-product.mjs`, no instalador e nos testes, além de exigir source maps. |
| C. Bundle com `esbuild`/`tsup` | Rápido e gera um único artefato. | Dependências novas. Empacotar o cliente gerado e os engines do Prisma é atrito conhecido (UNVERIFIED para a 6.19.3). Stack traces passam a depender de source maps. Também muda o modelo "roda fonte" do qual o instalador depende. |

**Recomendação:** opção A, com `erasableSyntaxOnly` e `tsc --noEmit` como gate. Reavaliar só se uma sintaxe não apagável virar necessária, o que não deve acontecer: Fastify, Prisma e Twurple não pedem decorators.

## Q2. Migração incremental

- **Convivência** (VERIFIED pela semântica da configuração; PARTIAL para o comportamento no TS 7): manter `allowJs` e `checkJs`, incluir `apps/**/*.ts` e adicionar `allowImportingTsExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax` e `noEmit`. Em runtime, o Node permite que um `.mjs` importe `./x.ts`. Quem importa um arquivo convertido troca `./x.mjs` por `./x.ts` na mesma fatia. `skipLibCheck` continua ligado.
- **Ordem:** começar pelos adaptadores de borda, onde mora a classe de bug. A sequência fica:
  1. `twitch/*` (11 arquivos, 1.332 linhas);
  2. `outbox/*` (5 workers);
  3. `http/*` com schemas (H-05);
  4. `persistence/queue-repository.mjs` (2.460 linhas, por último por ser o maior);
  5. `domain/`, `commands/` e `observability/`;
  6. os arquivos raiz (`server.mjs`, `runtime*.mjs`).

  `apps/shared` é usado pelo frontend Next e pede uma decisão separada.
- **As 92 tags JSDoc:** ao converter um arquivo, `@param {T}`, `@returns {T}` e `@typedef` viram anotações TS, `type` e `interface`. O texto descritivo do JSDoc fica. Arquivos ainda não convertidos não mudam, e o TS 7 continua checando o JSDoc deles (sem `@enum`/`@constructor`, PARTIAL).
- **Strict por módulo:** a recomendação é uma segunda configuração, `tsconfig.api.strict.json` (`extends` da raiz, `strict: true`, `include` só com as pastas convertidas), e `npm run typecheck` rodando as duas. Project references exigem `composite` e emissão de declarações, o que é pesado demais para este repositório (UNVERIFIED no TS 7 com `noEmit`). `// @ts-nocheck` só como exceção curta e rastreada, nunca como estado final de uma fatia. Quando todos os arquivos estiverem convertidos, a raiz passa a `strict: true` e o `checkJs` sai de `apps/api`.

## Q3. Vitest com TypeScript

- **Configuração:** o Vitest transforma `.ts` via Vite sem checar tipos (PARTIAL; comportamento geral, não relido para a 5.0.3). Mude o `include` para `tests/**/*.test.{js,jsx,ts}`. O custo de transformação deve ser pequeno perto do PostgreSQL no Docker (UNVERIFIED, precisa medir). Inclua `tests/**/*.ts` em um tsconfig para que o `tsc` pegue erros de tipo nos testes.
- **`vi.mock`:** use `vi.mocked(fn)`. Tipe os fakes como `Pick<ClasseReal, 'membros' | 'usados'>`. Assim, um fake que inventa uma propriedade quebra o `tsc`, que é exatamente o objetivo de H-02/H-03.
- **Instâncias reais do Twurple sem rede** (VERIFIED no `node_modules`): `new HelixCustomRewardRedemption(rawJson)`, alimentado por um payload Helix gravado, já serve, porque os getters leem só os dados brutos. Passe o `client` com cast `as unknown as` só se testar métodos como `getUser()`. Confira o round-trip com `getRawData(instancia)`. Risco: o construtor é `@private`. Concentre o helper em um arquivo e mantenha `@twurple/*` em 8.2.0 (gatilho da linha 9).

## Q4. Prisma, Twurple e Fastify

- **Prisma** (VERIFIED no repo): o `prisma-client-js` já gera `index.d.ts`. Não muda o generator, o Dockerfile (o `prisma generate` já roda no estágio de runtime) nem o instalador. Na CI, o `typecheck` precisa do cliente gerado antes do `tsc`. Se o `npm ci` gera esse cliente nos jobs é UNVERIFIED. O generator novo `prisma-client` (saída em TS, `output` obrigatório, `importFileExtension`) é opcional e **não recomendado** agora. A documentação dele descreve o Prisma 7, em que o `prisma-client-js` está obsoleto ([Prisma generators](https://www.prisma.io/docs/orm/prisma-schema/overview/generators), PARTIAL para a 6.x).
- **Twurple 8.2.0:** escrito em TS e com `.d.ts` publicados, ou seja, tipos de primeira classe (VERIFIED).
- **Fastify 5.12.5:** também tem tipos de primeira classe. Os type providers oficiais ([Fastify Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/), VERIFIED) são `@fastify/type-provider-json-schema-to-ts`, `-typebox` e `-zod`, usados com `Fastify().withTypeProvider<…>()`. A chamada precisa ser repetida em cada escopo encapsulado, e schemas guardados em variável pedem `as const`. Para H-05, recomendo o **json-schema-to-ts**: mantém JSON Schema puro (validação nativa do Fastify, sem biblioteca nova de schema em runtime) e o mesmo schema valida e tipa. Comece pelas 5 rotas de maior valor.

## Q5. Ferramentas do projeto

| Ferramenta | Mudança | Evidência |
|---|---|---|
| `npm run typecheck`/`typecheck:api` | Incluir `apps/**/*.ts` e `tests/**/*.ts`, aplicar os flags da Q1 e criar a configuração strict da Q2 | VERIFIED |
| ESLint (substituído pela Q8: o proprietário prefere o Biome) | Precisaria do `@typescript-eslint/parser` para `.ts`. **Bloqueio:** o typescript-eslint não suporta o TS 7. O `npm ci` falha pelo peer `<6.1.0`, e os mantenedores mandam usar o TS 6 lado a lado ([issue #12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518), fechada em 2026-08-10 como duplicata da #10940) | VERIFIED / PARTIAL (layout do contorno) |
| OpenGrep (`review:static`) | Na sintaxe do Semgrep, `javascript` cobre `.js/.jsx` e `typescript` cobre `.ts/.tsx` ([Semgrep rule syntax](https://semgrep.dev/docs/writing-rules/rule-syntax)). Adicione `typescript` aos `languages` das duas regras e prove a cobertura com uma fixture `.ts`. | PARTIAL (não testado) |
| Scripts `validate:*` | Não inspecionados a fundo. Um glob de extensão `.mjs` deixaria `.ts` de fora, então auditar na TS-0 | UNVERIFIED |
| `npm test` e cobertura | Ajustar o `include` do Vitest. A cobertura passa a incluir `.ts` importado pelos testes | PARTIAL |
| `npm run build` e `docker compose build` | Na opção A, mudam só os caminhos de import e a entrada em `start-product.mjs`. O `.dockerignore` não pode excluir `*.ts` | VERIFIED / UNVERIFIED (`.dockerignore`) |
| Testes de contrato | `tests/unit/quality-script-contract.test.js:8` afirma um typecheck "JSDoc-aware", então precisa ser atualizado junto com as regras (Q7) | VERIFIED |

## Q6. Custo, ordem e riscos (estimativas UNVERIFIED)

| Fatia | Escopo | Semanas-pessoa com agentes |
|---|---|---|
| TS-0 | Ferramentas: flags e configuração strict do tsconfig, Biome (Q8), `typescript` no OpenGrep, include do Vitest, auditoria dos `validate:*`, regras e docs (Q7), teste de contrato. Canário: converter `twitch/credential-fingerprint.mjs` e levá-lo até o build Docker e a CI. | 0,5–1 (+0,5 do Biome) |
| TS-1 | `twitch/*` (11 arquivos, 1.332 linhas) em strict sobre as classes reais do Twurple, com testes de contrato (absorve H-02/H-03) | 1–1,5 |
| TS-2 | `outbox/*` (5 workers) em strict | 0,5 |
| TS-3 | `http/*` com json-schema-to-ts nas 5 rotas principais (início de H-05) | 1–1,5 |
| TS-4 | `persistence/queue-repository` (2.460 linhas), talvez dividido antes | 1–1,5 |
| TS-5 | `domain/`, `commands/`, `observability/`, arquivos raiz, troca da entrada e `strict: true` global | 0,5–1 |
| **Total** | | **≈5–7,5**, das quais cerca de 2–3 já estão dentro de H-02/H-03/H-05 |

Cada fatia é um PR próprio, feito depois do trabalho crítico do cutover da OPS-15 ou em paralelo quando os conjuntos de escrita não se sobrepõem.

**Riscos:**

1. Lint de `.ts` bloqueado pelo TS 7, resolvido pelo Biome na Q8.
2. Regressão por renomear caminhos de import. Mitigação: uma pasta por PR, com `npm test` completo e smoke do Docker.
3. O modo strict pode revelar muitos erros latentes no `queue-repository`.
4. O OpenGrep pode deixar de varrer `.ts` sem avisar.
5. Tempo de CI: o `tsc` 7 é rápido, e o peso continua no PostgreSQL Docker e no `next build`.
6. O construtor `@private` do Twurple usado nos helpers de teste.

## Q7. Onde está a regra "JavaScript ESM com JSDoc" (VERIFIED, `grep` em 2026-10-27)

| Arquivo:linha | Texto (resumo) | Ação do `@po`/`@sm` |
|---|---|---|
| `AGENTS.md:111` | "JavaScript ESM com JSDoc" (stack) | Trocar por "TypeScript (sintaxe apagável, executado via type stripping do Node) em `apps/api`; JS ESM com JSDoc no restante até a migração" |
| `docs/CONTRIBUTING.md:12` | "Keep product code JavaScript ESM with JSDoc. Do not introduce TypeScript, a transpiler…" | Reescrever: TS liberado no backend, sem transpilador para a API |
| `docs/pt-BR/CONTRIBUICAO.md:12` | Mesmo texto em pt-BR | Idem |
| `docs/fullstack-architecture.md:7` e `docs/pt-BR/fullstack-architecture.md:7` | "Product runtime is JavaScript ESM…" | Atualizar |
| `docs/front-end-architecture.md:13` e pt-BR `:13` | O navegador continua em JS ESM com JSDoc, e o Next "não autoriza TypeScript…" | Escopo do frontend: manter ou decidir à parte |
| `docs/architecture.md:28` e pt-BR `:28` | `prisma-client-js` "fixado para gerar JavaScript" | Continua válido na opção A, só ajustar a justificativa |
| `docs/process/backend-migration-study.md:19,91` e pt-BR | Premissa A3 | Registrar que a decisão do proprietário a substitui |
| `tests/unit/quality-script-contract.test.js:8` | "JSDoc-aware no-emit typecheck" | Atualizar na TS-0 |
| `CLAUDE.md`, `.claude/CLAUDE.md` e `.aiox-core/constitution.md` | **Nenhuma ocorrência** (a linha `.claude/CLAUDE.md:87` só fala em "TypeScript/JavaScript best practices") | Nada a mudar |

## Q8. Biome no lugar do ESLint (preferência do proprietário, 2026-10-27)

Fatos do repo (VERIFIED): `eslint` 10.12.0 e `@eslint/js` 10.0.1, sem Prettier, e um `eslint.config.js` de 54 linhas. Os scripts `lint`, `lint:api`, `lint:infra` e `lint:web` usam `--max-warnings=0`. A CI chama `npm run lint:${{ matrix.app }}` (linha 29) e `npm run lint` (linha 48). Não há `.vscode/`. O lint cobre `apps/frontend` e `tests/`.

**Situação do Biome** (VERIFIED, [blog do Biome](https://biomejs.dev/blog/)): a v2.6 saiu em 2026-10-15. A v2.5, de 2026-06-05, chegou a cerca de 500 regras e lint entre arquivos. É linter e formatter em um binário para JS/TS/JSX/ESM/JSON. **Não usa o compilador TypeScript**, então escapa por completo do bloqueio TS 7/typescript-eslint da Q5 (inferência: ele tem parser e motor de inferência próprios).

**Regras com tipos** (VERIFIED, páginas das regras): o Biome tem motor de inferência de tipos próprio, ligado pelo domínio **Types**, que também ativa o scanner do projeto. Existem [`noFloatingPromises`](https://biomejs.dev/linter/rules/no-floating-promises/) (desde a v2.0.0) e [`noMisusedPromises`](https://biomejs.dev/linter/rules/no-misused-promises/) (desde a v2.1.0). Ambas estão em **nursery** ("experimental, o comportamento pode mudar"), com severidade padrão *information* e correção insegura. A [página de origens das regras](https://biomejs.dev/linter/rules-sources/) não lista equivalente para `await-thenable`, `no-unnecessary-condition`, `switch-exhaustiveness-check`, `restrict-template-expressions` nem para a família `no-unsafe-*`. A completude da inferência do Biome em relação ao checker do TS é UNVERIFIED, então espere menos achados que no typescript-eslint.

**Domínios** (VERIFIED, [Domains](https://biomejs.dev/linter/domains/)): ativam-se sozinhos conforme as dependências.

- **Next** (next ≥ 14): `noImgElement`, `noHeadElement`, `useInlineScriptId`, `noDocumentImportInPage`, entre outras.
- **React:** `useHookAtTopLevel` (equivale a rules-of-hooks), `useExhaustiveDependencies` ("inspirada" em exhaustive-deps, então as opções podem diferir), `useJsxKeyInIterable` e outras.
- **Test:** ativado pelo vitest.

`@next/next/no-html-link-for-pages` não tem equivalente listado. Hoje o repo **não** usa `eslint-config-next` nem o plugin de hooks (VERIFIED, `eslint.config.js`), então os domínios Next e React **acrescentam** cobertura em vez de substituir algo.

**Mapa regra a regra do `eslint.config.js`:**

| Regra/ajuste atual do ESLint | Biome | Situação |
|---|---|---|
| `eslint.configs.recommended` | `linter.rules.recommended: true` | Quase equivalente; paridade total não confirmada (PARTIAL) |
| `no-unused-vars` com `argsIgnorePattern: '^_'` | `noUnusedVariables` (por padrão ignora nomes com `_`; a semântica exata para argumentos é UNVERIFIED) | Tem equivalente |
| `no-restricted-imports` com `patterns.group ['**/web/*','**/web/**']` e mensagem (OPS-15 S-03, só em `apps/frontend` e `apps/shared`) | [`noRestrictedImports`](https://biomejs.dev/linter/rules/no-restricted-imports/) com `patterns: [{ group, message }]` (estilo gitignore), escopado por `overrides[].includes` | Tem equivalente; testar `**/web/*` em imports relativos (PARTIAL) |
| `globals` (listas de node/browser) | Dispensável: variáveis não declaradas ficam com `noUndeclaredVariables` (desligada por padrão) e com o `tsc` | Usar `tsc` |
| `ignores` (`.next`, `out`, `coverage`) | `files.includes` com negações `!` | Tem equivalente |
| `ecmaFeatures.jsx`, `sourceType: module` | Nativos | Tem equivalente |

**OpenGrep:** é independente do linter e continua como o único revisor estático (regra do proprietário). Acrescente `typescript` aos `languages`, como na Q5. Não leve as regras de segurança para o Biome: os plugins GritQL existem, mas são outro escopo, desnecessário aqui.

**Formatação:** o Biome substitui o Prettier, que o repo não tem. Para evitar churn de diffs:

1. Configure o formatter para casar com o estilo dominante atual (aspas simples, ponto e vírgula, 2 espaços e largura medida no repo).
2. Rode `biome format --write` em **um commit isolado só de formatação**, sem mudança de lógica.
3. Registre esse commit em `.git-blame-ignore-revs`.
4. Faça isso entre os merges das branches abertas da OPS-15, porque a formatação conflita com todas elas.

A alternativa é ligar primeiro só o linter e o formatter depois.

**Scripts, CI e IDE:**

- `lint*` passa a ser `biome lint <caminhos> --error-on-warnings` (ou `biome check` para lint e formatação juntos).
- Adicione `format:check` ou use `biome ci` na CI (o comando oficial para CI; PARTIAL, não relido).
- Se os nomes dos scripts forem mantidos, o YAML das linhas 29 e 48 não muda.
- Atualize `tests/unit/quality-script-contract.test.js` e `ci-workflow-contract.test.js` se eles verificarem `eslint`.
- Remova `eslint`, `@eslint/js` e `eslint.config.js`, e fixe `@biomejs/biome` em versão exata.
- No VS Code, use a extensão oficial `biomejs.biome` (formatter e diagnósticos), opcionalmente recomendada em `.vscode/extensions.json`.

**Recomendação: Biome + `tsc --noEmit` (strict por módulo, Q2) como gate de tipos.** Não adicionar o typescript-eslint: ele está bloqueado pelo TS 7.0.2 (Q5), e manter uma cópia do TS 6 só para o lint traz um segundo compilador e atrito com peers.

- Ligue as regras nursery `noFloatingPromises` e `noMisusedPromises` **só em `apps/api` (`overrides`), em nível `warn`, como experimento**. Promova para `error` depois que uma fatia rodar sem falso positivo, porque promessas não tratadas são um risco real nos workers da outbox e da Twitch.
- Reavalie as regras com tipos do typescript-eslint (`await-thenable`, `switch-exhaustiveness-check`, `no-unsafe-*`) só quando ele suportar a API do TS 7 (issue #10940).
- `switch-exhaustiveness-check` pode ser coberto com checagem `never` no `tsc`, como convenção de código.

**Ordem e custo (estimativa UNVERIFIED):** o Biome vem **primeiro, dentro da TS-0** (+0,5 semana-pessoa). A sequência é migrar o linter, verificar paridade (lint da árvore atual sem achados, ou deltas documentados) e depois fazer o commit isolado de formatação. Assim, todo `.ts` novo já nasce formatado e analisado, e o bloqueio de ferramenta da TS-0 desaparece. O total fica em torno de 5 a 7,5 semanas-pessoa.

## Só um teste no ambiente do projeto confirma

- Se o `node` 24.20.0 em `node:24.20.0-alpine3.24` inicia o canário convertido a partir do `start-product.mjs`, e se o build Docker e o smoke do instalador continuam passando.
- Se o TS 7.0.2 aceita imports mistos `.mjs` → `.ts` com `allowImportingTsExtensions` e `checkJs`, e quantos erros a configuração strict gera por pasta.
- Se o OpenGrep com `languages: [javascript, typescript]` acusa uma violação plantada em uma fixture `.ts`.
- Se o `typecheck` da CI enxerga os tipos gerados do Prisma, e quanto tempo o Vitest leva para transformar a suíte real.
- Se os getters de `new HelixCustomRewardRedemption(raw)` devolvem o esperado para um payload gravado.
- Paridade do Biome: achados de `biome lint` contra `eslint` na árvore atual, se o `noRestrictedImports` bloqueia um `../web/x.mjs` plantado em `apps/frontend`, a taxa de falso positivo das regras nursery em `apps/api` e o tamanho do diff de formatação.

## Fontes (acessadas em 2026-10-27)

- [Node.js v24, Modules: TypeScript](https://nodejs.org/docs/latest-v24.x/api/typescript.html) (VERIFIED)
- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) (VERIFIED no essencial, via trecho de busca)
- [Progress on TypeScript 7, dez/2025](https://devblogs.microsoft.com/typescript/progress-on-typescript-7-december-2025) e [Visual Studio Magazine](https://visualstudiomagazine.com/Articles/2025/12/02/Microsoft-Gets-Real-on-Native-TypeScript-Remake.aspx) (PARTIAL)
- [typescript-eslint, issue #12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518) (VERIFIED)
- [Fastify Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/) (VERIFIED)
- [Prisma generators](https://www.prisma.io/docs/orm/prisma-schema/overview/generators) (PARTIAL; página da v7)
- [Semgrep rule syntax, tabela de linguagens](https://semgrep.dev/docs/writing-rules/rule-syntax) (PARTIAL para o OpenGrep)
- Biome: [blog (v2.6, 2026-10-15)](https://biomejs.dev/blog/), [Domains](https://biomejs.dev/linter/domains/), [noFloatingPromises](https://biomejs.dev/linter/rules/no-floating-promises/), [noMisusedPromises](https://biomejs.dev/linter/rules/no-misused-promises/), [noRestrictedImports](https://biomejs.dev/linter/rules/no-restricted-imports/), [Rule sources](https://biomejs.dev/linter/rules-sources/) (VERIFIED)
- Repositório: `package.json`, `tsconfig*.json`, `Dockerfile`, `vitest.config.js`, `eslint.config.js`, `.opengrep/rules.yml`, `node_modules/@twurple/*` (VERIFIED)

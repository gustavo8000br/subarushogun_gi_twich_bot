# OPS-24 — Converter o backend para TypeScript e migrar o lint do ESLint para o Biome

[English](../../../stories/OPS-24/story.md)

**Status:** Ready (Pronta; GO do `@po` em 2026-10-27, ver [po-validation.md](po-validation.md)). Implementação somente após GO do `@po`, os gates de planejamento abaixo, issue criada pelo `@devops` e as regras de sequência em "Dependências". **Issue:** #91 (criada pelo `@devops`; sem comentários em issues).
**Origem:** decisões do proprietário de 2026-10-27 (abaixo); nota de pesquisa do `@analyst` [typescript-migration-research.md](../OPS-15/typescript-migration-research.md) (fatias TS-0..TS-5, riscos, Q7 com os locais da regra, Q8 Biome); estudo do `@architect` [backend-migration-study.md](../../process/backend-migration-study.md) (plano de endurecimento H-01..H-09, "não reescrever em outra linguagem").
**Relacionadas:** OPS-15 (o cutover não pode congelar); OPS-22 (recuperação financeira — vem primeiro, é dona do bug que motivou a tipagem); OPS-23 (SSE — espera apenas a TS-0 e a TS-2, ver "Dependências"); OPS-21 (contrato da API do painel — divide `http/*` e `queue-repository`); FT-01 e FT-28 (conjunto de escrita do frontend tocado pelo commit de formatação do Biome).
**Item registrado (proprietário, 2026-10-30):** o item **TS-16** do inventário faz parte desta story: tipar o JSX do painel Next (`apps/frontend/**/*.jsx`) e devolvê-lo ao `typecheck:web` (59 erros em 14 arquivos, listados em [frontend-jsx-typecheck-backlog.md](frontend-jsx-typecheck-backlog.md)). O frontend é tipado por JSDoc e continua `.jsx`, então a exclusão "frontend em TypeScript" abaixo não muda. Depende da FT-30 (ferramentas) e da FT-42 (a onda 4 reaponta o job `web`); o `@architect` ordena. Nenhum CA é acrescentado aqui; o arquivo de backlog é a lista inicial. Ver [backlog-inventory](../../process/backlog-inventory.md).
**Coordenação necessária:** `$aiox-po` (validação, texto da regra), `$aiox-architect` (layout de tsconfig/strict, regras do Biome, texto da regra do proprietário em `AGENTS.md`), `$aiox-data-engineer` (só para confirmar que dividir o `queue-repository` e tipar o Prisma não muda schema nem migration), `$aiox-analyst` (itens em aberto abaixo, se houver), `$aiox-qa` independente, `$aiox-devops` (issue, workflow de CI). `$aiox-ux-design-expert`: não se aplica, sem mudança voltada à pessoa usuária (ver "Nota de UX").

## Problema

Os defeitos achados na bateria ao vivo (um getter do Twurple que não existe, `error.status` onde o Twurple lança `statusCode`, fakes de teste que são objetos simples em vez de classes da biblioteca) são **defeitos de fronteira de tipos que o próprio verificador do repositório está configurado para não pegar**: `tsconfig.json` tem `strict: false`, os parâmetros do adaptador não têm tipos JSDoc e existem só 92 tags JSDoc em 7.524 linhas de 45 arquivos do backend ([estudo](../../process/backend-migration-study.md), seção 2). O estudo do `@architect` rejeitou reescrever em outra linguagem (10 a 24 pessoas-semana, congela OPS-15/OPS-20/OPS-21, nenhuma biblioteca Twitch tão completa quanto o Twurple 8.2.0) e a nota do `@analyst` verificou o caminho mais barato: o Node 24.20.0 executa `.ts` direto (type stripping, estável desde o 24.12.0), o TypeScript 7.0.2 já é o compilador nativo rápido e o Docker já roda a API como código-fonte.

Dois fatos de ferramentas moldam o trabalho (nota, seções 0, Q5 e Q8):

- O `typescript-eslint` não roda no TypeScript 7 (sem API programática; o `npm ci` falha na faixa de peer), então lintar `.ts` com ESLint exigiria um segundo compilador. Por isso o proprietário também escolheu o **Biome** (lint e formatação em um só binário) e o `tsc --noEmit` como gate de tipos.
- Três superfícies de configuração ignoram `.ts` hoje em silêncio: o `include` do Vitest (`tests/**/*.test.{js,jsx}`), os globs do ESLint e as duas regras do OpenGrep (`languages: [javascript]`). Um arquivo convertido poderia não ser testado, lintado nem varrido e os gates continuariam verdes. Fechar isso faz parte da primeira fatia, não de um acompanhamento.

## Decisões do proprietário (2026-10-27)

1. O backend (`apps/api`) vai para **TypeScript**, sem reescrita em outra linguagem. O Docker continua obrigatório.
2. O lint passa do **ESLint para o Biome** (lint e formatação) junto com a conversão.
3. Ordem: tipagem e recuperação financeira (**OPS-22**) antes do SSE (**OPS-23**). A conversão **não pode congelar o cutover da OPS-15**.
4. Caminho técnico aprovado: executar `.ts` direto no Node 24.20.0 (type stripping, sem etapa de build) com `tsc --noEmit` como gate; lint com Biome mais `tsc`; sem `typescript-eslint`.
5. Mudar a regra "JavaScript ESM com JSDoc" no `AGENTS.md` é decisão do proprietário, **já tomada em 2026-10-27**. Esta story, portanto, não precisa de nova decisão do proprietário para alterá-la; ela lista onde o texto mora (abaixo) para o `@architect` aplicar na fatia TS-0.

## História

Como proprietário que mantém este bot com agentes de IA,
quero o backend convertido de forma incremental para TypeScript, com verificação estrita por pasta convertida e com o Biome como único linter e formatador,
para que uma propriedade errada de biblioteca, um formato de erro errado ou um fake que não corresponde à classe real falhem no compilador ou no teste de contrato, e não numa live, sem congelar o cutover da OPS-15.

## Escopo

**Dentro (seis fatias, um PR cada, nesta ordem; os nomes seguem a nota de pesquisa, os IDs do inventário são FT-30..FT-35):**

- **TS-0 — Ferramentas.** Flags de `tsconfig` para `.ts` mais uma configuração estrita para as pastas convertidas; Biome substituindo o ESLint (paridade primeiro, depois um commit isolado só de formatação); OpenGrep varrendo `.ts`; Vitest incluindo `.ts`; auditoria dos scripts `validate:*` e do `.dockerignore`; as atualizações de regra e documentação; um arquivo canário passando por Docker e CI.
- **TS-1 — `apps/api/src/twitch/*`** (11 arquivos, 1.332 linhas) estrito, tipado sobre classes reais do Twurple, testes de contrato com instâncias reais. Absorve os itens do estudo **H-02** (adaptador tipado) e **H-03** (testes de contrato com instâncias reais).
- **TS-2 — `apps/api/src/outbox/*`** (5 workers) estrito.
- **TS-3 — rotas de `apps/api/src/http/*`** estritas, com type provider de JSON Schema nas cinco rotas de maior valor (início da **H-05**).
- **TS-4 — `apps/api/src/persistence/queue-repository`** (2.460 linhas), possivelmente dividido por agregado antes (H-07), sem mudança de comportamento.
- **TS-5 — o restante** (`domain/`, `commands/`, `observability/`, arquivos raiz `server`, `runtime*`, troca da entrada em `start-product.mjs`) e virar `strict: true` globalmente em `apps/api`.

**Fora do escopo:**

- Reescrita em outra linguagem, NestJS, bundler, build para `dist/` ou `tsx` em produção (só a rota A da nota).
- `apps/frontend` (Next) e `apps/shared` como TypeScript; a regra do frontend continua como está ([front-end-architecture.md](../../front-end-architecture.md) linha 13) e `apps/shared` é decisão própria posterior. O Biome lint e formata `apps/frontend` e `tests/` porque o ESLint cobria esses diretórios.
- Mover o Prisma para o gerador novo `prisma-client` (não recomendado na nota).
- Mudar comportamento, rotas, schema, migrations, textos visíveis ou contrato do painel. Toda fatia preserva comportamento; correções encontradas pelo modo estrito são mudanças separadas, test-first, registradas na fatia.
- Mover regras de segurança do OpenGrep para o Biome; o OpenGrep continua o único revisor estático (decisão do proprietário).
- Regras com tipos do typescript-eslint (reavaliar só quando ele suportar a API do TS 7, issue #10940 upstream).
- Bump de versão, commit, push, PR, release, cutover.

## Critérios de aceite

As classes de evidência continuam separadas: unitário, PostgreSQL isolado com migrations reais, build Docker e smoke do instalador, CI. Todo comportamento começa com um teste que falha (Red-first); as fatias de ferramentas provam cada gate com uma violação plantada de propósito antes de confiar nele.

### Fatia TS-0 — Ferramentas

1. **Dado** `tsconfig.json` e `tsconfig.api.json`, **quando** as flags são atualizadas (`apps/**/*.ts` e `tests/**/*.ts` incluídos, `allowImportingTsExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `noEmit`; `allowJs` e `checkJs` mantidos) e um segundo `tsconfig.api.strict.json` é adicionado (`extends` da raiz, `strict: true`, `include` limitado às pastas convertidas), **então** `npm run typecheck` roda as duas configurações e um erro de tipo plantado em arquivo convertido o faz falhar.
2. **Dado** o `include` do Vitest como `tests/**/*.test.{js,jsx,ts}`, **quando** um arquivo `.test.ts` com asserção que falha é adicionado, **então** `npm test` o executa e ele falha; o tempo de transformação na suíte real é medido e registrado (a nota o marca como NÃO VERIFICADO).
3. **Dado** o Biome instalado com versão exata fixada e um `biome.json` que mapeia o `eslint.config.js` do repositório (conjunto recomendado, variáveis não usadas ignorando nomes com prefixo `_`, o padrão de import restrito `**/web/*` e `**/web/**` limitado a `apps/frontend` e `apps/shared` com sua mensagem, ignores para `.next`, `out`, `coverage`), **quando** `npm run lint`, `lint:api`, `lint:infra` e `lint:web` rodam, **então** usam o Biome com avisos tratados como erro, mantêm os mesmos nomes de script (assim as linhas 29 e 48 de `.github/workflows/quality-gates.yml` não mudam) e a árvore atual passa com zero achados ou cada diferença em relação ao ESLint fica documentada na evidência da fatia.
4. **Dado** um import `../web/x.mjs` plantado em `apps/frontend`, **quando** o lint roda, **então** a regra de import restrito o reprova (a regra precisa ser provada em imports relativos, que a nota marca como PARCIAL).
5. **Dada** a checagem de paridade, **quando** o ESLint é removido, **então** `eslint`, `@eslint/js` e `eslint.config.js` somem, `tests/unit/quality-script-contract.test.js` (linha 8 "JSDoc-aware no-emit typecheck") e `tests/unit/ci-workflow-contract.test.js` (se afirmar `eslint`) são atualizados test-first e o lockfile instala limpo com `npm ci`.
6. **Dadas** as regras nursery `noFloatingPromises` e `noMisusedPromises`, **quando** são habilitadas só em `apps/api`, **então** rodam no nível `warn` como experimento; a promoção para `error` exige uma fatia sem falsos positivos, registrada pelo `@qa`. Elas não podem quebrar os gates com `--error-on-warnings`, então o `@architect` decide como o experimento é reportado (pergunta aberta 3).
7. **Dado** o `.opengrep/rules.yml` com `languages: [javascript, typescript]` nas duas regras, **quando** `npm run review:static` roda sobre um fixture `.ts` com uma violação plantada, **então** reporta o achado e sai com código diferente de zero; sem a violação plantada, sai com zero. O fixture fica onde a varredura real não o reporta como achado do projeto (local definido por `@dev` e `@qa`).
8. **Dado** o formatador configurado para o estilo dominante atual medido no repositório (aspas simples, ponto e vírgula, 2 espaços, largura de linha), **quando** `biome format --write` é executado, **então** é **um commit isolado, só de formatação**, sem mudança de lógica, seu hash entra em `.git-blame-ignore-revs` e `git diff -w` ou a suíte de testes prova que o comportamento não mudou. Ele não é criado antes da condição de sequência em "Dependências".
9. **Dado** o canário `apps/api/src/twitch/credential-fingerprint.mjs` convertido para `.ts` com seus importadores trocados na mesma fatia, **quando** a imagem Docker é construída e iniciada com `node apps/infra/scripts/start-product.mjs` em `node:24.20.0-alpine3.24`, **então** a API sobe e o smoke do instalador passa; o `.dockerignore` não exclui `*.ts`; `prisma generate` roda antes do `tsc` no CI (a nota marca os dois como NÃO VERIFICADOS). A evidência de CI depende de autorização de push (OW-13); até lá a evidência é Docker local e é registrada como tal.
10. **Dados** os scripts `validate:localization`, `validate:version` e `validate:port-denylist`, **quando** são auditados, **então** qualquer glob de extensão que pule `.ts` é corrigido test-first e o resultado da auditoria é registrado.
11. **Dado** o texto da regra, **quando** a lista de documentação em "Regras e documentos a atualizar" é aplicada, **então** cada arquivo e linha listados são atualizados em inglês e pt-BR (onde há gêmeo pt-BR), os testes de contrato de documentação passam e o `AGENTS.md` registra que o backend `apps/api` é TypeScript com sintaxe apagável executado pelo type stripping do Node, enquanto o resto continua JavaScript ESM com JSDoc até ser migrado.

### Fatia TS-1 — `twitch/*`

12. **Dados** os 11 arquivos de `apps/api/src/twitch/*`, **quando** convertidos para `.ts` com `import type` para tipos e especificadores de import com `.ts`, **então** passam em `tsconfig.api.strict.json` com `strict: true` e sem `@ts-nocheck`, `@ts-ignore` nem `any` sem tipo nas fronteiras de Twurple, Fastify ou Prisma.
13. **Dado** que o adaptador lê o status de um resgate, **quando** lê uma propriedade que `HelixCustomRewardRedemption` não tem, **então** o `tsc` falha. Isso é provado por um teste ou fixture de erro de compilação deliberado e fecha a H-02. (Se a fatia 1 da OPS-22, FT-24, já corrigiu o mapeamento em JavaScript, esta fatia tipa esse código; não o corrige de novo.)
14. **Dado** um helper de teste em um único arquivo que constrói instâncias reais de `HelixCustomRewardRedemption` a partir de JSON bruto gravado do Helix (`new HelixCustomRewardRedemption(raw)`, com `client` passado por `as unknown as` só onde um método que o exige é exercitado), **quando** os testes de twitch rodam, **então** usam instâncias reais do Twurple no lugar de fakes de objeto simples para tipos do Twurple (H-03), afirmando ida e volta com `getRawData`. Fakes em outros lugares são tipados como `Pick<ClasseReal, ...>`, de modo que uma propriedade inventada falhe no `tsc`.
15. **Dado** que `@twurple/*` está fixado em 8.2.0, **quando** o helper depende do construtor `@private`, **então** um teste falha se uma atualização menor mudar a assinatura do construtor, e o helper fica em um único arquivo.
16. **Dada** a função de classificação de erros da fatia 1 da OPS-22, **quando** é convertida, **então** ela estreita por `instanceof HttpStatusCodeError`, de modo que `statusCode` seja o único campo acessível após a checagem.

### Fatia TS-2 — `outbox/*`

17. **Dados** os cinco workers do outbox, **quando** convertidos, **então** passam em strict, os valores de estado do outbox e os tipos de operação são uniões de literais de string, e um `switch` sobre eles termina com uma checagem de exaustividade `never` que o `tsc` impõe.
18. **Dados** os testes de integração em PostgreSQL do outbox (leases, tentativas, `unknown`, retry), **quando** rodam após a conversão em PostgreSQL isolado com migrations reais, **então** passam sem alteração (preservação de comportamento).

### Fatia TS-3 — `http/*`

19. **Dados** os arquivos de rotas de `http/*`, **quando** convertidos, **então** passam em strict, e as cinco rotas escolhidas pelo `@architect` (primeiras candidatas: as que a OPS-21 e a OPS-22 mais mudam) usam `@fastify/type-provider-json-schema-to-ts` com schemas `as const` que validam entrada e saída e tipam o handler, reaplicado em cada escopo de plugin encapsulado.
20. **Dado** um erro inesperado em qualquer rota convertida, **quando** é lançado, **então** o contrato de erro seguro não muda: texto genérico localizado com `referenceId`, sem mensagem, stack nem dados internos (um teste por grupo de rotas convertido).
21. **Dados** o guard de `code` de erro e os testes de idempotência da OPS-21, **quando** a fatia entra, **então** passam sem alteração.

### Fatia TS-4 — `queue-repository`

22. **Dado** `persistence/queue-repository.mjs` (2.460 linhas), **quando** o `@architect` e o `@data-engineer` decidem se dividem por agregado antes, **então** a divisão (se escolhida) é um PR próprio com preservação de comportamento, com a suíte de integração em PostgreSQL verde antes e depois, e a conversão vem em seguida.
23. **Dado** o repositório convertido, **quando** passa em strict, **então** as chamadas do Prisma usam os tipos do cliente gerado (sem mudança de gerador, schema ou migration) e a suíte completa de integração em PostgreSQL passa com migrations reais.
24. **Dado** que o modo estrito expõe erros latentes, **quando** um revela um defeito real, **então** ele é registrado e corrigido test-first em mudança separada com seu próprio teste Red, nunca escondido por cast ou supressão.

### Fatia TS-5 — Restante e `strict` global

25. **Dado** que todos os arquivos restantes de `apps/api` são `.ts`, **quando** `strict: true` é definido na configuração raiz para `apps/api` e `checkJs` é removido para ele, **então** `npm run typecheck` fica verde, `tsconfig.api.strict.json` é incorporado e nenhum `@ts-nocheck` resta em `apps/api`.
26. **Dado** que os arquivos de entrada foram convertidos, **quando** `start-product.mjs` aponta para a entrada `.ts`, **então** a imagem Docker, a stack Compose e o smoke do instalador iniciam o produto sem mudança.
27. **Dado** o conjunto de fatias, **quando** os gates finais rodam, **então** os números registrados são: linhas e arquivos convertidos, contagem de erros do `strict` por pasta no início de cada fatia, tags JSDoc restantes e os tempos de Vitest e `tsc` antes e depois.

## Dependências

- **Depende de:** GO do `@po` e issue; fatias da OPS-22 (FT-24, FT-25, FT-26) integradas antes das fatias que tocam os mesmos arquivos (abaixo); autorização do proprietário para push/PR (OW-13) para a evidência de CI do AC 9.
- **Ordem em relação à OPS-22 e à OPS-23 (decisão 3 do proprietário):** OPS-22 primeiro. A TS-0 pode começar em paralelo à OPS-22 somente se o conjunto de escrita não se sobrepuser (ela toca configuração, docs e um arquivo canário, não `twitch/*`). A TS-1 começa após a FT-24 (mesmos arquivos `helix-adapter` e `reconciliation`); a TS-2 após FT-25 e FT-26 (`financial-worker`, `reward-worker`); a TS-4 após a FT-26 (a exclusão muda o `queue-repository`). **A OPS-23 (FT-27..FT-29) espera apenas a TS-0 (FT-30) e a TS-2 (FT-32, porque a FT-27 faz os workers do outbox emitirem notificações).** A TS-3 (FT-33) e a FT-27 são ordenadas pelo `@architect` em `http/*` (nunca dois agentes `@dev` nos mesmos arquivos); a TS-1 (FT-31) roda após a FT-24, independente da OPS-23; a TS-4 (FT-34) e a TS-5 (FT-35) nunca bloqueiam a OPS-23 nem o cutover. Motivo: respeita "tipagem antes do SSE" nos arquivos que o SSE toca sem deixar 5 a 7,5 pessoa-semanas segurarem uma dependência do cutover (decisão 3 do proprietário). Correção exigida pelo `@po` ([po-validation.md](po-validation.md)); confirmada pelo proprietário em 2026-10-27 (OD-24-3, DECIDIDA).
- **Coordenação com FT-28 e FT-01:** o commit de formatação do Biome reescreve `apps/frontend`, que a FT-01 (polimento de páginas) e a FT-28 (provider compartilhado) editam. **Decisão do proprietário OD-24-2 (2026-10-27):** o commit só de formatação é **um único commit feito depois da Onda 4 do cutover da OPS-15** (remoção do painel vanilla e de `apps/web`, [`cutover-plan.md`](../OPS-15/cutover-plan.md)), e o hash dele é registrado em `.git-blame-ignore-revs`. Ele continua nunca rodando enquanto houver branches da FT-01 ou da FT-28 abertas em `apps/frontend`. Até lá, a TS-0 entrega o Biome só como linter e o formatador espera (nota, Q8). *(Superado pela decisão de 2026-10-27: a janela anterior "depois ou entre essas branches, antes do cutover se possível".)*
- **Coordenação com a OPS-21:** FT-11..FT-16 mudam `queue-routes.mjs` e o cliente Next; a TS-3 é ordenada em relação a elas (um conjunto de escrita por vez).
- **Não bloqueia o cutover da OPS-15.** Nada em FT-10, FT-09 ou OW-11 depende desta story; se surgir conflito, o cutover vence e as fatias de TypeScript esperam.
- **É dependência de:** nada do cutover; H-04 e H-05 do estudo são absorvidas aqui.
- **TS-16 (2026-10-30):** o backlog de typecheck do JSX entra nesta story depois da FT-30 e da onda 4 da OPS-15 (FT-42); a contagem de erros registrada pela FT-42 (59) não pode crescer nesse meio tempo. Ordem fixada pelo `@architect`.

## Riscos

(A numeração segue a nota de pesquisa, Q6.)

1. **Incompatibilidade entre ESLint e TypeScript 7** bloqueia lintar `.ts`. Mitigação: Biome mais `tsc` (decisão 4); o typescript-eslint não é adicionado.
2. **Regressões nos caminhos de import** (`.mjs` para `.ts`) que os testes não cobrem. Mitigação: uma pasta por PR, importadores trocados no mesmo PR, `npm test` completo e smoke do Docker por fatia.
3. **O modo estrito expõe muitos erros latentes**, sobretudo no `queue-repository`, então a TS-4 pode demorar. Mitigação: contagem de erros por pasta antes de cada fatia (uma execução `tsc` somente leitura pelo `@qa`), divisão opcional antes, sem comentários de supressão.
4. **OpenGrep sem varrer `.ts` em silêncio**, dando falsa confiança no `review:static`. Mitigação: o AC 7 planta uma violação em fixture `.ts` antes de converter qualquer arquivo.
5. **Tempo de CI:** o `tsc` 7 é rápido; as partes pesadas continuam sendo o PostgreSQL em Docker e o `next build`. Mitigação: medir no AC 27.
6. **Construtor `@private` do Twurple** no helper de teste pode mudar numa versão menor. Mitigação: AC 15, um único arquivo de helper, versão 8.2.0 fixada.
7. **O commit de formatação conflita** com todas as branches abertas e esconde o blame. Mitigação: commit isolado depois ou entre as branches abertas da OPS-15, `.git-blame-ignore-revs`, testes provam ausência de mudança de lógica.
8. **A cobertura com tipos do Biome é menor que a do typescript-eslint** (sem equivalentes listados para `await-thenable`, `switch-exhaustiveness-check`, `no-unsafe-*`; as duas regras de promise são nursery). Mitigação: o `tsc` estrito e a convenção `never` carregam as checagens de tipos; as regras nursery começam como avisos.
9. **O type stripping aceita só sintaxe apagável e não checa tipos.** Mitigação: `erasableSyntaxOnly`, e o `tsc` é gate obrigatório de CI (um `node` verde não prova nada sobre tipos).
10. **Pressão de entrega:** o trabalho compete com o cutover e com OPS-22/OPS-23 pelos mesmos arquivos e pela mesma revisão de um único proprietário. Mitigação: a ordem de dependências acima; cada fatia pode ser entregue sozinha e pausada entre fatias.

## Complexidade (estimativa do `@sm`, a confirmar pelo `@architect`)

Escopo 5, integração 3, infraestrutura 4, conhecimento 3, risco 4 = **19 → COMPLEXA (GG)**. Prioridade **P2** (acompanhamento aprovado que não pode bloquear o cutover; não é dependência P0/P1 da FT-10). Dificuldade **GG** no total; esforço pela nota (NÃO VERIFICADO): TS-0 **G** (1 a 1,5 pessoa-semana com o Biome), TS-1 **G** (1 a 1,5), TS-2 **M** (0,5), TS-3 **G** (1 a 1,5), TS-4 **G** (1 a 1,5), TS-5 **M** (0,5 a 1). Total de cerca de 5 a 7,5 pessoas-semana, das quais cerca de 2 a 3 já estavam planejadas como H-02, H-03 e H-05.

## Valor de negócio

A classe de bug que deixou operações financeiras em `unknown` e bloqueou a exclusão de fila passa a ser erro de compilação, e não incidente numa live (estimado em 0,5 a 1,5 pessoa-semana por incidente no estudo). Os agentes de IA ganham retorno rápido e nativo do compilador e uma só ferramenta de lint e formatação, com o modelo de execução (Node mais Docker, código-fonte na imagem) e a camada Twitch inalterados.

## Plano de testes (test-first)

1. **Canário até Docker e CI:** a TS-0 converte um arquivo pequeno e prova a cadeia inteira (tsc, Vitest, Biome, OpenGrep, build e start do Docker, smoke do instalador, CI) antes de converter qualquer pasta.
2. **Provas dos gates por violação plantada:** um erro de tipo (tsc), um `.test.ts` que falha (Vitest), uma violação de lint e um import `../web/x.mjs` (Biome), uma violação de regra em fixture `.ts` (OpenGrep). Cada gate precisa falhar com a planta e passar sem ela.
3. **Paridade do Biome:** `biome lint` na árvore atual comparado com o `eslint` antes de remover o ESLint; diferenças listadas e aceitas pelo `@qa`.
4. **Helper com instâncias reais do Twurple:** testes unitários afirmam getters em instâncias construídas de payloads Helix gravados, e um teste detecta mudança do construtor `@private`.
5. **Preservação de comportamento:** suíte unitária por fatia; integração em PostgreSQL (instância isolada, migrations reais, nunca SQLite nem mocks de Prisma) para TS-2 e TS-4; Compose e smoke do instalador para TS-0 e TS-5.
6. **Gates antes de fechar cada fatia:** `npm run lint`, `npm run typecheck` (as duas configurações), `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist`, `npm run review:static` (só OpenGrep; registrar comando, resultado e achados aceitos), mais o build Docker. Nenhum gate `format:check` é adicionado (decisão do proprietário OD-24-1, 2026-10-27): a formatação é cobrada pelo `npm run lint` (`biome check`) depois que o commit de formatação existir, então a lista de quality gates em `AGENTS.md` e `CLAUDE.md` não muda por causa da formatação. O `@qa` executa os gates finais independentes e emite o veredito antes de o `@devops` commitar.

## Regras e documentos a atualizar (fatia TS-0)

Da nota do `@analyst`, Q7 (VERIFICADO por `grep` em 2026-10-27, reconferido pelo `@sm` no mesmo dia). Alterar o `AGENTS.md` é decisão do proprietário, já tomada em 2026-10-27 (decisão 5); `CLAUDE.md`, `.claude/CLAUDE.md` e `.aiox-core/constitution.md` não contêm a regra e não precisam de mudança.

| Arquivo:linha | Texto atual (resumo) | Mudança |
|---|---|---|
| `AGENTS.md:111` | "JavaScript ESM com JSDoc" (stack) | "TypeScript (sintaxe apagável, executado pelo type stripping do Node) em `apps/api`; JavaScript ESM com JSDoc nas demais áreas até migrarem". O `@architect` redige. |
| `docs/CONTRIBUTING.md:12` | "Keep product code JavaScript ESM with JSDoc. Do not introduce TypeScript, a transpiler…" | Reescrever: o backend `apps/api` pode ser TypeScript sem transpiler; regra do frontend inalterada. |
| `docs/pt-BR/CONTRIBUICAO.md:12` | Igual, em pt-BR | Igual, em pt-BR. |
| `docs/fullstack-architecture.md:7` | "Product runtime is JavaScript ESM…" | Atualizar para o backend em TypeScript. |
| `docs/pt-BR/fullstack-architecture.md:7` | Igual, em pt-BR | Igual, em pt-BR. |
| `docs/front-end-architecture.md:13` | Código do navegador permanece em JS ESM com JSDoc; Next "não autoriza código de aplicação TypeScript" | Escopo do frontend: manter; no máximo acrescentar que a regra do backend é separada. |
| `docs/pt-BR/front-end-architecture.md:13` | Igual, em pt-BR | Igual, em pt-BR. |
| `docs/architecture.md:28` | Prisma `prisma-client-js` "fixado para preservar a geração em JavaScript" | Continua válido; reescrever o motivo (cliente tipado já gerado, sem mudança de gerador). |
| `docs/pt-BR/architecture.md:28` | Igual, em pt-BR | Igual, em pt-BR. |
| `docs/process/backend-migration-study.md:19,91` (premissa A3 e "aderência às regras"); também linhas 9, 71, 72 e 156 ("ainda sem `.ts`") | Premissa A3 e a decisão "mantém JS + JSDoc" | Acrescentar nota de que a decisão do proprietário de 2026-10-27 a supera. |
| `docs/pt-BR/process/backend-migration-study.md:19,91` (mesmas linhas; também 9, 71, 72, 156) | Igual, em pt-BR | Igual, em pt-BR. |
| `tests/unit/quality-script-contract.test.js:8` | "JSDoc-aware no-emit typecheck" | Atualizar texto e expectativas junto com as regras, test-first. |
| `tests/unit/ci-workflow-contract.test.js` | asserções sobre `eslint`, se houver | Atualizar test-first (AC 5). |
| `docs/research-index.md` (linha 22 e a linha de type stripping) e pt-BR | "Node type stripping" PARCIAL | O `@analyst` promove para VERIFICADO (não o `@sm`). |
| `package.json`, `eslint.config.js`, `.opengrep/rules.yml`, `vitest.config.js`, `tsconfig*.json`, `.dockerignore`, `.git-blame-ignore-revs`, `biome.json` | ferramentas | Arquivos de implementação, listados pelo `@dev` na File List. |

Os changelogs de estágio são atualizados em inglês e pt-BR juntos antes de qualquer commit (regra do projeto).

## Gates de planejamento antes da implementação

- [x] Pesquisa do `@analyst`: [typescript-migration-research.md](../OPS-15/typescript-migration-research.md) (2026-10-27; Node, TS 7, Fastify, Prisma, Twurple e Biome verificados; a lista "só um teste confirma" está coberta pelos ACs acima).
- [x] Estudo do `@architect`: [backend-migration-study.md](../../process/backend-migration-study.md) (2026-10-27).
- [x] Decisões do proprietário registradas (2026-10-27), incluindo a mudança da regra do `AGENTS.md`.
- [x] Validação do `@po` (10 pontos) e GO (9,0/10, 2026-10-27); o `@po` também confirma que nenhum gate de UX se aplica (ver "Nota de UX").
- [ ] `@architect`: layout de tsconfig e strict, quais cinco rotas recebem schemas (TS-3), dividir ou não o `queue-repository` (TS-4), forma de reportar as regras nursery, texto do `AGENTS.md`, ordem em relação à FT-27 e às fatias da OPS-21.
- [ ] `@data-engineer`: confirmar que dividir o `queue-repository` e tipar as chamadas do Prisma não exigem mudança de schema nem de migration.
- [ ] Plano de testes do `@qa` (provas por violação plantada, método de paridade do Biome, PostgreSQL isolado, separação de evidências) e a contagem somente leitura de erros do `tsc --strict` por pasta.
- [x] O `@devops` cria a issue do GitHub: a issue-mãe #91 existe; fatias como sub-issues just-in-time e revisa o impacto no workflow (nomes de script inalterados); sem comentários em issues.
- [ ] Proprietário: agenda do commit de formatação em relação às branches abertas da OPS-15 (pergunta aberta 1) — **decidida em 2026-10-27 (OD-24-2: commit único depois da Onda 4 do cutover)**; OW-13 para a evidência de CI — ainda pendente, por isso a caixa continua aberta.

## Nota de UX

Nenhum texto, rota ou comportamento voltado à pessoa usuária muda; as fatias preservam comportamento, então o gate obrigatório do `@ux-design-expert` não está previsto. O `@po` confirma isso na validação. Se uma fatia acabar mudando texto visível, essa mudança vai para uma story própria.

## Perguntas em aberto (para `@po` / `@architect` / proprietário)

1. Quando agendar o commit de formatação do Biome: antes das branches da OPS-15 ainda abertas (conflitos) ou depois que integrarem? Recomendado: depois ou entre elas; caso contrário, formatador depois.
2. O `format:check` entra na lista de quality gates de `AGENTS.md`, `CLAUDE.md` e do CI, ou o `biome check` dentro do `lint` já cobre? (Mudar a lista de gates é assunto do `@architect` e do proprietário.)
3. Como reportar as regras nursery de promise sem quebrar o `--error-on-warnings`: script separado, ou habilitar em `error` só após uma fatia limpa?
4. O `apps/shared` acompanha o backend depois ou continua JavaScript com o frontend? Não decidido aqui.
5. [AUTO-DECISION] IDs do inventário: a nota de pesquisa chama as fatias de TS-0..TS-5, mas o inventário já usa TS-01..TS-12 para itens de teste, então o inventário usa FT-30..FT-35 para estas fatias (motivo: evitar dois IDs diferentes que se leem quase iguais). A story mantém os nomes da nota.

6. **Decisões do proprietário pendentes (da validação do `@po`, 2026-10-27):**
   - **OD-24-1 (DECIDIDA, proprietário, 2026-10-27): Biome pelo `lint` (`biome check`), sem gate `format:check` novo.** Opções originais (histórico): formatação aplicada pelo `lint` (`biome check` após o commit de formatação, sem novo nome de gate; recomendado) ou um gate `format:check` separado. (Responde a pergunta 2.)
   - **OD-24-2 (DECIDIDA, proprietário, 2026-10-27): um único commit só de formatação depois da Onda 4 do cutover da OPS-15, hash em `.git-blame-ignore-revs`; até lá a TS-0 entrega o Biome só como linter.** Proposta original (histórico, superada): janela do commit só de formatação: primeira janela sem branch aberta em `apps/`, depois que FT-26 e FT-01/FT-28 integrarem e antes do congelamento do cutover, hash em `.git-blame-ignore-revs`; se não houver janela, o formatador espera até depois do cutover (a TS-0 entrega o Biome só como linter). (Responde a pergunta 1.)
   - **OD-24-3 (DECIDIDA, proprietário, 2026-10-27, como escrita):** a OPS-23 espera apenas a TS-0 e a TS-2 (ver "Dependências").
   - **OW-13:** autorização de push para a evidência de CI do AC 9.

## Definition of Done

- Os ACs 1 a 27 têm evidência Red-first registrada por classe; no AC 9, a parte de CI é executada após a OW-13 ou registrada explicitamente como pendente pelo proprietário.
- Todos os quality gates verdes após cada fatia, ESLint removido, `.ts` lintado, testado, checado em tipos e varrido (provado por violações plantadas), `AGENTS.md` e os documentos listados atualizados em inglês e pt-BR.
- Veredito do `@qa` registrado; File List e checklists atualizados; nenhuma mudança de comportamento atribuível à conversão.

## Validação do rascunho pelo SM (story-draft-checklist, 2026-10-27)

1. Objetivo e contexto: claros (classe de defeito, decisões do proprietário, relação com OPS-15, OPS-22, OPS-23). PASS.
2. Orientação técnica: caminho, flags, pacotes, arquivos e tamanhos de pasta nomeados a partir da nota do `@analyst`; pontos de desenho abertos atribuídos ao `@architect`. PASS.
3. Referências: apontam para as seções da nota (Q1..Q8) e para o estudo. PASS.
4. Autossuficiência: fatias, ordem, tratamento do commit de formatação, locais da regra e itens não verificados declarados; incógnitas listadas como perguntas em aberto. PASS.
5. Testes: classes separadas; provas por violação plantada; PostgreSQL real; evidência de CI dependente da OW-13 declarada. PASS.
6. Análise estática: `npm run review:static` registrado; OpenGrep continua o único revisor; a cobertura de `.ts` é um AC. PASS.
- Resultado: pronta para o `@po`. Nenhum requisito foi inventado; os números de esforço são as estimativas NÃO VERIFICADAS da nota e estão marcados assim.

## File List

- `docs/stories/OPS-24/story.md` (novo)
- `docs/pt-BR/stories/OPS-24/story.md` (novo)
- `docs/stories.md` (entrada no índice)
- `docs/pt-BR/stories.md` (entrada no índice)
- `docs/process/backlog-inventory.md` e pt-BR (itens ST-17, FT-30..FT-35)
- `docs/process/kanban-board-design.md` e pt-BR (carga do quadro e hierarquia)

Os arquivos de implementação serão listados aqui pelo `@dev` após os gates.

## Change Log

- 2026-10-27 — `@sm` (River): story redigida a partir da pesquisa de TypeScript/Biome do `@analyst`, do estudo de backend do `@architect` e das decisões do proprietário de 2026-10-27. Status Rascunho.
- 2026-10-27 — `@po` (Pax): `*validate-story-draft` 10 pontos = 9,0/10, **GO**. Issue #91 registrada. Status Rascunho → Ready (Pronta). Gate de UX confirmado como não aplicável. Correção exigida antes do início da OPS-23: declarar quais fatias TS precedem a OPS-23 (ver [po-validation.md](po-validation.md)); recomendações de `format:check` e do commit de formatação registradas lá.
- 2026-10-27 — `@sm` (River): "Dependências" corrigida conforme exigido pelo `@po` (a OPS-23 espera apenas a TS-0 e a TS-2; TS-3 e FT-27 ordenadas pelo `@architect`); caixas dos gates de planejamento do GO do `@po` e da issue #91 marcadas; perguntas abertas 1-2 e OD-24-1..3 registradas como decisões do proprietário pendentes. Nenhum CA, título ou escopo alterado.
- 2026-10-27 — `@po` (Pax): decisões do proprietário conferidas após as decisões de 2026-10-27 (legado abandonado, cutover antecipado parte por parte, SSE pela OPS-23). OD-24-1, OD-24-2, OD-24-3 e OW-13 seguem **pendentes**; a OD-24-3 é coerente com as decisões do proprietário, mas não tem confirmação explícita; o fallback da OD-24-2 ("formatador após o cutover") passa a ser o caminho provável. Status continua Ready (Pronta; GO 9,0/10). Ver [po-validation.md](po-validation.md).
- 2026-10-27 — `@po` (Pax): decisões do proprietário de 2026-10-27 registradas (o proprietário aceitou as decisões da sessão, repassadas pelo `@aiox-master`). OD-24-1 DECIDIDA: Biome pelo `lint` (`biome check`), sem gate `format:check` novo (item 6 do plano de testes atualizado). OD-24-2 DECIDIDA: um único commit só de formatação depois da Onda 4 do cutover da OPS-15, hash em `.git-blame-ignore-revs`; até lá a TS-0 entrega o Biome só como linter ("Coordenação com FT-28 e FT-01" reescrita; a janela anterior ficou como nota de superada). OD-24-3 DECIDIDA como já estava escrita (a OPS-23 espera apenas a TS-0 e a TS-2; a frase "confirmação pendente" em "Dependências" atualizada). As perguntas abertas 1 e 2 ficam respondidas por essas decisões. Seguem pendentes: OW-13 (autorização de push para a evidência de CI do AC 9), as perguntas abertas 3 e 4 e os gates de planejamento do `@architect`, do `@data-engineer` e do `@qa`. Nenhum CA, título, escopo ou status alterado (Ready). Ver [po-validation.md](po-validation.md).
- 2026-10-30 — `@sm` (River): registrado o item TS-16 do inventário (JSX do painel Next de volta ao `typecheck:web`, 59 erros em 14 arquivos) dentro desta story, com a dependência da FT-30 e da FT-42. Sem mudança de CA, de outro escopo nem de status (status é do `@po`).

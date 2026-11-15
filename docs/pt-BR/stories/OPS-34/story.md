# OPS-34 — Checagem de tipos dos arquivos de teste (`tests/`) dentro de `npm run typecheck` (P-03, pós-beta)

[English](../../../stories/OPS-34/story.md)

**Status:** Rascunho (redigida pelo `@sm` em 2026-11-13). **Pós-beta:** por decisão do dono de 2026-11-13 esta story **não** entra na `v1.0.0-beta`; é feita **depois** do beta, junto da migração para TypeScript (OPS-24). Ainda não validada: o `@po` valida quando for agendada. **Issue:** [#121](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/121).
**Fonte:** decisão do dono de 2026-11-13 (P-03 vira story depois do beta, com a migração para TypeScript); relatório do slice de endurecimento do CI de 2026-11-13 na [OPS-15](../../../stories/OPS-15/story.md) (busque "P-03": "P-03 deferred (411 type errors)"); [ledger de critérios de aceite abertos](../../process/open-acceptance-criteria-2026-11-10.md).
**Relacionadas:** OPS-24 (#91, backend em TypeScript e Biome; esta story só começa depois da fatia TS-0 e compartilha o layout de `tsconfig`), OPS-30 (scripts E2E de navegador no CI, que vivem em `tests/e2e/`), P-02 (testes já lintados pelo ESLint, feito em 2026-11-13).
**Itens registrados:** **ST-26** do inventário (esta story) e fatias **FT-86..FT-89**. O número OPS-33 está reservado pelo handoff de 2026-11-11 (story de engenharia e desempenho) e não foi reutilizado. Veja [backlog-inventory](../../process/backlog-inventory.md).
**Coordenação necessária:** `$aiox-po` (validação), `$aiox-architect` (layout do tsconfig, rigor, desenho do ratchet), `$aiox-analyst` (só para LACUNA em `docs/research-index.md`), `$aiox-devops` (issue, job de CI), `$aiox-qa` independente (veredito e validação por mutação).

## Problema

- `npm run typecheck` (`tsc --noEmit`) inclui só `apps/**/*.js` e `apps/**/*.mjs` (`tsconfig.json`). Os cerca de 227 arquivos de `tests/` (`unit` 172, `integration` 27, `e2e` 18, `helpers` 9, `platform` 1) ficam fora.
- Quando o P-03 foi tentado em 2026-11-13 (slice de endurecimento do CI), apareceram **411 erros de TypeScript** e o item foi adiado. Fakes de teste que são objetos simples em vez de classes da biblioteca são exatamente o tipo de defeito de fronteira que motivou a OPS-24 (getter do Twurple que não existia, `error.status` no lugar de `statusCode`); hoje o verificador não os enxerga nos testes.
- Ligar a checagem de uma vez seria um commit com 411 erros, ou tentaria alguém a relaxar o `tsconfig`. Nenhum dos dois é aceitável.

## História

Como mantenedor,
quero que os arquivos de teste sejam checados pelo mesmo gate do código da aplicação,
para que fakes, fixtures e helpers não se afastem em silêncio dos tipos reais e um `npm run typecheck` verde signifique que os testes também estão cobertos.

## Escopo

**Dentro:**

- **FT-86 (a)** linha de base e andaime: `tsconfig.tests.json` estendendo a configuração raiz, linha de base de erros por pasta registrada no repositório e script de catraca (ratchet) que falha quando a contagem de erros sobe.
- **FT-87 (b)** `tests/helpers`, `tests/platform` e os fakes/fixtures compartilhados (são importados pelo resto, por isso vão primeiro).
- **FT-88 (c)** `tests/unit` (172 arquivos), em lotes por subpasta ou prefixo.
- **FT-89 (d)** `tests/integration` e `tests/e2e`; depois, dobrar a checagem em `npm run typecheck`, remover a catraca e ligar o CI.

**Fora de escopo:** converter arquivos de teste de `.js`/`.jsx` para `.ts` (pertence à OPS-24); mudar comportamento da aplicação; trocar o framework de teste; subir `strict` no código da aplicação (decisão separada); `@ts-nocheck` ou `@ts-ignore` como saída.

## Critérios de aceite

As classes de evidência ficam separadas: estática (tsc), execuções de teste unitário/integração, checagem por mutação. Cada lote de correções mantém `npm test` verde.

### Grupo A — linha de base e catraca (FT-86)

1. **Dado** o `tsconfig.tests.json`, **então** ele estende o `tsconfig.json` raiz, inclui `tests/**/*.js`, `tests/**/*.mjs` e `tests/**/*.jsx` e **não** sobrescreve nem afrouxa nenhuma `compilerOptions` da configuração raiz (`strict`, `checkJs`, `skipLibCheck`, `types`, módulos); um teste de contrato falha se uma regra for relaxada.
2. **Dada** a primeira execução, **então** a linha de base lista a contagem de erros por pasta (os 411 de 2026-11-13 são remedidos e registrados com a data e a versão do `tsc`) em um arquivo versionado no repositório.
3. **Dado** o script de catraca, **quando** o total ou a contagem de qualquer pasta for maior que a linha de base, **então** ele sai com código diferente de zero e imprime os erros novos; quando for menor, ele falha até a linha de base ser reduzida no mesmo commit (a contagem só desce).
4. **Dada** a catraca, **então** ela roda por `npm run typecheck:tests` e pelo job de qualidade do CI; nunca escreve na linha de base no CI.

### Grupo B — helpers e fixtures compartilhados (FT-87)

5. **Dados** `tests/helpers` e `tests/platform`, **então** `tsc -p tsconfig.tests.json` reporta **0 erros** neles, com fakes tipados (JSDoc) atribuíveis aos tipos reais das bibliotecas (classes do Twurple, tipos do cliente Prisma) em vez de objetos simples sem tipo.
6. **Dado** um fake compartilhado, **então** seu tipo deriva do tipo real (por exemplo `Pick`/`Partial` da classe da biblioteca, ou um cast documentado com motivo), e não de uma cópia que pode divergir.

### Grupo C — testes unitários (FT-88)

7. **Dado** `tests/unit`, **então** o trabalho avança em lotes (por subpasta ou prefixo de arquivo), um lote por commit, cada lote terminando com 0 erros nos seus arquivos e a linha de base menor.
8. **Dado** um lote, **então** nenhum `// @ts-nocheck`, `// @ts-ignore` ou cast para `any` é adicionado sem justificativa de uma linha; todo `// @ts-expect-error` traz o motivo e é coberto por um teste que prova que o erro é esperado.
9. **Dado** um lote, **então** `npm test` continua passando com o mesmo número de testes (nenhum teste apagado ou pulado para silenciar um erro).
10. **Dados** todos os lotes, **então** `tests/unit` reporta 0 erros.

### Grupo D — integração, e2e e gate final (FT-89)

11. **Dados** `tests/integration` e `tests/e2e`, **então** eles reportam 0 erros sob as mesmas regras dos CAs 8 e 9; os testes de integração continuam usando o PostgreSQL real (nenhum mock do Prisma é introduzido para agradar os tipos).
12. **Dado** o estado final, **então** `npm run typecheck` cobre `tests/` e sai com 0 e **0 erros em `tests/`**, o arquivo de linha de base e o script de catraca são removidos, e o `tsconfig.tests.json` (ou a configuração unificada) continua sem regra relaxada.
13. **Dado** o workflow de CI, **então** o job de qualidade roda a checagem de tipos dos testes e um teste de contrato do workflow afirma isso.
14. **Dado** o estado final, **então** o total foi da linha de base remedida (411 em 2026-11-13) a 0, com o histórico por pasta no Change Log.

### Grupo E — validação por mutação e gates

15. **Dado** o gate de tipos, **então** a validação por mutação é registrada: (i) alterar um fake para não casar mais com o tipo real e mostrar que `npm run typecheck` falha em `tests/`; (ii) reverter e mostrar que passa; (iii) incluir uma opção `strict` afrouxada e mostrar que o teste de contrato do CA 1 falha; (iv) subir a contagem de uma pasta e mostrar que a catraca do CA 3 falha (enquanto a catraca existir).
16. **Dados** os quality gates, **então** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist` e `npm run review:static` estão verdes; o veredito do `@qa` é registrado.

## Dependências

- **Somente pós-beta.** Começa depois que a `v1.0.0-beta` sair e depois da fatia TS-0 da OPS-24 (layout de configuração), para a configuração dos testes ser criada uma vez só.
- Ordem sugerida: FT-86 -> FT-87 -> FT-88 -> FT-89. FT-87 primeiro porque os helpers são importados em todo lugar.
- Nunca dois agentes `@dev` na mesma pasta de testes; os lotes da FT-88 são serializados ou divididos em conjuntos de arquivos disjuntos.
- Arquivo de teste ainda alterado pelas conversões da OPS-24 é corrigido no commit daquela story, não aqui, para evitar conflito.

## Riscos

1. **Churn em conflito com a OPS-24 e stories abertas.** Mitigação: início pós-beta, lotes disjuntos, rebase antes de cada lote.
2. **Pressão para silenciar erros com `any`/`@ts-ignore`.** Mitigação: CAs 1, 8 e 15 (sem relaxar, escapes justificados, prova por mutação).
3. **Defeitos reais revelados no código da aplicação.** Um erro de tipo pode expor um bug genuíno. Mitigação: relatar, corrigir primeiro com teste na aplicação em commit separado e manter o diff desta story nos testes.
4. **Tipar fakes os torna frágeis.** Mitigação: derivar dos tipos reais (CA 6), não de cópias.
5. **Deriva da linha de base enquanto o trabalho se espalha por semanas.** Mitigação: a catraca só desce (CA 3).

## Complexidade (estimativa do `@sm`, a confirmar pelo `@architect`)

Escopo 4, integração 2, infraestrutura 2, conhecimento 3, risco 2 = **13 -> STANDARD** (6 fases). Dificuldade **G**, prioridade **P3** (pós-beta, endurecimento de qualidade).

## Pontos para `@po` e `@architect`

1. Se `strict` continua `false` nos testes até a aplicação passar a `strict` (esta story só proíbe afrouxar, não eleva).
2. Se a checagem dobrada é uma única execução do `tsc` ou o layout de project references escolhido pela OPS-24.
3. Se a catraca pode ser um script Node pequeno ou deve reaproveitar um auxiliar de quality gate existente.

## Plano de testes

1. **Testes de contrato:** `tsconfig.tests.json` estende a raiz e não afrouxa nada; o CI roda a checagem; a catraca falha em subida e em linha de base não reduzida.
2. **Estática:** `tsc -p tsconfig.tests.json` por pasta, contagens comparadas com a linha de base.
3. **Regressão:** `npm test` antes e depois de cada lote com o mesmo número de testes.
4. **Mutação (CA 15):** as quatro mutações registradas com comando e resultado.
5. **Gates:** a bateria completa do CA 16 pelo `@qa` independente.

## Gates de planejamento antes da implementação

- Validação do `@po` (GO >= 7) e a issue criada pelo `@devops` (obrigatória antes de implementar).
- Parecer do `@architect` sobre layout do tsconfig e a catraca.
- Sem gate do `@ux-design-expert`: não há mudança voltada à pessoa usuária.
- Pesquisa: nenhuma nova; consultar antes `docs/research-index.md` (a nota de migração para TypeScript na [OPS-15](../../../stories/OPS-15/typescript-migration-research.md) é a base).

## Pendências

- **Issue no GitHub:** toda story nova exige issue criada pelo `@devops` antes da implementação. **Criada:** [#121](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/121) pelo `@devops` em 2026-11-13 (somente o corpo, nunca comentários); o número também está em `docs/stories.md` e no quadro.
- Validação do `@po`.
- Sincronização do quadro pelo `@devops` (os cards ST-26 e FT-86..FT-89 foram registrados como rascunho pelo `@sm`).

## Definição de Pronto

- CAs 1 a 16 com evidência registrada por classe; os resultados da mutação estão no Change Log.
- Quality gates verdes; veredito do `@qa` registrado; File List e checklists atualizados em inglês e pt-BR.

## Validação do rascunho pelo SM (story-draft-checklist, 2026-11-13)

1. Objetivo e contexto: claros (411 erros, testes fora do gate). PASS.
2. Orientação técnica: incremental por pasta, catraca, sem relaxar; pontos abertos atribuídos. PASS.
3. Referências: relatório da OPS-15, ledger, OPS-24. PASS.
4. Autossuficiência: escopo, fora de escopo, decisão pós-beta declarada. PASS.
5. Testes: contrato, contagens estáticas, regressão, mutação. PASS.
6. Análise estática: `npm run review:static` nos gates. PASS.
- Resultado: pronta para o `@po` quando agendada (pós-beta). A contagem de 227 arquivos e os 411 erros devem ser remedidos no início da FT-86.

## File List

- `docs/stories/OPS-34/story.md` (novo)
- `docs/pt-BR/stories/OPS-34/story.md` (novo)
- `docs/stories.md` e `docs/pt-BR/stories.md` (entrada no índice)
- `docs/process/backlog-inventory.md`, `docs/process/kanban-board-design.md` e gêmeos pt-BR (ST-26, FT-86..FT-89)

Os arquivos de implementação serão listados aqui pelo `@dev` após os gates.

## Change Log

- 2026-11-13 — `@sm` (River): story redigida a partir da decisão do dono (P-03 depois do beta, com a migração para TypeScript). Status Rascunho. [AUTO-DECISION] número da story → OPS-34 (motivo: OPS-33 está reservado pelo handoff de 2026-11-11 para a story de engenharia/desempenho). [AUTO-DECISION] IDs do inventário → ST-26, FT-86..FT-89 (motivo: próximos livres depois de ST-25 e FT-85). [AUTO-DECISION] prioridade P3, dificuldade G, ordem do quadro 20 (motivo: endurecimento de qualidade pós-beta, abaixo da linha do beta).
